import { describe, expect, it } from 'vitest'
import { nextTheme, readStoredChoice, resolveTheme } from '../src/lib/theme'

describe('resolveTheme', () => {
  it('저장된 선택이 시스템 설정을 이긴다', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('저장된 선택이 없으면 시스템 설정을 따른다', () => {
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme(null, false)).toBe('light')
  })

  // localStorage는 다른 탭·확장·사용자가 쓴 임의의 값일 수 있다. 그때 조용히
  // 라이트로 떨어지면 다크를 쓰는 사람이 흰 화면을 맞는다.
  it('저장된 값이 이상하면 시스템 설정으로 돌아간다', () => {
    for (const junk of ['DARK', 'system', '', '{}', 0, true, undefined, {}]) {
      expect(resolveTheme(junk, true)).toBe('dark')
      expect(resolveTheme(junk, false)).toBe('light')
    }
  })
})

describe('readStoredChoice', () => {
  it('유효한 값만 선택으로 인정한다', () => {
    expect(readStoredChoice('dark')).toBe('dark')
    expect(readStoredChoice('light')).toBe('light')
  })

  it('그 밖에는 전부 "아직 안 고름"이다', () => {
    for (const junk of [null, 'auto', 'Dark', 42, {}]) expect(readStoredChoice(junk)).toBeNull()
  })
})

describe('nextTheme', () => {
  it('두 상태를 오간다', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('light')
    expect(nextTheme(nextTheme('light'))).toBe('light')
  })
})
