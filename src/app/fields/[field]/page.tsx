import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ItemCard } from '@/components/item-card'
import { fieldName, getSiteData, itemsByField, peopleById } from '@/lib/content'

type Params = { params: Promise<{ field: string }> }

export async function generateStaticParams() {
  const data = await getSiteData()
  return data.fields.map((field) => ({ field: field.key }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { field } = await params
  const data = await getSiteData()
  return { title: `${fieldName(data, field)} · AI Tech Followup` }
}

export default async function FieldPage({ params }: Params) {
  const { field } = await params
  const data = await getSiteData()
  if (!data.fields.some((f) => f.key === field)) notFound()

  const people = peopleById(data)
  const items = itemsByField(data, field)

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">{fieldName(data, field)}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{items.length}건</p>
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
