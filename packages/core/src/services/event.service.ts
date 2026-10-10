import {
  Event,
  EventKind,
  EventRepository,
  EventType,
  EventUtils,
  Filter,
  FilterUtils,
  EventQueryOptions,
  abortable,
  HandleEventResult,
  Logger,
} from '@nostr-relay/common';
import { defer, distinct, EMPTY, merge, Observable } from 'rxjs';
import { PluginManagerService } from './plugin-manager.service';
import { SubscriptionService } from './subscription.service';

export class EventService {
  private readonly eventRepository: EventRepository;
  private readonly subscriptionService: SubscriptionService;
  private readonly pluginManagerService: PluginManagerService;
  private readonly logger: Logger;
  constructor(
    eventRepository: EventRepository,
    subscriptionService: SubscriptionService,
    pluginManagerService: PluginManagerService,
    logger: Logger,
  ) {
    this.eventRepository = eventRepository;
    this.subscriptionService = subscriptionService;
    this.pluginManagerService = pluginManagerService;
    this.logger = logger;
  }

  find$(filters: Filter[], options: EventQueryOptions = {}): Observable<Event> {
    return abortable(
      merge(
        ...filters.map(filter =>
          this.findByFilter$(FilterUtils.normalize(filter), options),
        ),
      ).pipe(distinct(event => event.id)),
      options.signal,
    );
  }

  async count(
    filters: Filter[],
    excludedKinds: number[] = [],
    options: EventQueryOptions = {},
  ): Promise<number> {
    const supportedFilters = filters
      .map(filter => FilterUtils.normalize(filter))
      .filter(
        filter =>
          !FilterUtils.isMatchNone(filter) &&
          (filter.search === undefined ||
            this.eventRepository.isSearchSupported()),
      );
    if (!supportedFilters.length) return 0;
    return await this.eventRepository.count(
      supportedFilters,
      excludedKinds,
      options,
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

    const validateErrorMsg = EventUtils.validate(event);
    if (validateErrorMsg) {
      return {
        success: false,
        message: validateErrorMsg,
      };
    }

    try {
      return await this.pluginManagerService.handleEvent(event, async () => {
        const exists = await this.checkEventExists(event);
        if (exists) {
          return {
            success: true,
            message: 'duplicate: the event already exists',
          };
        }

        const eventType = EventUtils.getType(event.kind);
        if (eventType === EventType.EPHEMERAL)
          return this.handleEphemeralEvent(event);
        return this.handleRegularEvent(event);
      });
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

  private findByFilter$(
    filter: Filter,
    options: EventQueryOptions,
  ): Observable<Event> {
    if (
      FilterUtils.isMatchNone(filter) ||
      (filter.search !== undefined && !this.eventRepository.isSearchSupported())
    )
      return EMPTY;
    return abortable(
      this.pluginManagerService.findEvents(filter, options, () =>
        defer(() => this.eventRepository.find$(filter, options)),
      ),
      options.signal,
    );
  }

  private async handleEphemeralEvent(event: Event): Promise<HandleEventResult> {
    await this.broadcast(event);
    return { success: true };
  }

  private async handleDeletionEvent(event: Event): Promise<HandleEventResult> {
    await this.eventRepository.deleteByDeletionRequest(event);
    return { success: true };
  }

  private async handleRegularEvent(event: Event): Promise<HandleEventResult> {
    if (event.kind === EventKind.DELETION) {
      return await this.handleDeletionEvent(event);
    }

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
    if (EventType.EPHEMERAL === EventUtils.getType(event.kind)) return false;

    const exists = await this.eventRepository.findOne({ ids: [event.id] });
    return !!exists;
  }

  private async broadcast(event: Event): Promise<void> {
    return this.pluginManagerService.publishEvent(event, candidate =>
      this.subscriptionService.broadcast(candidate),
    );
  }

  async destroy(): Promise<void> {
    await this.eventRepository.destroy();
  }
}
