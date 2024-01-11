import {
  BroadcastService,
  Client,
  Event,
  EventId,
  EventRepository,
  EventUtils,
  Filter,
  FilterUtils,
  IncomingMessage,
  InternalError,
  Logger,
  MessageType,
  NostrRelayPlugin,
  OutgoingMessage,
  SubscriptionId,
} from '@nostr-relay/common';
import { endWith, filter, map } from 'rxjs';
import { ClientMetadataService } from './services/client-metadata.service';
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
  sendMessage,
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
  private readonly eventService: EventService;
  private readonly subscriptionService: SubscriptionService;
  private readonly eventHandlingLazyCache:
    | LazyCache<EventId, Promise<OutgoingMessage | void>>
    | undefined;
  private readonly domain?: string;
  private readonly clientMetadataService: ClientMetadataService;
  private readonly pluginManagerService: PluginManagerService;

  constructor(
    eventRepository: EventRepository,
    options: NostrRelayOptions = {},
  ) {
    // if domain is not set, it means that NIP-42 is not enabled
    this.domain = options.domain;

    const broadcastService =
      options.broadcastService ?? new LocalBroadcastService();

    this.pluginManagerService = new PluginManagerService();
    this.clientMetadataService = new ClientMetadataService({
      maxSubscriptionsPerClient: options.maxSubscriptionsPerClient,
    });
    this.subscriptionService = new SubscriptionService(
      broadcastService,
      this.clientMetadataService,
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
  }

  register(plugin: NostrRelayPlugin): NostrRelay {
    this.pluginManagerService.register(plugin);
    return this;
  }

  handleConnection(client: Client): void {
    const { id } = this.clientMetadataService.connect(client);
    if (this.domain) {
      sendMessage(client, createOutgoingAuthMessage(id));
    }
  }

  handleDisconnect(client: Client): void {
    this.clientMetadataService.disconnect(client);
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
    sendMessage(
      client,
      createOutgoingNoticeMessage('invalid: unknown message type'),
    );
  }

  async handleEventMessage(client: Client, event: Event): Promise<void> {
    const callback = async (): Promise<OutgoingMessage | undefined> => {
      const canHandle =
        await this.pluginManagerService.callBeforeEventHandleHooks(event);
      if (!canHandle) return;

      const handleResult = await this.eventService.handleEvent(event);

      const afterPluginsHandleResult =
        await this.pluginManagerService.callAfterEventHandleHooks(
          event,
          handleResult,
        );

      if (afterPluginsHandleResult) {
        return createOutgoingOkMessage(
          event.id,
          afterPluginsHandleResult.success,
          afterPluginsHandleResult.message,
        );
      }
    };

    const outgoingMessage = this.eventHandlingLazyCache
      ? await this.eventHandlingLazyCache.get(event.id, callback)
      : await callback();

    return sendMessage(client, outgoingMessage);
  }

  async handleReqMessage(
    client: Client,
    subscriptionId: SubscriptionId,
    filters: Filter[],
  ): Promise<void> {
    const clientPubkey = this.clientMetadataService.getPubkey(client);
    if (
      this.domain &&
      filters.some(filter =>
        FilterUtils.hasEncryptedDirectMessageKind(filter),
      ) &&
      !clientPubkey
    ) {
      return sendMessage(
        client,
        createOutgoingNoticeMessage(
          "restricted: we can't serve DMs to unauthenticated users, does your client implement NIP-42?",
        ),
      );
    }

    this.subscriptionService.subscribe(client, subscriptionId, filters);

    await new Promise<void>((resolve, reject) => {
      const event$ = this.eventService.find(filters);
      event$
        .pipe(
          filter(
            event =>
              !this.domain || EventUtils.checkPermission(event, clientPubkey),
          ),
          map(event => createOutgoingEventMessage(subscriptionId, event)),
          endWith(createOutgoingEoseMessage(subscriptionId)),
        )
        .subscribe({
          next: message => sendMessage(client, message),
          error: error => reject(error),
          complete: () => resolve(),
        });
    });
  }

  handleCloseMessage(client: Client, subscriptionId: SubscriptionId): void {
    this.subscriptionService.unsubscribe(client, subscriptionId);
  }

  handleAuthMessage(client: Client, signedEvent: Event): void {
    if (!this.domain) {
      return sendMessage(client, createOutgoingOkMessage(signedEvent.id, true));
    }

    const clientMetadata = this.clientMetadataService.getMetadata(client);
    if (!clientMetadata) {
      throw new InternalError(
        'client metadata not found, please call handleConnection first',
      );
    }

    const validateErrorMsg = EventUtils.isSignedEventValid(
      signedEvent,
      clientMetadata.id,
      this.domain,
    );
    if (validateErrorMsg) {
      return sendMessage(
        client,
        createOutgoingOkMessage(signedEvent.id, false, validateErrorMsg),
      );
    }

    clientMetadata.pubkey = EventUtils.getAuthor(signedEvent);
    return sendMessage(client, createOutgoingOkMessage(signedEvent.id, true));
  }

  isAuthorized(client: Client): boolean {
    return this.domain ? !!this.clientMetadataService.getPubkey(client) : true;
  }
}
