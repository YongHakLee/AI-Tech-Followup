import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { fetchYoutubeItems, youtubeFeedUrl } from '../../pipeline/adapters/youtube'
import type { FetchContext } from '../../pipeline/adapters/types'

const CHANNEL_ID = 'UCXUPKJO5MZQN11PqgIvyuvQ'
const SOURCE = { type: 'youtube' as const, channelId: CHANNEL_ID }

function fixtureContext(): { ctx: FetchContext; requested: string[] } {
  const requested: string[] = []
  return {
    requested,
    ctx: {
      async fetchText(url) {
        requested.push(url)
        return readFile(new URL('../fixtures/youtube.xml', import.meta.url), 'utf8')
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
})
