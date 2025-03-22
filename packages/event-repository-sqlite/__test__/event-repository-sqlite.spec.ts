import * as BetterSqlite3 from 'better-sqlite3';
import { EventKind, getTimestampInSeconds } from '../../common';
import { createEvent } from '../../common/__test__/utils/event.spec';
import { EventRepositorySqlite } from '../src/event-repository-sqlite';

describe('EventRepositorySqlite', () => {
  let eventRepository: EventRepositorySqlite;
  let database: BetterSqlite3.Database;

  beforeEach(async () => {
    eventRepository = new EventRepositorySqlite();
    await eventRepository.init();
    database = eventRepository.getDatabase();
  });

  afterEach(async () => {
    await eventRepository.destroy();
  });

  describe('constructor', () => {
    it('should support create by better-sqlite3.Database', async () => {
      const db = new BetterSqlite3(':memory:');
      const newEventRepository = new EventRepositorySqlite(db);
      await newEventRepository.init();
      expect(newEventRepository.getDatabase()).toBe(db);
      expect(newEventRepository.getDefaultLimit()).toBe(100);
      await newEventRepository.destroy();
    });

    it('should support options', async () => {
      const newEventRepository = new EventRepositorySqlite(':memory:', {
        defaultLimit: 10,
      });
      await newEventRepository.init();
      expect(newEventRepository.getDefaultLimit()).toBe(10);
      await newEventRepository.destroy();
    });
  });

  describe('isSearchSupported', () => {
    it('should return true', () => {
      expect(eventRepository.isSearchSupported()).toBe(true);
    });
  });

  describe('upsert', () => {
    it('should insert a new event', async () => {
      const eventA = createEvent({
        tags: [
          ['a', 'test'],
          ['b', 'test'],
        ],
      });
      const resultA = await eventRepository.upsert(eventA);
      expect(resultA).toEqual({ isDuplicate: false });

      const eventB = createEvent({});
      const resultB = await eventRepository.upsert(eventB);
      expect(resultB).toEqual({ isDuplicate: false });

      const dbEventA = await eventRepository.findOne({ ids: [eventA.id] });
      expect(dbEventA).toEqual(eventA);
      const genericTags = database
        .prepare(`SELECT * FROM generic_tags WHERE event_id = ?`)
        .all([eventA.id]) as { tag: string }[];
      expect(genericTags.map(e => e.tag)).toEqual(['a:test', 'b:test']);

      const dbEventB = await eventRepository.findOne({ ids: [eventB.id] });
      expect(dbEventB).toEqual(eventB);
    });

    it('should update an existing event', async () => {
      const eventA = createEvent({
        kind: EventKind.SET_METADATA,
        content: 'a',
        tags: [
          ['a', 'test'],
          ['b', 'test'],
        ],
      });
      await eventRepository.upsert(eventA);

      const eventB = createEvent({
        kind: EventKind.SET_METADATA,
        content: 'b',
        created_at: eventA.created_at + 1,
      });
      const result = await eventRepository.upsert(eventB);
      expect(result).toEqual({ isDuplicate: false });

      const dbEventA = await eventRepository.findOne({ ids: [eventA.id] });
      expect(dbEventA).toBeNull();
      const genericTags = database
        .prepare(`SELECT * FROM generic_tags WHERE event_id = ?`)
        .all([eventA.id]) as { tag: string }[];
      expect(genericTags.map(e => e.tag)).toEqual([]);
      const dbEventB = await eventRepository.findOne({ ids: [eventB.id] });
      expect(dbEventB).toEqual(eventB);
    });

    it('should not insert an event with same id', async () => {
      const event = createEvent();
      await eventRepository.upsert(event);
      const result = await eventRepository.upsert(event);
      expect(result).toEqual({ isDuplicate: true });

      const dbEvent = await eventRepository.findOne({ ids: [event.id] });
      expect(dbEvent).toEqual(event);
    });

    it('should not insert an event with earlier createdAt', async () => {
      const eventA = createEvent({
        kind: EventKind.SET_METADATA,
        content: 'a',
      });
      await eventRepository.upsert(eventA);

      const eventB = createEvent({
        kind: EventKind.SET_METADATA,
        content: 'b',
        created_at: eventA.created_at - 1,
      });
      const result = await eventRepository.upsert(eventB);
      expect(result).toEqual({ isDuplicate: true });

      const dbEventA = await eventRepository.findOne({ ids: [eventA.id] });
      expect(dbEventA).toEqual(eventA);
      const dbEventB = await eventRepository.findOne({ ids: [eventB.id] });
      expect(dbEventB).toBeNull();
    });

    it('should update an existing parameterized replaceable event', async () => {
      const eventA = createEvent({
        kind: EventKind.PARAMETERIZED_REPLACEABLE_FIRST,
        content: 'a',
        tags: [
          ['d', 'test'],
          ['x', 'test'],
        ],
      });
      await eventRepository.upsert(eventA);

      const eventB = createEvent({
        kind: EventKind.PARAMETERIZED_REPLACEABLE_FIRST,
        content: 'b',
        tags: [['d', 'test']],
        created_at: eventA.created_at + 1,
      });
      const result = await eventRepository.upsert(eventB);
      expect(result).toEqual({ isDuplicate: false });

      const eventAGenericTags = database
        .prepare('SELECT * FROM generic_tags WHERE event_id = ?')
        .all(eventA.id);
      expect(eventAGenericTags).toEqual([]);

      const eventBGenericTags = database
        .prepare('SELECT * FROM generic_tags WHERE event_id = ?')
        .all(eventB.id) as { tag: string }[];
      expect(eventBGenericTags.map(e => e.tag)).toEqual(['d:test']);
    });

    it('should insert an event with same createdAt and smaller id', async () => {
      const now = getTimestampInSeconds();
      const [A, B, C] = [
        createEvent({
          kind: EventKind.SET_METADATA,
          content: Math.random().toString(),
          created_at: now,
        }),
        createEvent({
          kind: EventKind.SET_METADATA,
          content: Math.random().toString(),
          created_at: now,
        }),
        createEvent({
          kind: EventKind.SET_METADATA,
          content: Math.random().toString(),
          created_at: now,
        }),
      ].sort((a, b) => (a.id < b.id ? -1 : 1));

      await eventRepository.upsert(B);
      const upsertAResult = await eventRepository.upsert(A);
      expect(upsertAResult).toEqual({ isDuplicate: false });

      const upsertCResult = await eventRepository.upsert(C);
      expect(upsertCResult).toEqual({ isDuplicate: true });

      const dbEventA = await eventRepository.findOne({ ids: [A.id] });
      expect(dbEventA).toEqual(A);
    });

    it('should throw an error', async () => {
      jest
        .spyOn(eventRepository['db'], 'transaction')
        .mockImplementation(() => {
          throw new Error('test');
        });

      await expect(eventRepository.upsert(createEvent())).rejects.toThrow(
        'test',
      );
    });
  });

  describe('find', () => {
    const now = getTimestampInSeconds();
    const events = [
      createEvent({
        kind: EventKind.LONG_FORM_CONTENT,
        content: 'hello nostr',
        tags: [
          ['d', 'test'],
          ['t', 'test'],
          ['e', 'test'],
        ],
        created_at: now + 1000,
      }),
      createEvent({
        kind: EventKind.TEXT_NOTE,
        content: 'hello world',
        tags: [
          ['t', 'test'],
          ['f', 'test'],
        ],
        created_at: now,
      }),
      createEvent({
        kind: EventKind.SET_METADATA,
        content: JSON.stringify({ name: 'cody' }),
        created_at: now - 1000,
      }),
    ];
    const [LONG_FORM_CONTENT_EVENT, TEXT_NOTE_EVENT, SET_METADATA_EVENT] =
      events;

    beforeEach(async () => {
      await Promise.all(events.map(event => eventRepository.upsert(event)));
    });

    it('should return all events', async () => {
      const result = await eventRepository.find({});
      expect(result).toEqual(events);
    });

    it('should filter by kind', async () => {
      const result = await eventRepository.find({
        kinds: [EventKind.TEXT_NOTE],
      });
      expect(result).toEqual([TEXT_NOTE_EVENT]);
    });

    it('should filter by author', async () => {
      const result = await eventRepository.find({
        authors: [TEXT_NOTE_EVENT.pubkey],
      });
      expect(result).toEqual(events);

      const result2 = await eventRepository.find({
        authors: ['test'],
      });
      expect(result2).toEqual([]);
    });

    it('should filter by since', async () => {
      const result = await eventRepository.find({
        since: now,
      });
      expect(result).toEqual([LONG_FORM_CONTENT_EVENT, TEXT_NOTE_EVENT]);
    });

    it('should filter by until', async () => {
      const result = await eventRepository.find({
        until: now,
      });
      expect(result).toEqual([TEXT_NOTE_EVENT, SET_METADATA_EVENT]);
    });

    it('should filter by since and until', async () => {
      const result = await eventRepository.find({
        since: now + 1,
        until: now + 1000,
      });
      expect(result).toEqual([LONG_FORM_CONTENT_EVENT]);
    });

    it('should filter by ids', async () => {
      const result = await eventRepository.find({
        ids: [TEXT_NOTE_EVENT.id],
      });
      expect(result).toEqual([TEXT_NOTE_EVENT]);
    });

    it('should filter by ids and tags', async () => {
      const result = await eventRepository.find({
        ids: [TEXT_NOTE_EVENT.id],
        '#t': ['test'],
        '#f': ['test'],
      });
      expect(result).toEqual([TEXT_NOTE_EVENT]);
    });

    it('should return empty array directly if limit is 0', async () => {
      const result = await eventRepository.find({
        limit: 0,
      });
      expect(result).toEqual([]);
    });

    describe('filter by generic tags', () => {
      it('should filter by tags', async () => {
        const result1 = await eventRepository.find({
          '#t': ['test'],
        });
        expect(result1).toEqual([LONG_FORM_CONTENT_EVENT, TEXT_NOTE_EVENT]);

        const result2 = await eventRepository.find({
          '#t': ['test'],
          limit: 1,
        });
        expect(result2).toEqual([LONG_FORM_CONTENT_EVENT]);
      });

      it('should filter by multiple tags', async () => {
        const result = await eventRepository.find({
          '#t': ['test'],
          '#e': ['test'],
        });
        expect(result).toEqual([LONG_FORM_CONTENT_EVENT]);
      });

      it('should filter by tags and since', async () => {
        const result = await eventRepository.find({
          '#t': ['test'],
          since: now + 1,
        });
        expect(result).toEqual([LONG_FORM_CONTENT_EVENT]);
      });

      it('should filter by tags and until', async () => {
        const result = await eventRepository.find({
          '#t': ['test'],
          until: now + 1,
        });
        expect(result).toEqual([TEXT_NOTE_EVENT]);
      });

      it('should filter by tags and since and until', async () => {
        const result = await eventRepository.find({
          '#t': ['test'],
          since: now + 1,
          until: now + 1000,
        });
        expect(result).toEqual([LONG_FORM_CONTENT_EVENT]);
      });

      it('should filter by tags and authors', async () => {
        const result = await eventRepository.find({
          '#t': ['test'],
          authors: [TEXT_NOTE_EVENT.pubkey],
        });
        expect(result).toEqual([LONG_FORM_CONTENT_EVENT, TEXT_NOTE_EVENT]);
      });

      it('should filter by tags and kinds', async () => {
        const result = await eventRepository.find({
          '#t': ['test'],
          kinds: [EventKind.TEXT_NOTE],
        });
        expect(result).toEqual([TEXT_NOTE_EVENT]);
      });

      it('should filter by tags and ids', async () => {
        const result = await eventRepository.find({
          '#t': ['test'],
          ids: [TEXT_NOTE_EVENT.id],
        });
        expect(result).toEqual([TEXT_NOTE_EVENT]);
      });

      it('should return empty array if query is too complex', async () => {
        const result = await eventRepository.find({
          '#t': ['test'],
          '#e': ['test'],
          '#f': ['test'],
        });
        expect(result).toEqual([]);
      });
    });
  });

  describe('deleteByDeletionRequest', () => {
    const now = getTimestampInSeconds();
    const events = [
      createEvent({
        kind: EventKind.LONG_FORM_CONTENT,
        content: 'hello nostr',
        tags: [
          ['d', 'test'],
          ['t', 'test'],
          ['e', 'test'],
        ],
        created_at: now + 1000,
      }),
      createEvent({
        kind: EventKind.TEXT_NOTE,
        content: 'hello world',
        tags: [
          ['t', 'test'],
          ['f', 'test'],
        ],
        created_at: now,
      }),
      createEvent({
        kind: EventKind.SET_METADATA,
        content: JSON.stringify({ name: 'cody' }),
        created_at: now - 1000,
      }),
    ];
    const [LONG_FORM_CONTENT_EVENT, TEXT_NOTE_EVENT, SET_METADATA_EVENT] =
      events;

    beforeEach(async () => {
      await Promise.all(events.map(event => eventRepository.upsert(event)));
    });

    it('should delete text note', async () => {
      const deletionRequestEvent = createEvent({
        kind: EventKind.DELETION,
        tags: [['e', TEXT_NOTE_EVENT.id]],
      });
      await eventRepository.deleteByDeletionRequest(deletionRequestEvent);

      const result = await eventRepository.find({});
      expect(result.length).toBe(2);
      expect(result.find(e => e.id === TEXT_NOTE_EVENT.id)).toBeUndefined();
    });

    it('should delete long form content', async () => {
      const deletionRequestEvent = createEvent({
        kind: EventKind.DELETION,
        tags: [
          [
            'a',
            `${LONG_FORM_CONTENT_EVENT.kind}:${LONG_FORM_CONTENT_EVENT.pubkey}:test`,
          ],
        ],
      });
      await eventRepository.deleteByDeletionRequest(deletionRequestEvent);

      const result = await eventRepository.find({});
      expect(result.length).toBe(2);
      expect(
        result.find(e => e.id === LONG_FORM_CONTENT_EVENT.id),
      ).toBeUndefined();
    });

    it('should delete metadata', async () => {
      const deletionRequestEvent = createEvent({
        kind: EventKind.DELETION,
        tags: [
          ['a', `${SET_METADATA_EVENT.kind}:${SET_METADATA_EVENT.pubkey}:`],
        ],
      });
      await eventRepository.deleteByDeletionRequest(deletionRequestEvent);

      const result = await eventRepository.find({});
      expect(result.length).toBe(2);
      expect(result.find(e => e.id === SET_METADATA_EVENT.id)).toBeUndefined();
    });

    it('should delete', async () => {
      const deletionRequestEvent = createEvent({
        kind: EventKind.DELETION,
        tags: [
          ['e', TEXT_NOTE_EVENT.id],
          [
            'a',
            `${LONG_FORM_CONTENT_EVENT.kind}:${LONG_FORM_CONTENT_EVENT.pubkey}:test`,
          ],
          ['a', `${SET_METADATA_EVENT.kind}:${SET_METADATA_EVENT.pubkey}:`],
        ],
      });
      await eventRepository.deleteByDeletionRequest(deletionRequestEvent);

      const result = await eventRepository.find({});
      expect(result.length).toBe(0);
    });

    it('should not delete events of others', async () => {
      const deletionRequestEvent = createEvent({
        kind: EventKind.DELETION,
        tags: [
          ['e', TEXT_NOTE_EVENT.id],
          [
            'a',
            `${LONG_FORM_CONTENT_EVENT.kind}:${LONG_FORM_CONTENT_EVENT.pubkey}:test`,
          ],
          ['a', `${SET_METADATA_EVENT.kind}:${SET_METADATA_EVENT.pubkey}:`],
        ],
        privateKey:
          '24eac0be69c86ae450903881f1e5dd1576a452bdaf1c3150a66bd6d15275318e',
      });
      await eventRepository.deleteByDeletionRequest(deletionRequestEvent);

      const result = await eventRepository.find({});
      expect(result.length).toBe(3);
    });
  });

  describe('setDefaultLimit', () => {
    it('should set default limit', async () => {
      expect(eventRepository.getDefaultLimit()).toBe(100);
      eventRepository.setDefaultLimit(10);
      expect(eventRepository.getDefaultLimit()).toBe(10);
    });
  });
});
