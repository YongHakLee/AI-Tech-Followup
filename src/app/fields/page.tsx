import type { Metadata } from 'next'
import { FieldRow } from '@/components/field-row'
import { getSiteData, itemsByField, peopleById } from '@/lib/content'

export const metadata: Metadata = { title: '분야별 · AI Tech Followup' }

export default async function FieldsPage() {
  const data = await getSiteData()
  const people = peopleById(data)

  const rows = data.fields.map((field) => ({
    field,
    items: itemsByField(data, field.key),
  }))
  const hasAny = rows.some((row) => row.items.length > 0)

  return (
    <div>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">분야별</h1>
      {hasAny ? (
        rows.map(({ field, items }) => (
          <FieldRow key={field.key} field={field} items={items} people={people} />
        ))
      ) : (
        <p className="text-sm text-muted-foreground">아직 수집된 항목이 없습니다.</p>
      )}
    </div>
  )
}
