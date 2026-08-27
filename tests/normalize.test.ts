import { describe, expect, it } from 'vitest'
import { itemId, normalizeUrl } from '../pipeline/normalize'

describe('normalizeUrl', () => {
  it('추적 파라미터를 제거한다', () => {
    expect(normalizeUrl('https://example.com/post?utm_source=x&id=3&fbclid=abc')).toBe(
      'https://example.com/post?id=3',
    )
  })

  it('www와 후행 슬래시와 해시를 제거한다', () => {
    expect(normalizeUrl('https://www.example.com/post/#section')).toBe('https://example.com/post')
  })

  it('http를 https로 통일한다', () => {
    expect(normalizeUrl('http://example.com/a')).toBe('https://example.com/a')
  })

  it('남은 쿼리 파라미터를 정렬한다', () => {
    expect(normalizeUrl('https://example.com/a?b=2&a=1')).toBe('https://example.com/a?a=1&b=2')
  })

  it('arXiv 버전 접미사와 pdf 경로를 abs로 통일한다', () => {
    const canonical = 'https://arxiv.org/abs/2508.12345'
    expect(normalizeUrl('http://arxiv.org/abs/2508.12345v1')).toBe(canonical)
    expect(normalizeUrl('https://arxiv.org/abs/2508.12345v3')).toBe(canonical)
    expect(normalizeUrl('https://arxiv.org/pdf/2508.12345v2.pdf')).toBe(canonical)
  })

  it('youtu.be 단축 링크를 watch URL로 편다', () => {
    expect(normalizeUrl('https://youtu.be/dQw4w9WgXcQ?si=track')).toBe(
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
    )
  })

  it('루트 경로의 슬래시는 남긴다', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })
})

describe('itemId', () => {
  it('40자 hex를 돌려준다', () => {
    expect(itemId('https://example.com/a')).toMatch(/^[0-9a-f]{40}$/)
  })

  it('정규화 후 같은 URL이면 같은 id를 준다', () => {
    expect(itemId('http://www.example.com/a/?utm_source=x')).toBe(itemId('https://example.com/a'))
  })

  it('다른 URL이면 다른 id를 준다', () => {
    expect(itemId('https://example.com/a')).not.toBe(itemId('https://example.com/b'))
  })
})
