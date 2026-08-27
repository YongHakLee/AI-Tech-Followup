import { describe, expect, it } from 'vitest'
import { buildPrompt, sanitizeOutput } from '../pipeline/summarize'

const ALLOWED = ['llm', 'agents', 'safety']

describe('sanitizeOutput', () => {
  it('허용 목록에 없는 태그를 버린다', () => {
    const result = sanitizeOutput({ summaryKo: '요약', tags: ['llm', 'quantum'] }, ALLOWED)
    expect(result.tags).toEqual(['llm'])
  })

  it('태그를 3개로 자른다', () => {
    const result = sanitizeOutput(
      { summaryKo: '요약', tags: ['llm', 'agents', 'safety', 'llm'] },
      ALLOWED,
    )
    expect(result.tags).toHaveLength(3)
  })

  it('중복 태그를 제거한다', () => {
    const result = sanitizeOutput({ summaryKo: '요약', tags: ['llm', 'llm'] }, ALLOWED)
    expect(result.tags).toEqual(['llm'])
  })

  it('요약 앞뒤 공백을 정리한다', () => {
    const result = sanitizeOutput({ summaryKo: '  요약  ', tags: [] }, ALLOWED)
    expect(result.summaryKo).toBe('요약')
  })

  it('빈 요약은 에러를 던진다', () => {
    expect(() => sanitizeOutput({ summaryKo: '   ', tags: [] }, ALLOWED)).toThrow()
  })

  it('태그가 전부 허용 목록 밖이면 빈 배열을 주고 요약은 그대로 반환한다', () => {
    const result = sanitizeOutput({ summaryKo: '요약', tags: ['quantum', 'blockchain'] }, ALLOWED)
    expect(result.tags).toEqual([])
    expect(result.summaryKo).toBe('요약')
  })

  it('태그 앞뒤 공백을 정리한 후 허용 목록과 비교한다', () => {
    const result = sanitizeOutput({ summaryKo: '요약', tags: [' llm ', 'agents\n'] }, ALLOWED)
    expect(result.tags).toEqual(['llm', 'agents'])
  })

  it('정확히 3개의 유효한 태그는 모두 남긴다', () => {
    const result = sanitizeOutput({ summaryKo: '요약', tags: ['llm', 'agents', 'safety'] }, ALLOWED)
    expect(result.tags).toEqual(['llm', 'agents', 'safety'])
  })

  it('허용 목록에 4개 이상의 유효한 태그가 있어도 앞의 3개만 남긴다', () => {
    const allowed4 = ['llm', 'agents', 'safety', 'robotics']
    const result = sanitizeOutput(
      { summaryKo: '요약', tags: ['llm', 'agents', 'safety', 'robotics'] },
      allowed4,
    )
    expect(result.tags).toEqual(['llm', 'agents', 'safety'])
  })
})

describe('buildPrompt', () => {
  it('제목, 저자, 발췌, 허용 태그를 모두 담는다', () => {
    const prompt = buildPrompt({
      title: 'On Scaling',
      excerpt: 'A note about scaling.',
      type: 'blog',
      personNames: ['Andrej Karpathy'],
      allowedTags: ALLOWED,
    })
    expect(prompt).toContain('On Scaling')
    expect(prompt).toContain('Andrej Karpathy')
    expect(prompt).toContain('A note about scaling.')
    expect(prompt).toContain('llm, agents, safety')
  })

  it('발췌가 비어 있으면 제목만으로 요약하라고 지시한다', () => {
    const prompt = buildPrompt({
      title: 'Title Only',
      excerpt: '',
      type: 'video',
      personNames: ['Someone'],
      allowedTags: ALLOWED,
    })
    expect(prompt).toContain('제목만')
  })

  it('허용 태그 목록을 모델이 고를 수 있는 그대로의 형태로 담는다', () => {
    const prompt = buildPrompt({
      title: 'T',
      excerpt: 'E',
      type: 'blog',
      personNames: ['A'],
      allowedTags: ['llm', 'agents', 'safety'],
    })
    expect(prompt).toContain('llm, agents, safety')
  })

  it('blog 타입은 "블로그 글"로 표기한다', () => {
    const prompt = buildPrompt({
      title: 'T',
      excerpt: 'E',
      type: 'blog',
      personNames: ['A'],
      allowedTags: ALLOWED,
    })
    expect(prompt).toContain('블로그 글')
  })

  it('paper 타입은 "논문"으로 표기한다', () => {
    const prompt = buildPrompt({
      title: 'T',
      excerpt: 'E',
      type: 'paper',
      personNames: ['A'],
      allowedTags: ALLOWED,
    })
    expect(prompt).toContain('논문')
  })

  it('video 타입은 "영상"으로 표기한다', () => {
    const prompt = buildPrompt({
      title: 'T',
      excerpt: 'E',
      type: 'video',
      personNames: ['A'],
      allowedTags: ALLOWED,
    })
    expect(prompt).toContain('영상')
  })
})
