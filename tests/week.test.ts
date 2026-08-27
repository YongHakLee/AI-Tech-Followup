import { describe, expect, it } from 'vitest'
import { isoWeek, itemsInWeek, weekEnd, weekStart } from '../pipeline/week'
import type { Item } from '../pipeline/schema'

describe('isoWeek', () => {
  it('목요일인 2026-01-01은 2026-W01이다', () => {
    expect(isoWeek(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01')
  })

  it('금요일인 2021-01-01은 전년도 2020-W53이다', () => {
    expect(isoWeek(new Date('2021-01-01T00:00:00Z'))).toBe('2020-W53')
  })

  it('같은 주의 월요일과 일요일은 같은 주차다', () => {
    expect(isoWeek(new Date('2026-08-24T00:00:00Z'))).toBe(
      isoWeek(new Date('2026-08-30T23:59:59Z')),
    )
  })

  it('주차를 두 자리로 채운다', () => {
    expect(isoWeek(new Date('2026-02-10T00:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/)
  })
})

describe('weekStart / weekEnd', () => {
  it('weekStart는 그 주 월요일 00:00 UTC다', () => {
    const start = weekStart('2026-W35')
    expect(start.getUTCDay()).toBe(1)
    expect(start.toISOString()).toBe('2026-08-24T00:00:00.000Z')
  })

  it('weekEnd는 7일 뒤다', () => {
    const start = weekStart('2026-W35')
    const end = weekEnd('2026-W35')
    expect(end.getTime() - start.getTime()).toBe(7 * 86400000)
  })

  it('isoWeek와 왕복한다', () => {
    for (const week of ['2020-W53', '2026-W01', '2026-W35']) {
      expect(isoWeek(weekStart(week))).toBe(week)
    }
  })
})

describe('itemsInWeek', () => {
  function item(id: string, publishedAt: string): Item {
    return {
      id: id.padEnd(40, '0'),
      personIds: ['person-a'],
      type: 'blog',
      title: `Title ${id}`,
      url: `https://example.com/${id}`,
      publishedAt,
      collectedAt: publishedAt,
      lang: 'en',
      sourceName: 'Blog',
      excerpt: '발췌',
      summaryKo: '요약.',
      tags: [],
    }
  }

  it('그 주에 발행된 항목만 최신순으로 고른다', () => {
    const items = [
      item('a', '2026-08-24T00:00:00.000Z'),
      item('b', '2026-08-30T23:59:59.000Z'),
      item('c', '2026-08-31T00:00:00.000Z'),
      item('d', '2026-08-23T23:59:59.000Z'),
    ]
    expect(itemsInWeek(items, '2026-W35').map((i) => i.title)).toEqual(['Title b', 'Title a'])
  })

  it('해당 주에 아무것도 없으면 빈 배열을 준다', () => {
    expect(itemsInWeek([item('a', '2026-01-05T00:00:00.000Z')], '2026-W35')).toEqual([])
  })
})
