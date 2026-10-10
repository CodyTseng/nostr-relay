import {
  Client,
  ClientContext,
  ClientSubscription,
  Event,
  EventUtils,
  Filter,
  Logger,
  createOutgoingClosedMessage,
  createOutgoingEventMessage,
  waitFor,
} from '@nostr-relay/common';
import { PluginManagerService } from './plugin-manager.service';

export class SubscriptionService {
  constructor(
    private readonly clientsMap: Map<Client, ClientContext>,
    private readonly logger: Logger,
    private readonly pluginManagerService: PluginManagerService,
    private readonly maxPendingEvents = 1000,
  ) {
    if (!Number.isInteger(maxPendingEvents) || maxPendingEvents < 1) {
      throw new Error(
        'maxPendingEventsPerSubscription must be a positive integer',
      );
    }
  }

  subscribe(
    ctx: ClientContext,
    subscriptionId: string,
    filters: Filter[],
    querying = false,
  ): ClientSubscription {
    if (!ctx.isOpen) throw new Error('client is disconnected');
    const subscription = new ClientSubscription(
      subscriptionId,
      filters,
      querying,
    );
    if (!ctx.subscriptions.has(subscriptionId)) {
      while (ctx.subscriptions.size >= ctx.maxSubscriptionsPerClient) {
        const oldestId = ctx.subscriptions.keys().next().value!;
        this.unsubscribe(ctx, oldestId);
        ctx.sendMessage(
          createOutgoingClosedMessage(
            oldestId,
            'rate-limited: subscription limit reached',
          ),
        );
      }
    }
    this.unsubscribe(ctx, subscriptionId);
    ctx.subscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  isActive(ctx: ClientContext, subscription: ClientSubscription): boolean {
    return (
      ctx.isOpen &&
      !subscription.signal.aborted &&
      ctx.subscriptions.get(subscription.id) === subscription
    );
  }

  unsubscribe(ctx: ClientContext, subscriptionId: string): boolean {
    const subscription = ctx.subscriptions.get(subscriptionId);
    if (!subscription) return false;
    ctx.subscriptions.delete(subscriptionId);
    subscription.close();
    return true;
  }

  /** Drain the live events captured while the historical query was running. */
  async complete(
    ctx: ClientContext,
    subscription: ClientSubscription,
  ): Promise<void> {
    if (!this.isActive(ctx, subscription)) return;
    subscription.state = 'draining';
    while (
      this.isActive(ctx, subscription) &&
      subscription.pendingEvents.size
    ) {
      const event = subscription.pendingEvents.values().next().value!;
      subscription.pendingEvents.delete(event.id);
      if (!subscription.deliveredIds.has(event.id)) {
        await waitFor(
          this.deliver(ctx, [subscription], event, subscription.signal),
          subscription.signal,
        );
      }
    }
    if (this.isActive(ctx, subscription)) {
      subscription.state = 'live';
      subscription.deliveredIds.clear();
    }
  }

  private async deliver(
    ctx: ClientContext,
    subscriptions: ClientSubscription[],
    event: Event,
    signal = ctx.signal,
  ): Promise<void> {
    await waitFor(
      this.pluginManagerService.broadcast(ctx, event, async () => {
        if (
          !(await (signal === ctx.signal
            ? this.pluginManagerService.canReadEvent(ctx, event)
            : this.pluginManagerService.canReadEvent(ctx, event, signal)))
        )
          return;
        for (const subscription of subscriptions) {
          if (!this.isActive(ctx, subscription)) continue;
          if (subscription.state !== 'live')
            subscription.deliveredIds.add(event.id);
          ctx.sendMessage(createOutgoingEventMessage(subscription.id, event));
        }
      }),
      signal,
    );
  }

  async broadcast(event: Event): Promise<void> {
    for (const ctx of this.clientsMap.values()) {
      if (!ctx.isOpen) continue;
      try {
        const live: ClientSubscription[] = [];
        for (const subscription of ctx.subscriptions.values()) {
          if (
            !subscription.filters.some(filter =>
              EventUtils.isMatchingFilter(event, filter),
            )
          )
            continue;
          if (subscription.state === 'live') {
            live.push(subscription);
          } else if (!subscription.deliveredIds.has(event.id)) {
            if (
              !subscription.pendingEvents.has(event.id) &&
              subscription.pendingEvents.size >= this.maxPendingEvents
            ) {
              this.unsubscribe(ctx, subscription.id);
              ctx.sendMessage(
                createOutgoingClosedMessage(
                  subscription.id,
                  'rate-limited: subscription live buffer is full',
                ),
              );
            } else {
              subscription.pendingEvents.set(event.id, event);
            }
          }
        }
        if (live.length) await this.deliver(ctx, live, event);
      } catch (error) {
        if (!ctx.signal.aborted)
          this.logger.error(
            `[${SubscriptionService.name}.broadcast] ${error instanceof Error ? error.message : 'unknown error'}`,
            error,
          );
      }
    }
  }
}
