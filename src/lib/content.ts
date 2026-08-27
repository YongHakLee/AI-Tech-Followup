import { loadRegistry } from '../../pipeline/registry'
import type { Field, Highlight, Item, Person } from '../../pipeline/schema'
import { createFileStore } from '../../pipeline/store'

export type { Field, Highlight, Item, Person }

export interface SiteData {
  people: Person[]
  fields: Field[]
  items: Item[]
  weeks: string[]
}

let cached: Promise<SiteData> | null = null

export function getSiteData(): Promise<SiteData> {
  if (!cached) {
    const load = (async () => {
      const root = process.cwd()
      const { people, fields } = await loadRegistry(root)
      const store = createFileStore(root)
      const [items, weeks] = await Promise.all([store.loadAllItems(), store.listWeeks()])
      return { people, fields, items, weeks }
    })()
    // If loading fails, clear the memo so the next call retries instead of
    // replaying the same failure forever. The `.catch` here both observes
    // `load`'s rejection (so it never goes unhandled) and rethrows it into
    // `cached`, which is the promise actually returned to callers.
    cached = load.catch((err) => {
      cached = null
      throw err
    })
  }
  return cached
}

export async function getHighlight(week: string): Promise<Highlight | null> {
  return createFileStore(process.cwd()).loadHighlight(week)
}

export function peopleById(data: SiteData): Map<string, Person> {
  return new Map(data.people.map((p) => [p.id, p]))
}

export function fieldsOfItem(item: Item, people: Map<string, Person>): string[] {
  if (item.tags.length > 0) return item.tags
  const inherited = new Set<string>()
  for (const id of item.personIds) {
    for (const key of people.get(id)?.fields ?? []) inherited.add(key)
  }
  return [...inherited].sort()
}

export function itemsByField(data: SiteData, fieldKey: string): Item[] {
  const people = peopleById(data)
  return data.items.filter((item) => fieldsOfItem(item, people).includes(fieldKey))
}

export function itemsByPerson(data: SiteData, personId: string): Item[] {
  return data.items.filter((item) => item.personIds.includes(personId))
}

export function fieldName(data: SiteData, key: string): string {
  return data.fields.find((f) => f.key === key)?.nameKo ?? key
}

export interface ResolvedPick {
  item: Item
  reason: string
}

export function resolvePicks(highlight: Highlight | null, items: Item[]): ResolvedPick[] {
  if (!highlight) return []
  const byId = new Map(items.map((item) => [item.id, item]))
  return highlight.picks
    .map((pick) => ({ item: byId.get(pick.itemId), reason: pick.reason }))
    .filter((entry): entry is ResolvedPick => entry.item !== undefined)
}

/**
 * 주간 상세의 "나머지" 목록을 한 번만 계산한다. 개수·가드·렌더링이 반드시 같은
 * 집합을 보게 하려고 페이지 밖으로 뺐다. 예전에는 제목이 items.length를, 그리드가
 * picks를 뺀 목록을 써서 그 주 항목이 전부 하이라이트로 뽑히면 "이번 주 전체 (3)"
 * 아래 그리드가 비었다.
 *
 * `picks`는 `resolvePicks(highlight, items)`로 만들어 `picks ⊆ items`를 만족해야
 * 한다. 그래야 allPicked가 "이번 주 항목이 전부 위에 있다"를 정말로 뜻한다.
 */
export function splitWeekItems(
  items: Item[],
  picks: ResolvedPick[],
): { remaining: Item[]; allPicked: boolean } {
  const pickIds = new Set(picks.map((pick) => pick.item.id))
  const remaining = items.filter((item) => !pickIds.has(item.id))
  return { remaining, allPicked: remaining.length === 0 && picks.length > 0 }
}
