import { EventService } from '../../src/services/event.service';
import {
  BroadcastService,
  Event,
  EventKind,
  EventRepository,
  EventUtils,
  Filter,
  MessageType,
  observableToArray,
} from '../../../common';
import { from } from 'rxjs';

describe('eventService', () => {
  let eventService: EventService;
  let eventRepository: EventRepository;
  let broadcastService: BroadcastService;

  beforeEach(() => {
    eventRepository = {
      upsert: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    broadcastService = {
      broadcast: jest.fn(),
      setListener: jest.fn(),
    };
    eventService = new EventService({
      eventRepository,
      broadcastService,
      options: {
        filterResultCacheTtl: 0,
      },
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
      const eventServiceWithCache = new EventService({
        eventRepository,
        broadcastService,
      });
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
        await eventService.handleEvent({
          kind: EventKind.AUTHENTICATION,
        } as Event),
      ).toBeUndefined();
      expect(eventRepository.findOne).not.toHaveBeenCalled();
      expect(eventRepository.upsert).not.toHaveBeenCalled();
      expect(broadcastService.broadcast).not.toHaveBeenCalled();
    });

    it('should return duplicate message if event exists', async () => {
      const event = { id: 'a' } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(event);

      expect(await eventService.handleEvent(event)).toEqual([
        MessageType.OK,
        event.id,
        true,
        'duplicate: the event already exists',
      ]);
    });

    it('should return validation error message if event is invalid', async () => {
      const event = { id: 'a' } as Event;

      jest
        .spyOn(EventUtils, 'validate')
        .mockReturnValue('error: invalid event');

      expect(await eventService.handleEvent(event)).toEqual([
        MessageType.OK,
        event.id,
        false,
        'error: invalid event',
      ]);
    });

    it('should handle ephemeral event successfully', async () => {
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);

      const event = { id: 'a', kind: EventKind.EPHEMERAL_FIRST } as Event;
      expect(await eventService.handleEvent(event)).toBeUndefined();
      expect(broadcastService.broadcast).toHaveBeenCalledWith(event);
    });

    it('should handle regular event successfully', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      jest
        .spyOn(eventRepository, 'upsert')
        .mockResolvedValue({ isDuplicate: false });

      expect(await eventService.handleEvent(event)).toEqual([
        MessageType.OK,
        event.id,
        true,
        '',
      ]);
      expect(broadcastService.broadcast).toHaveBeenCalledWith(event);
    });

    it('should handle regular event successfully with duplicate', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      jest
        .spyOn(eventRepository, 'upsert')
        .mockResolvedValue({ isDuplicate: true });

      expect(await eventService.handleEvent(event)).toEqual([
        MessageType.OK,
        event.id,
        true,
        'duplicate: the event already exists',
      ]);
      expect(broadcastService.broadcast).not.toHaveBeenCalled();
    });

    it('should catch normal Error', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      jest.spyOn(eventRepository, 'upsert').mockImplementation(() => {
        throw new Error('test');
      });

      expect(await eventService.handleEvent(event)).toEqual([
        MessageType.OK,
        event.id,
        false,
        'error: test',
      ]);
      expect(broadcastService.broadcast).not.toHaveBeenCalled();
    });

    it('should catch unknown error', async () => {
      const event = { id: 'a', kind: EventKind.TEXT_NOTE } as Event;

      jest.spyOn(eventRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(EventUtils, 'validate').mockReturnValue(undefined);
      jest.spyOn(eventRepository, 'upsert').mockRejectedValue('unknown');

      expect(await eventService.handleEvent(event)).toEqual([
        MessageType.OK,
        event.id,
        false,
        'error: unknown',
      ]);
      expect(broadcastService.broadcast).not.toHaveBeenCalled();
    });
  });
});
