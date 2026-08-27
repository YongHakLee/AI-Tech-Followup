import type { Item } from '../../pipeline/schema'

export function formatDate(iso: string): string {
  const date = new Date(iso)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}.${month}.${day}`
}

export const TYPE_LABEL: Record<Item['type'], string> = {
  blog: '글',
  paper: '논문',
  video: '영상',
}

export function weekLabel(week: string): string {
  const [year, number] = week.split('-W')
  return `${year}년 ${Number(number)}주차`
}
