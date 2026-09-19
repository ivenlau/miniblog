export type AssetListItem = {
  id: string
  url: string
  name: string
  mime: string
  size: number
  date: number
}

export type UploadedAsset = { url: string; id: string; name: string; mime: string; size: number }
