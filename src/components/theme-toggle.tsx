'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useSyncExternalStore } from 'react'
import {
  nextTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemeChoice,
} from '@/lib/theme'

/*
 * 테마는 리액트 바깥에 있는 상태다 — localStorage에 저장되고, 시스템 설정이
 * 바꾸고, 첫 페인트 전 인라인 스크립트가 이미 한 번 읽는다. 그래서 useState +
 * useEffect로 흉내내지 않고 외부 스토어로 구독한다. 서버 스냅샷이 null이라
 * 하이드레이션 시점에는 아무 아이콘도 그리지 않고, 그 뒤 실제 값으로 다시 그린다.
 */

let listeners: (() => void)[] = []

function readStored(): unknown {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY)
  } catch {
    // 사생활 보호 모드 등에서 접근이 막힐 수 있다. 시스템 설정으로 간다.
    return null
  }
}

function subscribe(onChange: () => void): () => void {
  listeners.push(onChange)
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onChange)
  // 다른 탭에서 바꾼 선택도 따라간다. 같은 탭의 쓰기는 storage 이벤트를 내지
  // 않으므로 아래 emit()이 따로 알린다.
  window.addEventListener('storage', onChange)
  return () => {
    listeners = listeners.filter((l) => l !== onChange)
    media.removeEventListener('change', onChange)
    window.removeEventListener('storage', onChange)
  }
}

function getSnapshot(): ThemeChoice {
  return resolveTheme(readStored(), window.matchMedia('(prefers-color-scheme: dark)').matches)
}

function getServerSnapshot(): null {
  return null
}

function emit(): void {
  for (const listener of listeners) listener()
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    if (theme === null) return
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  function choose() {
    const target = nextTheme(theme ?? 'light')
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, target)
    } catch {
      // 저장이 막혀도 이번 방문 동안은 동작해야 하므로 클래스는 바로 바꾼다.
      document.documentElement.classList.toggle('dark', target === 'dark')
    }
    emit()
  }

  // 마운트 전에는 어느 모드인지 알 수 없다. 그때 "다크 모드로 전환"이라고 하면
  // 이미 다크로 보고 있는 사람에게 거짓말이 된다.
  const label =
    theme === null ? '테마 전환' : theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'

  return (
    <button
      type="button"
      onClick={choose}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {theme === null ? (
        <span className="size-4" aria-hidden />
      ) : theme === 'dark' ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </button>
  )
}
