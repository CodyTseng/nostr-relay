import { EMPTY, from, Observable } from 'rxjs';
import { EventRepository, Filter, toPromise } from '../../src';

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

      eventRepository.find = jest.fn().mockReturnValue(EMPTY);
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

      eventRepository.find = jest.fn().mockReturnValue(from([event]));
      expect(await eventRepository.findOne({})).toEqual(event);
      expect(eventRepository.find).toHaveBeenCalledWith({ limit: 1 });
    });
  });

  describe('find$', () => {
    it('should return find result', async () => {
      const filter = {} as Filter;
      const events = [{ id: 'a' }, { id: 'b' }];

      eventRepository.find = jest.fn().mockReturnValue(events);
      const obs1 = eventRepository.find$(filter);
      expect(obs1 instanceof Observable).toBeTruthy();
      expect(await toPromise(obs1)).toEqual(events);
      expect(eventRepository.find).toHaveBeenCalledWith(filter);

      eventRepository.find = jest.fn().mockResolvedValue(events);
      const obs2 = eventRepository.find$(filter);
      expect(obs2 instanceof Observable).toBeTruthy();
      expect(await toPromise(obs2)).toEqual(events);
      expect(eventRepository.find).toHaveBeenCalledWith(filter);

      eventRepository.find = jest.fn().mockReturnValue(from(events));
      const obs3 = eventRepository.find$(filter);
      expect(obs3 instanceof Observable).toBeTruthy();
      expect(await toPromise(obs3)).toEqual(events);
      expect(eventRepository.find).toHaveBeenCalledWith(filter);
    });
  });
});

class TestEventRepository extends EventRepository {
  isSearchSupported = jest.fn().mockReturnValue(false);
  upsert = jest.fn();
  find = jest.fn();
  destroy = jest.fn();
}
