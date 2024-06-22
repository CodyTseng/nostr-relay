import {
  ClientContext,
  ClientReadyState,
  ConsoleLoggerService,
  Event,
  EventKind,
  EventRepository,
  EventUtils,
  Filter,
} from '../../../common';
import { EventService } from '../../src/services/event.service';
import { PluginManagerService } from '../../src/services/plugin-manager.service';
import { SubscriptionService } from '../../src/services/subscription.service';

describe('eventService', () => {
  let eventService: EventService;
  let eventRepository: EventRepository;
  let subscriptionService: SubscriptionService;
  let pluginManagerService: PluginManagerService;
  let ctx: ClientContext;

  beforeEach(() => {
    eventRepository = {
      isSearchSupported: jest.fn().mockReturnValue(false),
      upsert: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      destroy: jest.fn(),
    };
    subscriptionService = new SubscriptionService(
      new Map(),
      new ConsoleLoggerService(),
      true,
    );
    subscriptionService.broadcast = jest.fn();
    pluginManagerService = new PluginManagerService();
    eventService = new EventService(
      eventRepository,
      subscriptionService,
      pluginManagerService,
      new ConsoleLoggerService(),
      {
        filterResultCacheTtl: 0,
      },
    );
    ctx = new ClientContext({
      readyState: ClientReadyState.OPEN,
      send: jest.fn(),
    });
  });

  describe('find', () => {
    it('should return find result', async () => {
      const filters = [{}] as Filter[];
      const events = [{ id: 'a' }, { id: 'b' }] as Event[];

      jest.spyOn(eventRepository, 'find').mockResolvedValue(events);
      expect(await eventService.find(filters)).toEqual(events);

      jest.spyOn(eventRepository, 'find').mockResolvedValue(events);
      expect(await eventService.find(filters)).toEqual(events);

      jest.spyOn(eventRepository, 'find').mockReturnValue(events);
      expect(await eventService.find(filters)).toEqual(events);

      jest.spyOn(eventRepository, 'find').mockReturnValue(events);
      expect(await eventService.find(filters)).toEqual(events);

      expect(await eventService.find([{ search: 'test' }])).toEqual([]);
    });

    it('should return distinct result', async () => {
      const filters = [{}] as Filter[];
      const events = [{ id: 'a' }, { id: 'a' }] as Event[];

      jest.spyOn(eventRepository, 'find').mockResolvedValue(events);

      expect(await eventService.find(filters)).toEqual([events[0]]);
    });

    it('should use cache', async () => {
      const eventServiceWithCache = new EventService(
        eventRepository,
        subscriptionService,
        pluginManagerService,
        new ConsoleLoggerService(),
      );
      const filters = [{}, {}] as Filter[];
      const events = [{ id: 'a' }, { id: 'b' }] as Event[];

      jest.spyOn(eventRepository, 'find').mockResolvedValue(events);

      expect(await eventServiceWithCache.find(filters)).toEqual(events);
      expect(eventRepository.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('handleEvent', () => {
    it('should directly return if event is authentication', async () => {
      expect(
        await eventService.handleEvent(ctx, {
          kind: EventKind.AUTHENTICATION,
        } as Event),
      ).toEqual({ success: true, noReplyNeeded: true });
      expect(eventRepository.findOne).not.toHaveBeenCalled();
      expect(eventRepository.upsert).not.toHaveBeenCalled();
      expect(subscriptionService.broadcast).not.toHaveBeenCalled();
    });

    it('should return duplicate message if event exists', async () => {
      const event = { id: 'a' } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(event);

      expect(await eventService.handleEvent(ctx, event)).toEqual({
        success: true,
        message: 'duplicate: the event already exists',
      });
    });

    it('should return validation error message if event is invalid', async () => {
      const event = { id: 'a' } as Event;

      jest
        .spyOn(EventUtils, 'validate')
        .mockReturnValue('error: invalid event');

      expect(await eventService.handleEvent(ctx, event)).toEqual({
        success: false,
        message: 'error: invalid event',
      });
    });

    it('should handle ephemeral event successfully', async () => {
      const event = { id: 'a', kind: EventKind.EPHEMERAL_FIRST } as Event;
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);

      expect(await eventService.handleEvent(ctx, event)).toEqual({
        noReplyNeeded: true,
        success: true,
      });
      expect(subscriptionService.broadcast).toHaveBeenCalledWith(event);
    });

    it('should handle regular event successfully', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      jest
        .spyOn(eventRepository, 'upsert')
        .mockResolvedValue({ isDuplicate: false });

      expect(await eventService.handleEvent(ctx, event)).toEqual({
        success: true,
      });
      expect(subscriptionService.broadcast).toHaveBeenCalledWith(event);
    });

    it('should handle regular event successfully with duplicate', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      jest
        .spyOn(eventRepository, 'upsert')
        .mockResolvedValue({ isDuplicate: true });

      expect(await eventService.handleEvent(ctx, event)).toEqual({
        success: true,
        message: 'duplicate: the event already exists',
      });
      expect(subscriptionService.broadcast).not.toHaveBeenCalled();
    });

    it('should catch normal Error', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      jest.spyOn(eventRepository, 'upsert').mockImplementation(() => {
        throw new Error('test');
      });
      const spyLoggerError = jest
        .spyOn(eventService['logger'], 'error')
        .mockImplementation();

      expect(await eventService.handleEvent(ctx, event)).toEqual({
        success: false,
        message: 'error: test',
      });
      expect(subscriptionService.broadcast).not.toHaveBeenCalled();
      expect(spyLoggerError).toHaveBeenCalled();
    });

    it('should catch unknown error', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      jest.spyOn(eventRepository, 'upsert').mockRejectedValue('unknown');
      const spyLoggerError = jest
        .spyOn(eventService['logger'], 'error')
        .mockImplementation();

      expect(await eventService.handleEvent(ctx, event)).toEqual({
        success: false,
        message: 'error: unknown',
      });
      expect(subscriptionService.broadcast).not.toHaveBeenCalled();
      expect(spyLoggerError).toHaveBeenCalled();
    });
  });

  describe('mergeSortedEventArrays', () => {
    it('should return empty array if no arrays are provided', () => {
      expect(eventService['mergeSortedEventArrays']([])).toEqual([]);
    });

    it('should merge sorted arrays', () => {
      const arrays = [
        [
          { id: 'a', created_at: 10 },
          { id: 'b', created_at: 9 },
          { id: 'b', created_at: 9 },
          { id: 'c', created_at: 8 },
          { id: 'c', created_at: 8 },
          { id: 'd', created_at: 8 },
          { id: 'e', created_at: 7 },
        ],
        [
          { id: 'b', created_at: 9 },
          { id: 'c', created_at: 8 },
          { id: 'd', created_at: 8 },
          { id: 'f', created_at: 6 },
        ],
        [
          { id: 'a', created_at: 10 },
          { id: 'b', created_at: 9 },
          { id: 'c', created_at: 8 },
          { id: 'g', created_at: 5 },
          { id: 'h', created_at: 4 },
        ],
      ] as Event[][];

      expect(eventService['mergeSortedEventArrays'](arrays)).toEqual([
        { id: 'a', created_at: 10 },
        { id: 'b', created_at: 9 },
        { id: 'c', created_at: 8 },
        { id: 'd', created_at: 8 },
        { id: 'e', created_at: 7 },
        { id: 'f', created_at: 6 },
        { id: 'g', created_at: 5 },
        { id: 'h', created_at: 4 },
      ]);
    });
  });

  describe('destroy', () => {
    it('should destroy successfully', async () => {
      const eventServiceWithCache = new EventService(
        eventRepository,
        subscriptionService,
        pluginManagerService,
        new ConsoleLoggerService(),
      );

      const mockFindLazyCacheClear = jest
        .spyOn(eventServiceWithCache['findLazyCache']!, 'clear')
        .mockImplementation();

      await eventServiceWithCache.destroy();

      expect(mockFindLazyCacheClear).toHaveBeenCalled();
    });
  });
});
