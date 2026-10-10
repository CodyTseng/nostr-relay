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
  HandleEventPlugin,
  FindEventsPlugin,
  PublishEventPlugin,
  EventQueryOptions,
  HandleEventResult,
  Filter,
  waitFor,
} from '@nostr-relay/common';
import { defer, Observable } from 'rxjs';

export class PluginManagerService {
  private readonly plugins: NostrRelayPlugin[] = [];
  private readonly lifecycle = new AbortController();
  private initialization?: Promise<void>;
  private destruction?: Promise<void>;
  private pluginCleanup?: Promise<void>;

  constructor(private readonly lifecycleTimeoutMs = 10000) {
    if (!Number.isInteger(lifecycleTimeoutMs) || lifecycleTimeoutMs < 1)
      throw new Error('pluginLifecycleTimeoutMs must be a positive integer');
  }

  private runLifecycle(
    action: (signal: AbortSignal) => void | Promise<void>,
    initializing = false,
  ): Promise<void> {
    const deadline = new AbortController();
    const timer = setTimeout(
      () => deadline.abort(new Error('plugin lifecycle timed out')),
      this.lifecycleTimeoutMs,
    );
    const signal = initializing
      ? AbortSignal.any([this.lifecycle.signal, deadline.signal])
      : deadline.signal;
    return waitFor(
      Promise.resolve().then(() => action(signal)),
      signal,
    ).finally(() => clearTimeout(timer));
  }
  private readonly handleEventPlugins: HandleEventPlugin[] = [];
  private readonly findEventsPlugins: FindEventsPlugin[] = [];
  private readonly publishEventPlugins: PublishEventPlugin[] = [];

  init(): Promise<void> {
    if (this.destruction)
      return Promise.reject(new Error('relay is destroyed'));
    return (this.initialization ??= this.initialize().catch(async error => {
      this.lifecycle.abort();
      try {
        await this.cleanupPlugins();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'plugin initialization and cleanup failed',
        );
      }
      throw error;
    }));
  }

  private async initialize(): Promise<void> {
    for (const plugin of this.plugins) {
      await this.runLifecycle(signal => plugin.init?.(signal), true);
    }
  }

  stop(): void {
    this.lifecycle.abort();
  }

  destroy(): Promise<void> {
    this.stop();
    return (this.destruction ??= this.cleanup());
  }

  private async cleanup(): Promise<void> {
    await this.initialization?.catch(() => undefined);
    return this.cleanupPlugins();
  }

  private cleanupPlugins(): Promise<void> {
    return (this.pluginCleanup ??= this.cleanupResources());
  }

  private async cleanupResources(): Promise<void> {
    const errors: unknown[] = [];
    for (const plugin of [...this.plugins].reverse()) {
      try {
        await this.runLifecycle(signal => plugin.destroy?.(signal));
      } catch (error) {
        errors.push(error);
      }
    }
    this.plugins.length = 0;
    this.handleMessagePlugins.length = 0;
    this.beforeHandleEventPlugins.length = 0;
    this.canReadEventPlugins.length = 0;
    this.broadcastPlugins.length = 0;
    this.handleEventPlugins.length = 0;
    this.findEventsPlugins.length = 0;
    this.publishEventPlugins.length = 0;
    if (errors.length)
      throw new AggregateError(errors, 'plugin cleanup failed');
  }

  private readonly handleMessagePlugins: HandleMessagePlugin[] = [];
  private readonly beforeHandleEventPlugins: BeforeHandleEventPlugin[] = [];
  private readonly broadcastPlugins: BroadcastPlugin[] = [];
  private readonly canReadEventPlugins: CanReadEventPlugin[] = [];

  register(...plugins: NostrRelayPlugin[]): PluginManagerService {
    if (this.initialization || this.destruction)
      throw new Error('register plugins before relay initialization');
    plugins.forEach(plugin => {
      if (this.plugins.includes(plugin)) return;
      this.plugins.push(plugin);
      if (typeof (plugin as HandleEventPlugin).handleEvent === 'function')
        this.handleEventPlugins.push(plugin as HandleEventPlugin);
      if (typeof (plugin as FindEventsPlugin).findEvents === 'function')
        this.findEventsPlugins.push(plugin as FindEventsPlugin);
      if (typeof (plugin as PublishEventPlugin).publishEvent === 'function')
        this.publishEventPlugins.push(plugin as PublishEventPlugin);
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
    return waitFor(
      this.compose(
        this.handleMessagePlugins,
        'handleMessage',
        next,
        ctx,
        message,
      ),
      ctx.signal,
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

  async canReadEvent(
    ctx: ClientContext,
    event: Event,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const cancellation = signal ?? ctx.signal;
    cancellation.throwIfAborted();
    for (const plugin of this.canReadEventPlugins) {
      const result = signal
        ? plugin.canReadEvent(ctx, event, signal)
        : plugin.canReadEvent(ctx, event);
      if (!(await waitFor(Promise.resolve(result), cancellation))) return false;
    }
    cancellation.throwIfAborted();
    return true;
  }

  async handleEvent(
    event: Event,
    next: (event: Event) => Promise<HandleEventResult>,
  ): Promise<HandleEventResult> {
    return this.compose(this.handleEventPlugins, 'handleEvent', next, event);
  }

  findEvents(
    filter: Filter,
    options: EventQueryOptions,
    next: () => Observable<Event>,
  ): Observable<Event> {
    return defer(() => {
      let index = -1;
      const dispatch = (i: number): Observable<Event> => {
        if (i <= index) throw new Error('next() called multiple times');
        index = i;
        const plugin = this.findEventsPlugins[i];
        return plugin
          ? plugin.findEvents(filter, options, () => dispatch(i + 1))
          : next();
      };
      return dispatch(0);
    });
  }

  async publishEvent(
    event: Event,
    next: (event: Event) => Promise<void>,
  ): Promise<void> {
    return this.compose(this.publishEventPlugins, 'publishEvent', next, event);
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
