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
        broadcast: jest.fn(),
      };

      pluginManagerService.register(plugin);

      expect(pluginManagerService['handleMessagePlugins']).toEqual([plugin]);
      expect(pluginManagerService['broadcastPlugins']).toEqual([plugin]);
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

  describe('broadcast', () => {
    it('should call plugins in order', async () => {
      const arr: number[] = [];
      pluginManagerService.register(
        {
          broadcast: async (_ctx, _message, next) => {
            arr.push(1);
            await next();
            arr.push(5);
          },
        },
        {
          broadcast: async (_ctx, _message, next) => {
            arr.push(2);
            await next();
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
