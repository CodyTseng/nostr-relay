import {
  ClientContext,
  Event,
  EventHandleResult,
  HandleMessageResult,
  IncomingMessage,
  NostrRelayPlugin,
  PostBroadcast,
  PostHandleEvent,
  PostHandleMessage,
  PreBroadcast,
  PreHandleEvent,
  PreHandleMessage,
} from '@nostr-relay/common';

export class PluginManagerService {
  private readonly preHandleMessagePlugins: PreHandleMessage[] = [];
  private readonly postHandleMessagePlugins: PostHandleMessage[] = [];
  private readonly preHandleEventPlugins: PreHandleEvent[] = [];
  private readonly postHandleEventPlugins: PostHandleEvent[] = [];
  private readonly preBroadcastPlugins: PreBroadcast[] = [];
  private readonly postBroadcastPlugins: PostBroadcast[] = [];

  register(plugin: NostrRelayPlugin): void {
    if (this.hasPreHandleMessage(plugin)) {
      this.preHandleMessagePlugins.push(plugin);
    }
    if (this.hasPostHandleMessage(plugin)) {
      this.postHandleMessagePlugins.unshift(plugin);
    }
    if (this.hasPreHandleEvent(plugin)) {
      this.preHandleEventPlugins.push(plugin);
    }
    if (this.hasPostHandleEvent(plugin)) {
      this.postHandleEventPlugins.unshift(plugin);
    }
    if (this.hasPreBroadcast(plugin)) {
      this.preBroadcastPlugins.push(plugin);
    }
    if (this.hasPostBroadcast(plugin)) {
      this.postBroadcastPlugins.unshift(plugin);
    }
  }

  async preHandleMessage(
    ctx: ClientContext,
    message: IncomingMessage,
  ): Promise<IncomingMessage | null> {
    let result: IncomingMessage | null = message;
    for await (const plugin of this.preHandleMessagePlugins) {
      result = await plugin.preHandleMessage(ctx, message);
      if (!result) return null;
    }
    return result;
  }

  async postHandleMessage(
    ctx: ClientContext,
    message: IncomingMessage,
    handleResult: HandleMessageResult,
  ): Promise<void> {
    for await (const plugin of this.postHandleMessagePlugins) {
      await plugin.postHandleMessage(ctx, message, handleResult);
    }
  }

  async preHandleEvent(
    ctx: ClientContext,
    event: Event,
  ): Promise<Event | null> {
    let result: Event | null = event;
    for await (const plugin of this.preHandleEventPlugins) {
      result = await plugin.preHandleEvent(ctx, event);
      if (!result) return null;
    }
    return result;
  }

  async postHandleEvent(
    ctx: ClientContext,
    event: Event,
    handleResult: EventHandleResult,
  ): Promise<void> {
    for await (const plugin of this.postHandleEventPlugins) {
      await plugin.postHandleEvent(ctx, event, handleResult);
    }
  }

  async preBroadcast(ctx: ClientContext, event: Event): Promise<Event | null> {
    let result: Event | null = event;
    for await (const plugin of this.preBroadcastPlugins) {
      const result = await plugin.preBroadcast(ctx, event);
      if (!result) return null;
    }
    return result;
  }

  async postBroadcast(ctx: ClientContext, event: Event): Promise<void> {
    for await (const plugin of this.postBroadcastPlugins) {
      await plugin.postBroadcast(ctx, event);
    }
  }

  private hasPreHandleMessage(
    plugin: NostrRelayPlugin,
  ): plugin is PreHandleMessage {
    return typeof (plugin as PreHandleMessage).preHandleMessage === 'function';
  }

  private hasPostHandleMessage(
    plugin: NostrRelayPlugin,
  ): plugin is PostHandleMessage {
    return (
      typeof (plugin as PostHandleMessage).postHandleMessage === 'function'
    );
  }

  private hasPreHandleEvent(
    plugin: NostrRelayPlugin,
  ): plugin is PreHandleEvent {
    return typeof (plugin as PreHandleEvent).preHandleEvent === 'function';
  }

  private hasPostHandleEvent(
    plugin: NostrRelayPlugin,
  ): plugin is PostHandleEvent {
    return typeof (plugin as PostHandleEvent).postHandleEvent === 'function';
  }

  private hasPreBroadcast(plugin: NostrRelayPlugin): plugin is PreBroadcast {
    return typeof (plugin as PreBroadcast).preBroadcast === 'function';
  }

  private hasPostBroadcast(plugin: NostrRelayPlugin): plugin is PostBroadcast {
    return typeof (plugin as PostBroadcast).postBroadcast === 'function';
  }
}
