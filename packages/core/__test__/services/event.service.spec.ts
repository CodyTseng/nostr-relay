import { from } from 'rxjs';
import {
  BroadcastService,
  ClientContext,
  ClientReadyState,
  Event,
  EventKind,
  EventRepository,
  EventUtils,
  Filter,
  observableToArray,
} from '../../../common';
import { EventService } from '../../src/services/event.service';
import { PluginManagerService } from '../../src/services/plugin-manager.service';

describe('eventService', () => {
  let eventService: EventService;
  let eventRepository: EventRepository;
  let broadcastService: BroadcastService;
  let pluginManagerService: PluginManagerService;
  let ctx: ClientContext;

  beforeEach(() => {
    eventRepository = {
      isSearchSupported: false,
      upsert: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    broadcastService = {
      broadcast: jest.fn(),
      setListener: jest.fn(),
    };
    pluginManagerService = new PluginManagerService();
    eventService = new EventService(
      eventRepository,
      broadcastService,
      pluginManagerService,
      {
        logger: {
          error: jest.fn(),
        },
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
      expect(await observableToArray(eventService.find(filters))).toEqual(
        events,
      );

      jest.spyOn(eventRepository, 'find').mockResolvedValue(from(events));
      expect(await observableToArray(eventService.find(filters))).toEqual(
        events,
      );

      jest.spyOn(eventRepository, 'find').mockReturnValue(events);
      expect(await observableToArray(eventService.find(filters))).toEqual(
        events,
      );

      jest.spyOn(eventRepository, 'find').mockReturnValue(from(events));
      expect(await observableToArray(eventService.find(filters))).toEqual(
        events,
      );

      expect(
        await observableToArray(eventService.find([{ search: 'test' }])),
      ).toEqual([]);
    });

    it('should return distinct result', async () => {
      const filters = [{}] as Filter[];
      const events = [{ id: 'a' }, { id: 'a' }] as Event[];

      jest.spyOn(eventRepository, 'find').mockResolvedValue(events);

      expect(await observableToArray(eventService.find(filters))).toEqual([
        events[0],
      ]);
    });

    it('should use cache', async () => {
      const eventServiceWithCache = new EventService(
        eventRepository,
        broadcastService,
        pluginManagerService,
      );
      const filters = [{}, {}] as Filter[];
      const events = [{ id: 'a' }, { id: 'b' }] as Event[];

      jest.spyOn(eventRepository, 'find').mockResolvedValue(events);

      expect(
        await observableToArray(eventServiceWithCache.find(filters)),
      ).toEqual(events);
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
      expect(broadcastService.broadcast).not.toHaveBeenCalled();
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
      const mockBeforeEventBroadcast = jest
        .spyOn(
          eventService['pluginManagerService'],
          'callBeforeEventBroadcastHooks',
        )
        .mockResolvedValue({ canContinue: true });
      const mockAfterEventBroadcast = jest
        .spyOn(
          eventService['pluginManagerService'],
          'callAfterEventBroadcastHooks',
        )
        .mockImplementation();
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);

      const event = { id: 'a', kind: EventKind.EPHEMERAL_FIRST } as Event;
      expect(await eventService.handleEvent(ctx, event)).toEqual({
        noReplyNeeded: true,
        success: true,
      });
      expect(mockBeforeEventBroadcast).toHaveBeenCalledWith(ctx, event);
      expect(mockAfterEventBroadcast).toHaveBeenCalledWith(ctx, event);
      expect(broadcastService.broadcast).toHaveBeenCalledWith(event);
    });

    it('should not broadcast due to plugin prevention', async () => {
      jest
        .spyOn(
          eventService['pluginManagerService'],
          'callBeforeEventBroadcastHooks',
        )
        .mockResolvedValue({ canContinue: false });
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);

      const event = { id: 'a', kind: EventKind.EPHEMERAL_FIRST } as Event;
      expect(await eventService.handleEvent(ctx, event)).toEqual({
        noReplyNeeded: true,
        success: true,
      });
      expect(broadcastService.broadcast).not.toHaveBeenCalled();
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
      expect(broadcastService.broadcast).toHaveBeenCalledWith(event);
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
      expect(broadcastService.broadcast).not.toHaveBeenCalled();
    });

    it('should catch normal Error', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      jest.spyOn(eventRepository, 'upsert').mockImplementation(() => {
        throw new Error('test');
      });

      expect(await eventService.handleEvent(ctx, event)).toEqual({
        success: false,
        message: 'error: test',
      });
      expect(broadcastService.broadcast).not.toHaveBeenCalled();
      expect(eventService['logger'].error).toHaveBeenCalled();
    });

    it('should catch unknown error', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      jest.spyOn(eventRepository, 'upsert').mockRejectedValue('unknown');

      expect(await eventService.handleEvent(ctx, event)).toEqual({
        success: false,
        message: 'error: unknown',
      });
      expect(broadcastService.broadcast).not.toHaveBeenCalled();
      expect(eventService['logger'].error).toHaveBeenCalled();
    });
  });
});
