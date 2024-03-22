import {
  Client,
  ClientContext,
  ConsoleLoggerService,
  Event,
  EventHandleResult,
  EventId,
  EventRepository,
  EventUtils,
  Filter,
  FilterUtils,
  IncomingMessage,
  LogLevel,
  MessageType,
  NostrRelayPlugin,
  SubscriptionId,
  HandleAuthMessageResult,
  HandleCloseMessageResult,
  HandleEventMessageResult,
  HandleMessageResult,
  HandleReqMessageResult,
} from '@nostr-relay/common';
import { NostrRelayOptions } from './interfaces';
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
    | LazyCache<EventId, Promise<EventHandleResult>>
    | undefined;
  private readonly domain?: string;
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

    const logger = options.logger ?? new ConsoleLoggerService();
    logger.setLogLevel(options.logLevel ?? LogLevel.INFO);

    this.pluginManagerService = new PluginManagerService();
    this.subscriptionService = new SubscriptionService(
      this.clientContexts,
      logger,
      !!options.domain,
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

    // if domain is not set, it means that NIP-42 is not enabled
    this.domain = options.domain;
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
    if (this.domain) {
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
    msg: IncomingMessage,
  ): Promise<HandleMessageResult> {
    const ctx = this.getClientContext(client);
    const message = await this.pluginManagerService.preHandleMessage(ctx, msg);
    if (!message) return;

    if (message[0] === MessageType.EVENT) {
      const [, event] = message;
      const result = await this.handleEventMessage(client, event);
      const handleResult = {
        messageType: MessageType.EVENT,
        ...result,
      };
      await this.pluginManagerService.postHandleMessage(ctx, msg, handleResult);
      return handleResult;
    }
    if (message[0] === MessageType.REQ) {
      const [, subscriptionId, ...filters] = message;
      const result = await this.handleReqMessage(
        client,
        subscriptionId,
        filters,
      );
      const handleResult = {
        messageType: MessageType.REQ,
        ...result,
      };
      await this.pluginManagerService.postHandleMessage(ctx, msg, handleResult);
      return handleResult;
    }
    if (message[0] === MessageType.CLOSE) {
      const [, subscriptionId] = message;
      const result = this.handleCloseMessage(client, subscriptionId);
      const handleResult = {
        messageType: MessageType.CLOSE,
        ...result,
      };
      await this.pluginManagerService.postHandleMessage(ctx, msg, handleResult);
      return handleResult;
    }
    if (message[0] === MessageType.AUTH) {
      const [, signedEvent] = message;
      const result = this.handleAuthMessage(client, signedEvent);
      const handleResult = {
        messageType: MessageType.AUTH,
        ...result,
      };
      await this.pluginManagerService.postHandleMessage(ctx, msg, handleResult);
    }
    ctx.sendMessage(
      createOutgoingNoticeMessage('invalid: unknown message type'),
    );
    await this.pluginManagerService.postHandleMessage(ctx, msg);
  }

  /**
   * Handle an EVENT message from a client.
   *
   * @param client Client instance, usually a WebSocket
   * @param event Event to handle
   */
  async handleEventMessage(
    client: Client,
    event: Event,
  ): Promise<HandleEventMessageResult> {
    const ctx = this.getClientContext(client);
    const callback = async (): Promise<EventHandleResult> => {
      const e = await this.pluginManagerService.preHandleEvent(ctx, event);
      if (!e) return { success: false, noReplyNeeded: true };

      const handleResult = await this.eventService.handleEvent(ctx, e);

      await this.pluginManagerService.postHandleEvent(ctx, e, handleResult);

      return handleResult;
    };

    const handleResult = this.eventHandlingLazyCache
      ? await this.eventHandlingLazyCache.get(event.id, callback)
      : await callback();

    if (handleResult.noReplyNeeded !== true) {
      ctx.sendMessage(
        createOutgoingOkMessage(
          event.id,
          handleResult.success,
          handleResult.message,
        ),
      );
    }

    return {
      success: handleResult.success,
      message: handleResult.message,
    };
  }

  /**
   * Handle a REQ message from a client.
   *
   * @param client Client instance, usually a WebSocket
   * @param subscriptionId Subscription ID
   * @param filters Filters
   */
  async handleReqMessage(
    client: Client,
    subscriptionId: SubscriptionId,
    filters: Filter[],
  ): Promise<HandleReqMessageResult> {
    const ctx = this.getClientContext(client);
    const events: Event[] = [];
    if (
      this.domain &&
      filters.some(filter =>
        FilterUtils.hasEncryptedDirectMessageKind(filter),
      ) &&
      !ctx.pubkey
    ) {
      ctx.sendMessage(
        createOutgoingClosedMessage(
          subscriptionId,
          "restricted: we can't serve DMs to unauthenticated users, does your client implement NIP-42?",
        ),
      );
      ctx.sendMessage(createOutgoingAuthMessage(ctx.id));
      return { events };
    }

    this.subscriptionService.subscribe(ctx, subscriptionId, filters);

    (await this.eventService.find(filters)).forEach(event => {
      if (this.domain && !EventUtils.checkPermission(event, ctx.pubkey)) {
        return;
      }

      events.push(event);
      ctx.sendMessage(createOutgoingEventMessage(subscriptionId, event));
    });

    ctx.sendMessage(createOutgoingEoseMessage(subscriptionId));

    return { events };
  }

  /**
   * Handle a CLOSE message from a client.
   *
   * @param client Client instance, usually a WebSocket
   * @param subscriptionId Subscription ID
   */
  handleCloseMessage(
    client: Client,
    subscriptionId: SubscriptionId,
  ): HandleCloseMessageResult {
    this.subscriptionService.unsubscribe(
      this.getClientContext(client),
      subscriptionId,
    );
    return { success: true };
  }

  /**
   * Handle an AUTH message from a client.
   *
   * @param client Client instance, usually a WebSocket
   * @param signedEvent Signed event
   */
  handleAuthMessage(
    client: Client,
    signedEvent: Event,
  ): HandleAuthMessageResult {
    const ctx = this.getClientContext(client);
    if (!this.domain) {
      ctx.sendMessage(createOutgoingOkMessage(signedEvent.id, true));
      return { success: true };
    }

    const validateErrorMsg = EventUtils.isSignedEventValid(
      signedEvent,
      ctx.id,
      this.domain,
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
    return this.domain ? !!this.getClientContext(client).pubkey : true;
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
