export const EXCERPT_MAX = 600

export function toIsoDate(input: string | undefined | null): string | null {
  if (!input) return null
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function toExcerpt(input: string | undefined | null): string {
  if (!input) return ''
  const text = input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1)}…` : text
}

/** XML 파서는 항목이 하나면 배열이 아닌 객체를 준다. 항상 배열로 만든다. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}
