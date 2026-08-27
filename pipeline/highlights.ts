import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { Highlight, Item } from './schema'

export const CURATOR_MODEL = 'claude-sonnet-5'
const MAX_PICKS = 3

export interface Pick {
  itemId: string
  reason: string
}

export interface CurateResult {
  intro: string
  picks: Pick[]
}

export interface Curator {
  curate(items: Item[]): Promise<CurateResult>
}

const CurateSchema = z.object({
  intro: z.string(),
  picks: z.array(z.object({ itemId: z.string(), reason: z.string() })),
})

const TYPE_WEIGHT: Record<Item['type'], number> = { paper: 3, blog: 2, video: 1 }

const TYPE_REASON: Record<Item['type'], string> = {
  paper: '이번 주 새로 공개된 논문',
  blog: '이번 주 발행된 글',
  video: '이번 주 공개된 영상',
}

export function heuristicPicks(items: Item[]): Pick[] {
  return items
    .map((item) => ({
      item,
      score: TYPE_WEIGHT[item.type] * 10 + item.personIds.length,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return b.item.publishedAt.localeCompare(a.item.publishedAt)
    })
    .slice(0, MAX_PICKS)
    .map(({ item }) => ({
      itemId: item.id,
      reason: `${TYPE_REASON[item.type]} · ${item.personIds.length}명 관련`,
    }))
}

function heuristicIntro(items: Item[]): string {
  if (items.length === 0) return '이번 주에는 새로 수집된 항목이 없습니다.'
  const papers = items.filter((i) => i.type === 'paper').length
  const posts = items.filter((i) => i.type === 'blog').length
  const videos = items.filter((i) => i.type === 'video').length
  const parts = [
    papers > 0 ? `논문 ${papers}건` : null,
    posts > 0 ? `글 ${posts}건` : null,
    videos > 0 ? `영상 ${videos}건` : null,
  ].filter((p): p is string => p !== null)
  return `이번 주에는 ${parts.join(', ')}이 올라왔습니다.`
}

export async function buildHighlight(
  weekItems: Item[],
  week: string,
  curator: Curator | null,
  now: Date,
): Promise<Highlight> {
  const base = {
    week,
    generatedAt: now.toISOString(),
  }

  if (curator && weekItems.length > 0) {
    try {
      const result = await curator.curate(weekItems)
      const known = new Set(weekItems.map((i) => i.id))
      const picks = result.picks.filter((p) => known.has(p.itemId)).slice(0, MAX_PICKS)
      const intro = result.intro.trim()
      if (picks.length > 0 && intro) {
        return { ...base, intro, picks, origin: 'llm' }
      }
    } catch {
      // 폴백으로 내려간다
    }
  }

  return {
    ...base,
    intro: heuristicIntro(weekItems),
    picks: heuristicPicks(weekItems),
    origin: 'heuristic',
  }
}

export function createAnthropicCurator(options: { apiKey?: string } = {}): Curator {
  const client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {})

  return {
    async curate(items) {
      const list = items
        .map(
          (item) =>
            `- itemId: ${item.id}\n  종류: ${item.type}\n  제목: ${item.title}\n  요약: ${item.summaryKo ?? item.excerpt}`,
        )
        .join('\n')

      const prompt = [
        '아래는 이번 주에 수집된 AI 분야 콘텐츠 목록입니다.',
        '이 중 이번 주에 가장 주목할 만한 3건을 고르고, 한 주의 흐름을 요약하세요.',
        '',
        list,
        '',
        '규칙:',
        '- picks: 정확히 3건. itemId는 위 목록에 있는 값을 그대로 쓴다.',
        '- reason: 왜 골랐는지 한 문장. 목록에 없는 사실을 지어내지 않는다.',
        '- intro: 이번 주 흐름을 2문장으로. 특정 항목 나열이 아니라 흐름을 말한다.',
        '- 과장된 수식어를 쓰지 않는다.',
      ].join('\n')

      const response = await client.messages.parse({
        model: CURATOR_MODEL,
        max_tokens: 2048,
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'medium',
          format: zodOutputFormat(CurateSchema),
        },
        messages: [{ role: 'user', content: prompt }],
      })

      const parsed = response.parsed_output
      if (!parsed) throw new Error('큐레이터 구조화 출력 파싱 실패')
      return parsed
    },
  }
}
