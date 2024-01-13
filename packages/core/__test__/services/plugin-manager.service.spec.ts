import { ClientContext, ClientReadyState, Event } from '../../../common';
import { PluginManagerService } from '../../src/services/plugin-manager.service';

describe('PluginManagerService', () => {
  let pluginManagerService: PluginManagerService;
  let ctx: ClientContext;

  beforeEach(() => {
    pluginManagerService = new PluginManagerService();
    ctx = new ClientContext({
      readyState: ClientReadyState.OPEN,
      send: jest.fn(),
    });
  });

  describe('register', () => {
    it('should register before event handler plugin', () => {
      const plugin = {
        beforeEventHandle: jest.fn(),
      };

      pluginManagerService.register(plugin);

      expect(pluginManagerService['beforeEventHandlePlugins']).toEqual([
        plugin,
      ]);
    });

    it('should register after event handler plugin', () => {
      const plugin = {
        afterEventHandle: jest.fn(),
      };

      pluginManagerService.register(plugin);

      expect(pluginManagerService['afterEventHandlePlugins']).toEqual([plugin]);
    });

    it('should register before event broadcast plugin', () => {
      const plugin = {
        beforeEventBroadcast: jest.fn(),
      };

      pluginManagerService.register(plugin);

      expect(pluginManagerService['beforeEventBroadcastPlugins']).toEqual([
        plugin,
      ]);
    });

    it('should register after event broadcast plugin', () => {
      const plugin = {
        afterEventBroadcast: jest.fn(),
      };

      pluginManagerService.register(plugin);

      expect(pluginManagerService['afterEventBroadcastPlugins']).toEqual([
        plugin,
      ]);
    });

    it('should register multiple plugins', () => {
      const pluginA = {
        beforeEventHandle: jest.fn(),
        beforeEventBroadcast: jest.fn(),
      };
      const pluginB = {
        afterEventHandle: jest.fn(),
        afterEventBroadcast: jest.fn(),
      };

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      expect(pluginManagerService['beforeEventHandlePlugins']).toEqual([
        pluginA,
      ]);
      expect(pluginManagerService['afterEventHandlePlugins']).toEqual([
        pluginB,
      ]);
      expect(pluginManagerService['beforeEventBroadcastPlugins']).toEqual([
        pluginA,
      ]);
      expect(pluginManagerService['afterEventBroadcastPlugins']).toEqual([
        pluginB,
      ]);
    });
  });

  describe('callBeforeEventHandleHooks', () => {
    it('should run before event handle plugins', async () => {
      const pluginA = {
        beforeEventHandle: jest.fn().mockReturnValue({ canContinue: true }),
      };
      const pluginB = {
        beforeEventHandle: jest.fn().mockReturnValue({ canContinue: true }),
      };
      const event = {} as Event;

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      const result = await pluginManagerService.callBeforeEventHandleHooks(
        ctx,
        event,
      );

      expect(result).toEqual({ canContinue: true });
      expect(pluginA.beforeEventHandle).toHaveBeenCalledWith(ctx, event);
      expect(pluginB.beforeEventHandle).toHaveBeenCalledWith(ctx, event);

      const pluginACallOrder =
        pluginA.beforeEventHandle.mock.invocationCallOrder[0];
      const pluginBCallOrder =
        pluginB.beforeEventHandle.mock.invocationCallOrder[0];
      expect(pluginACallOrder).toBeLessThan(pluginBCallOrder);
    });

    it('should return false if any plugin returns false', async () => {
      const pluginA = {
        beforeEventHandle: jest.fn().mockReturnValue(false),
      };
      const pluginB = {
        beforeEventHandle: jest.fn().mockReturnValue(true),
      };
      const event = {} as Event;

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      const result = await pluginManagerService.callBeforeEventHandleHooks(
        ctx,
        event,
      );

      expect(result).toBe(false);
      expect(pluginA.beforeEventHandle).toHaveBeenCalledWith(ctx, event);
      expect(pluginB.beforeEventHandle).not.toHaveBeenCalled();
    });
  });

  describe('callAfterEventHandleHooks', () => {
    it('should run after event handle plugins', async () => {
      const handleResult = { needResponse: true, success: true };
      const pluginA = {
        afterEventHandle: jest.fn().mockImplementation(),
      };
      const pluginB = {
        afterEventHandle: jest.fn().mockImplementation(),
      };
      const event = {} as Event;

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      await pluginManagerService.callAfterEventHandleHooks(
        ctx,
        event,
        handleResult,
      );

      expect(pluginB.afterEventHandle).toHaveBeenCalledWith(
        ctx,
        event,
        handleResult,
      );
      expect(pluginA.afterEventHandle).toHaveBeenCalledWith(
        ctx,
        event,
        handleResult,
      );

      const pluginBCallOrder =
        pluginB.afterEventHandle.mock.invocationCallOrder[0];
      const pluginACallOrder =
        pluginA.afterEventHandle.mock.invocationCallOrder[0];
      expect(pluginBCallOrder).toBeLessThan(pluginACallOrder);
    });
  });

  describe('callBeforeEventBroadcastHooks', () => {
    it('should run before event broadcast plugins', async () => {
      const pluginA = {
        beforeEventBroadcast: jest.fn().mockReturnValue({ canContinue: true }),
      };
      const pluginB = {
        beforeEventBroadcast: jest.fn().mockReturnValue({ canContinue: true }),
      };
      const event = {} as Event;

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      const result = await pluginManagerService.callBeforeEventBroadcastHooks(
        ctx,
        event,
      );

      expect(result).toEqual({ canContinue: true });
      expect(pluginA.beforeEventBroadcast).toHaveBeenCalledWith(ctx, event);
      expect(pluginB.beforeEventBroadcast).toHaveBeenCalledWith(ctx, event);

      const pluginACallOrder =
        pluginA.beforeEventBroadcast.mock.invocationCallOrder[0];
      const pluginBCallOrder =
        pluginB.beforeEventBroadcast.mock.invocationCallOrder[0];
      expect(pluginACallOrder).toBeLessThan(pluginBCallOrder);
    });

    it('should return false if any plugin returns false', async () => {
      const pluginA = {
        beforeEventBroadcast: jest.fn().mockReturnValue(false),
      };
      const pluginB = {
        beforeEventBroadcast: jest.fn().mockReturnValue(true),
      };
      const event = {} as Event;

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      const result = await pluginManagerService.callBeforeEventBroadcastHooks(
        ctx,
        event,
      );

      expect(result).toBe(false);
      expect(pluginA.beforeEventBroadcast).toHaveBeenCalledWith(ctx, event);
      expect(pluginB.beforeEventBroadcast).not.toHaveBeenCalled();
    });
  });

  describe('callAfterEventBroadcastHooks', () => {
    it('should run after event broadcast plugins', async () => {
      const pluginA = {
        afterEventBroadcast: jest.fn(),
      };
      const pluginB = {
        afterEventBroadcast: jest.fn(),
      };
      const event = {} as Event;

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      await pluginManagerService.callAfterEventBroadcastHooks(ctx, event);

      expect(pluginB.afterEventBroadcast).toHaveBeenCalledWith(ctx, event);
      expect(pluginA.afterEventBroadcast).toHaveBeenCalledWith(ctx, event);

      const pluginBCallOrder =
        pluginB.afterEventBroadcast.mock.invocationCallOrder[0];
      const pluginACallOrder =
        pluginA.afterEventBroadcast.mock.invocationCallOrder[0];
      expect(pluginBCallOrder).toBeLessThan(pluginACallOrder);
    });
  });
});
