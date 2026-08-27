import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { fetchRssItems } from '../../pipeline/adapters/rss'
import type { FetchContext } from '../../pipeline/adapters/types'

function fixtureContext(file: string): FetchContext {
  return {
    async fetchText() {
      return readFile(new URL(`../fixtures/${file}`, import.meta.url), 'utf8')
    },
  }
}

const SOURCE = { type: 'rss' as const, url: 'https://blog.example.com/feed.xml' }

describe('fetchRssItems', () => {
  it('RSS 2.0 항목을 RawItem으로 바꾼다', async () => {
    const items = await fetchRssItems(SOURCE, fixtureContext('blog-rss2.xml'))
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      type: 'blog',
      title: 'On Scaling Laws',
      url: 'https://blog.example.com/scaling?utm_source=rss',
      publishedAt: '2026-08-20T10:00:00.000Z',
      sourceName: 'Test Blog',
      lang: 'en',
    })
  })

  it('HTML 태그를 제거해 발췌를 만든다', async () => {
    const items = await fetchRssItems(SOURCE, fixtureContext('blog-rss2.xml'))
    expect(items[0].excerpt).toBe('A short note about scaling.')
  })

  it('link가 없는 항목은 버린다', async () => {
    const items = await fetchRssItems(SOURCE, fixtureContext('blog-rss2.xml'))
    expect(items.map((i) => i.title)).not.toContain('Broken Post')
  })

  it('Atom 피드도 처리한다', async () => {
    const items = await fetchRssItems(SOURCE, fixtureContext('blog-atom.xml'))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      title: 'Atom Entry',
      url: 'https://atom.example.com/entry-1',
      publishedAt: '2026-08-19T12:00:00.000Z',
    })
  })

  it('언어 정보가 없으면 en으로 둔다', async () => {
    const items = await fetchRssItems(SOURCE, fixtureContext('blog-atom.xml'))
    expect(items[0].lang).toBe('en')
  })
})
