import {
  Event,
  EventRepository,
  EventRepositoryUpsertResult,
  EventUtils,
  Filter,
} from '@nostr-relay/common';
import * as BetterSqlite3 from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import * as path from 'path';

export class EventRepositorySqlite extends EventRepository {
  private db: BetterSqlite3.Database;

  constructor(filename = ':memory:') {
    super();
    this.db = new BetterSqlite3(filename);
    this.db.pragma('journal_mode = WAL');

    this.migrate();
  }

  isSearchSupported(): boolean {
    return false;
  }

  close(): void {
    this.db.close();
  }

  getDatabase(): BetterSqlite3.Database {
    return this.db;
  }

  async upsert(event: Event): Promise<EventRepositoryUpsertResult> {
    const upsertTransaction = this.db.transaction((event: Event) => {
      const author = EventUtils.getAuthor(event, false);
      const dTagValue = EventUtils.extractDTagValue(event);
      const genericTags = this.extractGenericTags(event);

      const insertEventResult = this.db
        .prepare(
          `
            INSERT INTO events 
              (id, pubkey, author, created_at, kind, tags, content, sig, d_tag_value)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (author, kind, d_tag_value) WHERE d_tag_value IS NOT NULL
            DO UPDATE SET
              id = excluded.id,
              pubkey = excluded.pubkey,
              created_at = excluded.created_at,
              tags = excluded.tags,
              content = excluded.content,
              sig = excluded.sig
            WHERE
              events.created_at < excluded.created_at
              OR (
                  events.created_at = excluded.created_at
                  AND events.id > excluded.id
              )
          `,
        )
        .run(
          event.id,
          event.pubkey,
          author,
          event.created_at,
          event.kind,
          JSON.stringify(event.tags),
          event.content,
          event.sig,
          dTagValue,
        );

      if (insertEventResult.changes === 0) {
        return { isDuplicate: true };
      }

      if (genericTags.length > 0) {
        this.db
          .prepare('DELETE FROM generic_tags WHERE event_id = ?')
          .run(event.id);
        this.db
          .prepare(
            `INSERT INTO generic_tags (tag, event_id, author, kind, created_at) VALUES ${genericTags
              .map(() => '(?, ?, ?, ?, ?)')
              .join(',')}`,
          )
          .run(
            genericTags.flatMap(tag => [
              tag,
              event.id,
              author,
              event.kind,
              event.created_at,
            ]),
          );
      }

      return { isDuplicate: false };
    });

    try {
      return upsertTransaction(event);
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        return { isDuplicate: true };
      }
      throw error;
    }
  }

  async find(filter: Filter): Promise<Event[]> {
    const { ids, authors, kinds, since, until, limit } = filter;

    if (limit === 0) return [];

    const genericTags = this.extractGenericTagsFrom(filter);
    if (!filter.ids?.length && genericTags.length) {
      return this.findFromGenericTags(filter, genericTags);
    }

    const innerJoinClauses: string[] = [];
    const whereClauses: string[] = [];
    const whereValues: (string | number)[] = [];

    if (genericTags.length) {
      genericTags.forEach((genericTags, index) => {
        const alias = `g${index + 1}`;
        innerJoinClauses.push(
          `INNER JOIN generic_tags ${alias} ON ${alias}.event_id = e.id`,
        );
        whereClauses.push(
          `${alias}.tag IN (${genericTags.map(() => '?').join(',')})`,
        );
        whereValues.push(...genericTags);
      });
    }

    if (ids?.length) {
      whereClauses.push(`id IN (${ids.map(() => '?').join(',')})`);
      whereValues.push(...ids);
    }

    if (authors?.length) {
      whereClauses.push(`author IN (${authors.map(() => '?').join(',')})`);
      whereValues.push(...authors);
    }

    if (kinds?.length) {
      whereClauses.push(`kind IN (${kinds.map(() => '?').join(',')})`);
      whereValues.push(...kinds);
    }

    if (since) {
      whereClauses.push(`created_at >= ?`);
      whereValues.push(since);
    }

    if (until) {
      whereClauses.push(`created_at <= ?`);
      whereValues.push(until);
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT * FROM events e ${innerJoinClauses.join(
          ' ',
        )} ${whereClause} ORDER BY e.created_at DESC LIMIT ?`,
      )
      .all(whereValues.concat(this.applyLimit(limit)));

    return rows.map(this.toEvent);
  }

  private async findFromGenericTags(
    filter: Filter,
    genericTags: string[][],
  ): Promise<Event[]> {
    const { authors, kinds, since, until, limit } = filter;

    const innerJoinClauses: string[] = [];

    // TODO: select more appropriate generic tags
    const [mainGenericTagsFilter, ...restGenericTagsCollection] = genericTags;

    const whereClauses: string[] = [
      `g.tag IN (${mainGenericTagsFilter.map(() => '?').join(',')})`,
    ];
    const parameters: (string | number)[] = [...mainGenericTagsFilter];

    if (restGenericTagsCollection.length) {
      restGenericTagsCollection.forEach((genericTags, index) => {
        const alias = `g${index + 1}`;
        innerJoinClauses.push(
          `INNER JOIN generic_tags ${alias} ON ${alias}.event_id = g.event_id AND ${alias}.tag IN (${genericTags
            .map(() => '?')
            .join(',')})`,
        );
        parameters.push(...genericTags);
      });
    }

    if (authors?.length) {
      whereClauses.push(`g.author IN (${authors.map(() => '?').join(',')})`);
      parameters.push(...authors);
    }

    if (kinds?.length) {
      whereClauses.push(`g.kind IN (${kinds.map(() => '?').join(',')})`);
      parameters.push(...kinds);
    }

    if (since) {
      whereClauses.push(`g.created_at >= ?`);
      parameters.push(since);
    }

    if (until) {
      whereClauses.push(`g.created_at <= ?`);
      parameters.push(until);
    }

    const whereClause = `WHERE ${whereClauses.join(' AND ')}`;
    const rows = this.db
      .prepare(
        `SELECT DISTINCT g.event_id, e.* FROM generic_tags g ${innerJoinClauses.join(
          ' ',
        )} RIGHT JOIN events e ON e.id = g.event_id ${whereClause} ORDER BY g.created_at DESC LIMIT ?`,
      )
      .all(parameters.concat(this.applyLimit(limit)));

    return rows.map(this.toEvent);
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

  private isGenericTagName(tagName: string): boolean {
    return /^[a-zA-Z]$/.test(tagName);
  }

  private toGenericTag(tagName: string, tagValue: string): string {
    return `${tagName}:${tagValue}`;
  }

  private extractGenericTags(event: Event): string[] {
    const genericTagSet = new Set<string>();
    event.tags.forEach(([tagName, tagValue]) => {
      if (this.isGenericTagName(tagName)) {
        genericTagSet.add(this.toGenericTag(tagName, tagValue));
      }
    });
    return [...genericTagSet];
  }

  private extractGenericTagsFrom(filter: Filter): string[][] {
    return Object.keys(filter)
      .filter(key => key.startsWith('#'))
      .map(key => {
        const tagName = key[1];
        return filter[key].map((v: string) => this.toGenericTag(tagName, v));
      })
      .sort((a, b) => a.length - b.length);
  }

  private applyLimit(limit = 100): number {
    return Math.min(limit, 1000);
  }

  private migrate(): {
    lastMigration: string | undefined;
    executedMigrations: string[];
  } {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nostr_relay_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    const lastMigration = this.db
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

    const runMigrations = this.db.transaction(() => {
      migrationsToRun.forEach(fileName => {
        const migration = readFileSync(
          path.join(__dirname, '../migrations', fileName),
          'utf8',
        );
        this.db.exec(migration);
        this.db
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
}
