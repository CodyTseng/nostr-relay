import {
  BroadcastService,
  Client,
  ClientReadyState,
  Event,
  EventUtils,
  Filter,
  MessageType,
} from '../../../common';
import { SubscriptionService } from '../../src/services/subscription.service';
import { LocalBroadcastService } from '../../src/services/local-broadcast.service';

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService;
  let broadcastService: BroadcastService;
  let client: Client;

  beforeEach(() => {
    broadcastService = new LocalBroadcastService();
    subscriptionService = new SubscriptionService(broadcastService, {
      logger: {
        error: jest.fn(),
      },
    });
    client = {
      readyState: ClientReadyState.OPEN,
      send: jest.fn(),
    };
  });

  describe('subscribe', () => {
    it('should add subscription', () => {
      const subscriptionId = 'subscriptionId';
      const filters = [{}] as Filter[];

      subscriptionService.subscribe(client, subscriptionId, filters);

      expect(
        subscriptionService['subscriptionsMap']
          .get(client)
          ?.get(subscriptionId),
      ).toEqual(filters);
    });

    it('should add subscription to existing client', () => {
      const subscriptionIdA = 'subscriptionIdA';
      const subscriptionIdB = 'subscriptionIdB';
      const filtersA = [{}] as Filter[];
      const filtersB = [{}, {}] as Filter[];

      subscriptionService.subscribe(client, subscriptionIdA, filtersA);
      subscriptionService.subscribe(client, subscriptionIdB, filtersB);

      expect(
        subscriptionService['subscriptionsMap']
          .get(client)
          ?.get(subscriptionIdA),
      ).toEqual(filtersA);
      expect(
        subscriptionService['subscriptionsMap']
          .get(client)
          ?.get(subscriptionIdB),
      ).toEqual(filtersB);
    });
  });

  describe('unsubscribe', () => {
    it('should remove subscription', () => {
      const subscriptionIdA = 'subscriptionIdA';
      const subscriptionIdB = 'subscriptionIdB';
      const filtersA = [{}] as Filter[];
      const filtersB = [{}, {}] as Filter[];

      subscriptionService.subscribe(client, subscriptionIdA, filtersA);
      subscriptionService.subscribe(client, subscriptionIdB, filtersB);

      expect(
        subscriptionService.unsubscribe(client, subscriptionIdA),
      ).toBeTruthy();

      expect(
        subscriptionService['subscriptionsMap']
          .get(client)
          ?.get(subscriptionIdA),
      ).toBeUndefined();
      expect(
        subscriptionService['subscriptionsMap']
          .get(client)
          ?.get(subscriptionIdB),
      ).toEqual(filtersB);
    });

    it('should remove client if no subscriptions', () => {
      const subscriptionId = 'subscriptionId';
      const filters = [{}] as Filter[];
      subscriptionService.subscribe(client, subscriptionId, filters);

      expect(
        subscriptionService.unsubscribe(client, subscriptionId),
      ).toBeTruthy();

      expect(
        subscriptionService['subscriptionsMap'].get(client),
      ).toBeUndefined();
    });

    it('should return false if client is not found', () => {
      const subscriptionId = 'subscriptionId';

      expect(
        subscriptionService.unsubscribe(client, subscriptionId),
      ).toBeFalsy();
    });
  });

  describe('eventListener', () => {
    it('should broadcast event to client', async () => {
      const subscriptionId = 'subscriptionId';
      const filters = [{}] as Filter[];
      const event = {
        id: 'id',
      } as Event;

      jest.spyOn(EventUtils, 'isMatchingFilter').mockReturnValue(true);

      subscriptionService.subscribe(client, subscriptionId, filters);
      broadcastService.broadcast(event);

      await new Promise(resolve => process.nextTick(resolve));

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

      subscriptionService.subscribe(client, subscriptionId, filters);
      broadcastService.broadcast(event);

      await new Promise(resolve => process.nextTick(resolve));

      expect(client.send).not.toHaveBeenCalled();
    });

    it('should not broadcast event to client if client is not open', async () => {
      const subscriptionId = 'subscriptionId';
      const filters = [{}] as Filter[];
      const event = {
        id: 'id',
      } as Event;

      jest.spyOn(EventUtils, 'isMatchingFilter').mockReturnValue(true);

      client.readyState = ClientReadyState.CLOSED;
      subscriptionService.subscribe(client, subscriptionId, filters);
      broadcastService.broadcast(event);

      await new Promise(resolve => process.nextTick(resolve));

      expect(client.send).not.toHaveBeenCalled();
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

      subscriptionService.subscribe(client, subscriptionId, filters);
      broadcastService.broadcast(event);

      await new Promise(resolve => process.nextTick(resolve));

      expect(client.send).not.toHaveBeenCalled();
      expect(subscriptionService['logger'].error).toHaveBeenCalled();
    });
  });
});
