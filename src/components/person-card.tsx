import Link from 'next/link'
import type { Person } from '@/lib/content'
import { PersonAvatar } from './person-avatar'

export function PersonCard({ person, count }: { person: Person; count: number }) {
  return (
    <Link
      href={`/people/${person.id}`}
      className="flex items-center gap-4 rounded-xl border border-border p-4 transition-colors hover:border-foreground/30"
    >
      <PersonAvatar person={person} size={48} />
      <div className="min-w-0">
        <div className="truncate font-semibold">{person.nameKo}</div>
        <div className="truncate text-sm text-muted-foreground">{person.affiliation}</div>
        <div className="mt-1 text-xs text-muted-foreground">{count}건</div>
      </div>
    </Link>
  )
}
