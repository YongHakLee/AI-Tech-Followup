import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fieldsOfItem,
  itemsByField,
  itemsByPerson,
  resolvePicks,
  type SiteData,
} from '../src/lib/content'
import type { Item, Person } from '../pipeline/schema'

function person(id: string, fields: string[]): Person {
  return {
    id,
    name: id,
    nameKo: id,
    affiliation: 'Lab',
    formerly: [],
    fields,
    bio: '설명',
    links: {},
    avatar: null,
    sources: [{ type: 'rss', url: 'https://example.com/feed' }],
  }
}

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id: id.padEnd(40, '0'),
    personIds: ['alice'],
    type: 'blog',
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    publishedAt: '2026-08-20T00:00:00.000Z',
    collectedAt: '2026-08-20T06:00:00.000Z',
    lang: 'en',
    sourceName: 'Blog',
    excerpt: '발췌',
    summaryKo: '요약.',
    tags: ['llm'],
    ...overrides,
  }
}

const DATA: SiteData = {
  people: [person('alice', ['llm', 'safety']), person('bob', ['robotics'])],
  fields: [
    { key: 'llm', nameKo: 'LLM' },
    { key: 'safety', nameKo: '안전' },
    { key: 'robotics', nameKo: '로보틱스' },
  ],
  items: [
    item('a', { tags: ['llm'] }),
    item('b', { tags: [], personIds: ['bob'] }),
    item('c', { tags: ['safety'], personIds: ['alice', 'bob'] }),
  ],
  weeks: ['2026-W34'],
}

const PEOPLE_BY_ID = new Map(DATA.people.map((p) => [p.id, p]))

describe('fieldsOfItem', () => {
  it('태그가 있으면 태그를 쓴다', () => {
    expect(fieldsOfItem(DATA.items[0], PEOPLE_BY_ID)).toEqual(['llm'])
  })

  it('태그가 비면 저자의 분야로 폴백한다', () => {
    expect(fieldsOfItem(DATA.items[1], PEOPLE_BY_ID)).toEqual(['robotics'])
  })

  it('저자가 여럿이면 분야를 합친다', () => {
    const orphan = item('d', { tags: [], personIds: ['alice', 'bob'] })
    expect(fieldsOfItem(orphan, PEOPLE_BY_ID).sort()).toEqual(['llm', 'robotics', 'safety'])
  })

  it('레지스트리에 없는 인물 id는 무시하고 빈 배열로 안전하게 처리한다', () => {
    const stale = item('e', { tags: [], personIds: ['ghost'] })
    expect(fieldsOfItem(stale, PEOPLE_BY_ID)).toEqual([])
  })

  it('레지스트리에 없는 인물과 있는 인물이 섞이면 있는 인물의 분야만 쓴다', () => {
    const mixed = item('f', { tags: [], personIds: ['ghost', 'bob'] })
    expect(fieldsOfItem(mixed, PEOPLE_BY_ID)).toEqual(['robotics'])
  })
})

describe('itemsByField', () => {
  it('해당 분야 항목만 최신순으로 준다', () => {
    expect(itemsByField(DATA, 'llm').map((i) => i.title)).toEqual(['Title a'])
    expect(itemsByField(DATA, 'robotics').map((i) => i.title)).toEqual(['Title b'])
  })
})

describe('itemsByPerson', () => {
  it('해당 인물이 관련된 항목만 준다', () => {
    expect(itemsByPerson(DATA, 'bob').map((i) => i.title).sort()).toEqual(['Title b', 'Title c'])
  })
})

describe('resolvePicks', () => {
  const highlight = {
    week: '2026-W34',
    generatedAt: '2026-08-24T00:00:00.000Z',
    intro: '인트로',
    picks: [
      { itemId: 'a'.padEnd(40, '0'), reason: '이유 1' },
      { itemId: 'z'.padEnd(40, '0'), reason: '없는 항목' },
    ],
    origin: 'llm' as const,
  }

  it('itemId를 실제 아이템으로 바꾼다', () => {
    const picks = resolvePicks(highlight, DATA.items)
    expect(picks).toHaveLength(1)
    expect(picks[0].item.title).toBe('Title a')
    expect(picks[0].reason).toBe('이유 1')
  })

  it('하이라이트가 없으면 빈 배열을 준다', () => {
    expect(resolvePicks(null, DATA.items)).toEqual([])
  })

  it('모든 itemId가 더 이상 존재하지 않으면 빈 배열을 준다', () => {
    const staleHighlight = {
      week: '2026-W34',
      generatedAt: '2026-08-24T00:00:00.000Z',
      intro: '인트로',
      picks: [
        { itemId: 'y'.padEnd(40, '0'), reason: '삭제됨 1' },
        { itemId: 'z'.padEnd(40, '0'), reason: '삭제됨 2' },
      ],
      origin: 'heuristic' as const,
    }
    expect(resolvePicks(staleHighlight, DATA.items)).toEqual([])
  })
})

describe('getSiteData', () => {
  const originalCwd = process.cwd()

  afterEach(() => {
    process.chdir(originalCwd)
  })

  it('content 디렉터리가 없어도 던지지 않고 빈 아이템·빈 주간을 준다 (첫 배포 시나리오)', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'site-data-'))
    await mkdir(path.join(root, 'registry/people'), { recursive: true })
    await writeFile(
      path.join(root, 'registry/fields.yaml'),
      '- { key: llm, nameKo: LLM }\n',
      'utf8',
    )
    await writeFile(
      path.join(root, 'registry/people/test-person.yaml'),
      [
        'id: test-person',
        'name: Test Person',
        'nameKo: 테스트',
        'affiliation: Somewhere',
        'fields: [llm]',
        'bio: 테스트용 인물.',
        'sources:',
        '  - { type: rss, url: https://example.com/feed.xml }',
        '',
      ].join('\n'),
      'utf8',
    )

    // content/ is intentionally never created.
    vi.resetModules()
    const { getSiteData } = await import('../src/lib/content')

    process.chdir(root)
    const data = await getSiteData()

    expect(data.items).toEqual([])
    expect(data.weeks).toEqual([])
    expect(data.people).toHaveLength(1)
    expect(data.fields).toHaveLength(1)
  })
})
