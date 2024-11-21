import { Kysely, Migration, MigrationProvider, sql } from 'kysely';

const migrations: Record<string, Migration> = {
  '001-initial': {
    up: async (db: Kysely<any>) => {
      await sql`CREATE TABLE
        events (
          id TEXT PRIMARY KEY NOT NULL,
          pubkey TEXT NOT NULL,
          author TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          kind INTEGER NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          content TEXT NOT NULL DEFAULT '',
          sig TEXT NOT NULL,
          d_tag_value TEXT
        );`.execute(db);

      await sql`CREATE UNIQUE INDEX e_author_kind_d_tag_value_idx ON events (author, kind, d_tag_value)
        WHERE
          d_tag_value IS NOT NULL;`.execute(db);

      await sql`CREATE INDEX e_author_kind_created_at_idx ON events (author, kind, created_at);`.execute(
        db,
      );

      await sql`CREATE INDEX e_author_created_at_idx ON events (author, created_at);`.execute(
        db,
      );

      await sql`CREATE INDEX e_kind_created_at_idx ON events (kind, created_at);`.execute(
        db,
      );

      await sql`CREATE INDEX e_created_at_idx ON events (created_at);`.execute(
        db,
      );

      await sql`CREATE TABLE
        generic_tags (
          tag TEXT NOT NULL,
          event_id TEXT NOT NULL,
          author TEXT NOT NULL,
          kind INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (event_id, tag),
          FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE ON UPDATE CASCADE
        );`.execute(db);

      await sql`CREATE INDEX g_tag_created_at_desc_event_id_idx ON generic_tags (tag, created_at DESC, event_id);`.execute(
        db,
      );

      await sql`CREATE INDEX g_tag_kind_created_at_desc_event_id_idx ON generic_tags (tag, kind, created_at DESC, event_id);`.execute(
        db,
      );

      await sql`CREATE INDEX g_tag_author_kind_created_at_desc_event_id_idx ON generic_tags (tag, author, kind, created_at DESC, event_id);`.execute(
        db,
      );
    },
    down: async db => {
      await db.schema
        .dropIndex('g_tag_author_kind_created_at_desc_event_id_idx')
        .execute();
      await db.schema
        .dropIndex('g_tag_kind_created_at_desc_event_id_idx')
        .execute();
      await db.schema.dropIndex('g_tag_created_at_desc_event_id_idx').execute();
      await db.schema.dropTable('generic_tags').execute();
      await db.schema.dropIndex('e_created_at_idx').execute();
      await db.schema.dropIndex('e_kind_created_at_idx').execute();
      await db.schema.dropIndex('e_author_created_at_idx').execute();
      await db.schema.dropIndex('e_author_kind_created_at_idx').execute();
      await db.schema.dropIndex('e_author_kind_d_tag_value_idx').execute();
      await db.schema.dropTable('events').execute();
    },
  },
  '002-fts': {
    up: async db => {
      await sql`CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(id UNINDEXED, content, tokenize='trigram')`.execute(
        db,
      );
    },
    down: async db => {
      await db.schema.dropTable('events_fts').execute();
    },
  },
};

export class CustomMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  }
}
