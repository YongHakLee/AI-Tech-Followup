import { getSiteData, peopleById } from '@/lib/content'

export const dynamic = 'force-static'

const SITE_URL = process.env.SITE_URL ?? 'https://ai-tech-followup.vercel.app'
const MAX_ENTRIES = 50

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET(): Promise<Response> {
  const data = await getSiteData()
  const people = peopleById(data)

  const entries = data.items
    .slice(0, MAX_ENTRIES)
    .map((item) => {
      const authors = item.personIds.map((id) => people.get(id)?.nameKo ?? id).join(', ')
      const description = `${item.summaryKo ?? item.excerpt}\n\n— ${authors} · ${item.sourceName}`
      return [
        '    <item>',
        `      <title>${escapeXml(item.title)}</title>`,
        `      <link>${escapeXml(item.url)}</link>`,
        `      <guid isPermaLink="false">${item.id}</guid>`,
        `      <pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(description)}</description>`,
        '    </item>',
      ].join('\n')
    })
    .join('\n')

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '  <channel>',
    '    <title>AI Tech Followup</title>',
    `    <link>${SITE_URL}</link>`,
    '    <description>AI 분야 연구자와 기술자들의 새 글·논문·강연을 한국어 요약으로 따라갑니다.</description>',
    '    <language>ko</language>',
    entries,
    '  </channel>',
    '</rss>',
  ].join('\n')

  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8' },
  })
}
