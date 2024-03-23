import {
  BroadcastMiddleware,
  ClientContext,
  Event,
  HandleEventMiddleware,
  HandleEventResult,
  HandleMessageMiddleware,
  HandleMessageResult,
  IncomingMessage,
  KeysOfUnion,
  NostrRelayPlugin,
} from '@nostr-relay/common';

export class PluginManagerService {
  private readonly handleMessageMiddlewares: HandleMessageMiddleware[] = [];
  private readonly handleEventMiddlewares: HandleEventMiddleware[] = [];
  private readonly broadcastMiddlewares: BroadcastMiddleware[] = [];

  register(...plugins: NostrRelayPlugin[]): PluginManagerService {
    plugins.forEach(plugin => {
      if (this.hasHandleMessageMiddleware(plugin)) {
        this.handleMessageMiddlewares.push(plugin);
      }
      if (this.hasHandleEventMiddleware(plugin)) {
        this.handleEventMiddlewares.push(plugin);
      }
      if (this.hasBroadcastMiddleware(plugin)) {
        this.broadcastMiddlewares.push(plugin);
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
      this.handleMessageMiddlewares,
      'handleMessage',
      next,
      ctx,
      message,
    );
  }

  async handleEvent(
    ctx: ClientContext,
    event: Event,
    next: (ctx: ClientContext, event: Event) => Promise<HandleEventResult>,
  ): Promise<HandleEventResult> {
    return this.compose(
      this.handleEventMiddlewares,
      'handleEvent',
      next,
      ctx,
      event,
    );
  }

  async broadcast(
    ctx: ClientContext,
    event: Event,
    next: (ctx: ClientContext, event: Event) => Promise<void>,
  ): Promise<void> {
    return this.compose(
      this.broadcastMiddlewares,
      'broadcast',
      next,
      ctx,
      event,
    );
  }

  private compose<R>(
    plugins: NostrRelayPlugin[],
    funcName: KeysOfUnion<NostrRelayPlugin>,
    next: (...args: any[]) => Promise<R>,
    ...args: any[]
  ): Promise<R> {
    let index = -1;
    async function dispatch(i: number): Promise<R> {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;
      const middleware = plugins[i]?.[funcName];
      if (!middleware) {
        return next(...args);
      }
      return middleware(...args, dispatch.bind(null, i + 1));
    }
    return dispatch(0);
  }

  private hasHandleMessageMiddleware(
    plugin: NostrRelayPlugin,
  ): plugin is HandleMessageMiddleware {
    return (
      typeof (plugin as HandleMessageMiddleware).handleMessage === 'function'
    );
  }

  private hasHandleEventMiddleware(
    plugin: NostrRelayPlugin,
  ): plugin is HandleEventMiddleware {
    return typeof (plugin as HandleEventMiddleware).handleEvent === 'function';
  }

  private hasBroadcastMiddleware(
    plugin: NostrRelayPlugin,
  ): plugin is BroadcastMiddleware {
    return typeof (plugin as BroadcastMiddleware).broadcast === 'function';
  }
}
