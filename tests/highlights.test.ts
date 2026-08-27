import { describe, expect, it } from 'vitest'
import { buildHighlight, heuristicPicks } from '../pipeline/highlights'
import type { Item } from '../pipeline/schema'

const NOW = new Date('2026-08-31T00:00:00.000Z')

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id: id.padEnd(40, '0'),
    personIds: ['person-a'],
    type: 'blog',
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    publishedAt: '2026-08-26T00:00:00.000Z',
    collectedAt: '2026-08-26T06:00:00.000Z',
    lang: 'en',
    sourceName: 'Blog',
    excerpt: '발췌',
    summaryKo: '요약.',
    tags: ['llm'],
    ...overrides,
  }
}

describe('heuristicPicks', () => {
  it('논문을 블로그보다, 블로그를 영상보다 앞세운다', () => {
    const items = [item('a', { type: 'video' }), item('b', { type: 'paper' }), item('c', { type: 'blog' })]
    expect(heuristicPicks(items).map((p) => p.itemId)).toEqual([
      'b'.padEnd(40, '0'),
      'c'.padEnd(40, '0'),
      'a'.padEnd(40, '0'),
    ])
  })

  it('관련 인물이 많은 항목을 우선한다', () => {
    const items = [
      item('a', { type: 'paper', personIds: ['x'] }),
      item('b', { type: 'paper', personIds: ['x', 'y', 'z'] }),
    ]
    expect(heuristicPicks(items)[0].itemId).toBe('b'.padEnd(40, '0'))
  })

  it('최대 3건만 고른다', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id))
    expect(heuristicPicks(items)).toHaveLength(3)
  })

  it('선정 이유를 채운다', () => {
    expect(heuristicPicks([item('a', { type: 'paper' })])[0].reason).not.toBe('')
  })

  it('점수가 같으면 최신 발행일을 우선한다 (타이브레이크)', () => {
    // 두 항목 모두 type: blog, personIds 1명 → 점수가 정확히 같다.
    // 입력 순서는 오래된 것(a)이 먼저, 최신(b)이 나중이다 — 만약 타이브레이크가
    // 동작하지 않고 안정 정렬만 이뤄진다면 입력 순서 그대로 [a, b]가 나와
    // 이 기대값과 어긋난다.
    const items = [
      item('a', { type: 'blog', personIds: ['x'], publishedAt: '2026-08-20T00:00:00.000Z' }),
      item('b', { type: 'blog', personIds: ['x'], publishedAt: '2026-08-25T00:00:00.000Z' }),
    ]
    expect(heuristicPicks(items).map((p) => p.itemId)).toEqual([
      'b'.padEnd(40, '0'),
      'a'.padEnd(40, '0'),
    ])
  })
})

describe('buildHighlight', () => {
  const weekItems = [item('a', { type: 'paper' }), item('b')]

  it('큐레이터가 없으면 휴리스틱으로 만든다', async () => {
    const highlight = await buildHighlight(weekItems, '2026-W35', null, NOW)
    expect(highlight.origin).toBe('heuristic')
    expect(highlight.picks).toHaveLength(2)
    expect(highlight.week).toBe('2026-W35')
    expect(highlight.generatedAt).toBe(NOW.toISOString())
  })

  it('큐레이터가 성공하면 그 결과를 쓴다', async () => {
    const curator = {
      async curate() {
        return {
          intro: '이번 주는 긴 컨텍스트가 화두였다.',
          picks: [{ itemId: 'a'.padEnd(40, '0'), reason: '가장 인용될 논문' }],
        }
      },
    }
    const highlight = await buildHighlight(weekItems, '2026-W35', curator, NOW)
    expect(highlight.origin).toBe('llm')
    expect(highlight.intro).toBe('이번 주는 긴 컨텍스트가 화두였다.')
    expect(highlight.picks).toHaveLength(1)
  })

  it('큐레이터가 실패하면 휴리스틱으로 폴백한다', async () => {
    const curator = { async curate(): Promise<never> { throw new Error('api down') } }
    const highlight = await buildHighlight(weekItems, '2026-W35', curator, NOW)
    expect(highlight.origin).toBe('heuristic')
    expect(highlight.picks.length).toBeGreaterThan(0)
  })

  it('큐레이터가 없는 itemId를 내면 걸러낸다', async () => {
    const curator = {
      async curate() {
        return { intro: '인트로', picks: [{ itemId: 'z'.padEnd(40, '0'), reason: '없는 항목' }] }
      },
    }
    const highlight = await buildHighlight(weekItems, '2026-W35', curator, NOW)
    expect(highlight.origin).toBe('heuristic')
  })

  it('그 주에 항목이 없으면 빈 picks를 준다', async () => {
    const highlight = await buildHighlight([], '2026-W35', null, NOW)
    expect(highlight.picks).toEqual([])
    expect(highlight.intro).not.toBe('')
  })

  it('일부 pick만 유효하면 유효한 것만 남기고 origin은 llm을 유지한다', async () => {
    // 결정: 부분적으로 유효한 pick 목록은 전체 폴백이 아니라, 유효한 pick만
    // 남기고 origin: 'llm'을 유지한다. 근거는 report 참고.
    const curator = {
      async curate() {
        return {
          intro: '인트로',
          picks: [
            { itemId: 'a'.padEnd(40, '0'), reason: '유효한 항목' },
            { itemId: 'z'.padEnd(40, '0'), reason: '존재하지 않는 항목' },
          ],
        }
      },
    }
    const highlight = await buildHighlight(weekItems, '2026-W35', curator, NOW)
    expect(highlight.origin).toBe('llm')
    expect(highlight.picks).toEqual([{ itemId: 'a'.padEnd(40, '0'), reason: '유효한 항목' }])
  })

  it('큐레이터가 3건 넘게 고르면 3건으로 자르고 origin은 llm을 유지한다', async () => {
    const manyItems = ['a', 'b', 'c', 'd'].map((id) => item(id))
    const curator = {
      async curate() {
        return {
          intro: '인트로',
          picks: manyItems.map((it, idx) => ({ itemId: it.id, reason: `이유 ${idx}` })),
        }
      },
    }
    const highlight = await buildHighlight(manyItems, '2026-W35', curator, NOW)
    expect(highlight.origin).toBe('llm')
    expect(highlight.picks).toHaveLength(3)
    expect(highlight.picks.map((p) => p.itemId)).toEqual(manyItems.slice(0, 3).map((it) => it.id))
  })
})
