import {
  Client,
  ClientContext,
  ConsoleLoggerService,
  Event,
  EventId,
  EventRepository,
  EventUtils,
  Filter,
  FilterUtils,
  HandleAuthMessageResult,
  HandleCloseMessageResult,
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
} from '@nostr-relay/common';
import { EventService } from './services/event.service';
import { PluginManagerService } from './services/plugin-manager.service';
import { SubscriptionService } from './services/subscription.service';
import {
  LazyCache,
  createOutgoingAuthMessage,
  createOutgoingClosedMessage,
  createOutgoingEoseMessage,
  createOutgoingEventMessage,
  createOutgoingNoticeMessage,
  createOutgoingOkMessage,
} from './utils';

export class NostrRelay {
  private readonly options: NostrRelayOptions;
  private readonly eventService: EventService;
  private readonly subscriptionService: SubscriptionService;
  private readonly eventHandlingLazyCache:
    | LazyCache<EventId, Promise<HandleEventResult>>
    | undefined;
  private readonly hostname?: string;
  private readonly pluginManagerService: PluginManagerService;

  private readonly clientContexts = new Map<Client, ClientContext>();

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

    this.pluginManagerService = new PluginManagerService();
    this.subscriptionService = new SubscriptionService(
      this.clientContexts,
      logger,
      !!this.hostname,
    );
    this.eventService = new EventService(
      eventRepository,
      this.subscriptionService,
      this.pluginManagerService,
      logger,
      {
        createdAtUpperLimit: options.createdAtUpperLimit,
        createdAtLowerLimit: options.createdAtLowerLimit,
        minPowDifficulty: options.minPowDifficulty,
        filterResultCacheTtl: options.filterResultCacheTtl,
      },
    );

    const eventHandlingResultCacheTtl =
      options.eventHandlingResultCacheTtl ?? 600000;
    if (eventHandlingResultCacheTtl > 0) {
      this.eventHandlingLazyCache = new LazyCache({
        max: 100 * 1024,
        ttl: options.eventHandlingResultCacheTtl,
      });
    }
  }

  /**
   * Register a plugin.
   *
   * @param plugin Plugin to register
   */
  register(plugin: NostrRelayPlugin): NostrRelay {
    this.pluginManagerService.register(plugin);
    return this;
  }

  /**
   * Handle a new client connection. This method should be called when a new
   * client connects to the Nostr Relay server.
   *
   * @param client Client instance, usually a WebSocket
   */
  handleConnection(client: Client): void {
    const ctx = this.getClientContext(client);
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
    return await this.pluginManagerService.handleMessage(
      ctx,
      message,
      this._handleMessage.bind(this),
    );
  }

  private async _handleMessage(
    ctx: ClientContext,
    message: IncomingMessage,
  ): Promise<HandleMessageResult> {
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
    let handleResult: HandleEventResult;
    const beforeHandleEventResult =
      await this.pluginManagerService.beforeHandleEvent(ctx, event);

    if (!beforeHandleEventResult.canHandle) {
      handleResult = {
        success: false,
        message: beforeHandleEventResult.message,
      };
    } else {
      handleResult = await this.handleEvent(event);
    }

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
    try {
      const events = await this.findEvents(filters, ctx.pubkey, event => {
        ctx.sendMessage(createOutgoingEventMessage(subscriptionId, event));
      });

      ctx.sendMessage(createOutgoingEoseMessage(subscriptionId));
      this.subscriptionService.subscribe(ctx, subscriptionId, filters);

      return { events };
    } catch (error) {
      ctx.sendMessage(
        createOutgoingClosedMessage(subscriptionId, error.message),
      );
      if (error instanceof UnauthenticatedError) {
        ctx.sendMessage(createOutgoingAuthMessage(ctx.id));
      }
      return { events: [] };
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
    return this.hostname ? !!this.getClientContext(client).pubkey : true;
  }

  /**
   * Broadcast an event. This method does not call any plugins.
   *
   * @param event The event to broadcast
   */
  async broadcast(event: Event): Promise<void> {
    await this.subscriptionService.broadcast(event);
  }

  /**
   * Destroy the NostrRelay instance. This method should be called when the
   * NostrRelay instance is no longer needed.
   */
  async destroy(): Promise<void> {
    this.clientContexts.clear();
    this.eventHandlingLazyCache?.clear();
    await this.eventService.destroy();
  }

  /**
   * Handle an event.
   *
   * @param event The event to handle
   */
  async handleEvent(event: Event): Promise<HandleEventResult> {
    const callback = (): Promise<HandleEventResult> => {
      return this.eventService.handleEvent(event);
    };

    return this.eventHandlingLazyCache
      ? await this.eventHandlingLazyCache.get(event.id, callback)
      : await callback();
  }

  /**
   * Find events by filters.
   *
   * @param filters Filters
   * @param pubkey Public key of the client
   * @param iteratee Iteratee function to call for each event
   */
  async findEvents(
    filters: Filter[],
    pubkey?: string,
    iteratee?: (event: Event) => void,
  ): Promise<Event[]> {
    if (
      this.hostname &&
      filters.some(filter =>
        FilterUtils.hasEncryptedDirectMessageKind(filter),
      ) &&
      !pubkey
    ) {
      throw new UnauthenticatedError(
        "restricted: we can't serve DMs to unauthenticated users, does your client implement NIP-42?",
      );
    }

    return new Promise((resolve, reject) => {
      const events: Event[] = [];
      this.eventService.find$(filters).subscribe({
        next: event => {
          if (this.hostname && !EventUtils.checkPermission(event, pubkey)) {
            return;
          }
          events.push(event);
          iteratee?.(event);
        },
        error: reject,
        complete: () => resolve(events),
      });
    });
  }

  private getClientContext(client: Client): ClientContext {
    const ctx = this.clientContexts.get(client);
    if (ctx) return ctx;

    const newCtx = new ClientContext(client, {
      maxSubscriptionsPerClient: this.options.maxSubscriptionsPerClient,
    });
    this.clientContexts.set(client, newCtx);
    return newCtx;
  }
}
