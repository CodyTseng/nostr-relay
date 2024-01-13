import {
  BroadcastService,
  Client,
  ClientContext,
  Event,
  EventId,
  EventRepository,
  EventUtils,
  Filter,
  FilterUtils,
  IncomingMessage,
  Logger,
  MessageType,
  NostrRelayPlugin,
  OutgoingMessage,
  SubscriptionId,
} from '@nostr-relay/common';
import { endWith, filter, map } from 'rxjs';
import { EventService } from './services/event.service';
import { LocalBroadcastService } from './services/local-broadcast.service';
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

type NostrRelayOptions = {
  domain?: string;
  broadcastService?: BroadcastService;
  logger?: Logger;
  createdAtUpperLimit?: number;
  createdAtLowerLimit?: number;
  minPowDifficulty?: number;
  maxSubscriptionsPerClient?: number;
  filterResultCacheTtl?: number;
  eventHandlingResultCacheTtl?: number;
};

export class NostrRelay {
  private readonly options: NostrRelayOptions;
  private readonly eventService: EventService;
  private readonly subscriptionService: SubscriptionService;
  private readonly eventHandlingLazyCache:
    | LazyCache<EventId, Promise<OutgoingMessage | void>>
    | undefined;
  private readonly domain?: string;
  private readonly pluginManagerService: PluginManagerService;

  private readonly clientContexts = new Map<Client, ClientContext>();

  constructor(
    eventRepository: EventRepository,
    options: NostrRelayOptions = {},
  ) {
    this.options = options;

    const broadcastService =
      options.broadcastService ?? new LocalBroadcastService();

    this.pluginManagerService = new PluginManagerService();
    this.subscriptionService = new SubscriptionService(
      broadcastService,
      this.clientContexts,
      {
        logger: options.logger,
      },
    );
    this.eventService = new EventService(
      eventRepository,
      broadcastService,
      this.pluginManagerService,
      {
        logger: options.logger,
        createdAtUpperLimit: options.createdAtUpperLimit,
        createdAtLowerLimit: options.createdAtLowerLimit,
        minPowDifficulty: options.minPowDifficulty,
        filterResultCacheTtl: options.filterResultCacheTtl,
      },
    );

    if (options?.eventHandlingResultCacheTtl) {
      this.eventHandlingLazyCache = new LazyCache({
        max: 100 * 1024,
        ttl: options.eventHandlingResultCacheTtl,
      });
    }

    // if domain is not set, it means that NIP-42 is not enabled
    this.domain = options.domain;
  }

  register(plugin: NostrRelayPlugin): NostrRelay {
    this.pluginManagerService.register(plugin);
    return this;
  }

  handleConnection(client: Client): void {
    const ctx = this.getClientContext(client);
    if (this.domain) {
      ctx.sendMessage(createOutgoingAuthMessage(ctx.id));
    }
  }

  handleDisconnect(client: Client): void {
    this.clientContexts.delete(client);
  }

  async handleMessage(client: Client, message: IncomingMessage): Promise<void> {
    if (message[0] === MessageType.EVENT) {
      const [, event] = message;
      return this.handleEventMessage(client, event);
    }
    if (message[0] === MessageType.REQ) {
      const [, subscriptionId, ...filters] = message;
      return this.handleReqMessage(client, subscriptionId, filters);
    }
    if (message[0] === MessageType.CLOSE) {
      const [, subscriptionId] = message;
      return this.handleCloseMessage(client, subscriptionId);
    }
    if (message[0] === MessageType.AUTH) {
      const [, signedEvent] = message;
      return this.handleAuthMessage(client, signedEvent);
    }
    const ctx = this.getClientContext(client);
    ctx.sendMessage(
      createOutgoingNoticeMessage('invalid: unknown message type'),
    );
  }

  async handleEventMessage(client: Client, event: Event): Promise<void> {
    const ctx = this.getClientContext(client);
    const callback = async (): Promise<OutgoingMessage | undefined> => {
      const canHandle =
        await this.pluginManagerService.callBeforeEventHandleHooks(ctx, event);
      if (!canHandle) return;

      const handleResult = await this.eventService.handleEvent(ctx, event);

      await this.pluginManagerService.callAfterEventHandleHooks(
        ctx,
        event,
        handleResult,
      );

      if (handleResult) {
        return createOutgoingOkMessage(
          event.id,
          handleResult.success,
          handleResult.message,
        );
      }
    };

    const outgoingMessage = this.eventHandlingLazyCache
      ? await this.eventHandlingLazyCache.get(event.id, callback)
      : await callback();

    return ctx.sendMessage(outgoingMessage);
  }

  async handleReqMessage(
    client: Client,
    subscriptionId: SubscriptionId,
    filters: Filter[],
  ): Promise<void> {
    const ctx = this.getClientContext(client);
    if (
      this.domain &&
      filters.some(filter =>
        FilterUtils.hasEncryptedDirectMessageKind(filter),
      ) &&
      !ctx.pubkey
    ) {
      return ctx.sendMessage(
        createOutgoingNoticeMessage(
          "restricted: we can't serve DMs to unauthenticated users, does your client implement NIP-42?",
        ),
      );
    }

    this.subscriptionService.subscribe(ctx, subscriptionId, filters);

    await new Promise<void>((resolve, reject) => {
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
          next: message => ctx.sendMessage(message),
          error: error => reject(error),
          complete: () => resolve(),
        });
    });
  }

  handleCloseMessage(client: Client, subscriptionId: SubscriptionId): void {
    this.subscriptionService.unsubscribe(
      this.getClientContext(client),
      subscriptionId,
    );
  }

  handleAuthMessage(client: Client, signedEvent: Event): void {
    const ctx = this.getClientContext(client);
    if (!this.domain) {
      return ctx.sendMessage(createOutgoingOkMessage(signedEvent.id, true));
    }

    const validateErrorMsg = EventUtils.isSignedEventValid(
      signedEvent,
      ctx.id,
      this.domain,
    );
    if (validateErrorMsg) {
      return ctx.sendMessage(
        createOutgoingOkMessage(signedEvent.id, false, validateErrorMsg),
      );
    }

    ctx.pubkey = EventUtils.getAuthor(signedEvent);
    return ctx.sendMessage(createOutgoingOkMessage(signedEvent.id, true));
  }

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
