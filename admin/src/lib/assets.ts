import { api } from './api'
import type { AssetListItem, UploadedAsset } from './assets-types'

/** 与服务端 server/lib/assets.ts 的 MAX_UPLOAD 一致 */
export const MAX_UPLOAD = 8 * 1024 * 1024

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export async function listImages(): Promise<AssetListItem[]> {
  const res = await api.get<{ items: AssetListItem[] }>('/api/assets?mime=image/%')
  return res.items
}

/** 上传图片素材，返回可插入 Markdown 的直链 */
export async function uploadImage(file: File): Promise<UploadedAsset> {
  const q = `?name=${encodeURIComponent(file.name)}&mime=${encodeURIComponent(file.type || 'application/octet-stream')}`
  return api.send<UploadedAsset>('POST', `/api/upload${q}`, file)
}
