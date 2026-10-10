import { from } from 'rxjs';
import {
  Client,
  ClientContext,
  ClientReadyState,
  Event,
  EventRepository,
  EventUtils,
  Filter,
  MessageType,
  NostrRelayPlugin,
  OutgoingOkMessage,
  SubscriptionId,
} from '../../common';
import { NostrRelay } from '../src/nostr-relay';

describe('NostrRelay', () => {
  let nostrRelay: NostrRelay;
  let client: Client;

  beforeEach(() => {
    nostrRelay = new NostrRelay({} as EventRepository, {
      hostname: 'test',
    });

    client = {
      send: jest.fn(),
      readyState: ClientReadyState.OPEN,
    };
  });

  describe('constructor', () => {
    it('should create instance', () => {
      expect(nostrRelay).toBeDefined();
    });
  });

  describe('register', () => {
    it('should register plugin', () => {
      const mockPluginManagerServiceRegister = jest
        .spyOn(nostrRelay['pluginManagerService'], 'register')
        .mockImplementation();

      nostrRelay.register({} as NostrRelayPlugin);

      expect(mockPluginManagerServiceRegister).toHaveBeenCalledWith({});
    });
  });

  describe('handleConnection', () => {
    it('should add client to clientMap', () => {
      nostrRelay.handleConnection(client);

      const ctx = nostrRelay['clientContexts'].get(client);
      expect(ctx).toBeDefined();

      const { id } = ctx!;
      expect(id).toStrictEqual(expect.any(String));
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.AUTH, id]),
      );
    });
  });

  describe('handleDisconnect', () => {
    it('should remove client from clientMap', () => {
      nostrRelay.handleConnection(client);
      nostrRelay.handleDisconnect(client);

      expect(nostrRelay['clientContexts'].get(client)).toBeUndefined();
    });
  });

  describe('event', () => {
    it('should handle event successfully', async () => {
      const event = { id: 'eventId' } as Event;
      const handleResult = { needResponse: true, success: true };
      const outgoingMessage: OutgoingOkMessage = [
        MessageType.OK,
        event.id,
        true,
        '',
      ];

      const mockHandleEvent = jest
        .spyOn(nostrRelay['eventService'], 'handleEvent')
        .mockResolvedValue(handleResult);

      await nostrRelay.handleMessage(client, [MessageType.EVENT, event]);

      expect(mockHandleEvent).toHaveBeenCalledWith(event);
      expect(client.send).toHaveBeenCalledWith(JSON.stringify(outgoingMessage));
    });

    it('does not cache handle results in the framework', async () => {
      const event = { id: 'eventId' } as Event;
      const outgoingMessage: OutgoingOkMessage = [
        MessageType.OK,
        event.id,
        true,
        '',
      ];
      const outgoingMessageStr = JSON.stringify(outgoingMessage);

      const mockHandleEvent = jest
        .spyOn(nostrRelay['eventService'], 'handleEvent')
        .mockResolvedValue({ success: true });

      await Promise.all([
        nostrRelay.handleMessage(client, [MessageType.EVENT, event]),
        nostrRelay.handleMessage(client, [MessageType.EVENT, event]),
      ]);

      expect(mockHandleEvent).toHaveBeenCalledTimes(2);
      expect(client.send).toHaveBeenCalledTimes(2);
      expect(client.send).toHaveBeenNthCalledWith(1, outgoingMessageStr);
      expect(client.send).toHaveBeenNthCalledWith(2, outgoingMessageStr);
    });

    it('should not cache handle result', async () => {
      const nostrRelayWithoutCache = new NostrRelay({} as EventRepository, {
        hostname: 'test',
      });
      const event = { id: 'eventId' } as Event;
      const outgoingMessage: OutgoingOkMessage = [
        MessageType.OK,
        event.id,
        true,
        '',
      ];
      const outgoingMessageStr = JSON.stringify(outgoingMessage);

      const mockHandleEvent = jest
        .spyOn(nostrRelayWithoutCache['eventService'], 'handleEvent')
        .mockResolvedValue({ success: true });

      await Promise.all([
        nostrRelayWithoutCache.handleMessage(client, [
          MessageType.EVENT,
          event,
        ]),
        nostrRelayWithoutCache.handleMessage(client, [
          MessageType.EVENT,
          event,
        ]),
      ]);

      expect(mockHandleEvent).toHaveBeenCalledTimes(2);
      expect(client.send).toHaveBeenCalledTimes(2);
      expect(client.send).toHaveBeenNthCalledWith(1, outgoingMessageStr);
      expect(client.send).toHaveBeenNthCalledWith(2, outgoingMessageStr);
    });
  });

  describe('req', () => {
    let ctx: ClientContext;

    beforeEach(() => {
      ctx = nostrRelay['getClientContext'](client);
    });

    it('uses the same read guard for historical results and live delivery', async () => {
      const denied = { id: 'denied', kind: 1 } as Event;
      const allowed = { id: 'allowed', kind: 1 } as Event;
      const canReadEvent = jest.fn(async (recipient, event) => {
        await Promise.resolve();
        return recipient === ctx && event.id === allowed.id;
      });
      nostrRelay.register({ canReadEvent });
      jest
        .spyOn(nostrRelay['eventService'], 'find$')
        .mockReturnValue(from([denied, allowed]));

      const result = await nostrRelay.handleMessage(client, [
        MessageType.REQ,
        'subscription',
        {},
      ]);

      expect(result).toEqual({
        messageType: MessageType.REQ,
        events: [allowed],
      });
      expect(client.send).toHaveBeenNthCalledWith(
        1,
        JSON.stringify([MessageType.EVENT, 'subscription', allowed]),
      );
      expect(client.send).toHaveBeenNthCalledWith(
        2,
        JSON.stringify([MessageType.EOSE, 'subscription']),
      );
      expect(client.send).toHaveBeenCalledTimes(2);
      expect(canReadEvent).toHaveBeenNthCalledWith(
        1,
        ctx,
        denied,
        expect.any(AbortSignal),
      );
      expect(canReadEvent).toHaveBeenNthCalledWith(
        2,
        ctx,
        allowed,
        expect.any(AbortSignal),
      );

      jest.mocked(client.send).mockClear();
      await nostrRelay.broadcast(denied);
      await nostrRelay.broadcast(allowed);

      expect(client.send).toHaveBeenCalledTimes(1);
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.EVENT, 'subscription', allowed]),
      );
      expect(canReadEvent).toHaveBeenCalledTimes(4);
    });

    it('sends EOSE and retains the subscription when all historical events are denied', async () => {
      nostrRelay.register({ canReadEvent: () => false });
      jest
        .spyOn(nostrRelay['eventService'], 'find$')
        .mockReturnValue(from([{ id: 'denied' } as Event]));

      const result = await nostrRelay.handleMessage(client, [
        MessageType.REQ,
        'subscription',
        {},
      ]);

      expect(result).toEqual({ messageType: MessageType.REQ, events: [] });
      expect(client.send).toHaveBeenCalledTimes(1);
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.EOSE, 'subscription']),
      );
      expect(ctx.subscriptions.has('subscription')).toBe(true);
    });

    it('closes the request without sending an event when its read guard fails', async () => {
      nostrRelay.register({
        canReadEvent: async () => {
          throw new Error('lookup failed');
        },
      });
      jest
        .spyOn(nostrRelay['eventService'], 'find$')
        .mockReturnValue(from([{ id: 'denied' } as Event]));

      const result = await nostrRelay.handleMessage(client, [
        MessageType.REQ,
        'subscription',
        {},
      ]);

      expect(result).toEqual({ messageType: MessageType.REQ, events: [] });
      expect(client.send).toHaveBeenCalledTimes(1);
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.CLOSED, 'subscription', 'lookup failed']),
      );
      expect(ctx.subscriptions.has('subscription')).toBe(false);
    });

    it('applies read guards to direct queries with a context and filters the callback', async () => {
      const events = [{ id: 'denied' }, { id: 'allowed' }] as Event[];
      nostrRelay.register({
        canReadEvent: (_ctx, event) => event.id === 'allowed',
      });
      jest
        .spyOn(nostrRelay['eventService'], 'find$')
        .mockReturnValue(from(events));
      const iteratee = jest.fn();

      expect(await nostrRelay.findEvents([{}], ctx, iteratee)).toEqual([
        events[1],
      ]);
      expect(iteratee).toHaveBeenCalledTimes(1);
      expect(iteratee).toHaveBeenCalledWith(events[1]);
      expect(await nostrRelay.findEvents([{}])).toEqual(events);
    });

    it('preserves event order and waits for asynchronous guards before EOSE', async () => {
      const events = [{ id: 'first' }, { id: 'second' }] as Event[];
      let allowFirst!: (allowed: boolean) => void;
      const firstPermission = new Promise<boolean>(resolve => {
        allowFirst = resolve;
      });
      const canReadEvent = jest.fn((_ctx, event) =>
        event.id === 'first' ? firstPermission : true,
      );
      nostrRelay.register({ canReadEvent });
      jest
        .spyOn(nostrRelay['eventService'], 'find$')
        .mockReturnValue(from(events));

      const result = nostrRelay.handleMessage(client, [
        MessageType.REQ,
        'subscription',
        {},
      ]);
      await Promise.resolve();
      expect(client.send).not.toHaveBeenCalled();
      allowFirst(true);
      await result;

      expect(client.send).toHaveBeenNthCalledWith(
        1,
        JSON.stringify([MessageType.EVENT, 'subscription', events[0]]),
      );
      expect(client.send).toHaveBeenNthCalledWith(
        2,
        JSON.stringify([MessageType.EVENT, 'subscription', events[1]]),
      );
      expect(client.send).toHaveBeenNthCalledWith(
        3,
        JSON.stringify([MessageType.EOSE, 'subscription']),
      );
    });

    it('should handle req successfully', async () => {
      const subscriptionId: SubscriptionId = 'subscriptionId';
      const filters: Filter[] = [{ kinds: [0, 1] }, { ids: ['a'] }];
      const events = [
        { id: 'a', kind: 0 },
        { id: 'b', kind: 1 },
        { id: 'c', kind: 4 },
      ] as Event[];

      const mockSubscribe = jest.spyOn(
        nostrRelay['subscriptionService'],
        'subscribe',
      );
      const mockFind = jest
        .spyOn(nostrRelay['eventService'], 'find$')
        .mockReturnValue(from(events));

      const result = await nostrRelay.handleMessage(client, [
        MessageType.REQ,
        subscriptionId,
        ...filters,
      ]);

      expect(result).toEqual({
        messageType: MessageType.REQ,
        events,
      });
      expect(mockSubscribe).toHaveBeenCalledWith(
        ctx,
        subscriptionId,
        filters,
        true,
      );
      expect(mockFind).toHaveBeenCalledWith(filters, {
        signal: expect.any(AbortSignal),
      });
      expect(client.send).toHaveBeenNthCalledWith(
        1,
        JSON.stringify([MessageType.EVENT, subscriptionId, events[0]]),
      );
      expect(client.send).toHaveBeenNthCalledWith(
        2,
        JSON.stringify([MessageType.EVENT, subscriptionId, events[1]]),
      );
      expect(client.send).toHaveBeenNthCalledWith(
        3,
        JSON.stringify([MessageType.EVENT, subscriptionId, events[2]]),
      );
      expect(client.send).toHaveBeenNthCalledWith(
        4,
        JSON.stringify([MessageType.EOSE, subscriptionId]),
      );
    });

    it('serves direct messages without authentication when no guard plugin is registered', async () => {
      const subscriptionId = 'subscriptionId';
      const filters: Filter[] = [{ kinds: [4] }];
      const events = [{ id: 'dm', kind: 4 }] as Event[];
      jest
        .spyOn(nostrRelay['eventService'], 'find$')
        .mockReturnValue(from(events));

      const result = await nostrRelay.handleMessage(client, [
        MessageType.REQ,
        subscriptionId,
        ...filters,
      ]);

      expect(ctx.pubkey).toBeUndefined();
      expect(result).toEqual({ messageType: MessageType.REQ, events });
      expect(ctx.subscriptions.get(subscriptionId)?.filters).toEqual(filters);
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.EVENT, subscriptionId, events[0]]),
      );
      expect(client.send).toHaveBeenCalledTimes(2);
    });

    it('lets a message plugin reject a direct message subscription', async () => {
      const find = jest.spyOn(nostrRelay['eventService'], 'find$');
      nostrRelay.register({
        handleMessage: async (recipient, message, next) => {
          if (message[0] === MessageType.REQ && !recipient.pubkey) {
            recipient.sendMessage([
              MessageType.CLOSED,
              message[1],
              'restricted: authentication required',
            ]);
            return { messageType: MessageType.REQ, events: [] };
          }
          return next();
        },
      });

      const result = await nostrRelay.handleMessage(client, [
        MessageType.REQ,
        'blocked',
        { kinds: [4] },
      ]);

      expect(result).toEqual({ messageType: MessageType.REQ, events: [] });
      expect(find).not.toHaveBeenCalled();
      expect(ctx.subscriptions.has('blocked')).toBe(false);
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([
          MessageType.CLOSED,
          'blocked',
          'restricted: authentication required',
        ]),
      );
    });

    it('should handle req successfully if client is authenticated and filter contains encrypted direct message kind', async () => {
      const subscriptionId: SubscriptionId = 'subscriptionId';
      const pubkey = 'pubkey';
      const filters: Filter[] = [{ kinds: [4] }];
      const events = [
        { id: 'a', kind: 4, pubkey, tags: [] as string[][] },
      ] as Event[];
      ctx.pubkey = pubkey;

      const mockSubscribe = jest.spyOn(
        nostrRelay['subscriptionService'],
        'subscribe',
      );
      const mockFind = jest
        .spyOn(nostrRelay['eventService'], 'find$')
        .mockReturnValue(from(events));

      const result = await nostrRelay.handleMessage(client, [
        MessageType.REQ,
        subscriptionId,
        ...filters,
      ]);

      expect(result).toEqual({ messageType: MessageType.REQ, events });
      expect(mockSubscribe).toHaveBeenCalledWith(
        ctx,
        subscriptionId,
        filters,
        true,
      );
      expect(mockFind).toHaveBeenCalledWith(filters, {
        signal: expect.any(AbortSignal),
      });
      expect(client.send).toHaveBeenNthCalledWith(
        1,
        JSON.stringify([MessageType.EVENT, subscriptionId, events[0]]),
      );
      expect(client.send).toHaveBeenNthCalledWith(
        2,
        JSON.stringify([MessageType.EOSE, subscriptionId]),
      );
    });

    it('should handle req successfully if NIP-42 is not enabled and filter contains encrypted direct message kind', async () => {
      const nostrRelayWithoutHostname = new NostrRelay({} as EventRepository);
      const subscriptionId: SubscriptionId = 'subscriptionId';
      const filters: Filter[] = [{ kinds: [4] }];
      const events = [{ id: 'a', kind: 4 }] as Event[];
      const ctx = nostrRelayWithoutHostname['getClientContext'](client);

      const mockSubscribe = jest.spyOn(
        nostrRelayWithoutHostname['subscriptionService'],
        'subscribe',
      );
      const mockFind = jest
        .spyOn(nostrRelayWithoutHostname['eventService'], 'find$')
        .mockReturnValue(from(events));

      const result = await nostrRelayWithoutHostname.handleMessage(client, [
        MessageType.REQ,
        subscriptionId,
        ...filters,
      ]);

      expect(result).toEqual({ messageType: MessageType.REQ, events });
      expect(mockSubscribe).toHaveBeenCalledWith(
        ctx,
        subscriptionId,
        filters,
        true,
      );
      expect(mockFind).toHaveBeenCalledWith(filters, {
        signal: expect.any(AbortSignal),
      });
      expect(client.send).toHaveBeenNthCalledWith(
        1,
        JSON.stringify([MessageType.EVENT, subscriptionId, events[0]]),
      );
      expect(client.send).toHaveBeenNthCalledWith(
        2,
        JSON.stringify([MessageType.EOSE, subscriptionId]),
      );
    });
  });

  describe('close', () => {
    it('should handle close successfully', async () => {
      const subscriptionId: SubscriptionId = 'subscriptionId';
      const mockUnsubscribe = jest
        .spyOn(nostrRelay['subscriptionService'], 'unsubscribe')
        .mockReturnValue(true);
      const ctx = nostrRelay['getClientContext'](client);

      await nostrRelay.handleMessage(client, [
        MessageType.CLOSE,
        subscriptionId,
      ]);

      expect(mockUnsubscribe).toHaveBeenCalledWith(ctx, subscriptionId);
    });
  });

  describe('count', () => {
    it('should return an exact count without creating a subscription', async () => {
      const queryId = 'queryId';
      const filters: Filter[] = [
        { kinds: [1] },
        { kinds: [1], '#t': ['nostr'] },
      ];
      const mockCount = jest
        .spyOn(nostrRelay['eventService'], 'count')
        .mockResolvedValue(3);
      const mockSubscribe = jest.spyOn(
        nostrRelay['subscriptionService'],
        'subscribe',
      );

      const result = await nostrRelay.handleMessage(client, [
        MessageType.COUNT,
        queryId,
        ...filters,
      ]);

      expect(result).toEqual({ messageType: MessageType.COUNT, count: 3 });
      expect(mockCount).toHaveBeenCalledWith(filters, [], {
        signal: expect.any(AbortSignal),
      });
      expect(mockSubscribe).not.toHaveBeenCalled();
      expect(client.send).toHaveBeenCalledTimes(1);
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.COUNT, queryId, { count: 3 }]),
      );
    });

    it('should return CLOSED when the repository does not support count', async () => {
      jest
        .spyOn(nostrRelay['eventService'], 'count')
        .mockRejectedValue(
          new Error('unsupported: COUNT is not supported by this repository'),
        );

      const result = await nostrRelay.handleMessage(client, [
        MessageType.COUNT,
        'queryId',
        { kinds: [1] },
      ]);

      expect(result).toEqual({
        messageType: MessageType.COUNT,
        error: 'unsupported: COUNT is not supported by this repository',
      });
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([
          MessageType.CLOSED,
          'queryId',
          'unsupported: COUNT is not supported by this repository',
        ]),
      );
    });

    it.each([{}, { kinds: [] }, { kinds: [4] }])(
      'counts all requested kinds without authentication: %j',
      async filter => {
        const mockCount = jest
          .spyOn(nostrRelay['eventService'], 'count')
          .mockResolvedValue(2);

        const result = await nostrRelay.handleMessage(client, [
          MessageType.COUNT,
          'queryId',
          filter,
        ]);

        expect(result).toEqual({ messageType: MessageType.COUNT, count: 2 });
        expect(mockCount).toHaveBeenCalledWith([filter], [], {
          signal: expect.any(AbortSignal),
        });
        expect(client.send).toHaveBeenCalledTimes(1);
        expect(client.send).toHaveBeenCalledWith(
          JSON.stringify([MessageType.COUNT, 'queryId', { count: 2 }]),
        );
      },
    );

    it('lets a message plugin reject a count request', async () => {
      const count = jest.spyOn(nostrRelay['eventService'], 'count');
      nostrRelay.register({
        handleMessage: async (ctx, message, next) => {
          if (message[0] === MessageType.COUNT && !ctx.pubkey) {
            ctx.sendMessage([
              MessageType.CLOSED,
              message[1],
              'restricted: authentication required',
            ]);
            return {
              messageType: MessageType.COUNT,
              error: 'restricted: authentication required',
            };
          }
          return next();
        },
      });

      const result = await nostrRelay.handleMessage(client, [
        MessageType.COUNT,
        'queryId',
        {},
      ]);

      expect(count).not.toHaveBeenCalled();
      expect(result).toEqual({
        messageType: MessageType.COUNT,
        error: 'restricted: authentication required',
      });
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([
          MessageType.CLOSED,
          'queryId',
          'restricted: authentication required',
        ]),
      );
    });
  });

  describe('auth', () => {
    it('should handle auth successfully', async () => {
      const pubkey = 'pubkey';
      const signedEvent = { id: 'eventId' } as Event;

      jest.spyOn(EventUtils, 'isSignedEventValid').mockImplementation();
      jest.spyOn(EventUtils, 'getAuthor').mockReturnValue(pubkey);

      nostrRelay.handleConnection(client);
      await nostrRelay.handleMessage(client, [MessageType.AUTH, signedEvent]);

      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.OK, signedEvent.id, true, '']),
      );
      expect(nostrRelay['clientContexts'].get(client)?.pubkey).toBe(pubkey);
    });

    it('should return failed msg if signed event is invalid', async () => {
      const signedEvent = { id: 'eventId' } as Event;

      jest.spyOn(EventUtils, 'isSignedEventValid').mockReturnValue('invalid');

      nostrRelay.handleConnection(client);
      await nostrRelay.handleMessage(client, [MessageType.AUTH, signedEvent]);

      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.OK, signedEvent.id, false, 'invalid']),
      );
    });

    it('should return directly if hostname is not set', async () => {
      const nostrRelayWithoutHostname = new NostrRelay({} as EventRepository);
      const signedEvent = { id: 'eventId' } as Event;

      await nostrRelayWithoutHostname.handleMessage(client, [
        MessageType.AUTH,
        signedEvent,
      ]);

      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.OK, signedEvent.id, true, '']),
      );
    });
  });

  it('unknown message type', async () => {
    const result = await nostrRelay.handleMessage(client, ['unknown'] as any);
    expect(result).toBeUndefined();
    expect(client.send).toHaveBeenCalledWith(
      JSON.stringify([MessageType.NOTICE, 'invalid: unknown message type']),
    );
  });

  describe('isAuthorized', () => {
    it('should return true if hostname is not set', () => {
      const nostrRelayWithoutHostname = new NostrRelay({} as EventRepository);

      expect(nostrRelayWithoutHostname.isAuthorized(client)).toBeTruthy();
    });

    it('should return false if client is not authenticated', () => {
      expect(nostrRelay.isAuthorized(client)).toBeFalsy();
    });

    it('should return true if client is authenticated', () => {
      nostrRelay.handleConnection(client);
      nostrRelay['clientContexts'].get(client)!.pubkey = 'pubkey';

      expect(nostrRelay.isAuthorized(client)).toBeTruthy();
    });
  });

  describe('broadcast', () => {
    it('passes the receiving context through plugins on direct broadcasts', async () => {
      nostrRelay.handleConnection(client);
      const ctx = nostrRelay['clientContexts'].get(client)!;
      nostrRelay['subscriptionService'].subscribe(ctx, 'subscription', [{}]);
      const event: Event = {
        id: 'eventId',
        pubkey: 'author',
        created_at: 1,
        kind: 1,
        tags: [],
        content: '',
        sig: '',
      };
      const broadcast = jest.fn(async (_ctx, _event, next) => {
        await next();
      });
      nostrRelay.register({ broadcast });
      jest.mocked(client.send).mockClear();

      await nostrRelay.broadcast(event);

      expect(broadcast).toHaveBeenCalledWith(ctx, event, expect.any(Function));
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.EVENT, 'subscription', event]),
      );
    });

    it('should call broadcast on subscriptionService', async () => {
      const mockSubscriptionServiceBroadcast = jest
        .spyOn(nostrRelay['subscriptionService'], 'broadcast')
        .mockResolvedValue(undefined);
      const event = { id: 'eventId' } as Event;

      await nostrRelay.broadcast(event);

      expect(mockSubscriptionServiceBroadcast).toHaveBeenCalledWith(event);
    });
  });

  describe('destroy', () => {
    it('should destroy successfully', async () => {
      const mockEventServiceDestroy = jest
        .spyOn(nostrRelay['eventService'], 'destroy')
        .mockImplementation();

      nostrRelay.handleConnection(client);
      expect(nostrRelay['clientContexts'].size).toBe(1);

      await nostrRelay.destroy();

      expect(nostrRelay['clientContexts'].size).toBe(0);
      expect(mockEventServiceDestroy).toHaveBeenCalled();
    });
  });
});
