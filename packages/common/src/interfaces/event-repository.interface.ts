import { firstValueFrom, Observable } from 'rxjs';
import { Event } from './event.interface';
import { Filter } from './filter.interface';

/**
 * The result of upsert method.
 */
export interface EventRepositoryUpsertResult {
  /**
   * Indicates whether the event is a duplicate event. If it's true, the event
   * will not be broadcasted. Otherwise, the event will be broadcasted.
   */
  isDuplicate: boolean;
}

/**
 * EventRepository is an interface for storing and retrieving events. You can
 * implement this interface to create your own event repository based on your
 * favorite database.
 */
export abstract class EventRepository {
  /**
   * Whether the search feature is supported.
   */
  abstract isSearchSupported(): boolean;

  /**
   * This method is called when a new event should be stored. You should handle
   * the REGULAR, REPLACEABLE and PARAMETERIZED REPLACEABLE events correctly.
   *
   * More info: https://github.com/nostr-protocol/nips/blob/master/01.md
   *
   * @param event Event to store
   */
  abstract upsert(
    event: Event,
  ): Promise<EventRepositoryUpsertResult> | EventRepositoryUpsertResult;

  /**
   * This method is called when a client requests events.
   *
   * @param filter Query filter
   */
  abstract find(filter: Filter): Promise<Event[]> | Observable<Event> | Event[];

  /**
   * This method is called when the event repository should be closed. You can
   * release resources in this method.
   */
  abstract destroy(): Promise<void>;

  /**
   * This method doesn't need to be implemented. It's just a helper method for
   * finding one event. And it will call `find` method internally.
   *
   * @param filter Query filter
   */
  async findOne(filter: Filter): Promise<Event | null> {
    const query = this.find({ ...filter, limit: 1 });
    if (query instanceof Observable) {
      return await firstValueFrom(query).catch(() => null);
    }
    const [event] = await query;
    return event ?? null;
  }

  /**
   * This method doesn't need to be implemented. It's just a helper method for
   * transforming the `find` method to an observable.
   *
   * @param filter Query filter
   */
  find$(filter: Filter): Observable<Event> {
    const query = this.find(filter);
    if (query instanceof Observable) {
      return query;
    }
    return new Observable(subscriber => {
      (async () => {
        const events = await query;
        for (const event of events) {
          subscriber.next(event);
        }
        subscriber.complete();
      })();
    });
  }
}
