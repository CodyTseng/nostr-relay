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
      domain: 'test',
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
      const handleResult = { success: true };
      const outgoingMessage: OutgoingOkMessage = [
        MessageType.OK,
        event.id,
        true,
        '',
      ];

      const mockPlugin = {
        beforeEventHandle: jest.fn().mockReturnValue(true),
        afterEventHandle: jest.fn().mockReturnValue(handleResult),
      };
      nostrRelay.register(mockPlugin);
      const mockHandleEvent = jest
        .spyOn(nostrRelay['eventService'], 'handleEvent')
        .mockResolvedValue(handleResult);
      const ctx = nostrRelay['getClientContext'](client);

      await nostrRelay.handleEventMessage(client, event);

      expect(mockPlugin.beforeEventHandle).toHaveBeenCalledWith(ctx, event);
      expect(mockPlugin.afterEventHandle).toHaveBeenCalledWith(
        ctx,
        event,
        handleResult,
      );
      expect(mockHandleEvent).toHaveBeenCalledWith(ctx, event);
      expect(client.send).toHaveBeenCalledWith(JSON.stringify(outgoingMessage));
    });

    it('should cache handle result', async () => {
      const nostrRelayWithCache = new NostrRelay({} as EventRepository, {
        domain: 'test',
        eventHandlingResultCacheTtl: 1000,
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
        .spyOn(nostrRelayWithCache['eventService'], 'handleEvent')
        .mockResolvedValue({ success: true });

      await Promise.all([
        nostrRelayWithCache.handleEventMessage(client, event),
        nostrRelayWithCache.handleEventMessage(client, event),
      ]);

      expect(mockHandleEvent).toHaveBeenCalledTimes(1);
      expect(client.send).toHaveBeenCalledTimes(2);
      expect(client.send).toHaveBeenNthCalledWith(1, outgoingMessageStr);
      expect(client.send).toHaveBeenNthCalledWith(2, outgoingMessageStr);
    });

    it('should not handle event due to plugin prevention', async () => {
      jest
        .spyOn(nostrRelay['pluginManagerService'], 'callBeforeEventHandleHooks')
        .mockResolvedValue(false);
      const mockHandleEvent = jest
        .spyOn(nostrRelay['eventService'], 'handleEvent')
        .mockResolvedValue({ success: true });

      await nostrRelay.handleEventMessage(client, { id: 'eventId' } as Event);

      expect(mockHandleEvent).not.toHaveBeenCalled();
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
        .spyOn(nostrRelay['eventService'], 'find')
        .mockReturnValue(from(events));

      await nostrRelay.handleReqMessage(client, subscriptionId, filters);

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

      await nostrRelay.handleReqMessage(client, subscriptionId, filters);

      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify([
          MessageType.NOTICE,
          "restricted: we can't serve DMs to unauthenticated users, does your client implement NIP-42?",
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

      const mockSubscribe = jest
        .spyOn(nostrRelay['subscriptionService'], 'subscribe')
        .mockImplementation();
      const mockFind = jest
        .spyOn(nostrRelay['eventService'], 'find')
        .mockReturnValue(from(events));

      await nostrRelay.handleReqMessage(client, subscriptionId, filters);

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

    it('should throw error if error occurs during rxjs subscribe', async () => {
      const subscriptionId: SubscriptionId = 'subscriptionId';
      const filters: Filter[] = [{ kinds: [0] }];

      jest
        .spyOn(nostrRelay['subscriptionService'], 'subscribe')
        .mockImplementation();
      jest
        .spyOn(nostrRelay['eventService'], 'find')
        .mockReturnValue(from([undefined as any]));

      await expect(
        nostrRelay.handleReqMessage(client, subscriptionId, filters),
      ).rejects.toThrow(Error);
    });

    it('should handle req successfully if NIP-42 is not enabled and filter contains encrypted direct message kind', async () => {
      const nostrRelayWithoutDomain = new NostrRelay({} as EventRepository);
      const subscriptionId: SubscriptionId = 'subscriptionId';
      const filters: Filter[] = [{ kinds: [4] }];
      const events = [{ id: 'a', kind: 4 }] as Event[];
      const ctx = nostrRelayWithoutDomain['getClientContext'](client);

      const mockSubscribe = jest
        .spyOn(nostrRelayWithoutDomain['subscriptionService'], 'subscribe')
        .mockImplementation();
      const mockFind = jest
        .spyOn(nostrRelayWithoutDomain['eventService'], 'find')
        .mockReturnValue(from(events));

      await nostrRelayWithoutDomain.handleReqMessage(
        client,
        subscriptionId,
        filters,
      );

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

    it('should return directly if domain is not set', async () => {
      const nostrRelayWithoutDomain = new NostrRelay({} as EventRepository);
      const signedEvent = { id: 'eventId' } as Event;

      nostrRelayWithoutDomain.handleAuthMessage(client, signedEvent);

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
    it('should return true if domain is not set', () => {
      const nostrRelayWithoutDomain = new NostrRelay({} as EventRepository);

      expect(nostrRelayWithoutDomain.isAuthorized(client)).toBeTruthy();
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
});
