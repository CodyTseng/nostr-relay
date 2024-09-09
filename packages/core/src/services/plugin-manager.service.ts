import {
  BeforeHandleEventPlugin,
  BeforeHandleEventResult,
  BroadcastPlugin,
  ClientContext,
  Event,
  HandleMessagePlugin,
  HandleMessageResult,
  IncomingMessage,
  KeysOfUnion,
  NostrRelayPlugin,
} from '@nostr-relay/common';

export class PluginManagerService {
  private readonly handleMessagePlugins: HandleMessagePlugin[] = [];
  private readonly beforeHandleEventPlugins: BeforeHandleEventPlugin[] = [];
  private readonly broadcastPlugins: BroadcastPlugin[] = [];

  register(...plugins: NostrRelayPlugin[]): PluginManagerService {
    plugins.forEach(plugin => {
      if (this.isHandleMessagePlugin(plugin)) {
        this.handleMessagePlugins.push(plugin);
      }
      if (this.isBeforeHandleEventPlugin(plugin)) {
        this.beforeHandleEventPlugins.push(plugin);
      }
      if (this.isBroadcastPlugin(plugin)) {
        this.broadcastPlugins.push(plugin);
      }
    });
    return this;
  }

  async handleMessage(
    ctx: ClientContext,
    message: IncomingMessage,
    next: (
      ctx: ClientContext,
      message: IncomingMessage,
    ) => Promise<HandleMessageResult>,
  ): Promise<HandleMessageResult> {
    return this.compose(
      this.handleMessagePlugins,
      'handleMessage',
      next,
      ctx,
      message,
    );
  }

  async beforeHandleEvent(
    ctx: ClientContext,
    event: Event,
  ): Promise<BeforeHandleEventResult> {
    for (const plugin of this.beforeHandleEventPlugins) {
      const result = await plugin.beforeHandleEvent(ctx, event);
      if (!result.canHandle) {
        return result;
      }
    }
    return { canHandle: true };
  }

  async broadcast(
    event: Event,
    next: (event: Event) => Promise<void>,
  ): Promise<void> {
    return this.compose(this.broadcastPlugins, 'broadcast', next, event);
  }

  private compose<R>(
    plugins: NostrRelayPlugin[],
    funcName: KeysOfUnion<NostrRelayPlugin>,
    next: (...args: any[]) => Promise<R>,
    ...args: any[]
  ): Promise<R> {
    let index = -1;
    return dispatch(0);
    function dispatch(i: number): Promise<R> {
      if (i <= index) {
        return Promise.reject(new Error('next() called multiple times'));
      }
      index = i;
      const plugin = plugins[i];
      if (!plugin || !plugin[funcName]) {
        return Promise.resolve(next(...args));
      }
      return Promise.resolve(
        plugin[funcName](...args, dispatch.bind(null, i + 1)),
      );
    }
  }

  private isHandleMessagePlugin(
    plugin: NostrRelayPlugin,
  ): plugin is HandleMessagePlugin {
    return typeof (plugin as HandleMessagePlugin).handleMessage === 'function';
  }

  private isBroadcastPlugin(
    plugin: NostrRelayPlugin,
  ): plugin is BroadcastPlugin {
    return typeof (plugin as BroadcastPlugin).broadcast === 'function';
  }

  private isBeforeHandleEventPlugin(
    plugin: NostrRelayPlugin,
  ): plugin is BeforeHandleEventPlugin {
    return (
      typeof (plugin as BeforeHandleEventPlugin).beforeHandleEvent ===
      'function'
    );
  }
}
