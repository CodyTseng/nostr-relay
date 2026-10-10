import {
  ClientContext,
  ClientReadyState,
  Event,
  IncomingMessage,
} from '../../../common';
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
    it('should register plugin', () => {
      const plugin = {
        handleMessage: jest.fn(),
        beforeHandleEvent: jest.fn(),
        broadcast: jest.fn(),
        canReadEvent: jest.fn(),
      };

      pluginManagerService.register(plugin);

      expect(pluginManagerService['handleMessagePlugins']).toEqual([plugin]);
      expect(pluginManagerService['beforeHandleEventPlugins']).toEqual([
        plugin,
      ]);
      expect(pluginManagerService['broadcastPlugins']).toEqual([plugin]);
      expect(pluginManagerService['canReadEventPlugins']).toEqual([plugin]);
    });

    it('should register plugins', () => {
      const plugin1 = {
        handleMessage: jest.fn(),
      };
      const plugin2 = {
        broadcast: jest.fn(),
      };
      const plugin3 = {
        handleMessage: jest.fn(),
        broadcast: jest.fn(),
      };

      pluginManagerService.register(plugin1, plugin2).register(plugin3);

      expect(pluginManagerService['handleMessagePlugins']).toEqual([
        plugin1,
        plugin3,
      ]);
      expect(pluginManagerService['broadcastPlugins']).toEqual([
        plugin2,
        plugin3,
      ]);
    });
  });

  describe('handleMessage', () => {
    it('should call plugins in order', async () => {
      const arr: number[] = [];
      pluginManagerService.register(
        {
          handleMessage: async (_ctx, _message, next) => {
            arr.push(1);
            const result = await next();
            arr.push(5);
            return result;
          },
        },
        {
          handleMessage: async (_ctx, _message, next) => {
            arr.push(2);
            const result = await next();
            arr.push(4);
            return result;
          },
        },
      );
      const mockNext = jest.fn().mockImplementation(async () => {
        arr.push(3);
        return { messageType: 'EVENT', success: true };
      });

      await pluginManagerService.handleMessage(
        ctx,
        {} as IncomingMessage,
        mockNext,
      );

      expect(arr).toEqual([1, 2, 3, 4, 5]);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith(ctx, {});
    });

    it('should directly return if plugin does not call next', async () => {
      pluginManagerService.register({
        handleMessage: async () => {
          return { messageType: 'EVENT', success: false };
        },
      });

      const result = await pluginManagerService.handleMessage(
        ctx,
        {} as IncomingMessage,
        async () => {
          return { messageType: 'EVENT', success: true };
        },
      );

      expect(result).toEqual({ messageType: 'EVENT', success: false });
    });

    it('should throw error if next() called multiple times', async () => {
      pluginManagerService.register({
        handleMessage: async (_ctx, _message, next) => {
          await next();
          await next();
        },
      });

      await expect(
        pluginManagerService.handleMessage(
          ctx,
          {} as IncomingMessage,
          async () => {},
        ),
      ).rejects.toThrow('next() called multiple times');
    });
  });

  describe('beforeHandleEvent', () => {
    it('should call plugins in order', async () => {
      const arr: number[] = [];
      pluginManagerService.register(
        {
          beforeHandleEvent: async () => {
            arr.push(1);
            return { canHandle: true };
          },
        },
        {
          beforeHandleEvent: async () => {
            arr.push(2);
            return { canHandle: true };
          },
        },
      );

      const result = await pluginManagerService.beforeHandleEvent({} as Event);

      expect(arr).toEqual([1, 2]);
      expect(result).toEqual({ canHandle: true });
    });

    it('should return result if canHandle is false', async () => {
      const arr: number[] = [];
      pluginManagerService.register(
        {
          beforeHandleEvent: async () => {
            arr.push(1);
            return { canHandle: false, message: 'block' };
          },
        },
        {
          beforeHandleEvent: async () => {
            arr.push(2);
            return { canHandle: true };
          },
        },
      );

      const result = await pluginManagerService.beforeHandleEvent({} as Event);

      expect(arr).toEqual([1]);
      expect(result).toEqual({ canHandle: false, message: 'block' });
    });
  });

  describe('canReadEvent', () => {
    it('allows reads when no guards are registered', async () => {
      expect(await pluginManagerService.canReadEvent(ctx, {} as Event)).toBe(
        true,
      );
    });

    it('passes context and event to synchronous and asynchronous guards in order', async () => {
      const event = {} as Event;
      const calls: number[] = [];
      const first = jest.fn((recipient, candidate) => {
        expect(recipient).toBe(ctx);
        expect(candidate).toBe(event);
        calls.push(1);
        return true;
      });
      const second = jest.fn(async () => {
        calls.push(2);
        return true;
      });
      pluginManagerService.register(
        { canReadEvent: first },
        { canReadEvent: second },
      );

      expect(await pluginManagerService.canReadEvent(ctx, event)).toBe(true);
      expect(calls).toEqual([1, 2]);
      expect(second).toHaveBeenCalledWith(ctx, event);
    });

    it('stops at the first denial', async () => {
      const later = jest.fn(() => true);
      pluginManagerService.register(
        { canReadEvent: () => true },
        { canReadEvent: async () => false },
        { canReadEvent: later },
      );
      expect(await pluginManagerService.canReadEvent(ctx, {} as Event)).toBe(
        false,
      );
      expect(later).not.toHaveBeenCalled();
    });

    it('propagates permission lookup failures', async () => {
      pluginManagerService.register({
        canReadEvent: async () => {
          throw new Error('lookup failed');
        },
      });
      await expect(
        pluginManagerService.canReadEvent(ctx, {} as Event),
      ).rejects.toThrow('lookup failed');
    });
  });

  describe('broadcast', () => {
    it('should call plugins in order', async () => {
      const arr: number[] = [];
      pluginManagerService.register(
        {
          broadcast: async (_ctx, _event, next) => {
            arr.push(1);
            await next();
            arr.push(5);
          },
        },
        {
          broadcast: async (_ctx, _event, next) => {
            arr.push(2);
            await next();
            arr.push(4);
          },
        },
      );

      const next = jest.fn(async () => {
        arr.push(3);
      });
      await pluginManagerService.broadcast(ctx, {} as Event, next);

      expect(arr).toEqual([1, 2, 3, 4, 5]);
      expect(next).toHaveBeenCalledWith(ctx, {});
    });
  });
});
