import type { ItemType } from '../schema'

export interface RawItem {
  type: ItemType
  title: string
  url: string
  publishedAt: string
  excerpt: string
  sourceName: string
  lang: string
}

export interface FetchContext {
  fetchText(url: string): Promise<string>
}
