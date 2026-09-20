-- nodes 共享契约表（与 minidriver 0001_final 同构：文件/目录统一节点 + 图床公开 slug）。
-- 博客图片素材统一存入该表（博客素材/YYYY-MM/），直链 /assets/<public_slug> 由本应用提供。
-- 全部 IF NOT EXISTS / 幂等：与 minidriver 谁先部署到同一 D1 都能收敛到同一 schema；
-- 独立部署（不同 D1）时它就是博客自己的表，行为不变。

CREATE TABLE IF NOT EXISTS nodes (
  id         TEXT PRIMARY KEY,              -- ULID
  type       TEXT NOT NULL CHECK (type IN ('file','folder')),
  name       TEXT NOT NULL,
  parent_id  TEXT REFERENCES nodes(id) ON DELETE CASCADE,  -- NULL = 根目录
  size       INTEGER,                       -- 仅 file；NULL = 上传未完成（列表中隐藏）
  mime       TEXT,
  r2_key     TEXT,
  thumb_key  TEXT,
  sha256     TEXT,
  public_slug TEXT,                         -- 图床/素材直链 slug；NULL = 未公开
  starred    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_nodes_name
  ON nodes(parent_id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_nodes_parent ON nodes(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_nodes_starred ON nodes(starred) WHERE starred = 1 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_nodes_trash  ON nodes(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_nodes_recent ON nodes(created_at DESC) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_nodes_public_slug ON nodes(public_slug) WHERE public_slug IS NOT NULL;
