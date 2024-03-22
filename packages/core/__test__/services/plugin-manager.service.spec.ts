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
        preHandleEvent: jest.fn(),
      };

      pluginManagerService.register(plugin);

      expect(pluginManagerService['preHandleEventPlugins']).toEqual([plugin]);
    });

    it('should register after event handler plugin', () => {
      const plugin = {
        postHandleEvent: jest.fn(),
      };

      pluginManagerService.register(plugin);

      expect(pluginManagerService['postHandleEventPlugins']).toEqual([plugin]);
    });

    it('should register before event broadcast plugin', () => {
      const plugin = {
        preBroadcast: jest.fn(),
      };

      pluginManagerService.register(plugin);

      expect(pluginManagerService['preBroadcastPlugins']).toEqual([plugin]);
    });

    it('should register after event broadcast plugin', () => {
      const plugin = {
        postBroadcast: jest.fn(),
      };

      pluginManagerService.register(plugin);

      expect(pluginManagerService['postBroadcastPlugins']).toEqual([plugin]);
    });

    it('should register multiple plugins', () => {
      const pluginA = {
        preHandleEvent: jest.fn(),
        preBroadcast: jest.fn(),
      };
      const pluginB = {
        postHandleEvent: jest.fn(),
        postBroadcast: jest.fn(),
      };

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      expect(pluginManagerService['preHandleEventPlugins']).toEqual([pluginA]);
      expect(pluginManagerService['postHandleEventPlugins']).toEqual([pluginB]);
      expect(pluginManagerService['preBroadcastPlugins']).toEqual([pluginA]);
      expect(pluginManagerService['postBroadcastPlugins']).toEqual([pluginB]);
    });
  });

  describe('preHandleEvent', () => {
    it('should run before event handle plugins', async () => {
      const event = {} as Event;
      const pluginA = {
        preHandleEvent: jest.fn().mockReturnValue(event),
      };
      const pluginB = {
        preHandleEvent: jest.fn().mockReturnValue(event),
      };

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      const result = await pluginManagerService.preHandleEvent(ctx, event);

      expect(result).toEqual(event);
      expect(pluginA.preHandleEvent).toHaveBeenCalledWith(ctx, event);
      expect(pluginB.preHandleEvent).toHaveBeenCalledWith(ctx, event);

      const pluginACallOrder =
        pluginA.preHandleEvent.mock.invocationCallOrder[0];
      const pluginBCallOrder =
        pluginB.preHandleEvent.mock.invocationCallOrder[0];
      expect(pluginACallOrder).toBeLessThan(pluginBCallOrder);
    });

    it('should return false if any plugin returns false', async () => {
      const event = {} as Event;
      const pluginA = {
        preHandleEvent: jest.fn().mockReturnValue(null),
      };
      const pluginB = {
        preHandleEvent: jest.fn().mockReturnValue(event),
      };

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      const result = await pluginManagerService.preHandleEvent(ctx, event);

      expect(result).toBeNull();
      expect(pluginA.preHandleEvent).toHaveBeenCalledWith(ctx, event);
      expect(pluginB.preHandleEvent).not.toHaveBeenCalled();
    });
  });

  describe('postHandleEvent', () => {
    it('should run after event handle plugins', async () => {
      const handleResult = { needResponse: true, success: true };
      const pluginA = {
        postHandleEvent: jest.fn().mockImplementation(),
      };
      const pluginB = {
        postHandleEvent: jest.fn().mockImplementation(),
      };
      const event = {} as Event;

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      await pluginManagerService.postHandleEvent(ctx, event, handleResult);

      expect(pluginB.postHandleEvent).toHaveBeenCalledWith(
        ctx,
        event,
        handleResult,
      );
      expect(pluginA.postHandleEvent).toHaveBeenCalledWith(
        ctx,
        event,
        handleResult,
      );

      const pluginBCallOrder =
        pluginB.postHandleEvent.mock.invocationCallOrder[0];
      const pluginACallOrder =
        pluginA.postHandleEvent.mock.invocationCallOrder[0];
      expect(pluginBCallOrder).toBeLessThan(pluginACallOrder);
    });
  });

  describe('preBroadcast', () => {
    it('should run before event broadcast plugins', async () => {
      const event = {} as Event;
      const pluginA = {
        preBroadcast: jest.fn().mockReturnValue(event),
      };
      const pluginB = {
        preBroadcast: jest.fn().mockReturnValue(event),
      };

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      const result = await pluginManagerService.preBroadcast(ctx, event);

      expect(result).toEqual(event);
      expect(pluginA.preBroadcast).toHaveBeenCalledWith(ctx, event);
      expect(pluginB.preBroadcast).toHaveBeenCalledWith(ctx, event);

      const pluginACallOrder = pluginA.preBroadcast.mock.invocationCallOrder[0];
      const pluginBCallOrder = pluginB.preBroadcast.mock.invocationCallOrder[0];
      expect(pluginACallOrder).toBeLessThan(pluginBCallOrder);
    });

    it('should return false if any plugin returns false', async () => {
      const event = {} as Event;
      const pluginA = {
        preBroadcast: jest.fn().mockReturnValue(null),
      };
      const pluginB = {
        preBroadcast: jest.fn().mockReturnValue(event),
      };

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      const result = await pluginManagerService.preBroadcast(ctx, event);

      expect(result).toBeNull();
      expect(pluginA.preBroadcast).toHaveBeenCalledWith(ctx, event);
      expect(pluginB.preBroadcast).not.toHaveBeenCalled();
    });
  });

  describe('postBroadcast', () => {
    it('should run after event broadcast plugins', async () => {
      const pluginA = {
        postBroadcast: jest.fn(),
      };
      const pluginB = {
        postBroadcast: jest.fn(),
      };
      const event = {} as Event;

      pluginManagerService.register(pluginA);
      pluginManagerService.register(pluginB);

      await pluginManagerService.postBroadcast(ctx, event);

      expect(pluginB.postBroadcast).toHaveBeenCalledWith(ctx, event);
      expect(pluginA.postBroadcast).toHaveBeenCalledWith(ctx, event);

      const pluginBCallOrder =
        pluginB.postBroadcast.mock.invocationCallOrder[0];
      const pluginACallOrder =
        pluginA.postBroadcast.mock.invocationCallOrder[0];
      expect(pluginBCallOrder).toBeLessThan(pluginACallOrder);
    });
  });
});
