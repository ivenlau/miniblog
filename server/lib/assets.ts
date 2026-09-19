import type { AppEnv, Env } from './env'
import { ulid, randomToken } from './ids'
import { Errors } from './errors'

type DB = AppEnv['Bindings']['DB']

/** 生成图床 slug（linked 模式；与 minidriver generatePublicSlug 同实现） */
async function generateSlug(db: DB): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const slug = randomToken(12)
    const exists = await db.prepare('SELECT 1 FROM nodes WHERE public_slug = ?').bind(slug).first()
    if (!exists) return slug
  }
  throw Errors.internal()
}

/**
 * 素材层抽象：博客图片/文件的存储与直链生成。
 * - linked（DriverAssetStore）：写入 minidriver 的 nodes 体系（博客素材/YYYY-MM/），
 *   直链 = minidriver 图床 /i/<slug>
 * - standalone（LocalAssetStore）：写入本应用 blog_assets 表 + R2 assets/ 前缀，
 *   直链 = 本域 /assets/<slug>
 */

export type UploadedAsset = { url: string; id: string; name: string; mime: string; size: number }
export type AssetListItem = { id: string; url: string; name: string; mime: string; size: number; date: number }

export interface AssetStore {
  upload(file: { name: string; mime: string; body: ArrayBuffer }, folder: string): Promise<UploadedAsset>
  listImages(): Promise<AssetListItem[]>
}

const MAX_UPLOAD = 8 * 1024 * 1024
const IMAGE_RE = /^image\//

/** linked：素材进入 minidriver 网盘体系 */
export class DriverAssetStore implements AssetStore {
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

    const id = ulid()
    const r2Key = `f/${id}`
    await this.env.R2.put(r2Key, file.body, { httpMetadata: { contentType: file.mime } })
    const slug = await generateSlug(this.env.DB)
    const now = Date.now()
    await this.env.DB.prepare(
      "INSERT INTO nodes (id, type, name, parent_id, size, mime, r2_key, public_slug, created_at, updated_at) VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, file.name, folderId, file.body.byteLength, file.mime, r2Key, slug, now, now)

    const base = (this.env.DRIVER_PUBLIC_URL || this.env.APP_PUBLIC_URL).replace(/\/+$/, '')
    return { url: `${base}/i/${slug}`, id, name: file.name, mime: file.mime, size: file.body.byteLength }
  }

  async listImages(): Promise<AssetListItem[]> {
    const base = (this.env.DRIVER_PUBLIC_URL || this.env.APP_PUBLIC_URL).replace(/\/+$/, '')
    const { results } = await this.env.DB.prepare(
      `SELECT id, name, mime, size, public_slug, updated_at FROM nodes
       WHERE type = 'file' AND mime LIKE 'image/%' AND deleted_at IS NULL AND public_slug IS NOT NULL
       ORDER BY updated_at DESC LIMIT 100`,
    ).all<{ id: string; name: string; mime: string; size: number; public_slug: string; updated_at: number }>()
    return (results ?? []).map((r) => ({
      id: r.id,
      url: `${base}/i/${r.public_slug}`,
      name: r.name,
      mime: r.mime,
      size: r.size,
      date: r.updated_at,
    }))
  }
}

/** standalone：素材存本应用（blog_assets + R2 assets/ 前缀） */
export class LocalAssetStore implements AssetStore {
  constructor(private env: Env) {}

  async upload(file: { name: string; mime: string; body: ArrayBuffer }, _folder: string): Promise<UploadedAsset> {
    if (file.body.byteLength > MAX_UPLOAD) throw Errors.badRequest('CONTENT_TOO_LARGE')
    const id = ulid()
    const slug = randomToken(8)
    const r2Key = `assets/${id}`
    await this.env.R2.put(r2Key, file.body, { httpMetadata: { contentType: file.mime } })
    const now = Date.now()
    await this.env.DB.prepare(
      'INSERT INTO blog_assets (id, slug, r2_key, name, mime, size, created_at) VALUES (?,?,?,?,?,?,?)',
    )
      .bind(id, slug, r2Key, file.name, file.mime, file.body.byteLength, now)
      .run()
    return { url: `${new URL(this.env.APP_PUBLIC_URL).origin}/assets/${slug}`, id, name: file.name, mime: file.mime, size: file.body.byteLength }
  }

  async listImages(): Promise<AssetListItem[]> {
    const origin = new URL(this.env.APP_PUBLIC_URL).origin
    const { results } = await this.env.DB.prepare(
      "SELECT id, slug, name, mime, size, created_at FROM blog_assets WHERE mime LIKE 'image/%' ORDER BY created_at DESC LIMIT 100",
    ).all<{ id: string; slug: string; name: string; mime: string; size: number; created_at: number }>()
    return (results ?? []).map((r) => ({
      id: r.id,
      url: `${origin}/assets/${r.slug}`,
      name: r.name,
      mime: r.mime,
      size: r.size,
      date: r.created_at,
    }))
  }
}

export function assetStore(env: Env): AssetStore {
  return env.DEPLOY_MODE === 'linked' ? new DriverAssetStore(env) : new LocalAssetStore(env)
}

export { MAX_UPLOAD }
