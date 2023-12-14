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
} from '@nostr-relay/common';
import { EMPTY, Observable, distinct, from, merge, mergeMap } from 'rxjs';
import { LazyCache, createOutgoingOkMessage } from '../utils';

type EventServiceOptions = {
  createdAtUpperLimit?: number;
  createdAtLowerLimit?: number;
  minPowDifficulty?: number;
  filterResultCacheTtl?: number;
};

export class EventService {
  private readonly eventRepository: EventRepository;
  private readonly broadcastService: BroadcastService;
  private readonly logger: Logger;
  private readonly findLazyCache?:
    | LazyCache<string, Promise<Observable<Event>>>
    | undefined;
  private readonly createdAtUpperLimit: number | undefined;
  private readonly createdAtLowerLimit: number | undefined;
  private readonly minPowDifficulty: number | undefined;

  constructor({
    eventRepository,
    broadcastService,
    logger,
    options,
  }: {
    eventRepository: EventRepository;
    broadcastService: BroadcastService;
    logger?: Logger;
    options?: EventServiceOptions;
  }) {
    this.eventRepository = eventRepository;
    this.broadcastService = broadcastService;
    this.logger = logger ?? new ConsoleLoggerService();
    this.createdAtUpperLimit = options?.createdAtUpperLimit;
    this.createdAtLowerLimit = options?.createdAtLowerLimit;
    this.minPowDifficulty = options?.minPowDifficulty;

    const filterResultCacheTtl = options?.filterResultCacheTtl ?? 10;
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

  async handleEvent(event: Event): Promise<void | OutgoingMessage> {
    if (event.kind === EventKind.AUTHENTICATION) return;

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
        return await this.handleEphemeralEvent(event);
      }
      if (
        [EventType.REPLACEABLE, EventType.PARAMETERIZED_REPLACEABLE].includes(
          eventType,
        )
      ) {
        return await this.handleReplaceableEvent(event);
      }
      return await this.handleRegularEvent(event);
    } catch (error) {
      this.logger.error(`${EventService.name}.handleEvent`, error);
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

  private async findByFilter(filter: Filter): Promise<Observable<Event>> {
    const callback = async () => {
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

  private async handleEphemeralEvent(event: Event): Promise<void> {
    await this.broadcastService.broadcast(event);
  }

  private async handleRegularEvent(event: Event): Promise<OutgoingMessage> {
    const { isDuplicate } = await this.eventRepository.insert(event);

    if (!isDuplicate) {
      await this.broadcastService.broadcast(event);
    }
    return createOutgoingOkMessage(
      event.id,
      true,
      isDuplicate ? 'duplicate: the event already exists' : '',
    );
  }

  private async handleReplaceableEvent(event: Event): Promise<OutgoingMessage> {
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

  private async checkEventExists(event: Event): Promise<boolean> {
    if (EventType.EPHEMERAL === EventUtils.getType(event)) return false;

    const exists = await this.eventRepository.findOne({ ids: [event.id] });
    return !!exists;
  }
}
