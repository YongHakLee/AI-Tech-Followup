import type { Metadata } from 'next'
import Link from 'next/link'
import { getHighlight, getSiteData } from '@/lib/content'
import { weekLabel } from '@/lib/format'
import { itemsInWeek } from '../../../pipeline/week'

export const metadata: Metadata = { title: '주간 아카이브 · AI Tech Followup' }

export default async function WeeklyIndexPage() {
  const data = await getSiteData()
  const rows = await Promise.all(
    data.weeks.map(async (week) => ({
      week,
      intro: (await getHighlight(week))?.intro ?? '',
      count: itemsInWeek(data.items, week).length,
    })),
  )

  return (
    <div>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">주간 아카이브</h1>
      {rows.length > 0 ? (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.week} className="py-5">
              <Link href={`/weekly/${row.week}`} className="group block">
                <div className="text-sm text-muted-foreground">
                  {weekLabel(row.week)} · {row.count}건
                </div>
                <p className="mt-1 leading-snug group-hover:underline">{row.intro}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">아직 아카이브가 없습니다.</p>
      )}
    </div>
  )
}
