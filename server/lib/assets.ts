import type { AppEnv, Env } from './env'
import { ulid, randomToken } from './ids'
import { Errors } from './errors'

type DB = AppEnv['Bindings']['DB']

/** 生成图床 slug（与 minidriver generatePublicSlug 同实现，共享 nodes 表唯一性约束兜底） */
async function generateSlug(db: DB): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = randomToken(12)
    const exists = await db.prepare('SELECT 1 FROM nodes WHERE public_slug = ?').bind(slug).first()
    if (!exists) return slug
  }
  throw Errors.internal()
}

/**
 * 素材层（唯一实现）：博客图片/文件统一存入 nodes 契约表（博客素材/YYYY-MM/）+ R2 f/<id>，
 * 直链由本应用提供：<APP_PUBLIC_URL>/assets/<slug>（不依赖网盘图床端点）。
 * 部署指向与 minidriver 相同的 D1/R2 时自动联动（素材在网盘可见、可管理）；
 * 指向不同资源时 nodes 即博客自己的表，行为完全一致。
 */
export type UploadedAsset = { url: string; id: string; name: string; mime: string; size: number }
export type AssetListItem = { id: string; url: string; name: string; mime: string; size: number; date: number }

export interface AssetStore {
  upload(file: { name: string; mime: string; body: ArrayBuffer }, folder: string): Promise<UploadedAsset>
  listImages(): Promise<AssetListItem[]>
}

const MAX_UPLOAD = 8 * 1024 * 1024
const IMAGE_RE = /^image\// // 预留：非图片素材的类型过滤

export class NodeAssetStore implements AssetStore {
  constructor(private env: Env) {}

  private async ensureFolder(name: string, parentId: string | null): Promise<string> {
    const existing = await this.env.DB.prepare(
      "SELECT id FROM nodes WHERE type = 'folder' AND name = ? AND parent_id IS ? AND deleted_at IS NULL",
    )
      .bind(name, parentId)
      .first<{ id: string }>()
    if (existing) return existing.id
    const id = ulid()
    await this.env.DB.prepare(
      "INSERT INTO nodes (id, type, name, parent_id, created_at, updated_at) VALUES (?, 'folder', ?, ?, ?, ?)",
    )
      .bind(id, name, parentId, Date.now(), Date.now())
      .run()
    return id
  }

  async upload(file: { name: string; mime: string; body: ArrayBuffer }, folder: string): Promise<UploadedAsset> {
    if (file.body.byteLength > MAX_UPLOAD) throw Errors.badRequest('CONTENT_TOO_LARGE')
    const month = new Date().toISOString().slice(0, 7)
    const rootId = await this.ensureFolder('博客素材', null)
    const folderId = await this.ensureFolder(month, rootId)

    // 同目录同名（截图/照片常重名）自动加序号，素材库上传永远成功
    let name = file.name
    for (let i = 2; ; i++) {
      const dup = await this.env.DB.prepare(
        'SELECT 1 FROM nodes WHERE parent_id = ? AND name = ? AND deleted_at IS NULL',
      )
        .bind(folderId, name)
        .first()
      if (!dup) break
      const dot = file.name.lastIndexOf('.')
      name = dot > 0 ? `${file.name.slice(0, dot)}-${i}${file.name.slice(dot)}` : `${file.name}-${i}`
    }

    const id = ulid()
    const r2Key = `f/${id}`
    await this.env.R2.put(r2Key, file.body, { httpMetadata: { contentType: file.mime } })
    const slug = await generateSlug(this.env.DB)
    const now = Date.now()
    await this.env.DB.prepare(
      "INSERT INTO nodes (id, type, name, parent_id, size, mime, r2_key, public_slug, created_at, updated_at) VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(id, name, folderId, file.body.byteLength, file.mime, r2Key, slug, now, now)
      .run()

    const base = new URL(this.env.APP_PUBLIC_URL).origin
    return { url: `${base}/assets/${slug}`, id, name, mime: file.mime, size: file.body.byteLength }
  }

  async listImages(): Promise<AssetListItem[]> {
    const base = new URL(this.env.APP_PUBLIC_URL).origin
    const { results } = await this.env.DB.prepare(
      `SELECT id, name, mime, size, public_slug, updated_at FROM nodes
       WHERE type = 'file' AND mime LIKE 'image/%' AND deleted_at IS NULL AND public_slug IS NOT NULL
       ORDER BY updated_at DESC LIMIT 100`,
    ).all<{ id: string; name: string; mime: string; size: number; public_slug: string; updated_at: number }>()
    return (results ?? []).map((r) => ({
      id: r.id,
      url: `${base}/assets/${r.public_slug}`,
      name: r.name,
      mime: r.mime,
      size: r.size,
      date: r.updated_at,
    }))
  }
}

export function assetStore(_env: Env): AssetStore {
  return new NodeAssetStore(_env)
}

export { MAX_UPLOAD }
