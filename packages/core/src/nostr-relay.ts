import {
  Client,
  ClientContext,
  Event,
  EventHandleResult,
  EventId,
  EventRepository,
  EventUtils,
  Filter,
  FilterUtils,
  IncomingMessage,
  MessageType,
  NostrRelayPlugin,
  SubscriptionId,
} from '@nostr-relay/common';
import { endWith, filter, map } from 'rxjs';
import {
  HandleAuthMessageResult,
  HandleCloseMessageResult,
  HandleEventMessageResult,
  HandleMessageResult,
  HandleReqMessageResult,
  NostrRelayOptions,
} from './interfaces';
import { EventService } from './services/event.service';
import { PluginManagerService } from './services/plugin-manager.service';
import { SubscriptionService } from './services/subscription.service';
import {
  LazyCache,
  createOutgoingAuthMessage,
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

    this.pluginManagerService = new PluginManagerService();
    this.subscriptionService = new SubscriptionService(this.clientContexts, {
      broadcastService: options.broadcastService,
      logger: options.logger,
    });
    this.eventService = new EventService(
      eventRepository,
      this.subscriptionService,
      this.pluginManagerService,
      {
        logger: options.logger,
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
    message: IncomingMessage,
  ): Promise<HandleMessageResult> {
    if (message[0] === MessageType.EVENT) {
      const [, event] = message;
      const result = await this.handleEventMessage(client, event);
      return {
        messageType: MessageType.EVENT,
        ...result,
      };
    }
    if (message[0] === MessageType.REQ) {
      const [, subscriptionId, ...filters] = message;
      const result = await this.handleReqMessage(
        client,
        subscriptionId,
        filters,
      );
      return {
        messageType: MessageType.REQ,
        ...result,
      };
    }
    if (message[0] === MessageType.CLOSE) {
      const [, subscriptionId] = message;
      const result = this.handleCloseMessage(client, subscriptionId);
      return {
        messageType: MessageType.CLOSE,
        ...result,
      };
    }
    if (message[0] === MessageType.AUTH) {
      const [, signedEvent] = message;
      const result = this.handleAuthMessage(client, signedEvent);
      return {
        messageType: MessageType.AUTH,
        ...result,
      };
    }
    const ctx = this.getClientContext(client);
    ctx.sendMessage(
      createOutgoingNoticeMessage('invalid: unknown message type'),
    );
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
      const hookResult =
        await this.pluginManagerService.callBeforeEventHandleHooks(ctx, event);
      if (!hookResult.canContinue) {
        return hookResult.result;
      }

      const handleResult = await this.eventService.handleEvent(ctx, event);

      await this.pluginManagerService.callAfterEventHandleHooks(
        ctx,
        event,
        handleResult,
      );

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
    if (
      this.domain &&
      filters.some(filter =>
        FilterUtils.hasEncryptedDirectMessageKind(filter),
      ) &&
      !ctx.pubkey
    ) {
      ctx.sendMessage(
        createOutgoingNoticeMessage(
          "restricted: we can't serve DMs to unauthenticated users, does your client implement NIP-42?",
        ),
      );
      return { eventCount: 0 };
    }

    this.subscriptionService.subscribe(ctx, subscriptionId, filters);

    const eventCount = await new Promise<number>((resolve, reject) => {
      let eventCount = 0;
      const event$ = this.eventService.find(filters);
      event$
        .pipe(
          filter(
            event =>
              !this.domain || EventUtils.checkPermission(event, ctx.pubkey),
          ),
          map(event => createOutgoingEventMessage(subscriptionId, event)),
          endWith(createOutgoingEoseMessage(subscriptionId)),
        )
        .subscribe({
          next: message => {
            ctx.sendMessage(message);
            eventCount++;
          },
          error: error => reject(error),
          complete: () => resolve(eventCount),
        });
    });

    return { eventCount };
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
   * Check whether a client is authorized. If NIP-42 is unabled, this method
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
