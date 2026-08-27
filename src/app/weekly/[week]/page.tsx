import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ItemCard } from '@/components/item-card'
import { getHighlight, getSiteData, peopleById, resolvePicks } from '@/lib/content'
import { weekLabel } from '@/lib/format'
import { itemsInWeek } from '../../../../pipeline/week'

type Params = { params: Promise<{ week: string }> }

export async function generateStaticParams() {
  const data = await getSiteData()
  return data.weeks.map((week) => ({ week }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { week } = await params
  return { title: `${weekLabel(week)} · AI Tech Followup` }
}

export default async function WeekPage({ params }: Params) {
  const { week } = await params
  const data = await getSiteData()
  if (!data.weeks.includes(week)) notFound()

  const people = peopleById(data)
  const highlight = await getHighlight(week)
  const items = itemsInWeek(data.items, week)
  const picks = resolvePicks(highlight, data.items)
  const pickIds = new Set(picks.map((p) => p.item.id))
  const remainingItems = items.filter((item) => !pickIds.has(item.id))
  // Once every item in the week is already shown as a highlight above, "이번 주 전체"
  // (this week overall) would still be true of the count but not of what this section
  // renders, so the label switches to "나머지" (the rest) to match the filtered list.
  const restSectionTitle = picks.length > 0 ? '이번 주 나머지' : '이번 주 전체'

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">{weekLabel(week)}</h1>
      <p className="mb-10 leading-relaxed text-muted-foreground">{highlight?.intro}</p>

      {picks.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold">하이라이트</h2>
          <div className="grid gap-4">
            {picks.map(({ item, reason }) => (
              <div key={item.id}>
                <ItemCard item={item} people={people} emphasis />
                <p className="mt-2 px-1 text-xs text-muted-foreground">{reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">
          {restSectionTitle} ({remainingItems.length})
        </h2>
        {remainingItems.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {remainingItems.map((item) => (
              <ItemCard key={item.id} item={item} people={people} />
            ))}
          </div>
        ) : picks.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            이번 주 항목은 모두 위 하이라이트에 포함되어 있습니다.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">아직 수집된 항목이 없습니다.</p>
        )}
      </section>
    </div>
  )
}
