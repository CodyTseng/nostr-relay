import { Event } from './event.interface';
import { Filter } from './filter.interface';
import { Observable } from 'rxjs';

export interface EventRepositoryInsertResult {
  isDuplicate: boolean;
}

export interface EventRepositoryUpsertResult {
  isDuplicate: boolean;
}

export interface EventRepository {
  insert(
    event: Event,
  ): Promise<EventRepositoryInsertResult> | EventRepositoryInsertResult;

  upsert(
    event: Event,
  ): Promise<EventRepositoryUpsertResult> | EventRepositoryUpsertResult;

  find(
    filter: Filter,
  ): Promise<Event[] | Observable<Event>> | Observable<Event> | Event[];

  findOne(filter: Filter): Promise<Event | null> | Event | null;
}
