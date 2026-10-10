import { from } from 'rxjs';
import {
  ConsoleLoggerService,
  Event,
  EventKind,
  EventRepository,
  EventUtils,
  Filter,
  toPromise,
} from '../../../common';
import { EventService } from '../../src/services/event.service';
import { PluginManagerService } from '../../src/services/plugin-manager.service';
import { SubscriptionService } from '../../src/services/subscription.service';

describe('eventService', () => {
  let eventService: EventService;
  let eventRepository: EventRepository;
  let subscriptionService: SubscriptionService;
  let pluginManagerService: PluginManagerService;

  beforeEach(() => {
    eventRepository = {
      isSearchSupported: jest.fn().mockReturnValue(false),
      upsert: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      findOne: jest.fn(),
      deleteByDeletionRequest: jest.fn(),
      destroy: jest.fn(),
      find$: jest.fn(),
    };
    pluginManagerService = new PluginManagerService();
    subscriptionService = new SubscriptionService(
      new Map(),
      new ConsoleLoggerService(),
      pluginManagerService,
    );
    subscriptionService.broadcast = jest.fn();
    eventService = new EventService(
      eventRepository,
      subscriptionService,
      pluginManagerService,
      new ConsoleLoggerService(),
    );
  });

  describe('find$', () => {
    it('should return find result', async () => {
      const filters = [{}] as Filter[];
      const events = [{ id: 'a' }, { id: 'b' }] as Event[];

      jest.spyOn(eventRepository, 'find$').mockReturnValue(from(events));
      expect(await toPromise(eventService.find$(filters))).toEqual(events);

      expect(await toPromise(eventService.find$([{ search: 'test' }]))).toEqual(
        [],
      );
    });

    it('should return distinct result', async () => {
      const filters = [{}] as Filter[];
      const events = [{ id: 'a' }, { id: 'a' }] as Event[];

      jest.spyOn(eventRepository, 'find$').mockReturnValue(from(events));

      expect(await toPromise(eventService.find$(filters))).toEqual([events[0]]);
    });

    it('should merge multiple results and return distinct result', async () => {
      jest
        .spyOn(eventRepository, 'find$')
        .mockReturnValueOnce(from([{ id: 'a' }, { id: 'b' }] as Event[]));
      jest
        .spyOn(eventRepository, 'find$')
        .mockReturnValueOnce(from([{ id: 'b' }, { id: 'c' }] as Event[]));

      expect(await toPromise(eventService.find$([{}, {}] as Filter[]))).toEqual(
        [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      );
    });

    it('queries the repository on each request without framework caching', async () => {
      const find = jest
        .spyOn(eventRepository, 'find$')
        .mockReturnValue(from([{ id: 'a' } as Event]));
      await toPromise(eventService.find$([{}]));
      await toPromise(eventService.find$([{}]));
      expect(find).toHaveBeenCalledTimes(2);
    });
  });

  describe('count', () => {
    it('should return the repository count', async () => {
      const filters = [{ kinds: [EventKind.TEXT_NOTE] }];
      jest.spyOn(eventRepository, 'count').mockResolvedValue(2);

      expect(await eventService.count(filters)).toBe(2);
      expect(eventRepository.count).toHaveBeenCalledWith(filters, [], {});
    });

    it('should skip search filters when the repository does not support search', async () => {
      const supportedFilter = { kinds: [EventKind.TEXT_NOTE] };
      jest.spyOn(eventRepository, 'count').mockResolvedValue(1);

      expect(
        await eventService.count([{ search: 'nostr' }, supportedFilter]),
      ).toBe(1);
      expect(eventRepository.count).toHaveBeenCalledWith(
        [supportedFilter],
        [],
        {},
      );
    });
  });

  describe('handleEvent', () => {
    it('should directly return if event is authentication', async () => {
      expect(
        await eventService.handleEvent({
          kind: EventKind.AUTHENTICATION,
        } as Event),
      ).toEqual({ success: true });
      expect(eventRepository.findOne).not.toHaveBeenCalled();
      expect(eventRepository.upsert).not.toHaveBeenCalled();
      expect(subscriptionService.broadcast).not.toHaveBeenCalled();
    });

    it('should return duplicate message if event exists', async () => {
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      const event = { id: 'a' } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(event);

      expect(await eventService.handleEvent(event)).toEqual({
        success: true,
        message: 'duplicate: the event already exists',
      });
    });

    it('should return validation error message if event is invalid', async () => {
      const event = { id: 'a' } as Event;

      jest
        .spyOn(EventUtils, 'validate')
        .mockReturnValue('error: invalid event');

      expect(await eventService.handleEvent(event)).toEqual({
        success: false,
        message: 'error: invalid event',
      });
    });

    it('should handle ephemeral event successfully', async () => {
      const event = { id: 'a', kind: EventKind.EPHEMERAL_FIRST } as Event;
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);

      expect(await eventService.handleEvent(event)).toEqual({
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

      expect(await eventService.handleEvent(event)).toEqual({
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

      expect(await eventService.handleEvent(event)).toEqual({
        success: true,
        message: 'duplicate: the event already exists',
      });
      expect(subscriptionService.broadcast).not.toHaveBeenCalled();
    });

    it('should handle deletion request event successfully', async () => {
      const event = { id: 'a', kind: EventKind.DELETION } as Event;

      jest
        .spyOn(eventRepository, 'deleteByDeletionRequest')
        .mockResolvedValue();

      expect(await eventService.handleEvent(event)).toEqual({
        success: true,
      });
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

      expect(await eventService.handleEvent(event)).toEqual({
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

      expect(await eventService.handleEvent(event)).toEqual({
        success: false,
        message: 'error: unknown',
      });
      expect(subscriptionService.broadcast).not.toHaveBeenCalled();
      expect(spyLoggerError).toHaveBeenCalled();
    });

    it('allows event caching in a plugin only after validation and guards', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;
      const cache = new Map<string, Promise<{ success: boolean }>>();
      const handleEvent = jest.fn((candidate, next) => {
        if (!cache.has(candidate.id)) cache.set(candidate.id, next());
        return cache.get(candidate.id)!;
      });
      pluginManagerService.register({ handleEvent });
      jest
        .spyOn(EventUtils, 'validate')
        .mockReturnValueOnce('invalid: forged event')
        .mockReturnValue(undefined);
      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(eventRepository, 'upsert')
        .mockResolvedValue({ isDuplicate: false });
      expect(await eventService.handleEvent(event)).toEqual({
        success: false,
        message: 'invalid: forged event',
      });
      expect(handleEvent).not.toHaveBeenCalled();
      expect(await eventService.handleEvent(event)).toEqual({ success: true });
      expect(await eventService.handleEvent(event)).toEqual({ success: true });
      expect(eventRepository.upsert).toHaveBeenCalledTimes(1);
      jest
        .spyOn(pluginManagerService, 'beforeHandleEvent')
        .mockResolvedValue({ canHandle: false, message: 'blocked' });
      expect(await eventService.handleEvent(event)).toEqual({
        success: false,
        message: 'blocked',
      });
      expect(handleEvent).toHaveBeenCalledTimes(2);
    });

    it('publishes accepted events once globally, independently of recipient count', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(eventRepository, 'upsert')
        .mockResolvedValueOnce({ isDuplicate: false })
        .mockResolvedValueOnce({ isDuplicate: true });
      const publishEvent = jest.fn(async (_event, next) => {
        await next();
      });
      pluginManagerService.register({ publishEvent });
      await eventService.handleEvent(event);
      await eventService.handleEvent(event);
      expect(publishEvent).toHaveBeenCalledTimes(1);
      expect(publishEvent).toHaveBeenCalledWith(event, expect.any(Function));
      expect(subscriptionService.broadcast).toHaveBeenCalledTimes(1);
    });

    it('should return directly if beforeHandleEvent return false', async () => {
      jest.spyOn(pluginManagerService, 'beforeHandleEvent').mockResolvedValue({
        canHandle: false,
        message: 'block: test',
      });

      expect(await eventService.handleEvent({} as Event)).toEqual({
        success: false,
        message: 'block: test',
      });
    });
  });

  describe('destroy', () => {
    it('closes the repository', async () => {
      await eventService.destroy();
      expect(eventRepository.destroy).toHaveBeenCalledTimes(1);
    });
  });
});
