import {
  BroadcastService,
  Client,
  ConsoleLoggerService,
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
  OutgoingMessage,
  Pubkey,
  SubscriptionId,
} from '@nostr-relay/common';
import { randomUUID } from 'crypto';
import { endWith, filter, map } from 'rxjs';
import { EventService } from './services/event.service';
import { LocalBroadcastService } from './services/local-broadcast.service';
import { SubscriptionService } from './services/subscription.service';
import {
  LazyCache,
  createOutgoingEoseMessage,
  createOutgoingEventMessage,
  createOutgoingNoticeMessage,
  createOutgoingOkMessage,
  sendMessage,
} from './utils';

type NostrRelayOptions = {
  createdAtUpperLimit?: number;
  createdAtLowerLimit?: number;
  minPowDifficulty?: number;
  maxSubscriptionsPerClient?: number;
  filterResultCacheTtl?: number;
  eventHandlingResultCacheTtl?: number;
};

type ClientMetadata = {
  id: string;
  pubkey?: Pubkey;
};

export class NostrRelay {
  private readonly domain: string;
  private readonly eventService: EventService;
  private readonly subscriptionService: SubscriptionService;
  private readonly logger: Logger;
  private readonly eventHandlingLazyCache:
    | LazyCache<EventId, Promise<OutgoingMessage | void>>
    | undefined;
  private readonly clientMap = new Map<Client, ClientMetadata>();

  constructor({
    domain,
    eventRepository,
    broadcastService,
    loggerConstructor,
    options,
  }: {
    domain: string;
    eventRepository: EventRepository;
    broadcastService?: BroadcastService;
    loggerConstructor?: new () => Logger;
    options?: NostrRelayOptions;
  }) {
    this.domain = domain;
    this.logger = new (loggerConstructor ?? ConsoleLoggerService)();
    this.logger.setContext(NostrRelay.name);

    broadcastService = broadcastService ?? new LocalBroadcastService();
    this.subscriptionService = new SubscriptionService({
      loggerConstructor,
      broadcastService,
      options: {
        maxSubscriptionsPerClient: options?.maxSubscriptionsPerClient,
      },
    });
    this.eventService = new EventService({
      eventRepository,
      broadcastService,
      loggerConstructor,
      options: {
        createdAtUpperLimit: options?.createdAtUpperLimit,
        createdAtLowerLimit: options?.createdAtLowerLimit,
        minPowDifficulty: options?.minPowDifficulty,
        filterResultCacheTtl: options?.filterResultCacheTtl,
      },
    });

    if (options?.eventHandlingResultCacheTtl) {
      this.eventHandlingLazyCache = new LazyCache({
        max: 100 * 1024,
        ttl: options.eventHandlingResultCacheTtl,
      });
    }
  }

  async handleConnection(client: Client) {
    this.clientMap.set(client, { id: randomUUID() });
  }

  async handleDisconnect(client: Client) {
    this.subscriptionService.clear(client);
  }

  async handleMessage(client: Client, message: IncomingMessage) {
    if (message[0] === MessageType.EVENT) {
      const [_, event] = message;
      return this.event(client, event);
    }
    if (message[0] === MessageType.REQ) {
      const [_, subscriptionId, ...filters] = message;
      return this.req(client, subscriptionId, ...filters);
    }
    if (message[0] === MessageType.CLOSE) {
      const [_, subscriptionId] = message;
      return this.close(client, subscriptionId);
    }
    if (message[0] === MessageType.AUTH) {
      const [_, signedEvent] = message;
      return this.auth(client, signedEvent);
    }
    this.logger.warn('unknown message type: ' + message[0]);
  }

  async event(client: Client, event: Event): Promise<void> {
    const handleResult = this.eventHandlingLazyCache
      ? await this.eventHandlingLazyCache.get(event.id, () =>
          this.eventService.handleEvent(event),
        )
      : await this.eventService.handleEvent(event);

    return sendMessage(client, handleResult);
  }

  async req(
    client: Client,
    subscriptionId: SubscriptionId,
    ...filters: Filter[]
  ): Promise<void> {
    const clientPubkey = this.clientMap.get(client)?.pubkey;
    if (
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

    const promise = new Promise<void>((resolve, reject) => {
      const event$ = this.eventService.find(filters);
      event$
        .pipe(
          filter(event => EventUtils.checkPermission(event, clientPubkey)),
          map(event => createOutgoingEventMessage(subscriptionId, event)),
          endWith(createOutgoingEoseMessage(subscriptionId)),
        )
        .subscribe({
          next: message => sendMessage(client, message),
          error: error => reject(error),
          complete: () => resolve(),
        });
    });
    return promise;
  }

  close(client: Client, subscriptionId: SubscriptionId): void {
    this.subscriptionService.unSubscribe(client, subscriptionId);
  }

  auth(client: Client, signedEvent: Event) {
    const clientMetadata = this.clientMap.get(client);
    if (!clientMetadata) {
      throw new InternalError('');
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
}
