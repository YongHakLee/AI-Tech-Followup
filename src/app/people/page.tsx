import type { Metadata } from 'next'
import { PersonCard } from '@/components/person-card'
import { getSiteData, itemsByPerson } from '@/lib/content'

export const metadata: Metadata = { title: '인물 · AI Tech Followup' }

export default async function PeoplePage() {
  const data = await getSiteData()

  const sections = data.fields
    .map((field) => ({
      field,
      members: data.people.filter((person) => person.fields.includes(field.key)),
    }))
    .filter((section) => section.members.length > 0)

  return (
    <div>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">인물</h1>
      {sections.length > 0 ? (
        sections.map(({ field, members }) => (
          <section key={field.key} className="mb-10">
            <h2 className="mb-4 text-lg font-semibold">{field.nameKo}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {members.map((person) => (
                <PersonCard
                  key={person.id}
                  person={person}
                  count={itemsByPerson(data, person.id).length}
                />
              ))}
            </div>
          </section>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">아직 등록된 인물이 없습니다.</p>
      )}
    </div>
  )
}
