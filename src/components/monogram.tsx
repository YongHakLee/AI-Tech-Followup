function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function hue(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360
  }
  return hash
}

export function Monogram({
  name,
  seed,
  size = 48,
}: {
  name: string
  seed: string
  size?: number
}) {
  const h = hue(seed)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={name}
      className="shrink-0 rounded-full"
    >
      <rect width="48" height="48" rx="24" fill={`hsl(${h} 60% 22%)`} />
      <text
        x="24"
        y="24"
        dy="0.35em"
        textAnchor="middle"
        fontSize="18"
        fontWeight="600"
        fill={`hsl(${h} 70% 82%)`}
        fontFamily="system-ui, sans-serif"
      >
        {initials(name)}
      </text>
    </svg>
  )
}
