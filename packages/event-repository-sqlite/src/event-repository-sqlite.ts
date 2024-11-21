import {
  Event,
  EventRepository,
  EventRepositoryUpsertResult,
  EventUtils,
  Filter,
} from '@nostr-relay/common';
import * as BetterSqlite3 from 'better-sqlite3';
import {
  JSONColumnType,
  Kysely,
  Migrator,
  SelectQueryBuilder,
  sql,
  SqliteDialect,
} from 'kysely';
import { CustomMigrationProvider } from './migrations';
import { extractSearchableContent } from './search';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT_MULTIPLIER = 10;

export type EventRepositorySqliteOptions = {
  defaultLimit?: number;
};

export interface Database {
  events: EventTable;
  events_fts: EventFtsTable;
  generic_tags: GenericTagTable;
}

interface EventTable {
  id: string;
  pubkey: string;
  author: string;
  created_at: number;
  kind: number;
  tags: JSONColumnType<string[][]>;
  content: string;
  sig: string;
  d_tag_value: string | null;
}

interface EventFtsTable {
  id: string;
  content: string;
}

interface GenericTagTable {
  tag: string;
  author: string;
  kind: number;
  event_id: string;
  created_at: number;
}

type eventSelectQueryBuilder = SelectQueryBuilder<
  Database & {
    e: EventTable;
  },
  'e',
  {}
>;

export class EventRepositorySqlite extends EventRepository {
  private db: Kysely<Database>;
  private betterSqlite3: BetterSqlite3.Database;
  private defaultLimit: number;
  private maxLimit: number;

  constructor(
    db: BetterSqlite3.Database,
    options?: EventRepositorySqliteOptions,
  );
  constructor(filename?: string, options?: EventRepositorySqliteOptions);
  constructor(
    filenameOrDb: string | BetterSqlite3.Database = ':memory:',
    options?: EventRepositorySqliteOptions,
  ) {
    super();
    if (typeof filenameOrDb === 'string') {
      this.betterSqlite3 = new BetterSqlite3(filenameOrDb);
      this.betterSqlite3.pragma('journal_mode = WAL');
    } else {
      this.betterSqlite3 = filenameOrDb;
    }
    this.db = new Kysely<Database>({
      dialect: new SqliteDialect({ database: this.betterSqlite3 }),
    });

    this.defaultLimit = options?.defaultLimit ?? DEFAULT_LIMIT;
    this.maxLimit = this.defaultLimit * MAX_LIMIT_MULTIPLIER;
  }

  async init(): Promise<void> {
    await this.migrate();
  }

  getDatabase(): BetterSqlite3.Database {
    return this.betterSqlite3;
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }

  isSearchSupported(): boolean {
    return true;
  }

  async upsert(event: Event): Promise<EventRepositoryUpsertResult> {
    const author = EventUtils.getAuthor(event);
    const dTagValue = EventUtils.extractDTagValue(event);
    const genericTags = this.extractGenericTagsFrom(event);
    try {
      const { numInsertedOrUpdatedRows } = await this.db
        .transaction()
        .execute(async trx => {
          let oldEventId: string | undefined;
          if (dTagValue !== null) {
            const row = await trx
              .selectFrom('events')
              .select(['id'])
              .where('author', '=', author)
              .where('kind', '=', event.kind)
              .where('d_tag_value', '=', dTagValue)
              .executeTakeFirst();
            oldEventId = row ? row.id : undefined;
          }
          const eventInsertResult = await trx
            .insertInto('events')
            .values({
              id: event.id,
              pubkey: event.pubkey,
              author,
              kind: event.kind,
              created_at: event.created_at,
              tags: JSON.stringify(event.tags),
              content: event.content,
              sig: event.sig,
              d_tag_value: dTagValue,
            })
            .onConflict(oc =>
              oc
                .columns(['author', 'kind', 'd_tag_value'])
                .where('d_tag_value', 'is not', null)
                .doUpdateSet({
                  id: eb => eb.ref('excluded.id'),
                  pubkey: eb => eb.ref('excluded.pubkey'),
                  created_at: eb => eb.ref('excluded.created_at'),
                  tags: eb => eb.ref('excluded.tags'),
                  content: eb => eb.ref('excluded.content'),
                  sig: eb => eb.ref('excluded.sig'),
                })
                .where(eb =>
                  eb.or([
                    eb('events.created_at', '<', eb =>
                      eb.ref('excluded.created_at'),
                    ),
                    eb.and([
                      eb('events.created_at', '=', eb =>
                        eb.ref('excluded.created_at'),
                      ),
                      eb('events.id', '>', eb => eb.ref('excluded.id')),
                    ]),
                  ]),
                ),
            )
            .executeTakeFirst();

          if (eventInsertResult.numInsertedOrUpdatedRows === BigInt(0)) {
            return eventInsertResult;
          }

          if (genericTags.length > 0) {
            await trx
              .deleteFrom('generic_tags')
              .where('event_id', '=', event.id)
              .execute();

            await trx
              .insertInto('generic_tags')
              .values(
                genericTags.map(tag => ({
                  tag,
                  event_id: event.id,
                  kind: event.kind,
                  author,
                  created_at: event.created_at,
                })),
              )
              .executeTakeFirst();
          }

          if (oldEventId) {
            await trx
              .deleteFrom('events_fts')
              .where('id', '=', oldEventId)
              .execute();
          }

          const searchableContent = extractSearchableContent(event);
          if (searchableContent) {
            await trx
              .insertInto('events_fts')
              .values({
                id: event.id,
                content: searchableContent,
              })
              .execute();
          }

          return eventInsertResult;
        });

      return { isDuplicate: numInsertedOrUpdatedRows === BigInt(0) };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return { isDuplicate: true };
      }
      throw error;
    }
  }

  async insertToSearch(event: Event): Promise<number> {
    const searchableContent = extractSearchableContent(event);
    if (searchableContent) {
      await this.db
        .insertInto('events_fts')
        .values({
          id: event.id,
          content: searchableContent,
        })
        .execute();
      return 1;
    }
    return 0;
  }

  async find(filter: Filter): Promise<Event[]> {
    const limit = this.getLimitFrom(filter);
    if (limit === 0) return [];

    const genericTagsCollection = this.extractGenericTagsCollectionFrom(filter);
    if (!filter.ids?.length && genericTagsCollection.length) {
      // too complex query
      if (genericTagsCollection.length > 2) {
        return [];
      }

      const rows = await this.createGenericTagsSelectQuery(
        filter,
        genericTagsCollection[0],
        genericTagsCollection[1],
      )
        .select([
          'e.id',
          'e.pubkey',
          'e.kind',
          'e.tags',
          'e.content',
          'e.sig',
          'e.created_at',
        ])
        .limit(limit)
        .execute();
      return rows.map(this.toEvent);
    }

    const rows = await this.createSelectQuery(filter)
      .select([
        'e.id',
        'e.pubkey',
        'e.kind',
        'e.tags',
        'e.content',
        'e.sig',
        'e.created_at',
      ])
      .limit(limit)
      .execute();
    return rows.map(this.toEvent);
  }

  getDefaultLimit(): number {
    return this.defaultLimit;
  }

  setDefaultLimit(limit: number): void {
    this.defaultLimit = limit;
    this.maxLimit = limit * MAX_LIMIT_MULTIPLIER;
  }

  private createSelectQuery(filter: Filter): eventSelectQueryBuilder {
    let query = this.db.selectFrom('events as e');

    const searchStr = filter.search?.trim();
    if (searchStr) {
      query = query.innerJoin('events_fts as fts', join =>
        join
          .onRef('fts.id', '=', 'e.id')
          .on('fts.content', sql`match`, searchStr),
      );
    }

    const genericTagsCollection = this.extractGenericTagsCollectionFrom(filter);
    if (genericTagsCollection.length) {
      const [firstGenericTagsFilter, secondGenericTagsFilter] =
        genericTagsCollection;
      query = query.innerJoin('generic_tags as g1', join =>
        join
          .onRef('g1.event_id', '=', 'e.id')
          .on('g1.tag', 'in', firstGenericTagsFilter),
      );

      if (secondGenericTagsFilter) {
        query = query.innerJoin('generic_tags as g2', join =>
          join
            .onRef('g2.event_id', '=', 'e.id')
            .on('g2.tag', 'in', secondGenericTagsFilter),
        );
      }
    }

    if (filter.ids?.length) {
      query = query.where('e.id', 'in', filter.ids);
    }

    if (filter.since) {
      query = query.where('e.created_at', '>=', filter.since);
    }

    if (filter.until) {
      query = query.where('e.created_at', '<=', filter.until);
    }

    if (filter.authors?.length) {
      query = query.where('e.author', 'in', filter.authors);
    }

    if (filter.kinds?.length) {
      query = query.where('e.kind', 'in', filter.kinds);
    }

    return query.orderBy('e.created_at desc');
  }

  private createGenericTagsSelectQuery(
    filter: Filter,
    firstGenericTagsFilter: string[],
    secondGenericTagsFilter?: string[],
  ): eventSelectQueryBuilder {
    let subQuery = this.db
      .selectFrom('generic_tags as g')
      .select('g.event_id')
      .distinct();

    if (secondGenericTagsFilter?.length) {
      subQuery = subQuery.innerJoin('generic_tags as g2', join =>
        join
          .onRef('g2.event_id', '=', 'g.event_id')
          .on('g2.tag', 'in', secondGenericTagsFilter),
      );
    }

    subQuery = subQuery.where('g.tag', 'in', firstGenericTagsFilter);

    if (filter.since) {
      subQuery = subQuery.where('g.created_at', '>=', filter.since);
    }

    if (filter.until) {
      subQuery = subQuery.where('g.created_at', '<=', filter.until);
    }

    if (filter.authors?.length) {
      subQuery = subQuery.where('g.author', 'in', filter.authors);
    }

    if (filter.kinds?.length) {
      subQuery = subQuery.where('g.kind', 'in', filter.kinds);
    }

    subQuery.orderBy('g.created_at desc').limit(this.getLimitFrom(filter));

    return this.db
      .selectFrom('events as e')
      .where('e.id', 'in', subQuery)
      .orderBy('e.created_at desc');
  }

  private isGenericTagName(tagName: string): boolean {
    return /^[a-zA-Z]$/.test(tagName);
  }

  private toGenericTag(tagName: string, tagValue: string): string {
    return `${tagName}:${tagValue}`;
  }

  private extractGenericTagsFrom(event: Event): string[] {
    const genericTagSet = new Set<string>();
    event.tags.forEach(([tagName, tagValue]) => {
      if (this.isGenericTagName(tagName)) {
        genericTagSet.add(this.toGenericTag(tagName, tagValue));
      }
    });
    return [...genericTagSet];
  }

  private extractGenericTagsCollectionFrom(filter: Filter): string[][] {
    return Object.keys(filter)
      .filter(key => key.startsWith('#') && filter[key].length > 0)
      .map(key => {
        const tagName = key[1];
        return filter[key].map((v: string) => this.toGenericTag(tagName, v));
      })
      .sort((a, b) => a.length - b.length);
  }

  private getLimitFrom(filter: Filter): number {
    return filter.limit === undefined
      ? this.defaultLimit
      : Math.min(filter.limit, this.maxLimit);
  }

  private async migrate(): Promise<void> {
    this.migrateOldMigrationTable();

    const migrator = new Migrator({
      db: this.db,
      provider: new CustomMigrationProvider(),
      migrationTableName: 'nostr_relay_sqlite_migrations',
    });

    const { error } = await migrator.migrateToLatest();

    if (error) {
      throw error;
    }
  }

  private migrateOldMigrationTable(): void {
    const oldMigrationsTable = this.betterSqlite3
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='nostr_relay_migrations'`,
      )
      .get() as { name: string } | undefined;

    if (oldMigrationsTable) {
      this.betterSqlite3.exec(`
        CREATE TABLE IF NOT EXISTS nostr_relay_sqlite_migrations (
          name TEXT NOT NULL PRIMARY KEY,
          timestamp TEXT NOT NULL
        )
      `);

      const oldMigrations = this.betterSqlite3
        .prepare(`SELECT * FROM nostr_relay_migrations`)
        .all() as { name: string; created_at: number }[];

      const runMigrations = this.betterSqlite3.transaction(() => {
        oldMigrations.forEach(migration => {
          this.betterSqlite3
            .prepare(
              `INSERT INTO nostr_relay_sqlite_migrations (name, timestamp) VALUES (?, ?)`,
            )
            .run(
              migration.name.replace('.sql', ''),
              new Date(migration.created_at).toISOString(),
            );
        });
        this.betterSqlite3.exec(`DROP TABLE nostr_relay_migrations`);
      });
      runMigrations();
    }
  }

  private toEvent(row: any): Event {
    return {
      id: row.id,
      pubkey: row.pubkey,
      created_at: row.created_at,
      kind: row.kind,
      tags: JSON.parse(row.tags),
      content: row.content,
      sig: row.sig,
    };
  }
}
