import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { arxivQueryUrl, fetchArxivItems } from '../../pipeline/adapters/arxiv'
import type { FetchContext } from '../../pipeline/adapters/types'

const SOURCE = { type: 'arxiv' as const, author: 'Karpathy_A' }

function fixtureContext(
  fixtureName = 'arxiv.xml',
): { ctx: FetchContext; requested: string[] } {
  const requested: string[] = []
  return {
    requested,
    ctx: {
      async fetchText(url) {
        requested.push(url)
        return readFile(new URL(`../fixtures/${fixtureName}`, import.meta.url), 'utf8')
      },
    },
  }
}

describe('arxivQueryUrl', () => {
  it('저자명을 인용부호로 감싸 인코딩한다', () => {
    const url = arxivQueryUrl('Karpathy_A')
    expect(url).toContain('search_query=au%3A%22Karpathy_A%22')
    expect(url).toContain('sortBy=submittedDate')
    expect(url).toContain('sortOrder=descending')
  })
})

describe('fetchArxivItems', () => {
  it('논문 항목을 RawItem으로 바꾼다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchArxivItems(SOURCE, ctx)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      type: 'paper',
      url: 'http://arxiv.org/abs/2508.12345v1',
      publishedAt: '2026-08-20T17:45:00.000Z',
      sourceName: 'arXiv',
      lang: 'en',
    })
  })

  it('제목과 초록의 줄바꿈과 여분 공백을 정리한다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchArxivItems(SOURCE, ctx)
    expect(items[0].title).toBe('A Study of Long Context Models')
    expect(items[0].excerpt).toBe(
      'We study how models handle very long contexts, and report several findings.',
    )
  })

  it('published를 쓰고 updated는 쓰지 않는다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchArxivItems(SOURCE, ctx)
    expect(items[0].publishedAt).not.toBe('2026-08-22T09:00:00.000Z')
  })

  it('저자가 한 명인 항목도 처리한다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchArxivItems(SOURCE, ctx)
    expect(items[1].title).toBe('Older Paper')
  })

  it('항목이 하나뿐이어도(파서가 객체로 반환해도) 배열로 처리한다', async () => {
    const { ctx } = fixtureContext('arxiv-single-entry.xml')
    const items = await fetchArxivItems(SOURCE, ctx)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: 'paper',
      title: 'Solo Paper on Sparse Attention',
      url: 'http://arxiv.org/abs/2506.54321v1',
      publishedAt: '2026-06-15T08:30:00.000Z',
      excerpt: 'A single paper abstract describing sparse attention mechanisms.',
      sourceName: 'arXiv',
      lang: 'en',
    })
  })

  it('id·발행일·제목이 없는 항목을 제외하고 나머지만 남긴다', async () => {
    const { ctx } = fixtureContext('arxiv-dropped-entries.xml')
    const items = await fetchArxivItems(SOURCE, ctx)
    expect(items.map((item) => item.title)).toEqual([
      'Kept One',
      'Kept Two',
      'Kept Three',
      'Kept Four',
    ])
    expect(items).toHaveLength(4)
  })
})
