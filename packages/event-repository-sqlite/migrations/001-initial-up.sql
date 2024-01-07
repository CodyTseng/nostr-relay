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

CREATE TABLE
  generic_tags (
    tag TEXT NOT NULL,
    event_id TEXT NOT NULL,
    author TEXT NOT NULL,
    kind INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, tag),
    FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
  );