import {
  Event,
  EventRepository,
  EventRepositoryUpsertResult,
  EventType,
  EventUtils,
  Filter,
} from '@nostr-relay/common';
import { Pool } from 'pg';

export class EventRepositoryPg extends EventRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    super();
    this.pool = pool;
  }

  async upsert(event: Event): Promise<EventRepositoryUpsertResult> {
    const eventType = EventUtils.getType(event);
    const author = EventUtils.getAuthor(event);
    const dTagValue = EventUtils.extractDTagValue(event);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (
        [EventType.PARAMETERIZED_REPLACEABLE, EventType.REPLACEABLE].includes(
          eventType,
        )
      ) {
        const oldEvent = await client
          .query(
            `SELECT * FROM events WHERE author = $1 AND kind = $2 AND d_tag_value = $3 LIMIT 1`,
            [author, event.kind, dTagValue],
          )
          .then(res => res.rows[0]);

        if (
          oldEvent &&
          (oldEvent.created_at > event.created_at ||
            (oldEvent.created_at === event.created_at &&
              oldEvent.id <= event.id))
        ) {
          return { isDuplicate: true };
        }

        if (oldEvent) {
          await client.query(`DELETE FROM events WHERE id = $1`, [oldEvent.id]);
        }
      }

      const genericTags = this.extractGenericTags(event);

      await client.query(
        `INSERT INTO events (id, pubkey, author, created_at, kind, tags, generic_tags, content, sig, expired_at, d_tag_value) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          event.id,
          event.pubkey,
          author,
          event.created_at,
          event.kind,
          event.tags,
          genericTags,
          event.content,
          event.sig,
          EventUtils.extractExpirationTimestamp(event),
          dTagValue,
        ],
      );
      await client.query(
        `INSERT INTO generic_tags (tag, author, kind, event_id, created_at) VALUES ${genericTags
          .map(
            (_, i) =>
              `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${
                i * 5 + 5
              })`,
          )
          .join(', ')}`,
        genericTags.flatMap(tag => [
          tag,
          author,
          event.kind,
          event.id,
          event.created_at,
        ]),
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      // code 23505 means duplicate key value violates unique constraint
      if (error.code === '23505') {
        return { isDuplicate: true };
      }
      throw error;
    } finally {
      client.release();
    }

    return { isDuplicate: false };
  }

  async find(filter: Filter): Promise<Event[]> {
    throw new Error('Method not implemented.');
  }

  async migrate(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  private extractGenericTags(event: Event): string[] {
    const genericTagSet = new Set<string>();
    event.tags.forEach(([tagName, ...tagValues]) => {
      if (tagName.match(/^[a-zA-Z]$/)) {
        tagValues.forEach(tagValue =>
          genericTagSet.add(`${tagName}:${tagValue}`),
        );
      }
    });
    return [...genericTagSet];
  }
}
