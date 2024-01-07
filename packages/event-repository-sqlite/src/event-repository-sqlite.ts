import {
  Event,
  EventKind,
  EventRepository,
  EventRepositoryUpsertResult,
  EventType,
  EventUtils,
  Filter,
} from '@nostr-relay/common';
import * as path from 'path';
import * as BetterSqlite3 from 'better-sqlite3';
import { readFile } from 'fs/promises';

export class EventRepositorySqlite extends EventRepository {
  private db: BetterSqlite3.Database;

  async init(filename = ':memory:') {
    this.db = new BetterSqlite3(filename);
    this.db.pragma('journal_mode = WAL');

    const migration = await readFile(
      path.join(__dirname, '../migrations/001-initial-up.sql'),
      'utf8',
    );
    this.db.exec(migration);
  }

  async close() {
    this.db.close();
  }

  getDatabase(): BetterSqlite3.Database {
    return this.db;
  }

  async upsert(event: Event): Promise<EventRepositoryUpsertResult> {
    const upsertTransaction = this.db.transaction((event: Event) => {
      const type = EventUtils.getType(event);
      const author = EventUtils.getAuthor(event, false);
      const dTagValue = EventUtils.extractDTagValue(event);
      const genericTags = this.extractGenericTags(event);

      let oldEvent: Event | undefined | null;
      if (
        [EventType.REPLACEABLE, EventType.PARAMETERIZED_REPLACEABLE].includes(
          type,
        )
      ) {
        const oldEventRow = this.db
          .prepare(
            `SELECT * FROM events WHERE kind = ? AND author = ? AND d_tag_value = ?`,
          )
          .get(event.kind, author, dTagValue);
        if (oldEventRow) oldEvent = this.toEvent(oldEventRow);

        if (
          oldEvent &&
          (oldEvent.created_at > event.created_at ||
            (oldEvent.created_at === event.created_at &&
              oldEvent.id <= event.id))
        ) {
          return { isDuplicate: true };
        }

        if (oldEvent) {
          this.db.prepare(`DELETE FROM events WHERE id = ?`).run(oldEvent.id);
        }
      }
      this.db
        .prepare(
          `INSERT INTO events (id, pubkey, author, created_at, kind, tags, content, sig, d_tag_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      if (genericTags.length > 0) {
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
    const { ids, authors, kinds, since, until, limit = 1000 } = filter;

    if (limit === 0) return [];

    if (this.shouldQueryFromGenericTags(filter)) {
      return this.findFromGenericTags(filter);
    }

    const genericTags = this.extractGenericTagsCollectionFrom(filter);

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

    if (filter['#d']?.length) {
      whereClauses.push(
        `d_tag_value IN (${filter['#d'].map(() => '?').join(',')})`,
      );
      whereValues.push(...filter['#d']);
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
      .all(whereValues.concat(limit));

    return rows.map(this.toEvent);
  }

  private async findFromGenericTags(filter: Filter): Promise<Event[]> {
    const genericTags = this.extractGenericTagsCollectionFrom(filter);
    const { authors, kinds, since, until, limit = 1000 } = filter;

    const innerJoinClauses: string[] = [];

    // TODO: select more appropriate generic tags
    const [mainGenericTagsFilter, ...restGenericTagsCollection] = genericTags;

    const whereClauses: string[] = [
      `g.tag IN (${mainGenericTagsFilter.map(() => '?').join(',')})`,
    ];
    const whereValues: (string | number)[] = [...mainGenericTagsFilter];

    if (restGenericTagsCollection.length) {
      restGenericTagsCollection.forEach((genericTags, index) => {
        const alias = `g${index + 1}`;
        innerJoinClauses.push(
          `INNER JOIN generic_tags ${alias} ON ${alias}.event_id = g.event_id`,
        );
        whereClauses.push(
          `${alias}.tag IN (${genericTags.map(() => '?').join(',')})`,
        );
        whereValues.push(...genericTags);
      });
    }

    if (authors?.length) {
      whereClauses.push(`g.author IN (${authors.map(() => '?').join(',')})`);
      whereValues.push(...authors);
    }

    if (kinds?.length) {
      whereClauses.push(`g.kind IN (${kinds.map(() => '?').join(',')})`);
      whereValues.push(...kinds);
    }

    if (since) {
      whereClauses.push(`g.created_at >= ?`);
      whereValues.push(since);
    }

    if (until) {
      whereClauses.push(`g.created_at <= ?`);
      whereValues.push(until);
    }

    const whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT * FROM events WHERE id IN (SELECT DISTINCT g.event_id FROM generic_tags g LEFT JOIN events e ON g.event_id = e.id ${innerJoinClauses.join(
          ' ',
        )} ${whereClause} ORDER BY g.created_at DESC LIMIT ?) ORDER BY created_at DESC`,
      )
      .all(whereValues.concat(limit));

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

  private shouldQueryFromGenericTags(filter: Filter): boolean {
    return (
      !!this.extractGenericTagsCollectionFrom(filter).length &&
      !filter.ids?.length &&
      !filter['#d']?.length
    );
  }

  private extractGenericTagsCollectionFrom(filter: Filter): string[][] {
    return Object.keys(filter)
      .filter(key => key.startsWith('#') && key !== '#d')
      .map(key => {
        const tagName = key[1];
        return filter[key].map((v: string) => this.toGenericTag(tagName, v));
      });
  }
}
