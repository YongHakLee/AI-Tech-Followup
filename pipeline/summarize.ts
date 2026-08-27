import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { ItemType } from './schema'

export const SUMMARY_MODEL = 'claude-sonnet-5'

export interface SummarizeInput {
  title: string
  excerpt: string
  type: ItemType
  personNames: string[]
  allowedTags: string[]
}

export interface SummarizeOutput {
  summaryKo: string
  tags: string[]
}

export interface Summarizer {
  summarize(input: SummarizeInput): Promise<SummarizeOutput>
}

const ResponseSchema = z.object({
  summaryKo: z.string(),
  tags: z.array(z.string()),
})

const TYPE_LABEL: Record<ItemType, string> = {
  blog: '블로그 글',
  paper: '논문',
  video: '영상',
}

export function buildPrompt(input: SummarizeInput): string {
  const body = input.excerpt.trim()
  const excerptSection = body
    ? `발췌/초록:\n${body}`
    : '발췌/초록: (제공되지 않음 — 제목만 보고 판단할 것)'

  return [
    `다음은 AI 분야 인물의 ${TYPE_LABEL[input.type]}입니다. 한국어로 요약하세요.`,
    '',
    `제목: ${input.title}`,
    `저자/발표자: ${input.personNames.join(', ')}`,
    excerptSection,
    '',
    '규칙:',
    '- summaryKo: 정확히 3문장. 무엇을 다루는지, 핵심 주장이나 결과, 왜 볼 만한지 순서로 쓴다.',
    '- 발췌에 없는 사실을 지어내지 않는다. 근거가 부족하면 단정하지 말고 범위를 좁혀 쓴다.',
    '- 원문의 문장을 그대로 번역해 옮기지 말고 요약한다.',
    '- 과장된 수식어("혁신적인", "충격적인")를 쓰지 않는다.',
    `- tags: 아래 목록에서만 고른다. 최대 3개, 해당 없으면 빈 배열.`,
    `  ${input.allowedTags.join(', ')}`,
  ].join('\n')
}

export function sanitizeOutput(raw: SummarizeOutput, allowedTags: string[]): SummarizeOutput {
  const summaryKo = raw.summaryKo.trim()
  if (!summaryKo) throw new Error('요약이 비어 있습니다')
  const allowed = new Set(allowedTags)
  const tags = [...new Set(raw.tags.map((t) => t.trim()))]
    .filter((t) => allowed.has(t))
    .slice(0, 3)
  return { summaryKo, tags }
}

export function createAnthropicSummarizer(options: { apiKey?: string } = {}): Summarizer {
  const client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {})

  return {
    async summarize(input) {
      const response = await client.messages.parse({
        model: SUMMARY_MODEL,
        max_tokens: 1024,
        thinking: { type: 'disabled' },
        output_config: {
          effort: 'low',
          format: zodOutputFormat(ResponseSchema),
        },
        messages: [{ role: 'user', content: buildPrompt(input) }],
      })

      const parsed = response.parsed_output
      if (!parsed) throw new Error('구조화 출력 파싱에 실패했습니다')
      return sanitizeOutput(parsed, input.allowedTags)
    },
  }
}
