import { EMPTY, Observable, Subject, from, shareReplay } from 'rxjs';
import {
  Client,
  ClientContext,
  ClientReadyState,
  Event,
  EventQueryOptions,
  EventRepository,
  MessageType,
  NostrRelayOptions,
} from '../../common';
import { NostrRelay } from '../src';

function event(id: string): Event {
  return {
    id,
    pubkey: 'author',
    kind: 1,
    created_at: 1,
    tags: [],
    content: '',
    sig: '',
  };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

class Repository extends EventRepository {
  queries: Subject<Event>[] = [];
  options: EventQueryOptions[] = [];
  isSearchSupported = (): boolean => false;
  upsert = jest.fn(async () => ({ isDuplicate: false }));
  destroy = jest.fn(async () => {});
  find = jest.fn(
    (_filter, options: EventQueryOptions = {}): Observable<Event> => {
      const query = new Subject<Event>();
      this.queries.push(query);
      this.options.push(options);
      return query;
    },
  );
}

function setup(options: NostrRelayOptions = {}): {
  relay: NostrRelay;
  repository: Repository;
  client: Client;
  ctx: ClientContext;
} {
  const repository = new Repository();
  const relay = new NostrRelay(repository, options);
  const client = { readyState: ClientReadyState.OPEN, send: jest.fn() };
  relay.handleConnection(client);
  return {
    relay,
    repository,
    client,
    ctx: relay['clientContexts'].get(client)!,
  };
}

function messages(client: Client): unknown[][] {
  return jest
    .mocked(client.send)
    .mock.calls.map(([message]) => JSON.parse(message));
}

describe('relay subscription lifecycle', () => {
  afterEach(() => jest.useRealTimers());

  it('buffers live events during history, deduplicates, and transitions after EOSE', async () => {
    const { relay, repository, client, ctx } = setup();
    const pending = relay.handleMessage(client, [MessageType.REQ, 's', {}]);
    await flush();
    expect(ctx.subscriptions.get('s')?.state).toBe('querying');
    await relay.broadcast(event('overlap'));
    await relay.broadcast(event('live'));
    repository.queries[0].next(event('history'));
    repository.queries[0].next(event('overlap'));
    repository.queries[0].complete();
    await pending;
    expect(
      messages(client).map(message =>
        message[0] === 'EVENT' ? (message[2] as Event).id : message[0],
      ),
    ).toEqual(['history', 'overlap', 'EOSE', 'live']);
    expect(ctx.subscriptions.get('s')?.state).toBe('live');
    expect(ctx.subscriptions.get('s')?.pendingEvents.size).toBe(0);
    expect(ctx.subscriptions.get('s')?.deliveredIds.size).toBe(0);
    await relay.destroy();
  });

  it('CLOSE cancels an in-flight query without resurrecting the subscription', async () => {
    const { relay, repository, client, ctx } = setup();
    const pending = relay.handleMessage(client, [MessageType.REQ, 's', {}]);
    await flush();
    await relay.handleMessage(client, [MessageType.CLOSE, 's']);
    await expect(pending).resolves.toEqual({
      messageType: MessageType.REQ,
      events: [],
    });
    expect(repository.options[0].signal?.aborted).toBe(true);
    expect(repository.queries[0].observers).toHaveLength(0);
    repository.queries[0].next(event('late'));
    expect(ctx.subscriptions.has('s')).toBe(false);
    expect(messages(client)).toEqual([]);
    await relay.destroy();
  });

  it('a replacement cancels the old generation and only the new query can complete', async () => {
    const { relay, repository, client, ctx } = setup();
    const first = relay.handleMessage(client, [
      MessageType.REQ,
      's',
      { ids: ['old'] },
    ]);
    await flush();
    const old = ctx.subscriptions.get('s')!;
    const second = relay.handleMessage(client, [
      MessageType.REQ,
      's',
      { ids: ['new'] },
    ]);
    await flush();
    expect(old.state).toBe('closed');
    expect(repository.queries[0].observers).toHaveLength(0);
    repository.queries[0].next(event('old'));
    repository.queries[1].next(event('new'));
    repository.queries[1].complete();
    await Promise.all([first, second]);
    expect(messages(client)).toEqual([
      ['EVENT', 's', event('new')],
      ['EOSE', 's'],
    ]);
    expect(ctx.subscriptions.get('s')?.filters).toEqual([{ ids: ['new'] }]);
    await relay.destroy();
  });

  it('a delayed permission result cannot deliver into a replaced subscription', async () => {
    const { relay, repository, client } = setup();
    let allow!: (value: boolean) => void;
    const permission = new Promise<boolean>(resolve => {
      allow = resolve;
    });
    relay.register({ canReadEvent: () => permission });
    repository.find.mockReturnValue(EMPTY);
    await relay.handleMessage(client, [MessageType.REQ, 's', { ids: ['old'] }]);
    jest.mocked(client.send).mockClear();
    const broadcast = relay.broadcast(event('old'));
    await flush();
    await relay.handleMessage(client, [MessageType.REQ, 's', { ids: ['new'] }]);
    allow(true);
    await broadcast;
    expect(messages(client)).toEqual([['EOSE', 's']]);
    await relay.destroy();
  });

  it('disconnect cancels pending history and prevents late messages', async () => {
    const { relay, repository, client, ctx } = setup();
    const pending = relay.handleMessage(client, [MessageType.REQ, 's', {}]);
    await flush();
    const cancelled = expect(pending).rejects.toBeDefined();
    relay.handleDisconnect(client);
    await cancelled;
    expect(ctx.signal.aborted).toBe(true);
    expect(ctx.subscriptions.size).toBe(0);
    expect(repository.queries[0].observers).toHaveLength(0);
    expect(messages(client)).toEqual([]);
    await relay.destroy();
  });

  it('does not recreate a disconnected client when a late handler arrives', async () => {
    const { relay, client } = setup();
    relay.handleDisconnect(client);
    await expect(
      relay.handleMessage(client, [MessageType.REQ, 'late', {}]),
    ).rejects.toThrow('client is disconnected');
    expect(relay['clientContexts'].size).toBe(0);
    await relay.destroy();
  });

  it('closes and notifies the oldest subscription before accepting a new ID', async () => {
    const { relay, repository, client, ctx } = setup({
      maxSubscriptionsPerClient: 1,
    });
    repository.find.mockReturnValue(EMPTY);
    await relay.handleMessage(client, [MessageType.REQ, 'first', {}]);
    const first = ctx.subscriptions.get('first')!;
    jest.mocked(client.send).mockClear();
    await relay.handleMessage(client, [MessageType.REQ, 'second', {}]);
    expect([...ctx.subscriptions.keys()]).toEqual(['second']);
    expect(first.state).toBe('closed');
    expect(first.signal.aborted).toBe(true);
    expect(repository.find).toHaveBeenCalledTimes(2);
    expect(messages(client)).toEqual([
      ['CLOSED', 'first', 'rate-limited: subscription limit reached'],
      ['EOSE', 'second'],
    ]);
    jest.mocked(client.send).mockClear();
    await relay.handleMessage(client, [
      MessageType.REQ,
      'second',
      { kinds: [1] },
    ]);
    expect(ctx.subscriptions.get('second')?.filters).toEqual([{ kinds: [1] }]);
    expect(messages(client)).toEqual([['EOSE', 'second']]);
    await relay.destroy();
  });

  it('eviction cancels pending history and clears buffered events without late EOSE', async () => {
    const { relay, repository, client, ctx } = setup({
      maxSubscriptionsPerClient: 1,
    });
    const first = relay.handleMessage(client, [MessageType.REQ, 'first', {}]);
    await flush();
    const old = ctx.subscriptions.get('first')!;
    await relay.broadcast(event('buffered'));
    expect(old.pendingEvents.size).toBe(1);
    const second = relay.handleMessage(client, [MessageType.REQ, 'second', {}]);
    await flush();
    expect(old.signal.aborted).toBe(true);
    expect(old.pendingEvents.size).toBe(0);
    expect(repository.queries[0].observers).toHaveLength(0);
    repository.queries[0].next(event('late'));
    repository.queries[1].complete();
    await Promise.all([first, second]);
    expect(messages(client)).toEqual([
      ['CLOSED', 'first', 'rate-limited: subscription limit reached'],
      ['EOSE', 'second'],
    ]);
    await relay.destroy();
  });

  it('replacing an ID at capacity preserves other subscriptions and renews its age', async () => {
    const { relay, repository, client, ctx } = setup({
      maxSubscriptionsPerClient: 2,
    });
    repository.find.mockReturnValue(EMPTY);
    await relay.handleMessage(client, [MessageType.REQ, 'first', {}]);
    await relay.handleMessage(client, [MessageType.REQ, 'second', {}]);
    jest.mocked(client.send).mockClear();
    await relay.handleMessage(client, [
      MessageType.REQ,
      'first',
      { kinds: [1] },
    ]);
    expect([...ctx.subscriptions.keys()]).toEqual(['second', 'first']);
    expect(messages(client)).toEqual([['EOSE', 'first']]);
    jest.mocked(client.send).mockClear();
    await relay.handleMessage(client, [MessageType.REQ, 'third', {}]);
    expect([...ctx.subscriptions.keys()]).toEqual(['first', 'third']);
    expect(messages(client)).toEqual([
      ['CLOSED', 'second', 'rate-limited: subscription limit reached'],
      ['EOSE', 'third'],
    ]);
    await relay.destroy();
  });

  it('bounds the catch-up buffer and closes overloaded subscriptions', async () => {
    const { relay, repository, client, ctx } = setup({
      maxPendingEventsPerSubscription: 1,
    });
    const pending = relay.handleMessage(client, [MessageType.REQ, 's', {}]);
    await flush();
    await relay.broadcast(event('a'));
    await relay.broadcast(event('a'));
    await relay.broadcast(event('b'));
    await pending;
    expect(ctx.subscriptions.has('s')).toBe(false);
    expect(repository.queries[0].observers).toHaveLength(0);
    expect(messages(client)).toEqual([
      ['CLOSED', 's', 'rate-limited: subscription live buffer is full'],
    ]);
    await relay.destroy();
  });

  it('bounds filters and closes a rejected replacement without opening another query', async () => {
    const { relay, repository, client, ctx } = setup({
      maxFiltersPerRequest: 1,
    });
    repository.find.mockReturnValue(EMPTY);
    await relay.handleMessage(client, [MessageType.REQ, 's', {}]);
    const existing = ctx.subscriptions.get('s');
    await relay.handleMessage(client, [MessageType.REQ, 's', {}, {}]);
    expect(ctx.subscriptions.has('s')).toBe(false);
    expect(existing?.state).toBe('closed');
    expect(repository.find).toHaveBeenCalledTimes(1);
    expect(messages(client)[messages(client).length - 1]).toEqual([
      'CLOSED',
      's',
      'rate-limited: too many filters',
    ]);
    await relay.destroy();
  });

  it('times out pending queries and removes their observers', async () => {
    jest.useFakeTimers();
    const { relay, repository, client, ctx } = setup({ queryTimeoutMs: 10 });
    const pending = relay.handleMessage(client, [MessageType.REQ, 's', {}]);
    await flush();
    jest.advanceTimersByTime(10);
    await pending;
    expect(ctx.subscriptions.has('s')).toBe(false);
    expect(repository.queries[0].observers).toHaveLength(0);
    expect(messages(client)).toEqual([
      ['CLOSED', 's', 'error: historical query timed out'],
    ]);
    await relay.destroy();
  });

  it('cancels a query even while its asynchronous read guard is unresolved', async () => {
    const { relay, repository, client } = setup();
    relay.register({ canReadEvent: () => new Promise<boolean>(() => {}) });
    const pending = relay.handleMessage(client, [MessageType.REQ, 's', {}]);
    await flush();
    repository.queries[0].next(event('a'));
    await flush();
    await relay.handleMessage(client, [MessageType.CLOSE, 's']);
    await pending;
    expect(messages(client)).toEqual([]);
    await relay.destroy();
  });
});

describe('relay resource and plugin lifecycle', () => {
  it('initializes once, cleans up in reverse order, and destroys the repository once', async () => {
    const { relay, repository } = setup();
    const calls: string[] = [];
    relay.register({
      init: () => {
        calls.push('init first');
      },
      destroy: () => {
        calls.push('destroy first');
      },
    });
    relay.register({
      init: async () => {
        calls.push('init second');
      },
      destroy: () => {
        calls.push('destroy second');
      },
    });
    await Promise.all([relay.init(), relay.init()]);
    expect(() => relay.register({})).toThrow(
      'register plugins before relay initialization',
    );
    await Promise.all([relay.destroy(), relay.destroy()]);
    expect(calls).toEqual([
      'init first',
      'init second',
      'destroy second',
      'destroy first',
    ]);
    expect(repository.destroy).toHaveBeenCalledTimes(1);
    await expect(relay.findEvents([{}])).rejects.toThrow('relay is destroyed');
    expect(() =>
      relay.handleConnection({
        readyState: ClientReadyState.OPEN,
        send: jest.fn(),
      }),
    ).toThrow('relay is destroyed');
  });

  it('continues cleanup after a plugin fails and respects external repository ownership', async () => {
    const { relay, repository } = setup({ destroyRepository: false });
    const cleanup = jest.fn();
    relay.register({ destroy: cleanup });
    relay.register({
      destroy: () => {
        throw new Error('failed');
      },
    });
    await expect(relay.destroy()).rejects.toThrow('relay cleanup failed');
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(repository.destroy).not.toHaveBeenCalled();
  });

  it('releases connection-scoped middleware when a client disconnects', async () => {
    const { relay, client } = setup();
    relay.register({ handleMessage: () => new Promise(() => {}) });
    const pending = relay.handleMessage(client, [MessageType.REQ, 's', {}]);
    const cancelled = expect(pending).rejects.toBeDefined();
    await flush();
    relay.handleDisconnect(client);
    await cancelled;
    await relay.destroy();
  });

  it('cancels trusted queries on destruction before closing their repository', async () => {
    const { relay, repository } = setup();
    const pending = relay.findEvents([{}]);
    // Attach a rejection handler before aborting.
    const rejected = expect(pending).rejects.toBeDefined();
    await flush();
    await relay.destroy();
    await rejected;
    expect(repository.queries[0].observers).toHaveLength(0);
    expect(repository.destroy).toHaveBeenCalledTimes(1);
  });

  it('rolls back plugin resources after initialization failure', async () => {
    const { relay, repository } = setup();
    const cleanup = jest.fn();
    relay.register({ init: () => {}, destroy: cleanup });
    relay.register({
      init: () => {
        throw new Error('init failed');
      },
      destroy: cleanup,
    });
    await expect(relay.init()).rejects.toThrow('init failed');
    expect(cleanup).toHaveBeenCalledTimes(2);
    await relay.destroy();
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(repository.destroy).toHaveBeenCalledTimes(1);
  });

  it('times out plugin cleanup and still releases the repository', async () => {
    jest.useFakeTimers();
    try {
      const { relay, repository } = setup({ pluginLifecycleTimeoutMs: 10 });
      relay.register({ destroy: () => new Promise<void>(() => {}) });
      const cleanup = relay.destroy();
      const rejected = expect(cleanup).rejects.toThrow('relay cleanup failed');
      await flush();
      jest.advanceTimersByTime(10);
      await rejected;
      expect(repository.destroy).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('query caching can be supplied by a plugin while read guards remain client-specific', async () => {
    const { relay, repository, client, ctx } = setup();
    const cache = new Map<string, Observable<Event>>();
    relay.register({
      findEvents: (filter, _options, next) => {
        const key = JSON.stringify(filter);
        if (!cache.has(key))
          cache.set(
            key,
            next().pipe(shareReplay({ bufferSize: 2, refCount: true })),
          );
        return cache.get(key)!;
      },
      destroy: () => {
        cache.clear();
      },
      canReadEvent: recipient => recipient === ctx,
    });
    repository.find.mockReturnValue(from([event('a')]));
    expect(await relay.findEvents([{}], ctx)).toEqual([event('a')]);
    const other = new ClientContext({
      readyState: ClientReadyState.OPEN,
      send: jest.fn(),
    });
    expect(await relay.findEvents([{}], other)).toEqual([]);
    expect(repository.find).toHaveBeenCalledTimes(1);
    expect(messages(client)).toEqual([]);
    await relay.destroy();
    expect(cache.size).toBe(0);
  });
});
