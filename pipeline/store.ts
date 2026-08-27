import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  EMPTY_STATE,
  HighlightSchema,
  ItemSchema,
  StateSchema,
  type Highlight,
  type Item,
  type State,
} from './schema'

export interface UpsertResult {
  created: Item[]
  merged: Item[]
}

export interface Store {
  loadState(): Promise<State>
  saveState(state: State): Promise<void>
  loadAllItems(): Promise<Item[]>
  upsertItems(candidates: Item[]): Promise<UpsertResult>
  loadHighlight(week: string): Promise<Highlight | null>
  saveHighlight(highlight: Highlight): Promise<void>
  listWeeks(): Promise<string[]>
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function createFileStore(root: string): Store {
  const itemsDir = path.join(root, 'content/items')
  const highlightsDir = path.join(root, 'content/highlights')
  const statePath = path.join(root, 'content/state.json')

  async function listMonths(): Promise<string[]> {
    try {
      return (await readdir(itemsDir))
        .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
        .map((f) => f.replace(/\.json$/, ''))
        .sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  async function loadMonth(month: string): Promise<Item[]> {
    const file = path.join(itemsDir, `${month}.json`)
    const raw = await readJson<unknown[]>(file)
    if (!raw) return []
    try {
      return ItemSchema.array().parse(raw)
    } catch (error) {
      throw new Error(`Invalid item data in ${file}: ${(error as Error).message}`, {
        cause: error,
      })
    }
  }

  return {
    async loadState() {
      const raw = await readJson<unknown>(statePath)
      if (!raw) return structuredClone(EMPTY_STATE)
      return StateSchema.parse(raw)
    },

    async saveState(state) {
      await writeJson(statePath, StateSchema.parse(state))
    },

    async loadAllItems() {
      const months = await listMonths()
      const all: Item[] = []
      for (const month of months) all.push(...(await loadMonth(month)))
      all.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      return all
    },

    async upsertItems(candidates) {
      const months = await listMonths()
      const byMonth = new Map<string, Item[]>()
      for (const month of months) byMonth.set(month, await loadMonth(month))

      const index = new Map<string, { month: string; item: Item }>()
      for (const [month, items] of byMonth) {
        for (const item of items) index.set(item.id, { month, item })
      }

      const created: Item[] = []
      const merged: Item[] = []
      const touched = new Set<string>()
      const createdIds = new Set<string>()

      for (const raw of candidates) {
        const candidate = ItemSchema.parse(raw)
        const existing = index.get(candidate.id)

        if (existing) {
          const before = existing.item.personIds.length
          const union = [...new Set([...existing.item.personIds, ...candidate.personIds])].sort()
          if (union.length !== before) {
            existing.item.personIds = union
            touched.add(existing.month)
            // An item created earlier in this same call must not also be
            // reported as merged, even though its personIds get unioned here.
            if (!createdIds.has(candidate.id) && !merged.some((m) => m.id === candidate.id)) {
              merged.push(existing.item)
            }
          }
          continue
        }

        const month = monthKey(candidate.publishedAt)
        const bucket = byMonth.get(month) ?? []
        const item: Item = { ...candidate, personIds: [...new Set(candidate.personIds)].sort() }
        bucket.push(item)
        byMonth.set(month, bucket)
        index.set(item.id, { month, item })
        touched.add(month)
        created.push(item)
        createdIds.add(item.id)
      }

      for (const month of touched) {
        const items = (byMonth.get(month) ?? []).slice()
        items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        await writeJson(path.join(itemsDir, `${month}.json`), items)
      }

      return { created, merged }
    },

    async loadHighlight(week) {
      const raw = await readJson<unknown>(path.join(highlightsDir, `${week}.json`))
      if (!raw) return null
      return HighlightSchema.parse(raw)
    },

    async saveHighlight(highlight) {
      const parsed = HighlightSchema.parse(highlight)
      await writeJson(path.join(highlightsDir, `${parsed.week}.json`), parsed)
    },

    async listWeeks() {
      try {
        return (await readdir(highlightsDir))
          .filter((f) => /^\d{4}-W\d{2}\.json$/.test(f))
          .map((f) => f.replace(/\.json$/, ''))
          .sort()
          .reverse()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      }
    },
  }
}
