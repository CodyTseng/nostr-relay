import {
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
  private readonly broadcastPlugins: BroadcastPlugin[] = [];

  register(...plugins: NostrRelayPlugin[]): PluginManagerService {
    plugins.forEach(plugin => {
      if (this.hasHandleMessagePlugin(plugin)) {
        this.handleMessagePlugins.push(plugin);
      }
      if (this.hasBroadcastPlugin(plugin)) {
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

  async broadcast(
    ctx: ClientContext,
    event: Event,
    next: (ctx: ClientContext, event: Event) => Promise<void>,
  ): Promise<void> {
    return this.compose(this.broadcastPlugins, 'broadcast', next, ctx, event);
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

  private hasHandleMessagePlugin(
    plugin: NostrRelayPlugin,
  ): plugin is HandleMessagePlugin {
    return typeof (plugin as HandleMessagePlugin).handleMessage === 'function';
  }

  private hasBroadcastPlugin(
    plugin: NostrRelayPlugin,
  ): plugin is BroadcastPlugin {
    return typeof (plugin as BroadcastPlugin).broadcast === 'function';
  }
}
