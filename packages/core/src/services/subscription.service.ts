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
import { createOutgoingEventMessage, sendMessage } from '../utils';
import { ClientMetadataService } from './client-metadata.service';

type SubscriptionServiceOptions = {
  logger?: Logger;
};

export class SubscriptionService {
  private readonly clientMetadataService: ClientMetadataService;
  private readonly logger: Logger;

  constructor(
    broadcastService: BroadcastService,
    clientMetadataService: ClientMetadataService,
    options: SubscriptionServiceOptions = {},
  ) {
    this.clientMetadataService = clientMetadataService;
    this.logger = options.logger ?? new ConsoleLoggerService();

    broadcastService.setListener(event => this.eventListener(event));
  }

  subscribe(client: Client, subscriptionId: string, filters: Filter[]) {
    // Filter with search is not currently supported.
    const nonSearchFilters = filters.filter(
      filter => filter.search === undefined,
    );
    let subscriptions = this.clientMetadataService.getSubscriptions(client);
    if (!subscriptions) {
      subscriptions = this.clientMetadataService.connect(client).subscriptions;
    }
    subscriptions.set(subscriptionId, nonSearchFilters);
  }

  unsubscribe(client: Client, subscriptionId: string) {
    const subscriptions = this.clientMetadataService.getSubscriptions(client);
    if (!subscriptions) {
      return false;
    }
    return subscriptions.delete(subscriptionId);
  }

  eventListener(event: Event) {
    try {
      this.clientMetadataService.forEach(({ subscriptions }, client) => {
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
