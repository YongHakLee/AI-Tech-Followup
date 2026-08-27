import { createHash } from 'node:crypto'

const TRACKING_PARAM = /^(utm_|mc_|_hs|hsa_)|^(fbclid|gclid|ref|ref_src|igshid|si|source|amp)$/i

export function normalizeUrl(raw: string): string {
  const url = new URL(raw.trim())

  if (url.hostname.toLowerCase().replace(/^www\./, '') === 'youtu.be') {
    const videoId = url.pathname.replace(/^\//, '')
    url.hostname = 'youtube.com'
    url.pathname = '/watch'
    url.search = ''
    url.searchParams.set('v', videoId)
  }

  url.protocol = 'https:'
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  url.hash = ''
  url.port = ''

  const kept = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a], [b]) => a.localeCompare(b))
  url.search = ''
  for (const [key, value] of kept) url.searchParams.append(key, value)

  let pathname = url.pathname
  if (url.hostname === 'arxiv.org') {
    pathname = pathname.replace(/^\/pdf\//, '/abs/').replace(/\.pdf$/, '')
    pathname = pathname.replace(/^(\/abs\/.+?)v\d+$/, '$1')
  }
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '')
  url.pathname = pathname

  return url.toString()
}

export function itemId(url: string): string {
  return createHash('sha1').update(normalizeUrl(url)).digest('hex')
}
