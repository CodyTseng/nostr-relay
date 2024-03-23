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
        handleEvent: jest.fn(),
        broadcast: jest.fn(),
      };

      pluginManagerService.register(plugin);

      expect(pluginManagerService['handleMessageMiddlewares']).toEqual([
        plugin,
      ]);
      expect(pluginManagerService['handleEventMiddlewares']).toEqual([plugin]);
      expect(pluginManagerService['broadcastMiddlewares']).toEqual([plugin]);
    });

    it('should register plugins', () => {
      const plugin1 = {
        handleMessage: jest.fn(),
      };
      const plugin2 = {
        handleEvent: jest.fn(),
      };
      const plugin3 = {
        broadcast: jest.fn(),
      };
      const plugin4 = {
        handleMessage: jest.fn(),
        handleEvent: jest.fn(),
        broadcast: jest.fn(),
      };

      pluginManagerService
        .register(plugin1, plugin2, plugin3)
        .register(plugin4);

      expect(pluginManagerService['handleMessageMiddlewares']).toEqual([
        plugin1,
        plugin4,
      ]);
      expect(pluginManagerService['handleEventMiddlewares']).toEqual([
        plugin2,
        plugin4,
      ]);
      expect(pluginManagerService['broadcastMiddlewares']).toEqual([
        plugin3,
        plugin4,
      ]);
    });
  });

  describe('handleMessage', () => {
    it('should call middlewares in order', async () => {
      const arr: number[] = [];
      pluginManagerService.register(
        {
          handleMessage: async (ctx, message, next) => {
            arr.push(1);
            const result = await next(ctx, message);
            arr.push(5);
            return result;
          },
        },
        {
          handleMessage: async (ctx, message, next) => {
            arr.push(2);
            const result = await next(ctx, message);
            arr.push(4);
            return result;
          },
        },
      );

      await pluginManagerService.handleMessage(
        ctx,
        {} as IncomingMessage,
        async () => {
          arr.push(3);
          return { messageType: 'EVENT', success: true };
        },
      );

      expect(arr).toEqual([1, 2, 3, 4, 5]);
    });

    it('should directly return if middleware does not call next', async () => {
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
        handleMessage: async (ctx, message, next) => {
          await next(ctx, message);
          await next(ctx, message);
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

  describe('handleEvent', () => {
    it('should call middlewares in order', async () => {
      const arr: number[] = [];
      pluginManagerService.register(
        {
          handleEvent: async (ctx, event, next) => {
            arr.push(1);
            const result = await next(ctx, event);
            arr.push(5);
            return result;
          },
        },
        {
          handleEvent: async (ctx, event, next) => {
            arr.push(2);
            const result = await next(ctx, event);
            arr.push(4);
            return result;
          },
        },
      );

      await pluginManagerService.handleEvent(ctx, {} as Event, async () => {
        arr.push(3);
        return { success: true };
      });

      expect(arr).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('broadcast', () => {
    it('should call middlewares in order', async () => {
      const arr: number[] = [];
      pluginManagerService.register(
        {
          broadcast: async (ctx, event, next) => {
            arr.push(1);
            await next(ctx, event);
            arr.push(5);
          },
        },
        {
          broadcast: async (ctx, event, next) => {
            arr.push(2);
            await next(ctx, event);
            arr.push(4);
          },
        },
      );

      await pluginManagerService.broadcast(ctx, {} as Event, async () => {
        arr.push(3);
      });

      expect(arr).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
