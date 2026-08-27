'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/fields', label: '분야' },
  { href: '/people', label: '인물' },
  { href: '/weekly', label: '주간' },
]

export function SiteNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-5 text-sm">
      {NAV.map((entry) => {
        // /people/simon-willison 처럼 하위 경로에 있어도 그 구역이 활성이어야 한다.
        const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`)
        return (
          <Link
            key={entry.href}
            href={entry.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'font-medium text-foreground underline decoration-primary decoration-2 underline-offset-[6px]'
                : 'text-muted-foreground transition-colors hover:text-foreground'
            }
          >
            {entry.label}
          </Link>
        )
      })}
    </nav>
  )
}
