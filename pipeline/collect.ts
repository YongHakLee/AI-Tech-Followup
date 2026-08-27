import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ARXIV_MIN_INTERVAL_MS, fetchArxivItems } from './adapters/arxiv'
import { fetchRssItems } from './adapters/rss'
import { fetchYoutubeItems } from './adapters/youtube'
import type { FetchContext, RawItem } from './adapters/types'
import { itemId } from './normalize'
import { loadRegistry, type Registry } from './registry'
import type { Item, Person, Source, SourceState } from './schema'
import { createFileStore, type Store } from './store'
import { createAnthropicSummarizer, type Summarizer } from './summarize'

const FIRST_RUN_LIMIT = 3
const MAX_AGE_DAYS = 180
const ALERT_THRESHOLD = 5
const MAX_SEEN_IDS = 500
const MAX_SUMMARIES_PER_RUN = 60
const ALERTS_FILE = '.pipeline-out/alerts.json'

export interface CollectDeps {
  registry: Registry
  store: Store
  fetchers: {
    rss(source: Extract<Source, { type: 'rss' }>, ctx: FetchContext): Promise<RawItem[]>
    youtube(source: Extract<Source, { type: 'youtube' }>, ctx: FetchContext): Promise<RawItem[]>
    arxiv(source: Extract<Source, { type: 'arxiv' }>, ctx: FetchContext): Promise<RawItem[]>
  }
  ctx: FetchContext
  summarizer: Summarizer | null
  now: () => Date
}

export interface CollectOptions {
  limit?: number
}

export interface SourceFailure {
  key: string
  error: string
  consecutive: number
}

export interface CollectReport {
  created: number
  merged: number
  summarized: number
  summaryFailures: number
  sourceFailures: SourceFailure[]
  alerts: SourceFailure[]
}

export function sourceKey(personId: string, source: Source): string {
  switch (source.type) {
    case 'rss':
      return `${personId}:rss:${source.url}`
    case 'youtube':
      return `${personId}:youtube:${source.channelId}`
    case 'arxiv':
      return `${personId}:arxiv:${source.author}`
  }
}

function emptySourceState(): SourceState {
  return { lastRunAt: null, seenIds: [], consecutiveFailures: 0, lastError: null }
}

/**
 * itemId()는 normalizeUrl()을 거치며, 절대 URL이 아닌 문자열(빈 문자열, 상대
 * 경로 등)에는 TypeError를 던진다. 그 자체는 normalizeUrl의 올바른 동작이므로
 * (다른 호출자는 그 예외를 원할 수 있다) 여기서 삼키지 않고, 이 URL을 낸 어댑터
 * 한 곳에서만 국소적으로 무효 처리한다. 피드 항목 하나가 URL을 엉망으로 냈다고
 * 실행 전체가 죽어서는 안 된다 — 그 항목 하나만 버리고 나머지는 계속 처리한다.
 */
function safeItemId(url: string): string | null {
  try {
    return itemId(url)
  } catch {
    return null
  }
}

async function fetchFor(
  deps: CollectDeps,
  source: Source,
): Promise<RawItem[]> {
  switch (source.type) {
    case 'rss':
      return deps.fetchers.rss(source, deps.ctx)
    case 'youtube':
      return deps.fetchers.youtube(source, deps.ctx)
    case 'arxiv':
      return deps.fetchers.arxiv(source, deps.ctx)
  }
}

export async function runCollect(
  deps: CollectDeps,
  options: CollectOptions = {},
): Promise<CollectReport> {
  const now = deps.now()
  const nowIso = now.toISOString()
  const oldestAllowed = new Date(now.getTime() - MAX_AGE_DAYS * 86_400_000).toISOString()
  const state = await deps.store.loadState()
  const fieldKeys = deps.registry.fields.map((f) => f.key)

  const sourceFailures: SourceFailure[] = []
  const candidates = new Map<string, Item>()

  const tasks: { person: Person; source: Source; key: string }[] = []
  for (const person of deps.registry.people) {
    for (const source of person.sources) {
      tasks.push({ person, source, key: sourceKey(person.id, source) })
    }
  }

  let lastArxivAt = 0
  for (const task of tasks) {
    const previous = state.sources[task.key] ?? emptySourceState()

    if (task.source.type === 'arxiv') {
      const wait = ARXIV_MIN_INTERVAL_MS - (Date.now() - lastArxivAt)
      if (lastArxivAt !== 0 && wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
      lastArxivAt = Date.now()
    }

    let fetched: RawItem[]
    try {
      fetched = await fetchFor(deps, task.source)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const consecutive = previous.consecutiveFailures + 1
      state.sources[task.key] = {
        ...previous,
        lastRunAt: nowIso,
        consecutiveFailures: consecutive,
        lastError: message,
      }
      sourceFailures.push({ key: task.key, error: message, consecutive })
      continue
    }

    const seen = new Set(previous.seenIds)
    const isFirstRun = previous.seenIds.length === 0

    let accepted = fetched
      .filter((raw) => raw.publishedAt >= oldestAllowed)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

    if (isFirstRun) accepted = accepted.slice(0, FIRST_RUN_LIMIT)

    // 첫 실행에서 채택하지 않은 나머지도 "확인 완료"로 기록한다.
    // 그러지 않으면 다음 실행이 밀린 과거 항목을 한꺼번에 끌어온다.
    // URL이 무효해 id를 만들 수 없는 항목은 seenIds에도 올리지 않는다 —
    // 어차피 절대 채택되지 않으므로 매 실행 다시 걸러지는 것으로 충분하다.
    const fetchedIds = fetched
      .map((raw) => safeItemId(raw.url))
      .filter((id): id is string => id !== null)

    for (const raw of accepted) {
      const id = safeItemId(raw.url)
      if (id === null) continue
      if (seen.has(id)) continue

      const existing = candidates.get(id)
      if (existing) {
        existing.personIds = [...new Set([...existing.personIds, task.person.id])].sort()
        continue
      }
      candidates.set(id, {
        id,
        personIds: [task.person.id],
        type: raw.type,
        title: raw.title,
        url: raw.url,
        publishedAt: raw.publishedAt,
        collectedAt: nowIso,
        lang: raw.lang,
        sourceName: raw.sourceName,
        excerpt: raw.excerpt,
        summaryKo: null,
        tags: [],
      })
    }

    const mergedSeen = [...new Set([...fetchedIds, ...previous.seenIds])].slice(0, MAX_SEEN_IDS)
    state.sources[task.key] = {
      lastRunAt: nowIso,
      seenIds: mergedSeen,
      consecutiveFailures: 0,
      lastError: null,
    }
  }

  const peopleById = new Map(deps.registry.people.map((p) => [p.id, p]))
  const budget = options.limit ?? MAX_SUMMARIES_PER_RUN
  const toSummarize = [...candidates.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, budget)

  let summarized = 0
  let summaryFailures = 0
  if (deps.summarizer) {
    for (const item of toSummarize) {
      try {
        const result = await deps.summarizer.summarize({
          title: item.title,
          excerpt: item.excerpt,
          type: item.type,
          personNames: item.personIds.map((id) => peopleById.get(id)?.name ?? id),
          allowedTags: fieldKeys,
        })
        item.summaryKo = result.summaryKo
        item.tags = result.tags
        summarized += 1
      } catch {
        summaryFailures += 1
      }
    }
  }

  const upsert = await deps.store.upsertItems([...candidates.values()])
  await deps.store.saveState(state)

  const alerts = sourceFailures.filter((f) => f.consecutive >= ALERT_THRESHOLD)

  return {
    created: upsert.created.length,
    merged: upsert.merged.length,
    summarized,
    summaryFailures,
    sourceFailures,
    alerts,
  }
}

async function main(): Promise<void> {
  const root = process.cwd()
  const dryRun = process.argv.includes('--dry-run')
  const limitFlag = process.argv.indexOf('--limit')
  const limit = limitFlag >= 0 ? Number(process.argv[limitFlag + 1]) : undefined

  const registry = await loadRegistry(root)
  const store = createFileStore(root, { readOnly: dryRun })

  const ctx: FetchContext = {
    async fetchText(url) {
      const response = await fetch(url, {
        headers: { 'user-agent': 'ai-tech-followup/1.0 (+https://github.com)' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} — ${url}`)
      return response.text()
    },
  }

  const report = await runCollect(
    {
      registry,
      store,
      fetchers: { rss: fetchRssItems, youtube: fetchYoutubeItems, arxiv: fetchArxivItems },
      ctx,
      summarizer: dryRun ? null : createAnthropicSummarizer(),
      now: () => new Date(),
    },
    { limit },
  )

  console.log(JSON.stringify(report, null, 2))

  if (report.alerts.length > 0) {
    const file = path.join(root, ALERTS_FILE)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(report.alerts, null, 2)}\n`, 'utf8')
  }
}

if (process.argv[1] && process.argv[1].endsWith('collect.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error)
    process.exitCode = 1
  })
}
