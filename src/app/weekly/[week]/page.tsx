import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ItemCard } from '@/components/item-card'
import { getHighlight, getSiteData, peopleById, resolvePicks, splitWeekItems } from '@/lib/content'
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
  // 픽은 반드시 이 주의 항목 안에서만 푼다. 사이트 전체(data.items)에서 풀면 다른
  // 주의 항목이 이 주의 하이라이트로 딸려 들어오고, 그 주에 항목이 하나도 없어도
  // "모두 위 하이라이트에 포함되어 있습니다"가 찍힌다.
  const picks = resolvePicks(highlight, items)
  const { remaining, allPicked } = splitWeekItems(items, picks)
  // 그 주 항목이 전부 하이라이트로 올라가면 "이번 주 전체"는 개수로는 참이어도
  // 이 섹션이 실제로 그리는 목록과는 어긋난다. 그래서 라벨을 "나머지"로 바꾼다.
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
          {restSectionTitle} ({remaining.length})
        </h2>
        {remaining.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {remaining.map((item) => (
              <ItemCard key={item.id} item={item} people={people} />
            ))}
          </div>
        ) : allPicked ? (
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
