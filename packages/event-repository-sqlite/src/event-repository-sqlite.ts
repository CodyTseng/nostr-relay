import {
  Event,
  EventRepository,
  EventRepositoryUpsertResult,
  EventUtils,
  Filter,
} from '@nostr-relay/common';
import * as BetterSqlite3 from 'better-sqlite3';
import { readdirSync, readFileSync } from 'fs';
import {
  JSONColumnType,
  Kysely,
  SelectQueryBuilder,
  SqliteDialect,
} from 'kysely';
import * as path from 'path';

export interface Database {
  events: EventTable;
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

  constructor(db: BetterSqlite3.Database);
  constructor(filename?: string);
  constructor(filenameOrDb: string | BetterSqlite3.Database = ':memory:') {
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

    this.migrate();
  }

  getDatabase(): BetterSqlite3.Database {
    return this.betterSqlite3;
  }

  close(): void {
    this.betterSqlite3.close();
  }

  isSearchSupported(): boolean {
    return false;
  }

  async upsert(event: Event): Promise<EventRepositoryUpsertResult> {
    const author = EventUtils.getAuthor(event);
    const dTagValue = EventUtils.extractDTagValue(event);
    const genericTags = this.extractGenericTagsFrom(event);
    try {
      const { numInsertedOrUpdatedRows } = await this.db
        .transaction()
        .execute(async trx => {
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

  private createSelectQuery(filter: Filter): eventSelectQueryBuilder {
    let query = this.db.selectFrom('events as e');

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

  private getLimitFrom(filter: Filter, defaultLimit = 100): number {
    return Math.min(filter.limit ?? defaultLimit, 1000);
  }

  private migrate(): {
    lastMigration: string | undefined;
    executedMigrations: string[];
  } {
    this.betterSqlite3.exec(`
      CREATE TABLE IF NOT EXISTS nostr_relay_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    const lastMigration = this.betterSqlite3
      .prepare(`SELECT * FROM nostr_relay_migrations ORDER BY id DESC LIMIT 1`)
      .get() as { name: string } | undefined;

    const migrationFileNames = readdirSync(
      path.join(__dirname, '../migrations'),
    ).filter(fileName => fileName.endsWith('.sql'));

    const migrationsToRun = (
      lastMigration
        ? migrationFileNames.filter(fileName => fileName > lastMigration.name)
        : migrationFileNames
    ).sort();

    if (migrationsToRun.length === 0) {
      return {
        lastMigration: lastMigration?.name,
        executedMigrations: [],
      };
    }

    const runMigrations = this.betterSqlite3.transaction(() => {
      migrationsToRun.forEach(fileName => {
        const migration = readFileSync(
          path.join(__dirname, '../migrations', fileName),
          'utf8',
        );
        this.betterSqlite3.exec(migration);
        this.betterSqlite3
          .prepare(
            `INSERT INTO nostr_relay_migrations (name, created_at) VALUES (?, ?)`,
          )
          .run(fileName, Date.now());
      });
    });
    runMigrations();

    return {
      lastMigration: migrationsToRun[migrationsToRun.length - 1],
      executedMigrations: migrationsToRun,
    };
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
