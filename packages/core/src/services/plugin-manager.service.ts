import {
  BeforeHandleEventPlugin,
  BeforeHandleEventResult,
  BroadcastPlugin,
  CanReadEventPlugin,
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
  private readonly canReadEventPlugins: CanReadEventPlugin[] = [];

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
      if (this.isCanReadEventPlugin(plugin)) {
        this.canReadEventPlugins.push(plugin);
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

  async beforeHandleEvent(event: Event): Promise<BeforeHandleEventResult> {
    for (const plugin of this.beforeHandleEventPlugins) {
      const result = await plugin.beforeHandleEvent(event);
      if (!result.canHandle) {
        return result;
      }
    }
    return { canHandle: true };
  }

  async canReadEvent(ctx: ClientContext, event: Event): Promise<boolean> {
    for (const plugin of this.canReadEventPlugins) {
      if (!(await plugin.canReadEvent(ctx, event))) {
        return false;
      }
    }
    return true;
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

  private isHandleMessagePlugin(
    plugin: NostrRelayPlugin,
  ): plugin is HandleMessagePlugin {
    return typeof (plugin as HandleMessagePlugin).handleMessage === 'function';
  }

  private isCanReadEventPlugin(
    plugin: NostrRelayPlugin,
  ): plugin is CanReadEventPlugin {
    return typeof (plugin as CanReadEventPlugin).canReadEvent === 'function';
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
