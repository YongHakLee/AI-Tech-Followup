import Link from 'next/link'
import { ItemCard } from '@/components/item-card'
import { PersonAvatar } from '@/components/person-avatar'
import {
  fieldsOfItem,
  getHighlight,
  getSiteData,
  peopleById,
  resolvePicks,
  type Person,
} from '@/lib/content'
import { weekLabel } from '@/lib/format'
import { isoWeek, itemsInWeek } from '../../pipeline/week'

export default async function HomePage() {
  const data = await getSiteData()
  const people = peopleById(data)

  const latestWeek = data.weeks[0] ?? isoWeek(new Date())
  const highlight = await getHighlight(latestWeek)
  const weekItems = itemsInWeek(data.items, latestWeek)
  const picks = resolvePicks(highlight, data.items)

  const activePeople = [...new Set(weekItems.flatMap((item) => item.personIds))]
    .map((id) => people.get(id))
    .filter((person): person is Person => person !== undefined)

  const fieldCounts = data.fields
    .map((field) => ({
      field,
      count: weekItems.filter((item) => fieldsOfItem(item, people).includes(field.key)).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)

  return (
    <div>
      <section className="mb-12">
        <div className="mb-1 text-sm text-muted-foreground">{weekLabel(latestWeek)} 하이라이트</div>
        <p className="mb-8 text-2xl font-semibold leading-snug tracking-tight">
          {highlight?.intro ?? '아직 수집된 항목이 없습니다.'}
        </p>

        {picks.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            {picks.map(({ item, reason }, index) => (
              <div key={item.id} className={index === 0 ? 'md:col-span-3' : ''}>
                <ItemCard item={item} people={people} emphasis={index === 0} />
                <p className="mt-2 px-1 text-xs text-muted-foreground">{reason}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {activePeople.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold">이번 주 활동한 사람</h2>
          <div className="flex flex-wrap gap-5">
            {activePeople.map((person) => (
              <Link
                key={person.id}
                href={`/people/${person.id}`}
                className="flex w-20 flex-col items-center gap-2 text-center"
              >
                <PersonAvatar person={person} size={56} />
                <span className="text-xs leading-tight text-muted-foreground">{person.nameKo}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {fieldCounts.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold">분야별</h2>
          <div className="flex flex-wrap gap-2">
            {fieldCounts.map(({ field, count }) => (
              <Link
                key={field.key}
                href={`/fields/${field.key}`}
                className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              >
                {field.nameKo} <span className="text-xs">{count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">최근 올라온 것</h2>
        {data.items.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.slice(0, 12).map((item) => (
              <ItemCard key={item.id} item={item} people={people} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">아직 수집된 항목이 없습니다.</p>
        )}
      </section>
    </div>
  )
}
