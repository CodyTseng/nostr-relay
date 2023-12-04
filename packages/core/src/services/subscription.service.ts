import {
  BroadcastService,
  ConsoleLoggerService,
  Event,
  EventUtils,
  Filter,
  Logger,
} from '@nostr-relay/common';
import { LRUCache } from 'lru-cache';
import { WebSocket } from 'ws';
import { createOutgoingEventMessage, sendMessage } from '../utils';

type SubscriptionServiceOptions = {
  maxSubscriptionsPerClient?: number;
};

export class SubscriptionService {
  private readonly subscriptionsMap = new Map<
    WebSocket,
    LRUCache<string, Filter[]>
  >();
  private readonly logger: Logger;
  private readonly maxSubscriptionsPerClient: number;

  constructor({
    broadcastService,
    loggerConstructor,
    options,
  }: {
    broadcastService: BroadcastService;
    loggerConstructor?: new () => Logger;
    options?: SubscriptionServiceOptions;
  }) {
    this.logger = new (loggerConstructor ?? ConsoleLoggerService)();
    this.logger.setContext(SubscriptionService.name);
    this.maxSubscriptionsPerClient = options?.maxSubscriptionsPerClient ?? 20;

    broadcastService.setListener(event => this.eventListener(event));
  }

  subscribe(client: WebSocket, subscriptionId: string, filters: Filter[]) {
    const subscriptions = this.subscriptionsMap.get(client);
    if (!subscriptions) {
      const lruCache = new LRUCache<string, Filter[]>({
        max: this.maxSubscriptionsPerClient,
      });
      lruCache.set(subscriptionId, filters);
      this.subscriptionsMap.set(client, lruCache);
      return;
    }
    subscriptions.set(subscriptionId, filters);
  }

  unSubscribe(client: WebSocket, subscriptionId: string) {
    const subscriptions = this.subscriptionsMap.get(client);
    if (!subscriptions) {
      return false;
    }
    const deleteResult = subscriptions.delete(subscriptionId);
    if (subscriptions.size === 0) {
      this.clear(client);
    }
    return deleteResult;
  }

  clear(client: WebSocket) {
    return this.subscriptionsMap.delete(client);
  }

  eventListener(event: Event) {
    try {
      this.subscriptionsMap.forEach((subscriptions, client) => {
        if (client.readyState !== WebSocket.OPEN) {
          return;
        }
        subscriptions.forEach((filters, subscriptionId) => {
          if (
            !filters.some(filter => EventUtils.isMatchingFilter(event, filter))
          ) {
            return;
          }
          sendMessage(
            client,
            createOutgoingEventMessage(subscriptionId, event),
          );
        });
      });
    } catch (error) {
      this.logger.error(error);
    }
  }
}
