import { XMLParser } from 'fast-xml-parser'
import type { Source } from '../schema'
import type { FetchContext, RawItem } from './types'
import { asArray, toExcerpt, toIsoDate } from './util'

type YoutubeSource = Extract<Source, { type: 'youtube' }>

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

export function youtubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
}

function firstLinkHref(link: unknown): string | undefined {
  for (const entry of asArray(link as Record<string, string> | Record<string, string>[])) {
    const href = entry?.['@_href']
    if (href) return href
  }
  return undefined
}

export async function fetchYoutubeItems(
  source: YoutubeSource,
  ctx: FetchContext,
): Promise<RawItem[]> {
  const xml = await ctx.fetchText(youtubeFeedUrl(source.channelId))
  const doc = parser.parse(xml) as Record<string, any>
  const feed = doc?.feed ?? {}
  const sourceName = String(feed.title ?? '').trim() || 'YouTube'

  const items: RawItem[] = []
  for (const entry of asArray<Record<string, any>>(feed.entry)) {
    const url = firstLinkHref(entry.link)
    if (!url) continue
    const publishedAt = toIsoDate(entry.published)
    if (!publishedAt) continue
    const title = String(entry.title ?? '').trim()
    if (!title) continue

    const description = entry['media:group']?.['media:description']
    items.push({
      type: 'video',
      title,
      url,
      publishedAt,
      excerpt: toExcerpt(description === undefined ? '' : String(description)),
      sourceName,
      lang: 'en',
    })
  }
  return items
}
