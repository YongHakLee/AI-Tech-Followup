import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { fetchYoutubeItems, youtubeFeedUrl } from '../../pipeline/adapters/youtube'
import type { FetchContext } from '../../pipeline/adapters/types'

const CHANNEL_ID = 'UCXUPKJO5MZQN11PqgIvyuvQ'
const SOURCE = { type: 'youtube' as const, channelId: CHANNEL_ID }

function fixtureContext(
  fixtureName = 'youtube.xml',
): { ctx: FetchContext; requested: string[] } {
  const requested: string[] = []
  return {
    requested,
    ctx: {
      async fetchText(url) {
        requested.push(url)
        return readFile(new URL(`../fixtures/${fixtureName}`, import.meta.url), 'utf8')
      },
    },
  }
}

describe('youtubeFeedUrl', () => {
  it('채널 RSS 주소를 만든다', () => {
    expect(youtubeFeedUrl(CHANNEL_ID)).toBe(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
    )
  })
})

describe('fetchYoutubeItems', () => {
  it('채널 RSS 주소로 요청한다', async () => {
    const { ctx, requested } = fixtureContext()
    await fetchYoutubeItems(SOURCE, ctx)
    expect(requested).toEqual([youtubeFeedUrl(CHANNEL_ID)])
  })

  it('영상 항목을 RawItem으로 바꾼다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchYoutubeItems(SOURCE, ctx)
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      type: 'video',
      title: 'Deep Dive into Transformers',
      url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA',
      publishedAt: '2026-08-21T15:00:00.000Z',
      excerpt: 'We build a transformer from scratch, step by step.',
      sourceName: 'Test Channel',
      lang: 'en',
    })
  })

  it('설명이 비어 있어도 버리지 않는다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchYoutubeItems(SOURCE, ctx)
    expect(items[1].title).toBe('Short Update')
    expect(items[1].excerpt).toBe('')
  })

  it('항목이 하나뿐이어도(파서가 객체로 반환해도) 배열로 처리한다', async () => {
    const { ctx } = fixtureContext('youtube-single-entry.xml')
    const items = await fetchYoutubeItems(SOURCE, ctx)
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      type: 'video',
      title: 'Only Upload',
      url: 'https://www.youtube.com/watch?v=CCCCCCCCCCC',
      publishedAt: '2026-08-10T12:00:00.000Z',
      excerpt: "The channel's only video so far.",
      sourceName: 'Solo Channel',
      lang: 'en',
    })
  })

  it('링크·발행일·제목이 없는 항목을 제외하고 나머지만 남긴다', async () => {
    const { ctx } = fixtureContext('youtube-dropped-entries.xml')
    const items = await fetchYoutubeItems(SOURCE, ctx)
    expect(items.map((item) => item.title)).toEqual(['Kept One', 'Kept Two'])
    expect(items).toHaveLength(2)
  })
})
