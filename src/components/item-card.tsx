import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { Item, Person } from '@/lib/content'
import { formatDate, TYPE_LABEL } from '@/lib/format'

export function ItemCard({
  item,
  people,
  emphasis = false,
}: {
  item: Item
  people: Map<string, Person>
  emphasis?: boolean
}) {
  const authors = item.personIds.map((id) => people.get(id)).filter((p): p is Person => Boolean(p))

  return (
    <article
      className={`group flex h-full flex-col gap-3 rounded-xl border bg-card p-5 transition-colors hover:border-primary/45 ${
        emphasis ? 'border-primary/45 ring-1 ring-primary/15' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{TYPE_LABEL[item.type]}</Badge>
        <span>{item.sourceName}</span>
        <span aria-hidden>·</span>
        <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
      </div>

      <h3 className={emphasis ? 'text-xl font-semibold leading-snug' : 'text-base font-semibold leading-snug'}>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-4 hover:underline"
        >
          {item.title}
        </a>
      </h3>

      <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
        {item.summaryKo ?? item.excerpt}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {authors.map((person) => (
          <Link
            key={person.id}
            href={`/people/${person.id}`}
            className="text-muted-foreground hover:text-foreground"
          >
            {person.name}
          </Link>
        ))}
      </div>
    </article>
  )
}
