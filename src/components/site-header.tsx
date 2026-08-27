import Link from 'next/link'
import { SiteNav } from '@/components/site-nav'
import { ThemeToggle } from '@/components/theme-toggle'

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          AI Tech Followup
        </Link>
        <div className="flex items-center gap-5">
          <SiteNav />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
