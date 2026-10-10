import {
  Client,
  ClientContext,
  ClientReadyState,
  ConsoleLoggerService,
  Event,
  EventKind,
  EventUtils,
  Filter,
  MessageType,
} from '../../../common';
import { SubscriptionService } from '../../src/services/subscription.service';
import { PluginManagerService } from '../../src/services/plugin-manager.service';

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService;
  let client: Client;
  let ctx: ClientContext;
  let clientsMap: Map<Client, ClientContext>;
  let pluginManagerService: PluginManagerService;

  beforeEach(() => {
    clientsMap = new Map<Client, ClientContext>();
    pluginManagerService = new PluginManagerService();
    subscriptionService = new SubscriptionService(
      clientsMap,
      new ConsoleLoggerService(),
      pluginManagerService,
    );
    client = {
      readyState: ClientReadyState.OPEN,
      send: jest.fn(),
    };
    ctx = new ClientContext(client);
    clientsMap.set(client, ctx);
  });

  describe('subscribe', () => {
    it('should add subscription', () => {
      const subscriptionId = 'subscriptionId';
      const filters = [{}] as Filter[];

      subscriptionService.subscribe(ctx, subscriptionId, filters);

      expect(ctx.subscriptions.get(subscriptionId)?.filters).toEqual(filters);
    });

    it('should add subscription to existing client', () => {
      const subscriptionIdA = 'subscriptionIdA';
      const subscriptionIdB = 'subscriptionIdB';
      const filtersA = [{}] as Filter[];
      const filtersB = [{}, {}] as Filter[];

      subscriptionService.subscribe(ctx, subscriptionIdA, filtersA);
      subscriptionService.subscribe(ctx, subscriptionIdB, filtersB);

      expect(ctx.subscriptions.get(subscriptionIdA)?.filters).toEqual(filtersA);
      expect(ctx.subscriptions.get(subscriptionIdB)?.filters).toEqual(filtersB);
    });
  });

  describe('unsubscribe', () => {
    it('should remove subscription', () => {
      const subscriptionIdA = 'subscriptionIdA';
      const subscriptionIdB = 'subscriptionIdB';
      const filtersA = [{}] as Filter[];
      const filtersB = [{}, {}] as Filter[];

      subscriptionService.subscribe(ctx, subscriptionIdA, filtersA);
      subscriptionService.subscribe(ctx, subscriptionIdB, filtersB);

      expect(
        subscriptionService.unsubscribe(ctx, subscriptionIdA),
      ).toBeTruthy();

      expect(ctx.subscriptions.get(subscriptionIdA)?.filters).toBeUndefined();
      expect(ctx.subscriptions.get(subscriptionIdB)?.filters).toEqual(filtersB);
    });

    it('should return false if client is not found', () => {
      const subscriptionId = 'subscriptionId';

      expect(subscriptionService.unsubscribe(ctx, subscriptionId)).toBeFalsy();
    });
  });

  describe('broadcast', () => {
    const taggedEvent: Event = {
      id: 'id',
      pubkey: 'author',
      created_at: 1,
      kind: EventKind.TEXT_NOTE,
      tags: [],
      content: '',
      sig: '',
    };
    it('checks read permission once per matching client and isolates lookup failures', async () => {
      const otherClient: Client = {
        readyState: ClientReadyState.OPEN,
        send: jest.fn(),
      };
      const otherCtx = new ClientContext(otherClient);
      clientsMap.set(otherClient, otherCtx);
      const canReadEvent = jest.fn(async recipient => {
        if (recipient === ctx) throw new Error('lookup failed');
        return true;
      });
      pluginManagerService.register({ canReadEvent });
      const logError = jest
        .spyOn(subscriptionService['logger'], 'error')
        .mockImplementation();
      subscriptionService.subscribe(ctx, 'first', [{}]);
      subscriptionService.subscribe(ctx, 'second', [{}]);
      subscriptionService.subscribe(otherCtx, 'other', [{}]);

      await subscriptionService.broadcast(taggedEvent);

      expect(canReadEvent).toHaveBeenCalledTimes(2);
      expect(canReadEvent).toHaveBeenCalledWith(ctx, taggedEvent);
      expect(canReadEvent).toHaveBeenCalledWith(otherCtx, taggedEvent);
      expect(client.send).not.toHaveBeenCalled();
      expect(otherClient.send).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalled();
    });

    it('checks read guards even when a broadcast plugin calls next', async () => {
      pluginManagerService.register({
        broadcast: async (_ctx, _event, next) => {
          await next();
        },
        canReadEvent: () => false,
      });
      subscriptionService.subscribe(ctx, 'subscription', [{}]);
      await subscriptionService.broadcast(taggedEvent);
      expect(client.send).not.toHaveBeenCalled();
    });

    it('runs plugins once per client and can block one recipient', async () => {
      const otherClient: Client = {
        readyState: ClientReadyState.OPEN,
        send: jest.fn(),
      };
      const otherCtx = new ClientContext(otherClient);
      clientsMap.set(otherClient, otherCtx);
      const event = taggedEvent;
      const broadcast = jest.fn(async (recipient, _event, next) => {
        if (recipient === ctx) await next();
      });
      pluginManagerService.register({ broadcast });
      subscriptionService.subscribe(ctx, 'first', [{}]);
      subscriptionService.subscribe(ctx, 'second', [{}]);
      subscriptionService.subscribe(otherCtx, 'other', [{}]);

      await subscriptionService.broadcast(event);

      expect(broadcast).toHaveBeenCalledTimes(2);
      expect(broadcast).toHaveBeenCalledWith(ctx, event, expect.any(Function));
      expect(broadcast).toHaveBeenCalledWith(
        otherCtx,
        event,
        expect.any(Function),
      );
      expect(client.send).toHaveBeenCalledTimes(2);
      expect(otherClient.send).not.toHaveBeenCalled();
    });

    it('does not run plugins for clients without matching subscriptions', async () => {
      const broadcast = jest.fn();
      pluginManagerService.register({ broadcast });
      const event = taggedEvent;
      await subscriptionService.broadcast(event);
      subscriptionService.subscribe(ctx, 'unmatched', [{ ids: ['other'] }]);
      await subscriptionService.broadcast(event);
      expect(broadcast).not.toHaveBeenCalled();
    });

    it('continues delivering to other clients after a plugin rejects', async () => {
      const otherClient: Client = {
        readyState: ClientReadyState.OPEN,
        send: jest.fn(),
      };
      const otherCtx = new ClientContext(otherClient);
      clientsMap.set(otherClient, otherCtx);
      pluginManagerService.register({
        broadcast: async (recipient, _event, next) => {
          if (recipient === ctx) throw new Error('permission lookup failed');
          await next();
        },
      });
      const logError = jest
        .spyOn(subscriptionService['logger'], 'error')
        .mockImplementation();
      subscriptionService.subscribe(ctx, 'first', [{}]);
      subscriptionService.subscribe(otherCtx, 'other', [{}]);
      const event = taggedEvent;

      await subscriptionService.broadcast(event);

      expect(client.send).not.toHaveBeenCalled();
      expect(otherClient.send).toHaveBeenCalledTimes(1);
      expect(logError).toHaveBeenCalled();
    });

    it('does not send to subscriptions removed during an async plugin', async () => {
      pluginManagerService.register({
        broadcast: async (recipient, _event, next) => {
          await Promise.resolve();
          subscriptionService.unsubscribe(recipient, 'removed');
          await next();
        },
      });
      subscriptionService.subscribe(ctx, 'removed', [{}]);
      await subscriptionService.broadcast(taggedEvent);
      expect(client.send).not.toHaveBeenCalled();
    });

    it('should broadcast event to client', async () => {
      const subscriptionId = 'subscriptionId';
      const filters = [{}] as Filter[];
      const event = {
        id: 'id',
      } as Event;

      jest.spyOn(EventUtils, 'isMatchingFilter').mockReturnValue(true);

      subscriptionService.subscribe(ctx, subscriptionId, filters);
      await subscriptionService.broadcast(event);

      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.EVENT, subscriptionId, event]),
      );
    });

    it('should not broadcast event to client if not matching filter', async () => {
      const subscriptionId = 'subscriptionId';
      const filters = [{}] as Filter[];
      const event = {
        id: 'id',
      } as Event;

      jest.spyOn(EventUtils, 'isMatchingFilter').mockReturnValue(false);

      subscriptionService.subscribe(ctx, subscriptionId, filters);
      await subscriptionService.broadcast(event);

      expect(client.send).not.toHaveBeenCalled();
    });

    it('should not broadcast event to client if client is not open', async () => {
      const subscriptionId = 'subscriptionId';
      const filters = [{}] as Filter[];
      const event = {
        id: 'id',
      } as Event;

      jest.spyOn(EventUtils, 'isMatchingFilter').mockReturnValue(true);

      subscriptionService.subscribe(ctx, subscriptionId, filters);
      client.readyState = ClientReadyState.CLOSED;
      await subscriptionService.broadcast(event);

      expect(client.send).not.toHaveBeenCalled();
    });

    it('allows a plugin to block direct messages for an unauthenticated client', async () => {
      const subscriptionId = 'subscriptionId';
      const filters = [{}] as Filter[];
      const event = {
        id: 'id',
        kind: EventKind.ENCRYPTED_DIRECT_MESSAGE,
      } as Event;

      jest.spyOn(EventUtils, 'isMatchingFilter').mockReturnValue(true);
      const broadcast = jest.fn(async (recipient, _event, next) => {
        if (recipient.pubkey) await next();
      });
      pluginManagerService.register({ broadcast });

      subscriptionService.subscribe(ctx, subscriptionId, filters);
      await subscriptionService.broadcast(event);

      expect(client.send).not.toHaveBeenCalled();
      expect(broadcast).toHaveBeenCalledWith(ctx, event, expect.any(Function));
    });

    it('broadcasts direct messages to an unauthenticated client without a guard plugin', async () => {
      const subscriptionId = 'subscriptionId';
      const filters = [{}] as Filter[];
      const event = {
        id: 'id',
        kind: EventKind.ENCRYPTED_DIRECT_MESSAGE,
      } as Event;

      jest.spyOn(EventUtils, 'isMatchingFilter').mockReturnValue(true);

      subscriptionService.subscribe(ctx, subscriptionId, filters);
      await subscriptionService.broadcast(event);

      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.EVENT, subscriptionId, event]),
      );
    });

    it('should catch error', async () => {
      const subscriptionId = 'subscriptionId';
      const filters = [{}] as Filter[];
      const event = {
        id: 'id',
      } as Event;

      jest.spyOn(EventUtils, 'isMatchingFilter').mockImplementation(() => {
        throw new Error('error');
      });
      const spyLoggerError = jest
        .spyOn(subscriptionService['logger'], 'error')
        .mockImplementation();

      subscriptionService.subscribe(ctx, subscriptionId, filters);
      await subscriptionService.broadcast(event);

      expect(client.send).not.toHaveBeenCalled();
      expect(spyLoggerError).toHaveBeenCalled();
    });
  });
});
