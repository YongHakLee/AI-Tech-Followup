import { describe, expect, it } from 'vitest'
import { EXCERPT_MAX, toExcerpt, toIsoDate } from '../../pipeline/adapters/util'

describe('toExcerpt', () => {
  it('태그를 제거한다', () => {
    expect(toExcerpt('<p>A <b>short</b> note.</p>')).toBe('A short note.')
  })

  it('script 태그와 그 내용을 완전히 제거한다', () => {
    const input = '<div>Keep this<script>var secret = "leak state secrets";</script> text</div>'
    const result = toExcerpt(input)
    expect(result).toBe('Keep this text')
    expect(result).not.toContain('secret')
    expect(result).not.toContain('leak')
  })

  it('style 태그와 그 내용을 완전히 제거한다', () => {
    const input = '<div>Keep this<style>.cls { color: red; }</style> text</div>'
    const result = toExcerpt(input)
    expect(result).toBe('Keep this text')
    expect(result).not.toContain('color')
    expect(result).not.toContain('red')
  })

  it('script와 style이 섞여 있어도 본문만 남긴다', () => {
    const input =
      '<div>Keep <script>var x = "leak state secrets";</script>this<style>.cls{color:red}</style> text</div>'
    const result = toExcerpt(input)
    expect(result).toBe('Keep this text')
    expect(result).not.toContain('leak')
    expect(result).not.toContain('color:red')
  })

  it('&nbsp;를 공백으로 바꾼다', () => {
    expect(toExcerpt('A&nbsp;B')).toBe('A B')
  })

  it('&amp;를 &로 바꾼다', () => {
    expect(toExcerpt('Tom &amp; Jerry')).toBe('Tom & Jerry')
  })

  it('&lt;를 <로 바꾼다', () => {
    expect(toExcerpt('a &lt; b')).toBe('a < b')
  })

  it('&gt;를 >로 바꾼다', () => {
    expect(toExcerpt('a &gt; b')).toBe('a > b')
  })

  it('&quot;를 "로 바꾼다', () => {
    expect(toExcerpt('She said &quot;hi&quot;')).toBe('She said "hi"')
  })

  it("&#39;를 '로 바꾼다", () => {
    expect(toExcerpt('It&#39;s here')).toBe("It's here")
  })

  it('연속 공백을 하나로 합치고 앞뒤를 자른다', () => {
    expect(toExcerpt('  A   \n\n  B\tC  ')).toBe('A B C')
  })

  it('정확히 600자인 입력은 그대로 반환한다', () => {
    const input = 'a'.repeat(EXCERPT_MAX)
    const result = toExcerpt(input)
    expect(result).toBe(input)
    expect(result).toHaveLength(EXCERPT_MAX)
  })

  it('600자를 초과하면 599자 + 말줄임표로 정확히 600자가 된다', () => {
    const input = 'a'.repeat(EXCERPT_MAX + 100)
    const result = toExcerpt(input)
    expect(result).toHaveLength(EXCERPT_MAX)
    expect(result.endsWith('…')).toBe(true)
    expect(result).toBe(`${'a'.repeat(EXCERPT_MAX - 1)}…`)
  })

  it('빈 문자열, undefined, null은 빈 문자열을 반환한다', () => {
    expect(toExcerpt('')).toBe('')
    expect(toExcerpt(undefined)).toBe('')
    expect(toExcerpt(null)).toBe('')
  })
})

describe('toIsoDate', () => {
  it('RFC-822 날짜 문자열을 ISO로 바꾼다', () => {
    expect(toIsoDate('Wed, 20 Aug 2026 10:00:00 GMT')).toBe('2026-08-20T10:00:00.000Z')
  })

  it('ISO 날짜 문자열을 ISO로 바꾼다', () => {
    expect(toIsoDate('2026-08-19T12:00:00.000Z')).toBe('2026-08-19T12:00:00.000Z')
  })

  it('undefined는 null을 반환한다', () => {
    expect(toIsoDate(undefined)).toBeNull()
  })

  it('null은 null을 반환한다', () => {
    expect(toIsoDate(null)).toBeNull()
  })

  it('빈 문자열은 null을 반환한다', () => {
    expect(toIsoDate('')).toBeNull()
  })

  it('파싱할 수 없는 문자열은 null을 반환한다', () => {
    expect(toIsoDate('not-a-date')).toBeNull()
  })
})
