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
  // 색상만 인물에서 나오고, 명도·채도는 테마가 정한다. 예전에는 세 값이 모두
  // 하드코딩이라 다크 모드에서 원이 배경에 묻혔다 — 인물 고유 색은 이 사이트의
  // 시그니처라 한쪽 모드에서만 살아서는 안 된다.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={name}
      className="monogram shrink-0 rounded-full"
      style={{ '--mono-h': h } as React.CSSProperties}
    >
      <rect width="48" height="48" rx="24" className="monogram-disc" />
      <text
        x="24"
        y="24"
        dy="0.35em"
        textAnchor="middle"
        fontSize="18"
        fontWeight="600"
        className="monogram-initials"
        fontFamily="var(--font-geist-sans), system-ui, sans-serif"
      >
        {initials(name)}
      </text>
    </svg>
  )
}
