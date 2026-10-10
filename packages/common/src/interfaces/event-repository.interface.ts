import { defer, EMPTY, firstValueFrom, from, mergeMap, Observable } from 'rxjs';
import { abortable } from '../utils/abort.util';
import { FilterUtils } from '../utils/filter.util';
import { Event } from './event.interface';
import { Filter } from './filter.interface';

export interface EventQueryOptions {
  /** Adapters should cancel underlying I/O when possible. */
  signal?: AbortSignal;
}

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
  abstract find(
    filter: Filter,
    options?: EventQueryOptions,
  ): Promise<Event[]> | Observable<Event> | Event[];

  /**
   * Count distinct events matching any of the filters (NIP-45).
   * Repositories may override this method to opt into COUNT support.
   *
   * @param filters Query filters
   * @param excludedKinds Event kinds that must not contribute to the count
   */
  async count(
    filters: Filter[],
    excludedKinds: number[] = [],
    options: EventQueryOptions = {},
  ): Promise<number> {
    void filters;
    void excludedKinds;
    void options;
    throw new Error('unsupported: COUNT is not supported by this repository');
  }

  /**
   * This method is called when the event repository should be closed. You can
   * release resources in this method.
   */
  abstract destroy(): Promise<void>;

  /**
   * This method is called when a client requests to delete events.
   *
   * @param event Deletion request event
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deleteByDeletionRequest(event: Event): Promise<void> {
    return;
  }

  /**
   * This method doesn't need to be implemented. It's just a helper method for
   * finding one event. And it will call `find` method internally.
   *
   * @param filter Query filter
   */
  async findOne(filter: Filter): Promise<Event | null> {
    return firstValueFrom(this.find$({ ...filter, limit: 1 }), {
      defaultValue: null,
    });
  }

  /**
   * This method doesn't need to be implemented. It's just a helper method for
   * transforming the `find` method to an observable.
   *
   * @param filter Query filter
   */
  find$(filter: Filter, options: EventQueryOptions = {}): Observable<Event> {
    return abortable(
      defer(() => {
        options.signal?.throwIfAborted();
        const normalized = FilterUtils.normalize(filter);
        if (FilterUtils.isMatchNone(normalized)) return EMPTY;
        const query = this.find(normalized, options);
        return query instanceof Observable
          ? query
          : from(Promise.resolve(query)).pipe(mergeMap(events => from(events)));
      }),
      options.signal,
    );
  }
}
