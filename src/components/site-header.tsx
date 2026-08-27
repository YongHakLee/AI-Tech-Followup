import Link from 'next/link'

const NAV = [
  { href: '/fields', label: '분야' },
  { href: '/people', label: '인물' },
  { href: '/weekly', label: '주간' },
]

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          AI Tech Followup
        </Link>
        <nav className="flex gap-5 text-sm text-muted-foreground">
          {NAV.map((entry) => (
            <Link key={entry.href} href={entry.href} className="hover:text-foreground">
              {entry.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
