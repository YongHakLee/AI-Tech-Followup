import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { runCollect, sourceKey, type CollectDeps } from '../pipeline/collect'
import { itemId } from '../pipeline/normalize'
import { createFileStore, type Store } from '../pipeline/store'
import type { RawItem } from '../pipeline/adapters/types'
import type { Person, Source } from '../pipeline/schema'

const NOW = new Date('2026-08-27T00:00:00.000Z')

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-a',
    name: 'Person A',
    nameKo: '인물 A',
    affiliation: 'Lab',
    formerly: [],
    fields: ['llm'],
    bio: '설명',
    links: {},
    avatar: null,
    sources: [{ type: 'rss', url: 'https://a.example.com/feed' }],
    ...overrides,
  }
}

function raw(overrides: Partial<RawItem> = {}): RawItem {
  return {
    type: 'blog',
    title: 'Post',
    url: 'https://a.example.com/post-1',
    publishedAt: '2026-08-25T00:00:00.000Z',
    excerpt: '발췌',
    sourceName: 'A Blog',
    lang: 'en',
    ...overrides,
  }
}

function deps(store: Store, over: Partial<CollectDeps> = {}): CollectDeps {
  return {
    registry: { people: [person()], fields: [{ key: 'llm', nameKo: 'LLM' }] },
    store,
    fetchers: {
      async rss() { return [raw()] },
      async youtube() { return [] },
      async arxiv() { return [] },
    },
    ctx: { async fetchText() { return '' } },
    summarizer: { async summarize() { return { summaryKo: '요약.', tags: ['llm'] } } },
    now: () => NOW,
    ...over,
  }
}

let store: Store

beforeEach(async () => {
  store = createFileStore(await mkdtemp(path.join(tmpdir(), 'collect-')))
})

describe('sourceKey', () => {
  it('소스 종류별로 구분되는 키를 만든다', () => {
    const rssSource: Source = { type: 'rss', url: 'https://a.example.com/feed' }
    const ytSource: Source = { type: 'youtube', channelId: 'UC'.padEnd(24, 'a') }
    expect(sourceKey('p', rssSource)).not.toBe(sourceKey('p', ytSource))
    expect(sourceKey('p', rssSource)).toContain('rss')
  })
})

describe('runCollect', () => {
  it('첫 실행에서는 소스당 최신 3건만 채택한다', async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      raw({ url: `https://a.example.com/post-${i}`, publishedAt: `2026-08-${10 + i}T00:00:00.000Z` }),
    )
    const report = await runCollect(deps(store, {
      fetchers: { async rss() { return many }, async youtube() { return [] }, async arxiv() { return [] } },
    }))
    expect(report.created).toBe(3)
    const items = await store.loadAllItems()
    expect(items.map((i) => i.publishedAt)).toEqual([
      '2026-08-17T00:00:00.000Z',
      '2026-08-16T00:00:00.000Z',
      '2026-08-15T00:00:00.000Z',
    ])
  })

  it('첫 실행에서 밀린 나머지는 확인 완료로 표시해 다시 끌어오지 않는다', async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      raw({ url: `https://a.example.com/post-${i}`, publishedAt: `2026-08-${10 + i}T00:00:00.000Z` }),
    )
    const fixed = deps(store, {
      fetchers: { async rss() { return many }, async youtube() { return [] }, async arxiv() { return [] } },
    })
    await runCollect(fixed)
    const second = await runCollect(fixed)
    expect(second.created).toBe(0)
  })

  it('두 번째 실행에서는 새 항목만 채택한다', async () => {
    await runCollect(deps(store))
    const report = await runCollect(deps(store, {
      fetchers: {
        async rss() { return [raw(), raw({ url: 'https://a.example.com/post-2' })] },
        async youtube() { return [] },
        async arxiv() { return [] },
      },
    }))
    expect(report.created).toBe(1)
  })

  it('180일보다 오래된 항목은 버린다', async () => {
    const report = await runCollect(deps(store, {
      fetchers: {
        async rss() { return [raw({ publishedAt: '2020-01-01T00:00:00.000Z' })] },
        async youtube() { return [] },
        async arxiv() { return [] },
      },
    }))
    expect(report.created).toBe(0)
  })

  it('한 소스가 실패해도 다른 소스는 계속 처리한다', async () => {
    const two = [
      person({ id: 'person-a', sources: [{ type: 'rss', url: 'https://a.example.com/feed' }] }),
      person({ id: 'person-b', sources: [{ type: 'youtube', channelId: 'UC'.padEnd(24, 'a') }] }),
    ]
    const report = await runCollect(deps(store, {
      registry: { people: two, fields: [{ key: 'llm', nameKo: 'LLM' }] },
      fetchers: {
        async rss() { throw new Error('feed is dead') },
        async youtube() { return [raw({ type: 'video', url: 'https://youtube.com/watch?v=x' })] },
        async arxiv() { return [] },
      },
    }))
    expect(report.created).toBe(1)
    expect(report.sourceFailures).toHaveLength(1)
    expect(report.sourceFailures[0].error).toContain('feed is dead')
  })

  it('연속 5회 실패하면 alerts에 담는다', async () => {
    const failing = deps(store, {
      fetchers: {
        async rss() { throw new Error('dead') },
        async youtube() { return [] },
        async arxiv() { return [] },
      },
    })
    let report = await runCollect(failing)
    for (let i = 0; i < 4; i += 1) report = await runCollect(failing)
    expect(report.alerts).toHaveLength(1)
    expect(report.alerts[0].consecutive).toBe(5)
  })

  it('성공하면 실패 카운터를 0으로 되돌린다', async () => {
    await runCollect(deps(store, {
      fetchers: { async rss() { throw new Error('dead') }, async youtube() { return [] }, async arxiv() { return [] } },
    }))
    await runCollect(deps(store))
    const state = await store.loadState()
    const key = sourceKey('person-a', { type: 'rss', url: 'https://a.example.com/feed' })
    expect(state.sources[key].consecutiveFailures).toBe(0)
  })

  it('요약 결과를 아이템에 담는다', async () => {
    await runCollect(deps(store))
    const items = await store.loadAllItems()
    expect(items[0].summaryKo).toBe('요약.')
    expect(items[0].tags).toEqual(['llm'])
  })

  it('요약이 실패해도 아이템을 버리지 않는다', async () => {
    const report = await runCollect(deps(store, {
      summarizer: { async summarize() { throw new Error('rate limited') } },
    }))
    expect(report.created).toBe(1)
    expect(report.summaryFailures).toBe(1)
    const items = await store.loadAllItems()
    expect(items[0].summaryKo).toBeNull()
  })

  it('요약기가 null이면 호출하지 않는다', async () => {
    const report = await runCollect(deps(store, { summarizer: null }))
    expect(report.summarized).toBe(0)
    expect((await store.loadAllItems())[0].summaryKo).toBeNull()
  })

  it('같은 URL을 두 인물이 내면 아이템 하나에 두 인물을 붙인다', async () => {
    const two = [
      person({ id: 'person-a', sources: [{ type: 'rss', url: 'https://a.example.com/feed' }] }),
      person({ id: 'person-b', sources: [{ type: 'rss', url: 'https://b.example.com/feed' }] }),
    ]
    const report = await runCollect(deps(store, {
      registry: { people: two, fields: [{ key: 'llm', nameKo: 'LLM' }] },
      fetchers: {
        async rss() { return [raw({ url: 'https://arxiv.org/abs/2508.00001' })] },
        async youtube() { return [] },
        async arxiv() { return [] },
      },
    }))
    expect(report.created).toBe(1)
    const items = await store.loadAllItems()
    expect(items[0].personIds).toEqual(['person-a', 'person-b'])
  })

  // --- 브리프에 없는 추가 커버리지 ---

  it('URL이 잘못된 항목이 섞여 있어도 나머지 항목은 정상 수집되고 실행이 끝난다', async () => {
    const report = await runCollect(deps(store, {
      fetchers: {
        async rss() {
          return [
            raw({ url: '', publishedAt: '2026-08-20T00:00:00.000Z' }),
            raw({ url: 'https://a.example.com/post-ok', publishedAt: '2026-08-21T00:00:00.000Z' }),
          ]
        },
        async youtube() { return [] },
        async arxiv() { return [] },
      },
    }))
    expect(report.created).toBe(1)
    expect(report.sourceFailures).toHaveLength(0)
    const items = await store.loadAllItems()
    expect(items).toHaveLength(1)
    expect(items[0].url).toBe('https://a.example.com/post-ok')
  })

  it('한 실행에서 요약은 MAX_SUMMARIES_PER_RUN(60)건까지만 호출하고 나머지는 summaryKo를 null로 저장한다', async () => {
    const key = sourceKey('person-a', { type: 'rss', url: 'https://a.example.com/feed' })
    await store.saveState({
      version: 1,
      sources: {
        [key]: { lastRunAt: '2026-08-01T00:00:00.000Z', seenIds: ['dummy'], consecutiveFailures: 0, lastError: null },
      },
    })
    const many = Array.from({ length: 65 }, (_, i) =>
      raw({
        url: `https://a.example.com/post-${i}`,
        publishedAt: new Date(NOW.getTime() - i * 60_000).toISOString(),
      }),
    )
    let calls = 0
    const report = await runCollect(deps(store, {
      fetchers: { async rss() { return many }, async youtube() { return [] }, async arxiv() { return [] } },
      summarizer: {
        async summarize() {
          calls += 1
          return { summaryKo: '요약.', tags: [] }
        },
      },
    }))
    expect(report.created).toBe(65)
    expect(calls).toBe(60)
    expect(report.summarized).toBe(60)
    const items = await store.loadAllItems()
    expect(items.filter((i) => i.summaryKo === null)).toHaveLength(5)
  })

  it('--limit 옵션으로 한 실행의 요약 개수를 더 낮게 제한할 수 있다', async () => {
    const key = sourceKey('person-a', { type: 'rss', url: 'https://a.example.com/feed' })
    await store.saveState({
      version: 1,
      sources: {
        [key]: { lastRunAt: '2026-08-01T00:00:00.000Z', seenIds: ['dummy'], consecutiveFailures: 0, lastError: null },
      },
    })
    const many = Array.from({ length: 5 }, (_, i) =>
      raw({
        url: `https://a.example.com/post-${i}`,
        publishedAt: new Date(NOW.getTime() - i * 60_000).toISOString(),
      }),
    )
    let calls = 0
    const report = await runCollect(
      deps(store, {
        fetchers: { async rss() { return many }, async youtube() { return [] }, async arxiv() { return [] } },
        summarizer: {
          async summarize() {
            calls += 1
            return { summaryKo: '요약.', tags: [] }
          },
        },
      }),
      { limit: 2 },
    )
    expect(report.created).toBe(5)
    expect(calls).toBe(2)
    expect(report.summarized).toBe(2)
    const items = await store.loadAllItems()
    expect(items.filter((i) => i.summaryKo === null)).toHaveLength(3)
  })

  it('소스별 seenIds는 MAX_SEEN_IDS(500)개로 잘린다', async () => {
    const key = sourceKey('person-a', { type: 'rss', url: 'https://a.example.com/feed' })
    const oldIds = Array.from({ length: 499 }, (_, i) => `old-${i}`.padStart(40, '0'))
    await store.saveState({
      version: 1,
      sources: {
        [key]: { lastRunAt: '2026-08-01T00:00:00.000Z', seenIds: oldIds, consecutiveFailures: 0, lastError: null },
      },
    })
    const many = Array.from({ length: 10 }, (_, i) =>
      raw({ url: `https://a.example.com/post-${i}`, publishedAt: `2026-08-2${i}T00:00:00.000Z` }),
    )
    await runCollect(deps(store, {
      fetchers: { async rss() { return many }, async youtube() { return [] }, async arxiv() { return [] } },
    }))
    const state = await store.loadState()
    expect(state.sources[key].seenIds).toHaveLength(500)

    // 길이만으로는 "어느 쪽 끝을 잘랐는가"를 구분할 수 없다 — 방금 수집한 새 id가
    // 밀려나고 오래된 id가 남는 반전이 일어나도 길이는 여전히 500이 된다
    // (499개 구 id + 10개 신규 id = 509개, 어느 순서로 합쳐도 500으로 잘리면 길이는
    // 같다). 그래서 "무엇이" 남았는지를 직접 확인한다: 방금 수집한 모든 항목은
    // 남아 있어야 하고, seedState의 맨 끝(가장 오래된) id는 사라져 있어야 한다.
    const freshlyFetchedIds = many.map((r) => itemId(r.url))
    for (const id of freshlyFetchedIds) {
      expect(state.sources[key].seenIds).toContain(id)
    }
    const oldestSeededId = oldIds[oldIds.length - 1]
    expect(state.sources[key].seenIds).not.toContain(oldestSeededId)
  })
})
