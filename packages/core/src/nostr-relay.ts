import {
  Client,
  ClientContext,
  ClientReadyState,
  ClientSubscription,
  EventQueryOptions,
  FilterUtils,
  abortable,
  waitFor,
  ConsoleLoggerService,
  Event,
  EventRepository,
  EventUtils,
  Filter,
  HandleAuthMessageResult,
  HandleCloseMessageResult,
  HandleCountMessageResult,
  HandleEventMessageResult,
  HandleEventResult,
  HandleMessageResult,
  HandleReqMessageResult,
  IncomingMessage,
  LogLevel,
  MessageType,
  NostrRelayOptions,
  NostrRelayPlugin,
  SubscriptionId,
  UnauthenticatedError,
  createOutgoingAuthMessage,
  createOutgoingClosedMessage,
  createOutgoingCountMessage,
  createOutgoingEoseMessage,
  createOutgoingEventMessage,
  createOutgoingNoticeMessage,
  createOutgoingOkMessage,
} from '@nostr-relay/common';
import { concatMap, filter, lastValueFrom, tap, toArray } from 'rxjs';
import { EventService } from './services/event.service';
import { PluginManagerService } from './services/plugin-manager.service';
import { SubscriptionService } from './services/subscription.service';

export class NostrRelay {
  private readonly options: NostrRelayOptions;
  private readonly eventService: EventService;
  private readonly subscriptionService: SubscriptionService;
  private readonly queryTimeoutMs: number;
  private readonly maxFiltersPerRequest: number;
  private destroyed = false;
  private readonly lifecycle = new AbortController();
  private readonly operations = new Set<Promise<unknown>>();
  private destruction?: Promise<void>;
  private readonly hostname?: string;
  private readonly pluginManagerService: PluginManagerService;

  private readonly clientContexts = new Map<Client, ClientContext>();
  private readonly disconnectedClients = new WeakSet<Client>();

  /**
   * Create a new NostrRelay instance.
   *
   * @param eventRepository EventRepository to use
   * @param options Options for NostrRelay
   */
  constructor(
    eventRepository: EventRepository,
    options: NostrRelayOptions = {},
  ) {
    this.options = options;

    // if hostname is not set, it means that NIP-42 is not enabled
    this.hostname = options.hostname ?? options.domain;

    const logger = options.logger ?? new ConsoleLoggerService();
    logger.setLogLevel(options.logLevel ?? LogLevel.INFO);

    this.pluginManagerService = new PluginManagerService(
      options.pluginLifecycleTimeoutMs,
    );
    this.subscriptionService = new SubscriptionService(
      this.clientContexts,
      logger,
      this.pluginManagerService,
      options.maxPendingEventsPerSubscription,
    );
    this.eventService = new EventService(
      eventRepository,
      this.subscriptionService,
      this.pluginManagerService,
      logger,
    );

    this.maxFiltersPerRequest = options.maxFiltersPerRequest ?? 20;
    if (
      !Number.isInteger(this.maxFiltersPerRequest) ||
      this.maxFiltersPerRequest < 1
    )
      throw new Error('maxFiltersPerRequest must be a positive integer');
    this.queryTimeoutMs = options.queryTimeoutMs ?? 30000;
    if (!Number.isInteger(this.queryTimeoutMs) || this.queryTimeoutMs < 1)
      throw new Error('queryTimeoutMs must be a positive integer');
  }

  /** Initialize plugin resources. Also called lazily by asynchronous operations. */
  async init(): Promise<void> {
    this.assertActive();
    await this.pluginManagerService.init();
    this.assertActive();
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.operations.add(operation);
    const done = (): void => {
      this.operations.delete(operation);
    };
    operation.then(done, done);
    return operation;
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error('relay is destroyed');
  }

  /**
   * Register a plugin.
   *
   * @param plugin Plugin to register
   */
  register(plugin: NostrRelayPlugin): NostrRelay {
    this.assertActive();
    this.pluginManagerService.register(plugin);
    return this;
  }

  /**
   * Handle a new client connection. This method should be called when a new
   * client connects to the Nostr Relay server.
   *
   * @param client Client instance, usually a WebSocket
   * @param ip IP address of the client
   */
  handleConnection(client: Client, ip?: string): void {
    this.disconnectedClients.delete(client);
    const ctx = this.getClientContext(client, ip);
    if (this.hostname) {
      ctx.sendMessage(createOutgoingAuthMessage(ctx.id));
    }
  }

  /**
   * Handle a client disconnection. This method should be called when a client
   * disconnects from the Nostr Relay server.
   *
   * @param client Client instance, usually a WebSocket
   */
  handleDisconnect(client: Client): void {
    this.disconnectedClients.add(client);
    this.clientContexts.get(client)?.dispose();
    this.clientContexts.delete(client);
  }

  /**
   * Handle an incoming message from a client. It can be an EVENT, REQ, CLOSE,
   * or AUTH message. Before calling this method, you should validate the
   * message by `@nostr-relay/validator` or other validators.
   *
   * @param client Client instance, usually a WebSocket
   * @param message Incoming message from the client
   */
  async handleMessage(
    client: Client,
    message: IncomingMessage,
  ): Promise<HandleMessageResult> {
    const ctx = this.getClientContext(client);
    await waitFor(this.init(), ctx.signal);
    ctx.signal.throwIfAborted();
    return await this.track(
      this.pluginManagerService.handleMessage(
        ctx,
        message,
        this._handleMessage.bind(this),
      ),
    );
  }

  private async _handleMessage(
    ctx: ClientContext,
    message: IncomingMessage,
  ): Promise<HandleMessageResult> {
    ctx.signal.throwIfAborted();
    if (message[0] === MessageType.EVENT) {
      const [, event] = message;
      const result = await this.handleEventMessage(ctx, event);
      return {
        messageType: MessageType.EVENT,
        ...result,
      };
    }
    if (message[0] === MessageType.REQ) {
      const [, subscriptionId, ...filters] = message;
      const result = await this.handleReqMessage(ctx, subscriptionId, filters);
      return {
        messageType: MessageType.REQ,
        ...result,
      };
    }
    if (message[0] === MessageType.COUNT) {
      const [, queryId, ...filters] = message;
      const result = await this.handleCountMessage(ctx, queryId, filters);
      return {
        messageType: MessageType.COUNT,
        ...result,
      };
    }
    if (message[0] === MessageType.CLOSE) {
      const [, subscriptionId] = message;
      const result = this.handleCloseMessage(ctx, subscriptionId);
      return {
        messageType: MessageType.CLOSE,
        ...result,
      };
    }
    if (message[0] === MessageType.AUTH) {
      const [, signedEvent] = message;
      const result = this.handleAuthMessage(ctx, signedEvent);
      return {
        messageType: MessageType.AUTH,
        ...result,
      };
    }
    ctx.sendMessage(
      createOutgoingNoticeMessage('invalid: unknown message type'),
    );
  }

  private async handleEventMessage(
    ctx: ClientContext,
    event: Event,
  ): Promise<HandleEventMessageResult> {
    const handleResult = await this.handleEvent(event);

    ctx.sendMessage(
      createOutgoingOkMessage(
        event.id,
        handleResult.success,
        handleResult.message,
      ),
    );

    return handleResult;
  }

  private async handleReqMessage(
    ctx: ClientContext,
    subscriptionId: SubscriptionId,
    filters: Filter[],
  ): Promise<HandleReqMessageResult> {
    let subscription: ClientSubscription | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (filters.length > this.maxFiltersPerRequest)
        throw new Error('rate-limited: too many filters');
      subscription = this.subscriptionService.subscribe(
        ctx,
        subscriptionId,
        filters,
        true,
      );
      const current = subscription;
      timer = setTimeout(
        () =>
          current.controller.abort(
            new Error('error: historical query timed out'),
          ),
        this.queryTimeoutMs,
      );
      const events = await this.findEvents(
        current.filters,
        ctx,
        event => {
          if (this.subscriptionService.isActive(ctx, current)) {
            current.deliveredIds.add(event.id);
            ctx.sendMessage(createOutgoingEventMessage(subscriptionId, event));
          }
        },
        { signal: current.signal },
      );
      if (!this.subscriptionService.isActive(ctx, current))
        return { events: [] };
      ctx.sendMessage(createOutgoingEoseMessage(subscriptionId));
      await this.subscriptionService.complete(ctx, current);
      return { events };
    } catch (error) {
      // An old generation must never close or send messages for its replacement.
      if (
        subscription &&
        ctx.subscriptions.get(subscriptionId) !== subscription
      )
        return { events: [] };
      this.subscriptionService.unsubscribe(ctx, subscriptionId);
      if (!ctx.isOpen) return { events: [] };
      const message = error instanceof Error ? error.message : 'error: unknown';
      ctx.sendMessage(createOutgoingClosedMessage(subscriptionId, message));
      if (error instanceof UnauthenticatedError)
        ctx.sendMessage(createOutgoingAuthMessage(ctx.id));
      return { events: [] };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async handleCountMessage(
    ctx: ClientContext,
    queryId: SubscriptionId,
    filters: Filter[],
  ): Promise<HandleCountMessageResult> {
    try {
      if (filters.length > this.maxFiltersPerRequest)
        throw new Error('rate-limited: too many filters');
      const count = await this.countEvents(filters, { signal: ctx.signal });
      if (!ctx.isOpen) return { count };
      ctx.sendMessage(createOutgoingCountMessage(queryId, count));
      return { count };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error: unknown';
      ctx.sendMessage(createOutgoingClosedMessage(queryId, message));
      if (error instanceof UnauthenticatedError) {
        ctx.sendMessage(createOutgoingAuthMessage(ctx.id));
      }
      return { error: message };
    }
  }

  private handleCloseMessage(
    ctx: ClientContext,
    subscriptionId: SubscriptionId,
  ): HandleCloseMessageResult {
    this.subscriptionService.unsubscribe(ctx, subscriptionId);
    return { success: true };
  }

  private handleAuthMessage(
    ctx: ClientContext,
    signedEvent: Event,
  ): HandleAuthMessageResult {
    if (!this.hostname) {
      ctx.sendMessage(createOutgoingOkMessage(signedEvent.id, true));
      return { success: true };
    }

    const validateErrorMsg = EventUtils.isSignedEventValid(
      signedEvent,
      ctx.id,
      this.hostname,
    );
    if (validateErrorMsg) {
      ctx.sendMessage(
        createOutgoingOkMessage(signedEvent.id, false, validateErrorMsg),
      );
      return { success: false };
    }

    ctx.pubkey = EventUtils.getAuthor(signedEvent);
    ctx.sendMessage(createOutgoingOkMessage(signedEvent.id, true));
    return { success: true };
  }

  /**
   * Check whether a client is authorized. If NIP-42 is unable, this method
   * always returns true.
   *
   * @param client Client instance, usually a WebSocket
   */
  isAuthorized(client: Client): boolean {
    this.assertActive();
    return this.hostname ? !!this.clientContexts.get(client)?.pubkey : true;
  }

  /**
   * Deliver an event locally through broadcast and read plugins. Does not call publishEvent.
   *
   * @param event The event to broadcast
   */
  async broadcast(event: Event): Promise<void> {
    await this.init();
    this.assertActive();
    await this.track(this.subscriptionService.broadcast(event));
  }

  /**
   * Destroy the NostrRelay instance. This method should be called when the
   * NostrRelay instance is no longer needed.
   */
  destroy(): Promise<void> {
    this.destroyed = true;
    this.lifecycle.abort();
    this.pluginManagerService.stop();
    for (const ctx of this.clientContexts.values()) ctx.dispose();
    this.clientContexts.clear();
    return (this.destruction ??= this.cleanup());
  }

  private async cleanup(): Promise<void> {
    const errors: unknown[] = [];
    await Promise.allSettled([...this.operations]);
    try {
      await this.pluginManagerService.destroy();
    } catch (error) {
      errors.push(error);
    }
    if (this.options.destroyRepository !== false) {
      try {
        await this.eventService.destroy();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'relay cleanup failed');
  }

  /**
   * Handle an event.
   *
   * @param event The event to handle
   */
  async handleEvent(event: Event): Promise<HandleEventResult> {
    await this.init();
    this.assertActive();
    return this.track(this.eventService.handleEvent(event));
  }

  /**
   * Find events by filters. Queries with a context apply read guards.
   * Calls without a context are trusted server-side queries and bypass read guards.
   *
   * @param filters Filters
   * @param ctx The requesting client's context
   * @param iteratee Iteratee function to call for each event
   */
  async findEvents(
    filters: Filter[],
    ctx?: ClientContext,
    iteratee?: (event: Event) => void,
    options: EventQueryOptions = {},
  ): Promise<Event[]> {
    this.assertActive();
    if (ctx && filters.length > this.maxFiltersPerRequest)
      throw new Error('rate-limited: too many filters');
    const signal = AbortSignal.any([
      this.lifecycle.signal,
      ...(ctx ? [ctx.signal] : []),
      ...(options.signal ? [options.signal] : []),
    ]);
    await waitFor(this.init(), signal);
    this.assertActive();
    signal.throwIfAborted();
    return this.track(
      lastValueFrom(
        abortable(
          this.eventService
            .find$(
              filters.map(filter => FilterUtils.normalize(filter)),
              { signal },
            )
            .pipe(
              concatMap(async event =>
                !ctx ||
                (await this.pluginManagerService.canReadEvent(
                  ctx,
                  event,
                  signal,
                ))
                  ? event
                  : undefined,
              ),
              filter((event): event is Event => event !== undefined),
              tap(event => iteratee?.(event)),
            ),
          signal,
        ).pipe(toArray()),
      ),
    );
  }

  /** Trusted server-side count. Client access is controlled by HandleMessagePlugin. */
  async countEvents(
    filters: Filter[],
    options: EventQueryOptions = {},
  ): Promise<number> {
    this.assertActive();
    const signal = options.signal
      ? AbortSignal.any([this.lifecycle.signal, options.signal])
      : this.lifecycle.signal;
    await waitFor(this.init(), signal);
    this.assertActive();
    signal.throwIfAborted();
    return this.track(
      waitFor(
        this.eventService.count(
          filters.map(filter => FilterUtils.normalize(filter)),
          [],
          { signal },
        ),
        signal,
      ),
    );
  }

  private getClientContext(client: Client, ip?: string): ClientContext {
    this.assertActive();
    if (
      this.disconnectedClients.has(client) ||
      client.readyState !== ClientReadyState.OPEN
    )
      throw new Error('client is disconnected');
    const ctx = this.clientContexts.get(client);
    if (ctx) return ctx;

    const newCtx = new ClientContext(client, {
      maxSubscriptionsPerClient: this.options.maxSubscriptionsPerClient,
    });
    newCtx.ip = ip;
    this.clientContexts.set(client, newCtx);
    return newCtx;
  }
}
