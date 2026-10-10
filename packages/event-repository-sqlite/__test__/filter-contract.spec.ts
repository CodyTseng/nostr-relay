import { Event, EventUtils, Filter } from '../../common';
import { EventRepositorySqlite } from '../src';

function event(id: string, overrides: Partial<Event> = {}): Event {
  return {
    id: id.repeat(64),
    pubkey: '1'.repeat(64),
    created_at: 1,
    kind: 1,
    tags: [],
    content: '',
    sig: '',
    ...overrides,
  };
}

describe('SQLite and live filter contract', () => {
  let repository: EventRepositorySqlite;
  const events = [
    event('a', {
      created_at: 0,
      tags: [
        ['t', 'red'],
        ['t', 'cat'],
        ['p', 'alice'],
        ['q', 'thread'],
      ],
    }),
    event('b', {
      created_at: 10,
      pubkey: '2'.repeat(64),
      tags: [
        ['t', 'blue'],
        ['t', 'cat'],
        ['p', 'bob'],
        ['T', 'UPPER'],
      ],
    }),
    event('c', { created_at: 20, kind: 2, tags: [['t']] }),
    event('d', { created_at: 30 }),
    event('e', {
      created_at: 40,
      tags: [
        ['t', 'red'],
        ['t', 'blue'],
        ['p', 'alice'],
        ['q', 'thread'],
        ['d', ''],
      ],
    }),
  ];

  beforeEach(async () => {
    repository = new EventRepositorySqlite();
    await repository.init();
    for (const event of events) await repository.upsert(event);
  });
  afterEach(async () => repository.destroy());

  it.each<Filter>([
    {},
    { ids: [] },
    { authors: [] },
    { kinds: [] },
    { '#t': [] },
    { '&t': [] },
    { '#t': undefined },
    { '#t': ['red', 'red', 'blue'] },
    { '&t': ['cat', 'cat'] },
    { '&t': ['cat', 'red'] },
    { '&t': ['cat'], '#t': ['cat', 'blue'] },
    { '&t': ['cat'], '#t': ['cat'] },
    { '#t': ['red'], '#p': ['alice'], '#q': ['thread'] },
    { ids: [events[0].id], '#t': ['red'], '#p': ['alice'], '#q': ['missing'] },
    { '#t': ['undefined'] },
    { '#T': ['UPPER'] },
    { '#d': [''] },
    { since: 0, until: 0 },
    { since: 20, until: 10 },
    { since: 10, until: 20 },
    { authors: [events[1].pubkey], kinds: [1] },
    { search: '   ' },
  ])('matches identical event IDs and COUNT for %j', async filter => {
    const expected = events
      .filter(event => EventUtils.isMatchingFilter(event, filter))
      .map(event => event.id)
      .sort();
    const actual = await repository.find(filter);
    expect(actual.map(event => event.id).sort()).toEqual(expected);
    expect(await repository.count([filter])).toBe(expected.length);
  });

  it('applies limits to distinct events even with several matching tag values', async () => {
    const filter: Filter = {
      '#t': ['red', 'blue'],
      '#p': ['alice', 'bob'],
      limit: 2,
    };
    expect((await repository.find(filter)).map(event => event.id)).toEqual([
      events[4].id,
      events[1].id,
    ]);
    expect(await repository.count([filter])).toBe(3);
  });

  it('removes obsolete tag indexes when a replacement has no tags', async () => {
    const old = event('f', { kind: 0, created_at: 10, tags: [['t', 'old']] });
    const replacement = event('0', { kind: 0, created_at: 11, tags: [] });
    await repository.upsert(old);
    await repository.upsert(replacement);
    expect(await repository.find({ '#t': ['old'] })).toEqual([]);
    expect(await repository.count([{ '#t': ['old'] }])).toBe(0);
    expect(await repository.find({ kinds: [0] })).toEqual([replacement]);
  });

  it('rejects already cancelled queries', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(
      repository.find({}, { signal: controller.signal }),
    ).rejects.toThrow('cancelled');
  });
});
