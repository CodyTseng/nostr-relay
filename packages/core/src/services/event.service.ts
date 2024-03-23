import {
  ClientContext,
  Event,
  EventKind,
  EventRepository,
  EventType,
  EventUtils,
  Filter,
  HandleEventResult,
  Logger,
} from '@nostr-relay/common';
import { LazyCache } from '../utils';
import { PluginManagerService } from './plugin-manager.service';
import { SubscriptionService } from './subscription.service';

type EventServiceOptions = {
  createdAtUpperLimit?: number;
  createdAtLowerLimit?: number;
  minPowDifficulty?: number;
  filterResultCacheTtl?: number;
};

export class EventService {
  private readonly eventRepository: EventRepository;
  private readonly subscriptionService: SubscriptionService;
  private readonly pluginManagerService: PluginManagerService;
  private readonly logger: Logger;
  private readonly findLazyCache?:
    | LazyCache<string, Promise<Event[]>>
    | undefined;
  private readonly createdAtUpperLimit: number | undefined;
  private readonly createdAtLowerLimit: number | undefined;
  private readonly minPowDifficulty: number | undefined;

  constructor(
    eventRepository: EventRepository,
    subscriptionService: SubscriptionService,
    pluginManagerService: PluginManagerService,
    logger: Logger,
    options: EventServiceOptions = {},
  ) {
    this.eventRepository = eventRepository;
    this.subscriptionService = subscriptionService;
    this.pluginManagerService = pluginManagerService;
    this.logger = logger;
    this.createdAtUpperLimit = options.createdAtUpperLimit;
    this.createdAtLowerLimit = options.createdAtLowerLimit;
    this.minPowDifficulty = options.minPowDifficulty;

    const filterResultCacheTtl = options.filterResultCacheTtl ?? 1000;
    if (filterResultCacheTtl > 0) {
      this.findLazyCache = new LazyCache({
        max: 1000,
        ttl: filterResultCacheTtl,
      });
    }
  }

  async find(filters: Filter[]): Promise<Event[]> {
    const arrays = await Promise.all(
      filters.map(filter => this.findByFilter(filter)),
    );
    return this.mergeSortedEventArrays(arrays);
  }

  async handleEvent(
    ctx: ClientContext,
    event: Event,
  ): Promise<HandleEventResult> {
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
      if (error instanceof Error) {
        this.logger.error(
          `[${EventService.name}.handleEvent] ${error.message}`,
          error,
        );
        return {
          success: false,
          message: 'error: ' + error.message,
        };
      }
      this.logger.error(
        `[${EventService.name}.handleEvent] unknown error`,
        error,
      );
      return {
        success: false,
        message: 'error: unknown',
      };
    }
  }

  private async findByFilter(filter: Filter): Promise<Event[]> {
    const callback = async (): Promise<Event[]> => {
      if (
        filter.search !== undefined &&
        !this.eventRepository.isSearchSupported
      ) {
        return [];
      }
      return await this.eventRepository.find(filter);
    };

    return this.findLazyCache
      ? await this.findLazyCache.get(JSON.stringify(filter), callback)
      : await callback();
  }

  private async handleEphemeralEvent(
    ctx: ClientContext,
    event: Event,
  ): Promise<HandleEventResult> {
    await this.broadcast(ctx, event);
    return { noReplyNeeded: true, success: true };
  }

  private async handleRegularEvent(
    ctx: ClientContext,
    event: Event,
  ): Promise<HandleEventResult> {
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
    return this.pluginManagerService.broadcast(ctx, event, (_, e) =>
      this.subscriptionService.broadcast(e),
    );
  }

  private mergeSortedEventArrays(arrays: Event[][]): Event[] {
    if (arrays.length === 0) {
      return [];
    }

    function merge(left: Event[], right: Event[]): Event[] {
      const result: Event[] = [];
      let leftIndex = 0;
      let rightIndex = 0;

      while (leftIndex < left.length && rightIndex < right.length) {
        const leftEvent = left[leftIndex];
        const rightEvent = right[rightIndex];
        if (
          leftEvent.created_at > rightEvent.created_at ||
          (leftEvent.created_at === rightEvent.created_at &&
            leftEvent.id < rightEvent.id)
        ) {
          result.push(leftEvent);
          leftIndex++;
        } else {
          result.push(rightEvent);
          rightIndex++;
        }
      }

      return result.concat(left.slice(leftIndex), right.slice(rightIndex));
    }

    let result: Event[] = arrays[0];
    for (let i = 1; i < arrays.length; i++) {
      result = merge(result, arrays[i]);
    }

    return result.filter((e, i, a) => i === 0 || e.id !== a[i - 1]?.id);
  }
}
