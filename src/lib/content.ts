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
    cached = (async () => {
      const root = process.cwd()
      const { people, fields } = await loadRegistry(root)
      const store = createFileStore(root)
      const [items, weeks] = await Promise.all([store.loadAllItems(), store.listWeeks()])
      return { people, fields, items, weeks }
    })()
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
