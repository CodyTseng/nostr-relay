import { EventRepository } from '../../src';

describe('EventRepository', () => {
  let eventRepository: EventRepository;

  beforeEach(() => {
    eventRepository = new TestEventRepository();
  });

  describe('findOne', () => {
    it('should return null if no event is found', async () => {
      eventRepository.find = jest.fn().mockResolvedValue([]);
      expect(await eventRepository.findOne({})).toBeNull();
      expect(eventRepository.find).toHaveBeenCalledWith({ limit: 1 });

      eventRepository.find = jest.fn().mockReturnValue([]);
      expect(await eventRepository.findOne({})).toBeNull();
      expect(eventRepository.find).toHaveBeenCalledWith({ limit: 1 });

      eventRepository.find = jest.fn().mockResolvedValue([]);
      expect(await eventRepository.findOne({})).toBeNull();
      expect(eventRepository.find).toHaveBeenCalledWith({ limit: 1 });

      eventRepository.find = jest.fn().mockReturnValue([]);
      expect(await eventRepository.findOne({})).toBeNull();
      expect(eventRepository.find).toHaveBeenCalledWith({ limit: 1 });
    });

    it('should return the first event if found', async () => {
      const event = { id: 'a' };
      eventRepository.find = jest.fn().mockResolvedValue([event]);
      expect(await eventRepository.findOne({})).toEqual(event);
      expect(eventRepository.find).toHaveBeenCalledWith({ limit: 1 });

      eventRepository.find = jest.fn().mockReturnValue([event]);
      expect(await eventRepository.findOne({})).toEqual(event);
      expect(eventRepository.find).toHaveBeenCalledWith({ limit: 1 });

      eventRepository.find = jest.fn().mockResolvedValue([event]);
      expect(await eventRepository.findOne({})).toEqual(event);
      expect(eventRepository.find).toHaveBeenCalledWith({ limit: 1 });

      eventRepository.find = jest.fn().mockReturnValue([event]);
      expect(await eventRepository.findOne({})).toEqual(event);
      expect(eventRepository.find).toHaveBeenCalledWith({ limit: 1 });
    });
  });
});

class TestEventRepository extends EventRepository {
  isSearchSupported = jest.fn().mockReturnValue(false);
  upsert = jest.fn();
  find = jest.fn();
  destroy = jest.fn();
}
