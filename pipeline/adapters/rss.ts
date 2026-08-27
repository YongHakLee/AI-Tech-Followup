import Parser from 'rss-parser'
import type { Source } from '../schema'
import type { FetchContext, RawItem } from './types'
import { toExcerpt, toIsoDate } from './util'

type RssSource = Extract<Source, { type: 'rss' }>

const parser = new Parser()

export async function fetchRssItems(
  source: RssSource,
  ctx: FetchContext,
): Promise<RawItem[]> {
  const xml = await ctx.fetchText(source.url)
  const feed = await parser.parseString(xml)
  const sourceName = feed.title?.trim() || new URL(source.url).hostname
  const lang = (feed.language ?? 'en').trim() || 'en'

  const items: RawItem[] = []
  for (const entry of feed.items ?? []) {
    const url = entry.link?.trim()
    if (!url) continue
    const publishedAt = toIsoDate(entry.isoDate ?? entry.pubDate)
    if (!publishedAt) continue
    const title = entry.title?.trim()
    if (!title) continue

    items.push({
      type: 'blog',
      title,
      url,
      publishedAt,
      excerpt: toExcerpt(
        entry.contentSnippet ?? entry.content ?? entry.summary ?? '',
      ),
      sourceName,
      lang,
    })
  }
  return items
}
