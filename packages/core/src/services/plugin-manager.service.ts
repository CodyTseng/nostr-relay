import {
  AfterEventBroadcast,
  AfterEventHandle,
  BeforeEventBroadcast,
  BeforeEventHandle,
  Event,
  EventHandleResult,
  NostrRelayPlugin,
} from '@nostr-relay/common';

export class PluginManagerService {
  private readonly beforeEventHandlePlugins: BeforeEventHandle[] = [];
  private readonly afterEventHandlePlugins: AfterEventHandle[] = [];
  private readonly beforeEventBroadcastPlugins: BeforeEventBroadcast[] = [];
  private readonly afterEventBroadcastPlugins: AfterEventBroadcast[] = [];

  register(plugin: NostrRelayPlugin) {
    if (this.hasBeforeEventHandleHook(plugin)) {
      this.beforeEventHandlePlugins.push(plugin);
    }
    if (this.hasAfterEventHandleHook(plugin)) {
      this.afterEventHandlePlugins.unshift(plugin);
    }
    if (this.hasBeforeEventBroadcastHook(plugin)) {
      this.beforeEventBroadcastPlugins.push(plugin);
    }
    if (this.hasAfterEventBroadcastHook(plugin)) {
      this.afterEventBroadcastPlugins.unshift(plugin);
    }
  }

  async callBeforeEventHandleHooks(event: Event): Promise<boolean> {
    for (const plugin of this.beforeEventHandlePlugins) {
      const result = await plugin.beforeEventHandle(event);
      if (result === false) return false;
    }
    return true;
  }

  async callAfterEventHandleHooks(
    event: Event,
    handleResult: EventHandleResult,
  ): Promise<EventHandleResult> {
    for (const plugin of this.afterEventHandlePlugins) {
      handleResult = await plugin.afterEventHandle(event, handleResult);
    }
    return handleResult;
  }

  async callBeforeEventBroadcastHooks(event: Event): Promise<boolean> {
    for (const plugin of this.beforeEventBroadcastPlugins) {
      const result = await plugin.beforeEventBroadcast(event);
      if (result === false) return false;
    }
    return true;
  }

  async callAfterEventBroadcastHooks(event: Event): Promise<void> {
    for (const plugin of this.afterEventBroadcastPlugins) {
      await plugin.afterEventBroadcast(event);
    }
  }

  private hasBeforeEventHandleHook(
    plugin: NostrRelayPlugin,
  ): plugin is BeforeEventHandle {
    return (
      typeof (plugin as BeforeEventHandle).beforeEventHandle === 'function'
    );
  }

  private hasAfterEventHandleHook(
    plugin: NostrRelayPlugin,
  ): plugin is AfterEventHandle {
    return typeof (plugin as AfterEventHandle).afterEventHandle === 'function';
  }

  private hasBeforeEventBroadcastHook(
    plugin: NostrRelayPlugin,
  ): plugin is BeforeEventBroadcast {
    return (
      typeof (plugin as BeforeEventBroadcast).beforeEventBroadcast ===
      'function'
    );
  }

  private hasAfterEventBroadcastHook(
    plugin: NostrRelayPlugin,
  ): plugin is AfterEventBroadcast {
    return (
      typeof (plugin as AfterEventBroadcast).afterEventBroadcast === 'function'
    );
  }
}
