-- Miniblog 业务表（仅 blog_* 前缀；绝不触碰认证表与 minidriver 的 nodes/shares/uploads）

CREATE TABLE blog_posts (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL,
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  content_md   TEXT NOT NULL,
  cover_url    TEXT,
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  pinned       INTEGER NOT NULL DEFAULT 0,
  views        INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE UNIQUE INDEX ux_blog_posts_slug ON blog_posts(slug);
CREATE INDEX ix_blog_posts_pub ON blog_posts(status, published_at DESC);

CREATE TABLE blog_tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);
CREATE TABLE blog_post_tags (
  post_id TEXT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE blog_pages (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  content_md TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE blog_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 仅 standalone 模式使用（linked 的素材走 minidriver nodes 体系）
CREATE TABLE IF NOT EXISTS blog_assets (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  r2_key     TEXT NOT NULL,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
