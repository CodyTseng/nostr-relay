import {
  Client,
  ClientContext,
  Event,
  EventUtils,
  Filter,
  Logger,
  createOutgoingEventMessage,
} from '@nostr-relay/common';

export class SubscriptionService {
  constructor(
    private readonly clientsMap: Map<Client, ClientContext>,
    private readonly logger: Logger,
    private readonly isNip42Enabled: boolean,
  ) {}

  subscribe(
    ctx: ClientContext,
    subscriptionId: string,
    filters: Filter[],
  ): void {
    // Filter with search is not currently supported.
    const nonSearchFilters = filters.filter(
      filter => filter.search === undefined,
    );
    ctx.subscriptions.set(subscriptionId, nonSearchFilters);
  }

  unsubscribe(ctx: ClientContext, subscriptionId: string): boolean {
    return ctx.subscriptions.delete(subscriptionId);
  }

  async broadcast(event: Event): Promise<void> {
    try {
      for (const ctx of this.clientsMap.values()) {
        if (!ctx.isOpen) continue;

        ctx.subscriptions.forEach((filters, subscriptionId) => {
          if (
            filters.some(filter =>
              EventUtils.isMatchingFilter(event, filter),
            ) &&
            (!this.isNip42Enabled ||
              EventUtils.checkPermission(event, ctx.pubkey))
          ) {
            ctx.sendMessage(createOutgoingEventMessage(subscriptionId, event));
          }
        });
      }
    } catch (error) {
      this.logger.error(
        `[${SubscriptionService.name}.eventListener] ${error.message}`,
        error,
      );
    }
  }
}
