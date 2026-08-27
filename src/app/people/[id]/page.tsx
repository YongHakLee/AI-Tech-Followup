import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ItemCard } from '@/components/item-card'
import { PersonAvatar } from '@/components/person-avatar'
import { fieldName, getSiteData, itemsByPerson, peopleById } from '@/lib/content'

type Params = { params: Promise<{ id: string }> }

export async function generateStaticParams() {
  const data = await getSiteData()
  return data.people.map((person) => ({ id: person.id }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const data = await getSiteData()
  const person = data.people.find((p) => p.id === id)
  return { title: `${person?.name ?? id} · AI Tech Followup` }
}

export default async function PersonPage({ params }: Params) {
  const { id } = await params
  const data = await getSiteData()
  const person = data.people.find((p) => p.id === id)
  if (!person) notFound()

  const people = peopleById(data)
  const items = itemsByPerson(data, person.id)
  const links = Object.entries(person.links) as [string, string][]

  return (
    <div>
      <header className="mb-10 flex flex-wrap items-start gap-5">
        <PersonAvatar person={person} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{person.name}</h1>
          <p className="mt-2 text-sm">
            {person.affiliation}
            {person.formerly.length > 0 && (
              <span className="text-muted-foreground"> · 전 {person.formerly.join(', ')}</span>
            )}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{person.bio}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {person.fields.map((key) => (
              <span key={key} className="rounded-full border border-border px-2.5 py-0.5 text-xs">
                {fieldName(data, key)}
              </span>
            ))}
          </div>

          {links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              {links.map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {label}
                </a>
              ))}
            </div>
          )}
        </div>
      </header>

      <h2 className="mb-4 text-lg font-semibold">타임라인 ({items.length})</h2>
      {items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} people={people} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">아직 수집된 항목이 없습니다.</p>
      )}
    </div>
  )
}
