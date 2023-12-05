import { Event } from './event.interface';
import { Filter } from './filter.interface';
import { Observable } from 'rxjs';

export interface EventRepositoryUpsertResult {
  isDuplicate: boolean;
}

export interface EventRepository {
  upsert(event: Event): Promise<EventRepositoryUpsertResult>;

  find(
    filter: Filter,
  ): Promise<Event[] | Observable<Event>> | Observable<Event> | Event[];

  findOne(filter: Filter): Promise<Event | null>;
}