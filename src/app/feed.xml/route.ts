import { getSiteData, peopleById } from '@/lib/content'

export const dynamic = 'force-static'

const SITE_URL = process.env.SITE_URL ?? 'https://ai-tech-followup.vercel.app'
const MAX_ENTRIES = 50

/**
 * XML 1.0은 대부분의 C0 제어문자를 문서 어디에도 허용하지 않는다 — 이스케이프한
 * 참조(&#x1;)로도 안 된다. 항목 제목은 서드파티 피드에서 온 문자열이 trim만 거쳐
 * 그대로 들어오므로, 제어문자 하나가 섞이면 /feed.xml 전체가 모든 리더에서 파싱
 * 불가가 된다. force-static이라 다음 빌드까지 그 상태로 고정된다. 그래서 버린다.
 */
function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 날짜가 깨졌으면 리터럴 "Invalid Date"를 내보내느니 pubDate를 빼는 편이 낫다. */
function rfc822(iso: string): string | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date.toUTCString()
}

export async function GET(): Promise<Response> {
  const data = await getSiteData()
  const people = peopleById(data)

  const entries = data.items
    .slice(0, MAX_ENTRIES)
    .map((item) => {
      const authors = item.personIds.map((id) => people.get(id)?.name ?? id).join(', ')
      const description = `${item.summaryKo ?? item.excerpt}\n\n— ${authors} · ${item.sourceName}`
      const pubDate = rfc822(item.publishedAt)
      return [
        '    <item>',
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(item.url)}</link>`,
        `      <guid isPermaLink="false">${escapeXml(item.id)}</guid>`,
        ...(pubDate ? [`      <pubDate>${pubDate}</pubDate>`] : []),
        `      <description>${escapeXml(description)}</description>`,
        '    </item>',
      ].join('\n')
    })

  // 첫 항목의 날짜가 깨졌다고 lastBuildDate 자체를 버릴 이유는 없다.
  const lastBuildDate = data.items.map((item) => rfc822(item.publishedAt)).find(Boolean) ?? null

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>AI Tech Followup</title>',
    `    <link>${escapeXml(SITE_URL)}</link>`,
    `    <atom:link href="${escapeXml(`${SITE_URL}/feed.xml`)}" rel="self" type="application/rss+xml"/>`,
    '    <description>AI 분야 연구자와 기술자들의 새 글·논문·강연을 한국어 요약으로 따라갑니다.</description>',
    '    <language>ko</language>',
    ...(lastBuildDate ? [`    <lastBuildDate>${lastBuildDate}</lastBuildDate>`] : []),
    ...entries,
    '  </channel>',
    '</rss>',
  ].join('\n')

  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  })
}
