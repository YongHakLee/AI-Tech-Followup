import Image from 'next/image'
import type { Person } from '@/lib/content'
import { Monogram } from './monogram'

export function PersonAvatar({ person, size = 48 }: { person: Person; size?: number }) {
  if (!person.avatar) return <Monogram name={person.name} seed={person.id} size={size} />
  return (
    <Image
      src={person.avatar}
      alt={person.name}
      width={size}
      height={size}
      unoptimized
      className="shrink-0 rounded-full object-cover"
    />
  )
}
