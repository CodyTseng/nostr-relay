import { Observable } from 'rxjs';
import { observableToArray } from '../utils';
import { Event } from './event.interface';
import { Filter } from './filter.interface';

export interface EventRepositoryUpsertResult {
  isDuplicate: boolean;
}

export abstract class EventRepository {
  readonly isSearchSupported: boolean = false;

  abstract upsert(
    event: Event,
  ): Promise<EventRepositoryUpsertResult> | EventRepositoryUpsertResult;

  abstract find(
    filter: Filter,
  ): Promise<Event[] | Observable<Event>> | Observable<Event> | Event[];

  async findOne(filter: Filter): Promise<Event | null> {
    let events = await this.find({ ...filter, limit: 1 });
    if (Array.isArray(events)) {
      return events[0] ?? null;
    }
    events = await observableToArray(events);
    return events[0] ?? null;
  }
}
