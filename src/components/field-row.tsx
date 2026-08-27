import Link from 'next/link'
import { ItemCard } from '@/components/item-card'
import type { Field, Item, Person } from '@/lib/content'

export function FieldRow({
  field,
  items,
  people,
  limit = 6,
}: {
  field: Field
  items: Item[]
  people: Map<string, Person>
  limit?: number
}) {
  if (items.length === 0) return null

  return (
    <section className="mb-12">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{field.nameKo}</h2>
        <Link
          href={`/fields/${field.key}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          더보기 ({items.length}) →
        </Link>
      </div>
      <div className="-mx-6 overflow-x-auto px-6">
        <div className="flex gap-4 pb-2">
          {items.slice(0, limit).map((item) => (
            <div key={item.id} className="w-[19rem] shrink-0">
              <ItemCard item={item} people={people} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
