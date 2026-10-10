import { Event } from './interfaces/event.interface';
import { Filter } from './interfaces/filter.interface';
import { FilterUtils } from './utils/filter.util';

/** One subscription generation. Replacing its ID creates a new instance. */
export class ClientSubscription {
  state: 'querying' | 'draining' | 'live' | 'closed';
  readonly controller = new AbortController();
  readonly pendingEvents = new Map<string, Event>();
  readonly deliveredIds = new Set<string>();
  readonly filters: Filter[];

  constructor(
    readonly id: string,
    filters: Filter[],
    querying = false,
  ) {
    this.filters = filters.map(filter => FilterUtils.normalize(filter));
    this.state = querying ? 'querying' : 'live';
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  close(): void {
    this.state = 'closed';
    this.controller.abort();
    this.pendingEvents.clear();
    this.deliveredIds.clear();
  }
}
