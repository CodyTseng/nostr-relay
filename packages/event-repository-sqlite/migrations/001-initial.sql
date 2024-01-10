CREATE TABLE
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
  );

CREATE UNIQUE INDEX e_author_kind_d_tag_value_idx ON events (author, kind, d_tag_value)
WHERE
  d_tag_value IS NOT NULL;

CREATE INDEX e_author_kind_created_at_idx ON events (author, kind, created_at);

CREATE INDEX e_author_created_at_idx ON events (author, created_at);

CREATE INDEX e_kind_created_at_idx ON events (kind, created_at);

CREATE INDEX e_created_at_idx ON events (created_at);

CREATE TABLE
  generic_tags (
    tag TEXT NOT NULL,
    event_id TEXT NOT NULL,
    author TEXT NOT NULL,
    kind INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, tag),
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE ON UPDATE CASCADE
  );

CREATE INDEX g_tag_created_at_desc_event_id_idx ON generic_tags (tag, created_at DESC, event_id);

CREATE INDEX g_tag_kind_created_at_desc_event_id_idx ON generic_tags (tag, kind, created_at DESC, event_id);

CREATE INDEX g_tag_author_kind_created_at_desc_event_id_idx ON generic_tags (tag, author, kind, created_at DESC, event_id);