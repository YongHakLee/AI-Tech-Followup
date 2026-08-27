import { describe, expect, it } from 'vitest'
import { completedWeek, isoWeek, itemsInWeek, weekEnd, weekStart } from '../pipeline/week'
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

describe('completedWeek', () => {
  // weekly 워크플로가 실제로 도는 시각. 이 시점에 isoWeek(now)는 이제 막 하루
  // 지난 주를 가리키므로, 하이라이트가 월요일 하루만 요약하게 된다.
  const cronFire = new Date('2026-08-25T00:00:00Z') // 화요일 09:00 KST

  it('화요일 cron 시각에 직전에 끝난 주를 준다', () => {
    expect(isoWeek(cronFire)).toBe('2026-W35')
    expect(completedWeek(cronFire)).toBe('2026-W34')
  })

  it('대상 주는 실행 시점보다 완전히 과거다', () => {
    expect(weekEnd(completedWeek(cronFire)).getTime()).toBeLessThanOrEqual(cronFire.getTime())
  })

  it('그 주의 어느 시각에 돌아도 같은 주를 준다', () => {
    const monday = completedWeek(new Date('2026-08-24T00:00:00Z'))
    const sunday = completedWeek(new Date('2026-08-30T23:59:59Z'))
    expect(monday).toBe(sunday)
  })

  it('연초에도 전년도 마지막 주로 넘어간다', () => {
    expect(completedWeek(new Date('2021-01-05T00:00:00Z'))).toBe('2020-W53')
  })
})
