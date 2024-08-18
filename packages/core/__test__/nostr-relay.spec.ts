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

      await nostrRelay.handleEventMessage(client, event);

      expect(mockHandleEvent).toHaveBeenCalledWith(event);
      expect(client.send).toHaveBeenCalledWith(JSON.stringify(outgoingMessage));
    });

    it('should cache handle result', async () => {
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
        nostrRelay.handleEventMessage(client, event),
        nostrRelay.handleEventMessage(client, event),
      ]);

      expect(mockHandleEvent).toHaveBeenCalledTimes(1);
      expect(client.send).toHaveBeenCalledTimes(2);
      expect(client.send).toHaveBeenNthCalledWith(1, outgoingMessageStr);
      expect(client.send).toHaveBeenNthCalledWith(2, outgoingMessageStr);
    });

    it('should not cache handle result', async () => {
      const nostrRelayWithoutCache = new NostrRelay({} as EventRepository, {
        hostname: 'test',
        eventHandlingResultCacheTtl: 0,
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
        nostrRelayWithoutCache.handleEventMessage(client, event),
        nostrRelayWithoutCache.handleEventMessage(client, event),
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

    it('should handle req successfully', async () => {
      const subscriptionId: SubscriptionId = 'subscriptionId';
      const filters: Filter[] = [{ kinds: [0, 1] }, { ids: ['a'] }];
      const events = [
        { id: 'a', kind: 0 },
        { id: 'b', kind: 1 },
        { id: 'c', kind: 4 }, // should be filtered out
      ] as Event[];

      const mockSubscribe = jest
        .spyOn(nostrRelay['subscriptionService'], 'subscribe')
        .mockImplementation();
      const mockFind = jest
        .spyOn(nostrRelay['eventService'], 'find$')
        .mockReturnValue(from(events));

      const result = await nostrRelay.handleReqMessage(
        client,
        subscriptionId,
        filters,
      );

      expect(result).toEqual({ events: events.slice(0, 2) });
      expect(mockSubscribe).toHaveBeenCalledWith(ctx, subscriptionId, filters);
      expect(mockFind).toHaveBeenCalledWith(filters);
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
        JSON.stringify([MessageType.EOSE, subscriptionId]),
      );
    });

    it('should return notice if client is not authenticated and filter contains encrypted direct message kind', async () => {
      const subscriptionId: SubscriptionId = 'subscriptionId';
      const filters: Filter[] = [{ kinds: [4] }];

      const result = await nostrRelay.handleReqMessage(
        client,
        subscriptionId,
        filters,
      );

      expect(result).toEqual({ events: [] });
      expect(client.send).toHaveBeenNthCalledWith(
        1,
        JSON.stringify([
          MessageType.CLOSED,
          subscriptionId,
          "restricted: we can't serve DMs to unauthenticated users, does your client implement NIP-42?",
        ]),
      );
      expect(client.send).toHaveBeenNthCalledWith(
        2,
        JSON.stringify([MessageType.AUTH, ctx.id]),
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

      const mockSubscribe = jest
        .spyOn(nostrRelay['subscriptionService'], 'subscribe')
        .mockImplementation();
      const mockFind = jest
        .spyOn(nostrRelay['eventService'], 'find$')
        .mockReturnValue(from(events));

      const result = await nostrRelay.handleReqMessage(
        client,
        subscriptionId,
        filters,
      );

      expect(result).toEqual({ events });
      expect(mockSubscribe).toHaveBeenCalledWith(ctx, subscriptionId, filters);
      expect(mockFind).toHaveBeenCalledWith(filters);
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

      const mockSubscribe = jest
        .spyOn(nostrRelayWithoutHostname['subscriptionService'], 'subscribe')
        .mockImplementation();
      const mockFind = jest
        .spyOn(nostrRelayWithoutHostname['eventService'], 'find$')
        .mockReturnValue(from(events));

      const result = await nostrRelayWithoutHostname.handleReqMessage(
        client,
        subscriptionId,
        filters,
      );

      expect(result).toEqual({ events });
      expect(mockSubscribe).toHaveBeenCalledWith(ctx, subscriptionId, filters);
      expect(mockFind).toHaveBeenCalledWith(filters);
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
    it('should handle close successfully', () => {
      const subscriptionId: SubscriptionId = 'subscriptionId';
      const mockUnsubscribe = jest
        .spyOn(nostrRelay['subscriptionService'], 'unsubscribe')
        .mockReturnValue(true);
      const ctx = nostrRelay['getClientContext'](client);

      nostrRelay.handleCloseMessage(client, subscriptionId);

      expect(mockUnsubscribe).toHaveBeenCalledWith(ctx, subscriptionId);
    });
  });

  describe('auth', () => {
    it('should handle auth successfully', async () => {
      const pubkey = 'pubkey';
      const signedEvent = { id: 'eventId' } as Event;

      jest.spyOn(EventUtils, 'isSignedEventValid').mockImplementation();
      jest.spyOn(EventUtils, 'getAuthor').mockReturnValue(pubkey);

      nostrRelay.handleConnection(client);
      nostrRelay.handleAuthMessage(client, signedEvent);

      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.OK, signedEvent.id, true, '']),
      );
      expect(nostrRelay['clientContexts'].get(client)?.pubkey).toBe(pubkey);
    });

    it('should return failed msg if signed event is invalid', async () => {
      const signedEvent = { id: 'eventId' } as Event;

      jest.spyOn(EventUtils, 'isSignedEventValid').mockReturnValue('invalid');

      nostrRelay.handleConnection(client);
      nostrRelay.handleAuthMessage(client, signedEvent);

      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.OK, signedEvent.id, false, 'invalid']),
      );
    });

    it('should return directly if hostname is not set', async () => {
      const nostrRelayWithoutHostname = new NostrRelay({} as EventRepository);
      const signedEvent = { id: 'eventId' } as Event;

      nostrRelayWithoutHostname.handleAuthMessage(client, signedEvent);

      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.OK, signedEvent.id, true, '']),
      );
    });
  });

  describe('handleMessage', () => {
    it('should handle event message', async () => {
      const mockEvent = jest
        .spyOn(nostrRelay, 'handleEventMessage')
        .mockImplementation();
      const event = { id: 'eventId' } as Event;

      await nostrRelay.handleMessage(client, [MessageType.EVENT, event]);

      expect(mockEvent).toHaveBeenCalledWith(client, event);
    });

    it('should handle req message', async () => {
      const mockReq = jest
        .spyOn(nostrRelay, 'handleReqMessage')
        .mockImplementation();
      const subscriptionId: SubscriptionId = 'subscriptionId';
      const filters: Filter[] = [{ kinds: [0, 1] }, { ids: ['a'] }];

      await nostrRelay.handleMessage(client, [
        MessageType.REQ,
        subscriptionId,
        ...filters,
      ]);

      expect(mockReq).toHaveBeenCalledWith(client, subscriptionId, filters);
    });

    it('should handle close message', async () => {
      const mockClose = jest
        .spyOn(nostrRelay, 'handleCloseMessage')
        .mockImplementation();
      const subscriptionId: SubscriptionId = 'subscriptionId';

      await nostrRelay.handleMessage(client, [
        MessageType.CLOSE,
        subscriptionId,
      ]);

      expect(mockClose).toHaveBeenCalledWith(client, subscriptionId);
    });

    it('should handle auth message', async () => {
      const mockAuth = jest
        .spyOn(nostrRelay, 'handleAuthMessage')
        .mockImplementation();
      const signedEvent = { id: 'eventId' } as Event;

      await nostrRelay.handleMessage(client, [MessageType.AUTH, signedEvent]);

      expect(mockAuth).toHaveBeenCalledWith(client, signedEvent);
    });

    it('should return notice if message type is invalid', async () => {
      await nostrRelay.handleMessage(client, ['unknown' as any, 'test']);

      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([MessageType.NOTICE, 'invalid: unknown message type']),
      );
    });
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
    it('should call broadcast on subscriptionService', async () => {
      const mockSubscriptionServiceBroadcast = jest
        .spyOn(nostrRelay['subscriptionService'], 'broadcast')
        .mockImplementation();
      const event = { id: 'eventId' } as Event;

      await nostrRelay.broadcast(event);

      expect(mockSubscriptionServiceBroadcast).toHaveBeenCalledWith(event);
    });
  });

  describe('destroy', () => {
    it('should destroy successfully', async () => {
      const mockLazyCacheClear = jest
        .spyOn(nostrRelay['eventHandlingLazyCache']!, 'clear')
        .mockImplementation();
      const mockEventServiceDestroy = jest
        .spyOn(nostrRelay['eventService'], 'destroy')
        .mockImplementation();

      nostrRelay.handleConnection(client);
      expect(nostrRelay['clientContexts'].size).toBe(1);

      await nostrRelay.destroy();

      expect(nostrRelay['clientContexts'].size).toBe(0);
      expect(mockLazyCacheClear).toHaveBeenCalled();
      expect(mockEventServiceDestroy).toHaveBeenCalled();
    });
  });
});
