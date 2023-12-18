import {
  BroadcastService,
  Client,
  ClientReadyState,
  ConsoleLoggerService,
  Event,
  EventUtils,
  Filter,
  Logger,
} from '@nostr-relay/common';
import { LRUCache } from 'lru-cache';
import { createOutgoingEventMessage, sendMessage } from '../utils';

type SubscriptionServiceOptions = {
  logger?: Logger;
  maxSubscriptionsPerClient?: number;
};

export class SubscriptionService {
  private readonly subscriptionsMap = new Map<
    Client,
    LRUCache<string, Filter[]>
  >();
  private readonly logger: Logger;
  private readonly maxSubscriptionsPerClient: number;

  constructor(
    broadcastService: BroadcastService,
    options: SubscriptionServiceOptions = {},
  ) {
    this.logger = options.logger ?? new ConsoleLoggerService();
    this.maxSubscriptionsPerClient = options.maxSubscriptionsPerClient ?? 20;

    broadcastService.setListener(event => this.eventListener(event));
  }

  subscribe(client: Client, subscriptionId: string, filters: Filter[]) {
    // Filter with search is not currently supported.
    const nonSearchFilters = filters.filter(
      filter => filter.search === undefined,
    );
    const subscriptions = this.subscriptionsMap.get(client);
    if (!subscriptions) {
      const lruCache = new LRUCache<string, Filter[]>({
        max: this.maxSubscriptionsPerClient,
      });
      lruCache.set(subscriptionId, nonSearchFilters);
      this.subscriptionsMap.set(client, lruCache);
      return;
    }
    subscriptions.set(subscriptionId, nonSearchFilters);
  }

  unsubscribe(client: Client, subscriptionId: string) {
    const subscriptions = this.subscriptionsMap.get(client);
    if (!subscriptions) {
      return false;
    }
    const deleteResult = subscriptions.delete(subscriptionId);
    if (subscriptions.size === 0) {
      this.remove(client);
    }
    return deleteResult;
  }

  remove(client: Client) {
    return this.subscriptionsMap.delete(client);
  }

  eventListener(event: Event) {
    try {
      this.subscriptionsMap.forEach((subscriptions, client) => {
        if (client.readyState !== ClientReadyState.OPEN) {
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
      this.logger.error(`${SubscriptionService.name}.eventListener`, error);
    }
  }
}
