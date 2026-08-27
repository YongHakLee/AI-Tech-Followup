import { XMLParser } from 'fast-xml-parser'
import type { Source } from '../schema'
import type { FetchContext, RawItem } from './types'
import { asArray, toExcerpt, toIsoDate } from './util'

type ArxivSource = Extract<Source, { type: 'arxiv' }>

/** arXiv는 요청 간 3초 간격을 요구한다. collect.ts가 이 값을 사용한다. */
export const ARXIV_MIN_INTERVAL_MS = 3000

const MAX_RESULTS = 20

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

export function arxivQueryUrl(author: string): string {
  const params = new URLSearchParams({
    search_query: `au:"${author}"`,
    sortBy: 'submittedDate',
    sortOrder: 'descending',
    max_results: String(MAX_RESULTS),
  })
  return `http://export.arxiv.org/api/query?${params.toString()}`
}

function collapse(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export async function fetchArxivItems(
  source: ArxivSource,
  ctx: FetchContext,
): Promise<RawItem[]> {
  const xml = await ctx.fetchText(arxivQueryUrl(source.author))
  const doc = parser.parse(xml) as Record<string, any>
  const feed = doc?.feed ?? {}

  const items: RawItem[] = []
  for (const entry of asArray<Record<string, any>>(feed.entry)) {
    const url = collapse(entry.id)
    if (!url) continue
    const publishedAt = toIsoDate(entry.published)
    if (!publishedAt) continue
    const title = collapse(entry.title)
    if (!title) continue

    items.push({
      type: 'paper',
      title,
      url,
      publishedAt,
      excerpt: toExcerpt(collapse(entry.summary)),
      sourceName: 'arXiv',
      lang: 'en',
    })
  }
  return items
}
