import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFileStore, type Store } from '../pipeline/store'
import type { Item } from '../pipeline/schema'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'a'.repeat(40),
    personIds: ['person-a'],
    type: 'paper',
    title: 'Sample',
    url: 'https://arxiv.org/abs/2508.00001',
    publishedAt: '2026-08-20T00:00:00.000Z',
    collectedAt: '2026-08-20T06:00:00.000Z',
    lang: 'en',
    sourceName: 'arXiv',
    excerpt: 'abstract',
    summaryKo: null,
    tags: [],
    ...overrides,
  }
}

let root: string
let store: Store

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'store-'))
  store = createFileStore(root)
})

describe('state', () => {
  it('파일이 없으면 빈 상태를 준다', async () => {
    expect(await store.loadState()).toEqual({ version: 1, sources: {} })
  })

  it('저장한 상태를 다시 읽는다', async () => {
    await store.saveState({
      version: 1,
      sources: {
        'p:rss:https://x/feed': {
          lastRunAt: '2026-08-20T06:00:00.000Z',
          seenIds: ['a'.repeat(40)],
          consecutiveFailures: 0,
          lastError: null,
        },
      },
    })
    const state = await store.loadState()
    expect(state.sources['p:rss:https://x/feed'].seenIds).toEqual(['a'.repeat(40)])
  })
})

describe('upsertItems', () => {
  it('새 아이템을 발행 월 파일에 쓴다', async () => {
    const result = await store.upsertItems([makeItem()])
    expect(result.created).toHaveLength(1)
    expect(result.merged).toHaveLength(0)
    const written = JSON.parse(
      await readFile(path.join(root, 'content/items/2026-08.json'), 'utf8'),
    )
    expect(written).toHaveLength(1)
    expect(written[0].title).toBe('Sample')
  })

  it('같은 id면 새로 만들지 않고 personIds를 합친다', async () => {
    await store.upsertItems([makeItem({ personIds: ['person-a'] })])
    const result = await store.upsertItems([makeItem({ personIds: ['person-b'] })])
    expect(result.created).toHaveLength(0)
    expect(result.merged).toHaveLength(1)
    const all = await store.loadAllItems()
    expect(all).toHaveLength(1)
    expect(all[0].personIds.sort()).toEqual(['person-a', 'person-b'])
  })

  it('이미 있는 personId를 중복으로 넣지 않는다', async () => {
    await store.upsertItems([makeItem()])
    await store.upsertItems([makeItem()])
    const all = await store.loadAllItems()
    expect(all[0].personIds).toEqual(['person-a'])
  })

  it('한 번의 호출 안에서도 같은 id를 합친다', async () => {
    const result = await store.upsertItems([
      makeItem({ personIds: ['person-a'] }),
      makeItem({ personIds: ['person-b'] }),
    ])
    expect(result.created).toHaveLength(1)
    expect(result.created[0].personIds.sort()).toEqual(['person-a', 'person-b'])
  })

  it('월별로 파일을 나눈다', async () => {
    await store.upsertItems([
      makeItem({ id: 'a'.repeat(40), publishedAt: '2026-08-20T00:00:00.000Z' }),
      makeItem({ id: 'b'.repeat(40), publishedAt: '2026-07-20T00:00:00.000Z' }),
    ])
    const all = await store.loadAllItems()
    expect(all).toHaveLength(2)
    await expect(
      readFile(path.join(root, 'content/items/2026-07.json'), 'utf8'),
    ).resolves.toContain('Sample')
  })

  it('월 파일 안에서 최신순으로 정렬한다', async () => {
    await store.upsertItems([
      makeItem({ id: 'a'.repeat(40), publishedAt: '2026-08-10T00:00:00.000Z' }),
      makeItem({ id: 'b'.repeat(40), publishedAt: '2026-08-25T00:00:00.000Z' }),
    ])
    const written = JSON.parse(
      await readFile(path.join(root, 'content/items/2026-08.json'), 'utf8'),
    )
    expect(written[0].publishedAt).toBe('2026-08-25T00:00:00.000Z')
  })

  it('병합해도 아이템을 다른 월로 옮기지 않는다', async () => {
    await store.upsertItems([
      makeItem({ id: 'a'.repeat(40), publishedAt: '2026-08-20T00:00:00.000Z', personIds: ['person-a'] }),
    ])
    // Same id, different month in the incoming candidate.
    const result = await store.upsertItems([
      makeItem({ id: 'a'.repeat(40), publishedAt: '2026-01-05T00:00:00.000Z', personIds: ['person-b'] }),
    ])
    expect(result.created).toHaveLength(0)
    expect(result.merged).toHaveLength(1)

    const files = (await readdir(path.join(root, 'content/items'))).sort()
    expect(files).toEqual(['2026-08.json'])

    const written = JSON.parse(
      await readFile(path.join(root, 'content/items/2026-08.json'), 'utf8'),
    )
    expect(written).toHaveLength(1)
    // publishedAt is not overwritten by a later candidate's value either;
    // the stored item keeps living where it was originally filed.
    expect(written[0].publishedAt).toBe('2026-08-20T00:00:00.000Z')
    expect(written[0].personIds.sort()).toEqual(['person-a', 'person-b'])
  })

  it('동일한 입력을 두 번 넣어도 파일 바이트가 바뀌지 않는다 (idempotent)', async () => {
    const items = [
      makeItem({ id: 'a'.repeat(40), publishedAt: '2026-08-20T00:00:00.000Z' }),
      makeItem({ id: 'b'.repeat(40), publishedAt: '2026-08-10T00:00:00.000Z', personIds: ['person-b'] }),
    ]
    await store.upsertItems(items)
    const filePath = path.join(root, 'content/items/2026-08.json')
    const before = await readFile(filePath, 'utf8')

    await store.upsertItems(items)
    const after = await readFile(filePath, 'utf8')

    expect(after).toBe(before)
  })
})

describe('loadAllItems with a corrupt month file', () => {
  it('스키마를 위반하는 항목이 있으면 해당 월 파일 전체를 건너뛴다', async () => {
    const itemsDir = path.join(root, 'content/items')
    await mkdir(itemsDir, { recursive: true })
    // Write a valid month...
    await writeFile(
      path.join(itemsDir, '2026-07.json'),
      `${JSON.stringify([makeItem({ id: 'b'.repeat(40), publishedAt: '2026-07-01T00:00:00.000Z' })], null, 2)}\n`,
      'utf8',
    )
    // ...and a corrupt one: id is not 40 hex chars, and tags has 4 entries (max 3).
    const corrupt = [
      {
        ...makeItem({ publishedAt: '2026-08-01T00:00:00.000Z' }),
        id: 'not-a-valid-id',
        tags: ['a', 'b', 'c', 'd'],
      },
    ]
    await writeFile(
      path.join(itemsDir, '2026-08.json'),
      `${JSON.stringify(corrupt, null, 2)}\n`,
      'utf8',
    )

    await expect(store.loadAllItems()).rejects.toThrow()
  })
})

describe('highlights', () => {
  it('없는 주차는 null을 준다', async () => {
    expect(await store.loadHighlight('2026-W35')).toBeNull()
  })

  it('저장하고 읽고 목록에 나타난다', async () => {
    await store.saveHighlight({
      week: '2026-W35',
      generatedAt: '2026-08-25T00:00:00.000Z',
      intro: '이번 주 흐름.',
      picks: [{ itemId: 'a'.repeat(40), reason: '중요하다' }],
      origin: 'llm',
    })
    expect((await store.loadHighlight('2026-W35'))?.intro).toBe('이번 주 흐름.')
    expect(await store.listWeeks()).toEqual(['2026-W35'])
  })
})
