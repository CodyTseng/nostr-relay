import {
  BroadcastService,
  ConsoleLoggerService,
  Event,
  EventKind,
  EventRepository,
  EventType,
  EventUtils,
  Filter,
  EventHandleResult,
  Logger,
  ClientContext,
} from '@nostr-relay/common';
import { EMPTY, Observable, distinct, from, merge, mergeMap } from 'rxjs';
import { LazyCache } from '../utils';
import { PluginManagerService } from './plugin-manager.service';

type EventServiceOptions = {
  logger?: Logger;
  createdAtUpperLimit?: number;
  createdAtLowerLimit?: number;
  minPowDifficulty?: number;
  filterResultCacheTtl?: number;
};

export class EventService {
  private readonly eventRepository: EventRepository;
  private readonly broadcastService: BroadcastService;
  private readonly pluginManagerService: PluginManagerService;
  private readonly logger: Logger;
  private readonly findLazyCache?:
    | LazyCache<string, Promise<Observable<Event>>>
    | undefined;
  private readonly createdAtUpperLimit: number | undefined;
  private readonly createdAtLowerLimit: number | undefined;
  private readonly minPowDifficulty: number | undefined;

  constructor(
    eventRepository: EventRepository,
    broadcastService: BroadcastService,
    pluginManagerService: PluginManagerService,
    options: EventServiceOptions = {},
  ) {
    this.eventRepository = eventRepository;
    this.broadcastService = broadcastService;
    this.pluginManagerService = pluginManagerService;
    this.logger = options.logger ?? new ConsoleLoggerService();
    this.createdAtUpperLimit = options.createdAtUpperLimit;
    this.createdAtLowerLimit = options.createdAtLowerLimit;
    this.minPowDifficulty = options.minPowDifficulty;

    const filterResultCacheTtl = options.filterResultCacheTtl ?? 10;
    if (filterResultCacheTtl > 0) {
      this.findLazyCache = new LazyCache({
        max: 1000,
        ttl: filterResultCacheTtl,
      });
    }
  }

  find(filters: Filter[]): Observable<Event> {
    return merge(...filters.map(filter => this.findByFilter(filter))).pipe(
      mergeMap(events => events),
      distinct(event => event.id),
    );
  }

  async handleEvent(
    ctx: ClientContext,
    event: Event,
  ): Promise<EventHandleResult> {
    if (event.kind === EventKind.AUTHENTICATION) {
      return { success: true, noReplyNeeded: true };
    }

    const exists = await this.checkEventExists(event);
    if (exists) {
      return {
        success: true,
        message: 'duplicate: the event already exists',
      };
    }

    const validateErrorMsg = EventUtils.validate(event, {
      createdAtUpperLimit: this.createdAtUpperLimit,
      createdAtLowerLimit: this.createdAtLowerLimit,
      minPowDifficulty: this.minPowDifficulty,
    });
    if (validateErrorMsg) {
      return {
        success: false,
        message: validateErrorMsg,
      };
    }

    try {
      const eventType = EventUtils.getType(event);
      if (eventType === EventType.EPHEMERAL) {
        return await this.handleEphemeralEvent(ctx, event);
      }
      return await this.handleRegularEvent(ctx, event);
    } catch (error) {
      this.logger.error(`${EventService.name}.handleEvent`, error);
      if (error instanceof Error) {
        return {
          success: false,
          message: 'error: ' + error.message,
        };
      }
      return {
        success: false,
        message: 'error: unknown',
      };
    }
  }

  private async findByFilter(filter: Filter): Promise<Observable<Event>> {
    const callback = async (): Promise<Observable<Event>> => {
      if (
        filter.search !== undefined &&
        !this.eventRepository.isSearchSupported
      ) {
        return EMPTY;
      }
      let findResult = this.eventRepository.find(filter);
      if (findResult instanceof Promise) {
        findResult = await findResult;
      }
      return Array.isArray(findResult) ? from(findResult) : findResult;
    };

    return this.findLazyCache
      ? this.findLazyCache.get(JSON.stringify(filter), callback)
      : callback();
  }

  private async handleEphemeralEvent(
    ctx: ClientContext,
    event: Event,
  ): Promise<EventHandleResult> {
    await this.broadcast(ctx, event);
    return { noReplyNeeded: true, success: true };
  }

  private async handleRegularEvent(
    ctx: ClientContext,
    event: Event,
  ): Promise<EventHandleResult> {
    const { isDuplicate } = await this.eventRepository.upsert(event);

    if (!isDuplicate) {
      await this.broadcast(ctx, event);
    }
    return {
      success: true,
      message: isDuplicate ? 'duplicate: the event already exists' : undefined,
    };
  }

  private async checkEventExists(event: Event): Promise<boolean> {
    if (EventType.EPHEMERAL === EventUtils.getType(event)) return false;

    const exists = await this.eventRepository.findOne({ ids: [event.id] });
    return !!exists;
  }

  private async broadcast(ctx: ClientContext, event: Event): Promise<void> {
    const hookResult =
      await this.pluginManagerService.callBeforeEventBroadcastHooks(ctx, event);
    if (!hookResult.canContinue) return;

    await this.broadcastService.broadcast(event);

    await this.pluginManagerService.callAfterEventBroadcastHooks(ctx, event);
  }
}
