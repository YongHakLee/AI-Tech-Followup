import type { Item } from './schema'

const DAY_MS = 86_400_000

export function isoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  const weekday = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * 자동 실행이 대상으로 삼을 주. 반드시 "직전에 끝난 주"다.
 *
 * isoWeek(now)는 지금이 속한 주를 준다. weekly 워크플로는 화요일 00:00 UTC에
 * 도는데 ISO 주는 월요일에 시작하므로, 그 시점에 그 주에는 월요일 하루치 항목밖에
 * 없다. 한 주를 요약해야 할 하이라이트가 하루를 요약하게 되고, 그 주는 다시
 * 생성되지 않으므로 영구히 그 상태로 남는다.
 */
export function completedWeek(now: Date): string {
  return isoWeek(new Date(now.getTime() - 7 * DAY_MS))
}

export function weekStart(week: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(week)
  if (!match) throw new Error(`주차 형식이 잘못되었습니다: ${week}`)
  const year = Number(match[1])
  const number = Number(match[2])

  const jan4 = new Date(Date.UTC(year, 0, 4))
  const weekday = jan4.getUTCDay() || 7
  const firstMonday = new Date(jan4.getTime() - (weekday - 1) * DAY_MS)
  return new Date(firstMonday.getTime() + (number - 1) * 7 * DAY_MS)
}

export function weekEnd(week: string): Date {
  return new Date(weekStart(week).getTime() + 7 * DAY_MS)
}

export function itemsInWeek(items: Item[], week: string): Item[] {
  const start = weekStart(week).toISOString()
  const end = weekEnd(week).toISOString()
  return items
    .filter((item) => item.publishedAt >= start && item.publishedAt < end)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}
