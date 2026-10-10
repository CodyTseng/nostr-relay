import {
  Client,
  ClientContext,
  Event,
  EventUtils,
  Filter,
  Logger,
  createOutgoingEventMessage,
} from '@nostr-relay/common';
import { PluginManagerService } from './plugin-manager.service';

export class SubscriptionService {
  constructor(
    private readonly clientsMap: Map<Client, ClientContext>,
    private readonly logger: Logger,
    private readonly pluginManagerService: PluginManagerService,
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
    for (const ctx of this.clientsMap.values()) {
      if (!ctx.isOpen) continue;

      try {
        const subscriptionIds: string[] = [];
        ctx.subscriptions.forEach((filters, subscriptionId) => {
          if (
            filters.some(filter => EventUtils.isMatchingFilter(event, filter))
          ) {
            subscriptionIds.push(subscriptionId);
          }
        });
        if (!subscriptionIds.length) continue;

        await this.pluginManagerService.broadcast(ctx, event, async () => {
          if (!(await this.pluginManagerService.canReadEvent(ctx, event))) {
            return;
          }
          for (const subscriptionId of subscriptionIds) {
            if (ctx.subscriptions.has(subscriptionId)) {
              ctx.sendMessage(
                createOutgoingEventMessage(subscriptionId, event),
              );
            }
          }
        });
      } catch (error) {
        this.logger.error(
          `[${SubscriptionService.name}.eventListener] ${error.message}`,
          error,
        );
      }
    }
  }
}
