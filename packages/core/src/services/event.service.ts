import {
  BroadcastService,
  ConsoleLoggerService,
  Event,
  EventKind,
  EventRepository,
  EventType,
  EventUtils,
  Filter,
  Logger,
  OutgoingMessage,
  observableToArray,
} from '@nostr-relay/common';
import { LRUCache } from 'lru-cache';
import { Observable, distinct, merge, mergeMap } from 'rxjs';
import { createOutgoingOkMessage } from '../utils';

type EventServiceOptions = {
  createdAtUpperLimit?: number;
  createdAtLowerLimit?: number;
  minPowDifficulty?: number;
  filterResultCacheTtl?: number;
};

export class EventService {
  private eventRepository: EventRepository;
  private broadcastService: BroadcastService;
  private logger: Logger;
  private readonly filterResultCache:
    | LRUCache<string, Promise<Event[]>>
    | undefined;
  private readonly createdAtUpperLimit: number | undefined;
  private readonly createdAtLowerLimit: number | undefined;
  private readonly minPowDifficulty: number | undefined;

  constructor({
    eventRepository,
    broadcastService,
    loggerConstructor,
    options,
  }: {
    eventRepository: EventRepository;
    broadcastService: BroadcastService;
    loggerConstructor?: new () => Logger;
    options?: EventServiceOptions;
  }) {
    this.eventRepository = eventRepository;
    this.broadcastService = broadcastService;
    this.logger = new (loggerConstructor ?? ConsoleLoggerService)();
    this.logger.setContext(EventService.name);
    this.createdAtUpperLimit = options?.createdAtUpperLimit;
    this.createdAtLowerLimit = options?.createdAtLowerLimit;
    this.minPowDifficulty = options?.minPowDifficulty;

    const filterResultCacheTtl = options?.filterResultCacheTtl ?? 10;
    if (filterResultCacheTtl > 0) {
      this.filterResultCache = new LRUCache({
        max: 1000,
        ttl: filterResultCacheTtl,
      });
    }
  }

  find(filters: Filter[]): Observable<Event> {
    return merge(
      ...filters.map(filter => this.findByFilterFromCache(filter)),
    ).pipe(
      mergeMap(events => events),
      distinct(event => event.id),
    );
  }

  async handleEvent(event: Event): Promise<void | OutgoingMessage> {
    const exists = await this.checkEventExists(event);
    if (exists) {
      return createOutgoingOkMessage(
        event.id,
        true,
        'duplicate: the event already exists',
      );
    }

    const validateErrorMsg = EventUtils.validate(event, {
      createdAtUpperLimit: this.createdAtUpperLimit,
      createdAtLowerLimit: this.createdAtLowerLimit,
      minPowDifficulty: this.minPowDifficulty,
    });
    if (validateErrorMsg) {
      return createOutgoingOkMessage(event.id, false, validateErrorMsg);
    }

    try {
      const eventType = EventUtils.getType(event);
      if (eventType === EventType.EPHEMERAL) {
        return this.handleEphemeralEvent(event);
      }
      return this.handleRegularEvent(event);
    } catch (error) {
      this.logger.error(error);
      if (error instanceof Error) {
        return createOutgoingOkMessage(
          event.id,
          false,
          'error: ' + error.message,
        );
      }
      return createOutgoingOkMessage(event.id, false, 'error: unknown');
    }
  }

  private async findByFilterFromCache(
    filter: Filter,
  ): Promise<Event[] | Observable<Event>> {
    if (!this.filterResultCache) {
      return this.eventRepository.find(filter);
    }

    const cacheKey = JSON.stringify(filter);
    const cache = this.filterResultCache.get(cacheKey);
    if (cache) {
      const events = await cache;
      return events;
    }

    let resolve: (value: Event[]) => void;
    const promise = new Promise<Event[]>(res => {
      resolve = res;
    });
    this.filterResultCache.set(cacheKey, promise);

    const promiseOrObserable = await this.eventRepository.find(filter);
    const events =
      promiseOrObserable instanceof Observable
        ? await observableToArray(promiseOrObserable)
        : promiseOrObserable;

    process.nextTick(() => resolve(events));

    return events;
  }

  private async handleEphemeralEvent(event: Event): Promise<void> {
    if (event.kind === EventKind.AUTHENTICATION) {
      return;
    }
    await this.broadcastService.broadcast(event);
  }

  private async handleRegularEvent(event: Event): Promise<OutgoingMessage> {
    const { isDuplicate } = await this.eventRepository.upsert(event);

    if (!isDuplicate) {
      await this.broadcastService.broadcast(event);
    }
    return createOutgoingOkMessage(
      event.id,
      true,
      isDuplicate ? 'duplicate: the event already exists' : '',
    );
  }

  async checkEventExists(event: Event): Promise<boolean> {
    if (EventType.EPHEMERAL === EventUtils.getType(event)) return false;

    const exists = await this.eventRepository.findOne({ ids: [event.id] });
    return !!exists;
  }
}
