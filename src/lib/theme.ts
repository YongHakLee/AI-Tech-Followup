export type ThemeChoice = 'light' | 'dark'
/** 사용자가 고른 값. null이면 아직 고르지 않았고 시스템 설정을 따른다. */
export type StoredChoice = ThemeChoice | null

export const THEME_STORAGE_KEY = 'ai-tech-followup:theme'

/**
 * 저장된 값이 없으면 시스템 설정을 따르고, 있으면 그것이 이긴다.
 *
 * 저장된 값을 신뢰하지 않고 검사하는 이유: localStorage는 다른 탭·확장·사용자가
 * 쓴 임의의 문자열일 수 있고, 그때 조용히 라이트로 떨어지는 것보다 시스템 설정으로
 * 돌아가는 편이 낫다.
 */
export function resolveTheme(stored: unknown, systemPrefersDark: boolean): ThemeChoice {
  if (stored === 'light' || stored === 'dark') return stored
  return systemPrefersDark ? 'dark' : 'light'
}

export function readStoredChoice(raw: unknown): StoredChoice {
  return raw === 'light' || raw === 'dark' ? raw : null
}

export function nextTheme(current: ThemeChoice): ThemeChoice {
  return current === 'dark' ? 'light' : 'dark'
}
