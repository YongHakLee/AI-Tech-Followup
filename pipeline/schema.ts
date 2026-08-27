import { z } from 'zod'

export const FieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  nameKo: z.string().min(1),
})
export type Field = z.infer<typeof FieldSchema>

export const SourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rss'), url: z.url() }),
  z.object({ type: z.literal('youtube'), channelId: z.string().regex(/^UC[\w-]{22}$/) }),
  z.object({ type: z.literal('arxiv'), author: z.string().min(1) }),
])
export type Source = z.infer<typeof SourceSchema>

export const PersonSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  affiliation: z.string().min(1),
  formerly: z.array(z.string()).default([]),
  fields: z.array(z.string().min(1)).min(1),
  bio: z.string().min(1),
  links: z
    .object({
      homepage: z.url().optional(),
      x: z.url().optional(),
      github: z.url().optional(),
      scholar: z.url().optional(),
    })
    .default({}),
  avatar: z.url().nullable().default(null),
  sources: z.array(SourceSchema).min(1),
})
export type Person = z.infer<typeof PersonSchema>

export const ItemTypeSchema = z.enum(['blog', 'paper', 'video'])
export type ItemType = z.infer<typeof ItemTypeSchema>

export const ItemSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{40}$/),
  personIds: z.array(z.string()).min(1),
  type: ItemTypeSchema,
  title: z.string().min(1),
  url: z.url(),
  publishedAt: z.string(),
  collectedAt: z.string(),
  lang: z.string(),
  sourceName: z.string(),
  excerpt: z.string().max(600),
  summaryKo: z.string().nullable(),
  tags: z.array(z.string()).max(3),
})
export type Item = z.infer<typeof ItemSchema>

export const SourceStateSchema = z.object({
  lastRunAt: z.string().nullable(),
  seenIds: z.array(z.string()),
  consecutiveFailures: z.number().int().min(0),
  lastError: z.string().nullable(),
})
export type SourceState = z.infer<typeof SourceStateSchema>

export const StateSchema = z.object({
  version: z.literal(1),
  sources: z.record(z.string(), SourceStateSchema),
})
export type State = z.infer<typeof StateSchema>

export const HighlightSchema = z.object({
  week: z.string().regex(/^\d{4}-W\d{2}$/),
  generatedAt: z.string(),
  intro: z.string(),
  picks: z
    .array(z.object({ itemId: z.string(), reason: z.string() }))
    .max(3),
  origin: z.enum(['llm', 'heuristic']),
})
export type Highlight = z.infer<typeof HighlightSchema>

export const EMPTY_STATE: State = { version: 1, sources: {} }
