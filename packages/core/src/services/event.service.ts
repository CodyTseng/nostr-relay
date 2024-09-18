import {
  Event,
  EventKind,
  EventRepository,
  EventType,
  EventUtils,
  Filter,
  HandleEventResult,
  Logger,
} from '@nostr-relay/common';
import { distinct, EMPTY, from, merge, Observable, shareReplay } from 'rxjs';
import { LazyCache, md5 } from '../utils';
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
    | LazyCache<string, Observable<Event> | Event[]>
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

  find$(filters: Filter[]): Observable<Event> {
    return merge(...filters.map(filter => this.findByFilter$(filter))).pipe(
      distinct(event => event.id),
    );
  }

  async handleEvent(event: Event): Promise<HandleEventResult> {
    const beforeHandleEventResult =
      await this.pluginManagerService.beforeHandleEvent(event);
    if (!beforeHandleEventResult.canHandle) {
      return {
        success: false,
        message: beforeHandleEventResult.message,
      };
    }

    if (event.kind === EventKind.AUTHENTICATION) {
      return { success: true };
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
        return await this.handleEphemeralEvent(event);
      }
      return await this.handleRegularEvent(event);
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

  private findByFilter$(filter: Filter): Observable<Event> {
    const callback = (): Observable<Event> => {
      if (
        filter.search !== undefined &&
        !this.eventRepository.isSearchSupported()
      ) {
        return EMPTY;
      }
      const share$ = this.eventRepository
        .find$(filter)
        .pipe(shareReplay({ refCount: true }));

      setImmediate(() => {
        const events: Event[] = [];
        share$.subscribe({
          next: event => events.push(event),
          complete: () => {
            this.findLazyCache?.set(md5(JSON.stringify(filter)), events);
          },
        });
      });

      return share$;
    };

    if (this.findLazyCache) {
      const cache = this.findLazyCache.get(
        md5(JSON.stringify(filter)),
        callback,
      );
      return cache instanceof Observable ? cache : from(cache);
    }
    return callback();
  }

  private async handleEphemeralEvent(event: Event): Promise<HandleEventResult> {
    await this.broadcast(event);
    return { success: true };
  }

  private async handleRegularEvent(event: Event): Promise<HandleEventResult> {
    const { isDuplicate } = await this.eventRepository.upsert(event);

    if (!isDuplicate) {
      await this.broadcast(event);
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

  private async broadcast(event: Event): Promise<void> {
    return this.pluginManagerService.broadcast(event, e =>
      this.subscriptionService.broadcast(e),
    );
  }

  async destroy(): Promise<void> {
    this.findLazyCache?.clear();
  }
}
