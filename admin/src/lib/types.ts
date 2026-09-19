export type PostDto = {
  id: string
  slug: string
  title: string
  summary: string
  contentMd?: string
  coverUrl: string | null
  status: 'draft' | 'published'
  pinned: boolean
  views: number
  publishedAt: number | null
  createdAt: number
  updatedAt: number
  tags: string[]
}
