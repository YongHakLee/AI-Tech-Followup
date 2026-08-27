import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fieldsOfItem,
  itemsByField,
  itemsByPerson,
  heroIntro,
  resolvePicks,
  splitWeekItems,
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

  it('첫 호출이 실패하면 캐시를 남기지 않고, 원인이 사라진 뒤 재호출하면 실제로 다시 읽어 성공한다', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'site-data-retry-'))

    // registry/ does not exist yet, so the first call must reject.
    vi.resetModules()
    const { getSiteData } = await import('../src/lib/content')

    process.chdir(root)

    await expect(getSiteData()).rejects.toThrow()

    // Now fix the underlying cause.
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

    // The retry must actually re-read the filesystem and return real data,
    // not replay the earlier rejection.
    const data = await getSiteData()
    expect(data.people).toHaveLength(1)
    expect(data.fields).toHaveLength(1)
    expect(data.items).toEqual([])
    expect(data.weeks).toEqual([])

    // The successful result must now be memoized: removing registry/ again
    // must not affect a subsequent call, since it should not re-read the fs.
    await rm(path.join(root, 'registry'), { recursive: true, force: true })
    const dataAgain = await getSiteData()
    expect(dataAgain).toBe(data)
  })
})

describe('splitWeekItems', () => {
  const a = item('a')
  const b = item('b')
  const c = item('c')
  const week = [a, b, c]

  function picksOf(...items: Item[]) {
    return items.map((it) => ({ item: it, reason: `${it.id} 이유` }))
  }

  it('픽이 없으면 그 주 전체가 나머지이고 allPicked가 아니다', () => {
    const { remaining, allPicked } = splitWeekItems(week, [])
    expect(remaining).toEqual(week)
    expect(allPicked).toBe(false)
  })

  it('픽이 일부면 나머지에서 그 픽만 빠진다', () => {
    const { remaining, allPicked } = splitWeekItems(week, picksOf(b))
    expect(remaining.map((i) => i.id)).toEqual([a.id, c.id])
    expect(allPicked).toBe(false)
  })

  // 원래 버그: 제목은 items.length를 세고 그리드는 픽을 뺀 목록을 그려서,
  // 그 주가 전부 픽이면 "이번 주 전체 (3)" 아래가 비었다.
  it('그 주 항목이 전부 픽이면 나머지가 비고 allPicked가 참이다', () => {
    const { remaining, allPicked } = splitWeekItems(week, picksOf(a, b, c))
    expect(remaining).toEqual([])
    expect(allPicked).toBe(true)
  })

  // 항목도 픽도 없는 주는 "모두 위에 포함되어 있습니다"가 아니라
  // "아직 수집된 항목이 없습니다"여야 한다.
  it('항목도 픽도 없으면 allPicked가 거짓이다', () => {
    expect(splitWeekItems([], []).allPicked).toBe(false)
  })

  it('나머지는 입력 순서를 유지한다', () => {
    const reversed = [c, b, a]
    expect(splitWeekItems(reversed, []).remaining.map((i) => i.id)).toEqual([c.id, b.id, a.id])
  })

  it('입력 배열을 변형하지 않는다', () => {
    const input = [...week]
    splitWeekItems(input, picksOf(a))
    expect(input).toEqual(week)
  })
})

describe('heroIntro', () => {
  const withIntro = { week: '2026-W35', generatedAt: '', intro: '이번 주 흐름.', picks: [], origin: 'llm' as const }

  it('하이라이트가 있으면 그 인트로를 쓴다', () => {
    expect(heroIntro(withIntro, [item('a')])).toBe('이번 주 흐름.')
  })

  // 배포된 사이트에서 실제로 났던 문제: 주간 워크플로가 아직 안 돌아 하이라이트가
  // 없는데 항목은 있었고, 히어로가 "아직 수집된 항목이 없습니다"라고 말했다.
  it('하이라이트가 없고 항목은 있으면 항목이 없다고 하지 않는다', () => {
    const text = heroIntro(null, [item('a')])
    expect(text).not.toContain('수집된 항목이 없습니다')
    expect(text).toBe('이번 주 하이라이트는 아직 생성되지 않았습니다.')
  })

  it('둘 다 없으면 항목이 없다고 한다', () => {
    expect(heroIntro(null, [])).toBe('아직 수집된 항목이 없습니다.')
  })

  it('인트로가 공백뿐이면 없는 것으로 본다', () => {
    expect(heroIntro({ ...withIntro, intro: '   ' }, [item('a')])).toBe(
      '이번 주 하이라이트는 아직 생성되지 않았습니다.',
    )
  })
})
