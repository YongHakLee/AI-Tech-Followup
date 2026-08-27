# AI Tech Followup 1단계 — 스스로 갱신되는 정적 사이트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RSS·arXiv·YouTube에서 지정한 인물들의 새 콘텐츠를 6시간마다 자동 수집해 한국어로 요약하고, 사람 손 없이 갱신되는 정적 사이트로 발행한다.

**Architecture:** GitHub Actions가 수집·요약 스크립트를 실행해 결과 JSON을 레포에 커밋하고, 그 push를 Vercel이 감지해 정적 사이트를 재배포한다. 원문 본문은 크롤링하지도 저장하지도 않으며 요약과 링크만 보관한다. 상시 실행되는 서버나 콘텐츠 데이터베이스가 없다.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Zod v4 · rss-parser · fast-xml-parser · `@anthropic-ai/sdk` · Vitest · GitHub Actions · Vercel

**설계 문서:** `docs/superpowers/specs/2026-08-27-ai-tech-followup-design.md`

## Global Constraints

이 절의 규칙은 모든 태스크의 요구사항에 암묵적으로 포함된다.

- **원문 본문을 크롤링하지 않는다.** 피드가 스스로 제공한 발췌·초록만 사용한다. HTTP 요청은 피드/API 엔드포인트에만 보낸다.
- **`excerpt` 필드는 최대 600자.** 초과분은 잘라낸다.
- **요약 모델은 `claude-sonnet-5`.** 모델 ID 문자열은 그대로 쓰며 날짜 접미사를 붙이지 않는다.
- **태그는 `registry/fields.yaml`의 `key` 목록 안에서만** 나올 수 있고 항목당 최대 3개다.
- **`registry/`는 사람만 편집하고, `content/`는 파이프라인만 커밋한다.** 파이프라인 코드가 `registry/`에 쓰기를 하면 안 된다.
- **Node 24, npm.** pnpm/yarn을 쓰지 않는다.
- 모든 외부 링크는 `target="_blank" rel="noopener noreferrer"`.
- 커밋 메시지는 Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- 파일 경로는 레포 루트 `/mnt/nas4/lyh/github/AI-Tech-Followup` 기준 상대 경로다.

## File Structure

```
pipeline/
  schema.ts            Zod 스키마와 타입 (Person, Field, Item, State, Highlight)
  registry.ts          registry/ YAML 로드 + 검증
  normalize.ts         URL 정규화, 아이템 ID 생성
  week.ts              ISO 주차 계산
  adapters/
    types.ts           RawItem, FetchContext 인터페이스
    util.ts            날짜 파싱, HTML 제거, 발췌 자르기
    rss.ts             블로그·뉴스레터 어댑터
    youtube.ts         YouTube 채널 어댑터
    arxiv.ts           arXiv 저자 어댑터
  store.ts             content/ 읽기·병합·쓰기
  summarize.ts         요약기 인터페이스 + Anthropic 구현
  highlights.ts        주간 하이라이트 (LLM + 휴리스틱 폴백)
  collect.ts           수집 진입점
  weekly.ts            하이라이트 진입점
  validate.ts          registry 검증 진입점 (CI용)

src/
  lib/content.ts       빌드타임 콘텐츠 로더
  lib/format.ts        날짜·라벨 포맷
  components/          Monogram, PersonAvatar, ItemCard, PersonCard, FieldRow, Header, Footer
  app/                 페이지 라우트

registry/people/*.yaml, registry/fields.yaml
content/items/, content/highlights/, content/state.json
.github/workflows/{ci,collect,weekly}.yml
.github/scripts/report-alerts.sh
```

경계 원칙: 어댑터는 네트워크 접근을 직접 하지 않고 주입받은 `FetchContext`를 통해서만 한다(테스트에서 네트워크 없이 검증 가능). 요약기는 인터페이스 뒤에 있어 `collect.ts` 테스트에서 스텁으로 대체된다. 사이트 코드(`src/`)는 `content/`와 `registry/`를 읽기만 하고 파이프라인 코드를 import하지 않는다(단, 타입과 순수 유틸은 공유한다).

---

### Task 1: 프로젝트 스캐폴딩과 CI

**Files:**
- Delete: `.superpowers/` (브라우저 목업 임시 디렉터리, git에 포함되지 않음)
- Create: 프로젝트 전체 (`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/*`)
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `.gitignore`
- Modify: `package.json` (scripts 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `npm test`, `npm run typecheck`, `npm run build` 명령. 이후 모든 태스크가 이 세 가지로 검증한다.

- [ ] **Step 1: 목업 디렉터리 정리**

```bash
cd /mnt/nas4/lyh/github/AI-Tech-Followup
rm -rf .superpowers
ls -a
```

기대: `.git`, `.gitignore`, `docs`만 남는다. `create-next-app`은 대상 디렉터리에 예상 밖 파일이 있으면 중단하는데, `.gitignore`와 `docs`는 허용 목록에 있어 문제없다.

- [ ] **Step 2: Next.js 앱 생성**

```bash
npx create-next-app@latest . \
  --typescript --tailwind --app --eslint --src-dir \
  --import-alias "@/*" --turbopack --use-npm --yes
```

기대: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx` 생성. 완료 후 `npx next --version`이 16.x를 출력한다.

- [ ] **Step 3: 의존성 설치**

```bash
npm i zod yaml rss-parser fast-xml-parser @anthropic-ai/sdk
npm i -D vitest tsx vite-tsconfig-paths
npx shadcn@latest init -d
npx shadcn@latest add badge card
```

기대: `src/components/ui/badge.tsx`와 `src/components/ui/card.tsx`가 생긴다. `zod`가 4.x인지 `npm ls zod`로 확인한다.

- [ ] **Step 4: Vitest 설정 파일 작성**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 5: 스모크 테스트 작성**

`tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it('runs typescript tests', () => {
    const answer: number = 1 + 1
    expect(answer).toBe(2)
  })
})
```

- [ ] **Step 6: package.json scripts 추가**

`package.json`의 `"scripts"`를 아래로 교체한다(`dev`/`build`/`start`/`lint`는 create-next-app이 넣은 값을 유지).

```json
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build --turbopack",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "collect": "tsx pipeline/collect.ts",
    "weekly": "tsx pipeline/weekly.ts",
    "validate:registry": "tsx pipeline/validate.ts"
  },
```

- [ ] **Step 7: .gitignore에 파이프라인 출력 디렉터리 추가**

`.gitignore` 끝에 추가:

```
.pipeline-out/
```

- [ ] **Step 8: 테스트·타입체크·빌드 실행**

```bash
npm test && npm run typecheck && npm run build
```

기대: 테스트 1건 PASS, 타입 에러 없음, 빌드 성공.

- [ ] **Step 9: CI 워크플로 작성**

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run validate:registry
      - run: npm run build
```

`validate:registry`는 Task 2에서 만든다. 그 전까지 CI는 그 단계에서 실패하는데, 이 워크플로는 GitHub 원격이 붙는 Task 14까지 실행되지 않으므로 문제되지 않는다.

- [ ] **Step 10: 커밋**

```bash
git add -A
git commit -m "chore: Next.js 16 + Vitest 스캐폴딩과 CI 워크플로"
```

---

### Task 2: 스키마와 registry 로더

**Files:**
- Create: `pipeline/schema.ts`
- Create: `pipeline/registry.ts`
- Create: `pipeline/validate.ts`
- Create: `registry/fields.yaml`
- Create: `registry/people/andrej-karpathy.yaml`, `registry/people/simon-willison.yaml`, `registry/people/lilian-weng.yaml`
- Test: `tests/registry.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `pipeline/schema.ts`: `Field`, `Source`, `Person`, `ItemType`, `Item`, `SourceState`, `State`, `Highlight` 타입과 동명의 `*Schema` Zod 객체
  - `pipeline/registry.ts`: `loadRegistry(root: string): Promise<{ people: Person[]; fields: Field[] }>` — 검증 실패 시 어떤 파일의 어떤 필드가 문제인지 담은 `Error`를 던진다

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/registry.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadRegistry } from '../pipeline/registry'

const FIELDS = `
- { key: llm, nameKo: LLM }
- { key: agents, nameKo: 에이전트 }
`

const VALID_PERSON = `
id: test-person
name: Test Person
nameKo: 테스트
affiliation: Somewhere
fields: [llm]
bio: 테스트용 인물.
links:
  homepage: https://example.com
sources:
  - { type: rss, url: https://example.com/feed.xml }
`

async function makeRoot(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'registry-'))
  await mkdir(path.join(root, 'registry/people'), { recursive: true })
  for (const [rel, body] of Object.entries(files)) {
    await writeFile(path.join(root, rel), body, 'utf8')
  }
  return root
}

describe('loadRegistry', () => {
  it('유효한 registry를 읽어 인물과 분야를 돌려준다', async () => {
    const root = await makeRoot({
      'registry/fields.yaml': FIELDS,
      'registry/people/test-person.yaml': VALID_PERSON,
    })
    const { people, fields } = await loadRegistry(root)
    expect(fields.map((f) => f.key)).toEqual(['llm', 'agents'])
    expect(people).toHaveLength(1)
    expect(people[0].id).toBe('test-person')
    expect(people[0].formerly).toEqual([])
    expect(people[0].avatar).toBeNull()
  })

  it('파일명과 id가 다르면 거부한다', async () => {
    const root = await makeRoot({
      'registry/fields.yaml': FIELDS,
      'registry/people/other-name.yaml': VALID_PERSON,
    })
    await expect(loadRegistry(root)).rejects.toThrow(/other-name/)
  })

  it('fields.yaml에 없는 분야 키를 거부한다', async () => {
    const root = await makeRoot({
      'registry/fields.yaml': FIELDS,
      'registry/people/test-person.yaml': VALID_PERSON.replace('[llm]', '[nonexistent]'),
    })
    await expect(loadRegistry(root)).rejects.toThrow(/nonexistent/)
  })

  it('필수 필드가 빠지면 파일명을 담은 에러를 던진다', async () => {
    const root = await makeRoot({
      'registry/fields.yaml': FIELDS,
      'registry/people/test-person.yaml': VALID_PERSON.replace('name: Test Person\n', ''),
    })
    await expect(loadRegistry(root)).rejects.toThrow(/test-person\.yaml/)
  })

  it('알 수 없는 소스 타입을 거부한다', async () => {
    const root = await makeRoot({
      'registry/fields.yaml': FIELDS,
      'registry/people/test-person.yaml': VALID_PERSON.replace(
        '{ type: rss, url: https://example.com/feed.xml }',
        '{ type: mastodon, url: https://example.com }',
      ),
    })
    await expect(loadRegistry(root)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/registry.test.ts
```

기대: FAIL — `Failed to resolve import "../pipeline/registry"`.

- [ ] **Step 3: 스키마 작성**

`pipeline/schema.ts`:

```ts
import { z } from 'zod'

export const FieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  nameKo: z.string().min(1),
})
export type Field = z.infer<typeof FieldSchema>

export const SourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rss'), url: z.string().url() }),
  z.object({ type: z.literal('youtube'), channelId: z.string().regex(/^UC[\w-]{22}$/) }),
  z.object({ type: z.literal('arxiv'), author: z.string().min(1) }),
])
export type Source = z.infer<typeof SourceSchema>

export const PersonSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  nameKo: z.string().min(1),
  affiliation: z.string().min(1),
  formerly: z.array(z.string()).default([]),
  fields: z.array(z.string().min(1)).min(1),
  bio: z.string().min(1),
  links: z
    .object({
      homepage: z.string().url().optional(),
      x: z.string().url().optional(),
      github: z.string().url().optional(),
      scholar: z.string().url().optional(),
    })
    .default({}),
  avatar: z.string().url().nullable().default(null),
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
  url: z.string().url(),
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
```

- [ ] **Step 4: registry 로더 작성**

`pipeline/registry.ts`:

```ts
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse as parseYaml } from 'yaml'
import { FieldSchema, PersonSchema, type Field, type Person } from './schema'

export interface Registry {
  people: Person[]
  fields: Field[]
}

export async function loadRegistry(root: string): Promise<Registry> {
  const fieldsPath = path.join(root, 'registry/fields.yaml')
  const rawFields = parseYaml(await readFile(fieldsPath, 'utf8'))
  const fieldsResult = FieldSchema.array().min(1).safeParse(rawFields)
  if (!fieldsResult.success) {
    throw new Error(`registry/fields.yaml 검증 실패: ${formatIssues(fieldsResult.error)}`)
  }
  const fields = fieldsResult.data
  const fieldKeys = new Set(fields.map((f) => f.key))

  const peopleDir = path.join(root, 'registry/people')
  const entries = (await readdir(peopleDir)).filter((f) => f.endsWith('.yaml')).sort()

  const people: Person[] = []
  for (const file of entries) {
    const raw = parseYaml(await readFile(path.join(peopleDir, file), 'utf8'))
    const result = PersonSchema.safeParse(raw)
    if (!result.success) {
      throw new Error(`registry/people/${file} 검증 실패: ${formatIssues(result.error)}`)
    }
    const person = result.data
    const expectedId = file.replace(/\.yaml$/, '')
    if (person.id !== expectedId) {
      throw new Error(`registry/people/${file}: id가 "${person.id}"인데 파일명은 "${expectedId}"입니다`)
    }
    const unknown = person.fields.filter((k) => !fieldKeys.has(k))
    if (unknown.length > 0) {
      throw new Error(
        `registry/people/${file}: fields.yaml에 없는 분야 키 [${unknown.join(', ')}]`,
      )
    }
    people.push(person)
  }

  const seen = new Set<string>()
  for (const p of people) {
    if (seen.has(p.id)) throw new Error(`중복된 인물 id: ${p.id}`)
    seen.add(p.id)
  }

  return { people, fields }
}

function formatIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map((i) => `${i.path.join('.') || '(root)'} — ${i.message}`)
    .join('; ')
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run tests/registry.test.ts
```

기대: 5건 PASS.

- [ ] **Step 6: fields.yaml 작성**

`registry/fields.yaml`:

```yaml
- { key: llm,        nameKo: LLM / 파운데이션 모델 }
- { key: agents,     nameKo: AI 에이전트 }
- { key: reasoning,  nameKo: 추론 / 학습 방법론 }
- { key: multimodal, nameKo: 멀티모달 }
- { key: robotics,   nameKo: 로보틱스 / 체화 AI }
- { key: safety,     nameKo: 안전 / 정렬 }
- { key: systems,    nameKo: 시스템 / 인프라 }
- { key: science,    nameKo: 과학 응용 }
- { key: policy,     nameKo: 정책 / 사회 }
- { key: education,  nameKo: 교육 / 해설 }
```

- [ ] **Step 7: 시드 인물 3명 작성**

`registry/people/andrej-karpathy.yaml`:

```yaml
id: andrej-karpathy
name: Andrej Karpathy
nameKo: 안드레이 카파시
affiliation: Eureka Labs
formerly: [Tesla, OpenAI, Stanford]
fields: [llm, education, reasoning]
bio: 신경망 학습 방법과 AI 교육에 관해 쓰고 가르친다.
links:
  homepage: https://karpathy.ai
  x: https://x.com/karpathy
  github: https://github.com/karpathy
avatar: null
sources:
  - { type: rss, url: https://karpathy.bearblog.dev/feed/ }
  - { type: youtube, channelId: UCXUPKJO5MZQN11PqgIvyuvQ }
  - { type: arxiv, author: Karpathy_A }
```

`registry/people/simon-willison.yaml`:

```yaml
id: simon-willison
name: Simon Willison
nameKo: 사이먼 윌리슨
affiliation: Datasette
formerly: [Eventbrite, Django]
fields: [llm, agents, education]
bio: LLM을 실제로 써보며 매일 기록하고, 도구와 위험을 함께 짚는다.
links:
  homepage: https://simonwillison.net
  github: https://github.com/simonw
avatar: null
sources:
  - { type: rss, url: https://simonwillison.net/atom/everything/ }
```

`registry/people/lilian-weng.yaml`:

```yaml
id: lilian-weng
name: Lilian Weng
nameKo: 릴리안 웽
affiliation: Thinking Machines Lab
formerly: [OpenAI]
fields: [llm, agents, safety, reasoning]
bio: 에이전트와 정렬 문제를 긴 호흡의 정리글로 풀어낸다.
links:
  homepage: https://lilianweng.github.io
  github: https://github.com/lilianweng
avatar: null
sources:
  - { type: rss, url: https://lilianweng.github.io/index.xml }
```

- [ ] **Step 8: 검증 진입점 작성**

`pipeline/validate.ts`:

```ts
import { loadRegistry } from './registry'

async function main(): Promise<void> {
  const { people, fields } = await loadRegistry(process.cwd())
  const sourceCount = people.reduce((n, p) => n + p.sources.length, 0)
  console.log(`registry OK — 인물 ${people.length}명, 분야 ${fields.length}개, 소스 ${sourceCount}개`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
```

- [ ] **Step 9: 실제 registry 검증**

```bash
npm run validate:registry
```

기대: `registry OK — 인물 3명, 분야 10개, 소스 5개`

- [ ] **Step 10: 커밋**

```bash
git add pipeline/schema.ts pipeline/registry.ts pipeline/validate.ts registry tests/registry.test.ts
git commit -m "feat: registry 스키마와 로더, 시드 인물 3명"
```

---

### Task 3: 순수 유틸 — URL 정규화, 아이템 ID, ISO 주차

**Files:**
- Create: `pipeline/normalize.ts`
- Create: `pipeline/week.ts`
- Test: `tests/normalize.test.ts`, `tests/week.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `normalizeUrl(raw: string): string`
  - `itemId(url: string): string` — `normalizeUrl` 결과의 SHA-1 40자 hex
  - `isoWeek(date: Date): string` — `"2026-W35"`
  - `weekStart(week: string): Date` — 해당 주 월요일 00:00 UTC
  - `weekEnd(week: string): Date` — 다음 주 월요일 00:00 UTC (배타적 상한)
  - `itemsInWeek(items: Item[], week: string): Item[]` — 그 주에 발행된 항목만 최신순으로

`itemsInWeek`이 하이라이트 모듈이 아니라 여기 있는 이유: 사이트 페이지(Task 12·13)도 이 함수를 쓰는데, 하이라이트 모듈은 Anthropic SDK를 import하므로 그쪽에 두면 SDK가 Next 빌드에 끌려 들어온다.

- [ ] **Step 1: 실패하는 정규화 테스트 작성**

`tests/normalize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { itemId, normalizeUrl } from '../pipeline/normalize'

describe('normalizeUrl', () => {
  it('추적 파라미터를 제거한다', () => {
    expect(normalizeUrl('https://example.com/post?utm_source=x&id=3&fbclid=abc')).toBe(
      'https://example.com/post?id=3',
    )
  })

  it('www와 후행 슬래시와 해시를 제거한다', () => {
    expect(normalizeUrl('https://www.example.com/post/#section')).toBe('https://example.com/post')
  })

  it('http를 https로 통일한다', () => {
    expect(normalizeUrl('http://example.com/a')).toBe('https://example.com/a')
  })

  it('남은 쿼리 파라미터를 정렬한다', () => {
    expect(normalizeUrl('https://example.com/a?b=2&a=1')).toBe('https://example.com/a?a=1&b=2')
  })

  it('arXiv 버전 접미사와 pdf 경로를 abs로 통일한다', () => {
    const canonical = 'https://arxiv.org/abs/2508.12345'
    expect(normalizeUrl('http://arxiv.org/abs/2508.12345v1')).toBe(canonical)
    expect(normalizeUrl('https://arxiv.org/abs/2508.12345v3')).toBe(canonical)
    expect(normalizeUrl('https://arxiv.org/pdf/2508.12345v2.pdf')).toBe(canonical)
  })

  it('youtu.be 단축 링크를 watch URL로 편다', () => {
    expect(normalizeUrl('https://youtu.be/dQw4w9WgXcQ?si=track')).toBe(
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
    )
  })

  it('루트 경로의 슬래시는 남긴다', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })
})

describe('itemId', () => {
  it('40자 hex를 돌려준다', () => {
    expect(itemId('https://example.com/a')).toMatch(/^[0-9a-f]{40}$/)
  })

  it('정규화 후 같은 URL이면 같은 id를 준다', () => {
    expect(itemId('http://www.example.com/a/?utm_source=x')).toBe(itemId('https://example.com/a'))
  })

  it('다른 URL이면 다른 id를 준다', () => {
    expect(itemId('https://example.com/a')).not.toBe(itemId('https://example.com/b'))
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/normalize.test.ts
```

기대: FAIL — `Failed to resolve import "../pipeline/normalize"`.

- [ ] **Step 3: 정규화 구현**

`pipeline/normalize.ts`:

```ts
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
```

- [ ] **Step 4: 정규화 테스트 통과 확인**

```bash
npx vitest run tests/normalize.test.ts
```

기대: 10건 PASS.

- [ ] **Step 5: 실패하는 주차 테스트 작성**

`tests/week.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { isoWeek, itemsInWeek, weekEnd, weekStart } from '../pipeline/week'
import type { Item } from '../pipeline/schema'

describe('isoWeek', () => {
  it('목요일인 2026-01-01은 2026-W01이다', () => {
    expect(isoWeek(new Date('2026-01-01T00:00:00Z'))).toBe('2026-W01')
  })

  it('금요일인 2021-01-01은 전년도 2020-W53이다', () => {
    expect(isoWeek(new Date('2021-01-01T00:00:00Z'))).toBe('2020-W53')
  })

  it('같은 주의 월요일과 일요일은 같은 주차다', () => {
    expect(isoWeek(new Date('2026-08-24T00:00:00Z'))).toBe(
      isoWeek(new Date('2026-08-30T23:59:59Z')),
    )
  })

  it('주차를 두 자리로 채운다', () => {
    expect(isoWeek(new Date('2026-02-10T00:00:00Z'))).toMatch(/^\d{4}-W\d{2}$/)
  })
})

describe('weekStart / weekEnd', () => {
  it('weekStart는 그 주 월요일 00:00 UTC다', () => {
    const start = weekStart('2026-W35')
    expect(start.getUTCDay()).toBe(1)
    expect(start.toISOString()).toBe('2026-08-24T00:00:00.000Z')
  })

  it('weekEnd는 7일 뒤다', () => {
    const start = weekStart('2026-W35')
    const end = weekEnd('2026-W35')
    expect(end.getTime() - start.getTime()).toBe(7 * 86400000)
  })

  it('isoWeek와 왕복한다', () => {
    for (const week of ['2020-W53', '2026-W01', '2026-W35']) {
      expect(isoWeek(weekStart(week))).toBe(week)
    }
  })
})

describe('itemsInWeek', () => {
  function item(id: string, publishedAt: string): Item {
    return {
      id: id.padEnd(40, '0'),
      personIds: ['person-a'],
      type: 'blog',
      title: `Title ${id}`,
      url: `https://example.com/${id}`,
      publishedAt,
      collectedAt: publishedAt,
      lang: 'en',
      sourceName: 'Blog',
      excerpt: '발췌',
      summaryKo: '요약.',
      tags: [],
    }
  }

  it('그 주에 발행된 항목만 최신순으로 고른다', () => {
    const items = [
      item('a', '2026-08-24T00:00:00.000Z'),
      item('b', '2026-08-30T23:59:59.000Z'),
      item('c', '2026-08-31T00:00:00.000Z'),
      item('d', '2026-08-23T23:59:59.000Z'),
    ]
    expect(itemsInWeek(items, '2026-W35').map((i) => i.title)).toEqual(['Title b', 'Title a'])
  })

  it('해당 주에 아무것도 없으면 빈 배열을 준다', () => {
    expect(itemsInWeek([item('a', '2026-01-05T00:00:00.000Z')], '2026-W35')).toEqual([])
  })
})
```

- [ ] **Step 6: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/week.test.ts
```

기대: FAIL — `Failed to resolve import "../pipeline/week"`.

- [ ] **Step 7: 주차 구현**

`pipeline/week.ts`:

```ts
import type { Item } from './schema'

const DAY_MS = 86_400_000

export function isoWeek(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
  const weekday = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - yearStart) / DAY_MS + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function weekStart(week: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(week)
  if (!match) throw new Error(`주차 형식이 잘못되었습니다: ${week}`)
  const year = Number(match[1])
  const number = Number(match[2])

  const jan4 = new Date(Date.UTC(year, 0, 4))
  const weekday = jan4.getUTCDay() || 7
  const firstMonday = new Date(jan4.getTime() - (weekday - 1) * DAY_MS)
  return new Date(firstMonday.getTime() + (number - 1) * 7 * DAY_MS)
}

export function weekEnd(week: string): Date {
  return new Date(weekStart(week).getTime() + 7 * DAY_MS)
}

export function itemsInWeek(items: Item[], week: string): Item[] {
  const start = weekStart(week).toISOString()
  const end = weekEnd(week).toISOString()
  return items
    .filter((item) => item.publishedAt >= start && item.publishedAt < end)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
}
```

- [ ] **Step 8: 주차 테스트 통과 확인**

```bash
npx vitest run tests/week.test.ts
```

기대: 9건 PASS.

- [ ] **Step 9: 커밋**

```bash
git add pipeline/normalize.ts pipeline/week.ts tests/normalize.test.ts tests/week.test.ts
git commit -m "feat: URL 정규화와 ISO 주차 유틸"
```

---

### Task 4: 어댑터 인터페이스와 RSS 어댑터

**Files:**
- Create: `pipeline/adapters/types.ts`
- Create: `pipeline/adapters/util.ts`
- Create: `pipeline/adapters/rss.ts`
- Test: `tests/adapters/rss.test.ts`
- Test fixture: `tests/fixtures/blog-rss2.xml`, `tests/fixtures/blog-atom.xml`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `pipeline/adapters/types.ts`: `RawItem { type, title, url, publishedAt, excerpt, sourceName, lang }`, `FetchContext { fetchText(url: string): Promise<string> }`
  - `pipeline/adapters/util.ts`: `toIsoDate(input: string | undefined): string | null`, `toExcerpt(html: string): string`, `asArray<T>(value: T | T[] | undefined | null): T[]`
  - `pipeline/adapters/rss.ts`: `fetchRssItems(source: Extract<Source, { type: 'rss' }>, ctx: FetchContext): Promise<RawItem[]>`

- [ ] **Step 1: 픽스처 작성**

`tests/fixtures/blog-rss2.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Blog</title>
    <language>en</language>
    <link>https://blog.example.com</link>
    <item>
      <title>On Scaling Laws</title>
      <link>https://blog.example.com/scaling?utm_source=rss</link>
      <pubDate>Wed, 20 Aug 2026 10:00:00 GMT</pubDate>
      <description>&lt;p&gt;A &lt;b&gt;short&lt;/b&gt; note about scaling.&lt;/p&gt;</description>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://blog.example.com/second</link>
      <pubDate>Mon, 18 Aug 2026 08:30:00 GMT</pubDate>
      <description>Plain text description.</description>
    </item>
    <item>
      <title>Broken Post</title>
      <pubDate>Mon, 18 Aug 2026 08:30:00 GMT</pubDate>
      <description>No link here.</description>
    </item>
  </channel>
</rss>
```

`tests/fixtures/blog-atom.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Blog</title>
  <link href="https://atom.example.com"/>
  <entry>
    <title>Atom Entry</title>
    <link href="https://atom.example.com/entry-1"/>
    <published>2026-08-19T12:00:00Z</published>
    <summary>An atom summary.</summary>
  </entry>
</feed>
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/adapters/rss.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { fetchRssItems } from '../../pipeline/adapters/rss'
import type { FetchContext } from '../../pipeline/adapters/types'

function fixtureContext(file: string): FetchContext {
  return {
    async fetchText() {
      return readFile(new URL(`../fixtures/${file}`, import.meta.url), 'utf8')
    },
  }
}

const SOURCE = { type: 'rss' as const, url: 'https://blog.example.com/feed.xml' }

describe('fetchRssItems', () => {
  it('RSS 2.0 항목을 RawItem으로 바꾼다', async () => {
    const items = await fetchRssItems(SOURCE, fixtureContext('blog-rss2.xml'))
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      type: 'blog',
      title: 'On Scaling Laws',
      url: 'https://blog.example.com/scaling?utm_source=rss',
      publishedAt: '2026-08-20T10:00:00.000Z',
      sourceName: 'Test Blog',
      lang: 'en',
    })
  })

  it('HTML 태그를 제거해 발췌를 만든다', async () => {
    const items = await fetchRssItems(SOURCE, fixtureContext('blog-rss2.xml'))
    expect(items[0].excerpt).toBe('A short note about scaling.')
  })

  it('link가 없는 항목은 버린다', async () => {
    const items = await fetchRssItems(SOURCE, fixtureContext('blog-rss2.xml'))
    expect(items.map((i) => i.title)).not.toContain('Broken Post')
  })

  it('Atom 피드도 처리한다', async () => {
    const items = await fetchRssItems(SOURCE, fixtureContext('blog-atom.xml'))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      title: 'Atom Entry',
      url: 'https://atom.example.com/entry-1',
      publishedAt: '2026-08-19T12:00:00.000Z',
    })
  })

  it('언어 정보가 없으면 en으로 둔다', async () => {
    const items = await fetchRssItems(SOURCE, fixtureContext('blog-atom.xml'))
    expect(items[0].lang).toBe('en')
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/adapters/rss.test.ts
```

기대: FAIL — 모듈 해석 실패.

- [ ] **Step 4: 인터페이스와 공용 유틸 작성**

`pipeline/adapters/types.ts`:

```ts
import type { ItemType } from '../schema'

export interface RawItem {
  type: ItemType
  title: string
  url: string
  publishedAt: string
  excerpt: string
  sourceName: string
  lang: string
}

export interface FetchContext {
  fetchText(url: string): Promise<string>
}
```

`pipeline/adapters/util.ts`:

```ts
export const EXCERPT_MAX = 600

export function toIsoDate(input: string | undefined | null): string | null {
  if (!input) return null
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function toExcerpt(input: string | undefined | null): string {
  if (!input) return ''
  const text = input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > EXCERPT_MAX ? `${text.slice(0, EXCERPT_MAX - 1)}…` : text
}

/** XML 파서는 항목이 하나면 배열이 아닌 객체를 준다. 항상 배열로 만든다. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}
```

- [ ] **Step 5: RSS 어댑터 작성**

`pipeline/adapters/rss.ts`:

```ts
import Parser from 'rss-parser'
import type { Source } from '../schema'
import type { FetchContext, RawItem } from './types'
import { toExcerpt, toIsoDate } from './util'

type RssSource = Extract<Source, { type: 'rss' }>

const parser = new Parser()

export async function fetchRssItems(
  source: RssSource,
  ctx: FetchContext,
): Promise<RawItem[]> {
  const xml = await ctx.fetchText(source.url)
  const feed = await parser.parseString(xml)
  const sourceName = feed.title?.trim() || new URL(source.url).hostname
  const lang = (feed.language ?? 'en').trim() || 'en'

  const items: RawItem[] = []
  for (const entry of feed.items ?? []) {
    const url = entry.link?.trim()
    if (!url) continue
    const publishedAt = toIsoDate(entry.isoDate ?? entry.pubDate)
    if (!publishedAt) continue
    const title = entry.title?.trim()
    if (!title) continue

    items.push({
      type: 'blog',
      title,
      url,
      publishedAt,
      excerpt: toExcerpt(
        entry.contentSnippet ?? entry.content ?? entry.summary ?? '',
      ),
      sourceName,
      lang,
    })
  }
  return items
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
npx vitest run tests/adapters/rss.test.ts
```

기대: 5건 PASS.

- [ ] **Step 7: 커밋**

```bash
git add pipeline/adapters tests/adapters tests/fixtures
git commit -m "feat: 어댑터 인터페이스와 RSS 어댑터"
```

---

### Task 5: YouTube 어댑터

**Files:**
- Create: `pipeline/adapters/youtube.ts`
- Test: `tests/adapters/youtube.test.ts`
- Test fixture: `tests/fixtures/youtube.xml`

**Interfaces:**
- Consumes: `FetchContext`, `RawItem`, `toExcerpt`, `toIsoDate`, `asArray` (모두 Task 4)
- Produces: `fetchYoutubeItems(source: Extract<Source, { type: 'youtube' }>, ctx: FetchContext): Promise<RawItem[]>`, `youtubeFeedUrl(channelId: string): string`

- [ ] **Step 1: 픽스처 작성**

`tests/fixtures/youtube.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
      xmlns:media="http://search.yahoo.com/mrss/"
      xmlns="http://www.w3.org/2005/Atom">
  <title>Test Channel</title>
  <entry>
    <id>yt:video:AAAAAAAAAAA</id>
    <yt:videoId>AAAAAAAAAAA</yt:videoId>
    <title>Deep Dive into Transformers</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=AAAAAAAAAAA"/>
    <published>2026-08-21T15:00:00+00:00</published>
    <media:group>
      <media:description>We build a transformer from scratch, step by step.</media:description>
    </media:group>
  </entry>
  <entry>
    <id>yt:video:BBBBBBBBBBB</id>
    <yt:videoId>BBBBBBBBBBB</yt:videoId>
    <title>Short Update</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=BBBBBBBBBBB"/>
    <published>2026-08-15T09:00:00+00:00</published>
    <media:group>
      <media:description></media:description>
    </media:group>
  </entry>
</feed>
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/adapters/youtube.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { fetchYoutubeItems, youtubeFeedUrl } from '../../pipeline/adapters/youtube'
import type { FetchContext } from '../../pipeline/adapters/types'

const CHANNEL_ID = 'UCXUPKJO5MZQN11PqgIvyuvQ'
const SOURCE = { type: 'youtube' as const, channelId: CHANNEL_ID }

function fixtureContext(): { ctx: FetchContext; requested: string[] } {
  const requested: string[] = []
  return {
    requested,
    ctx: {
      async fetchText(url) {
        requested.push(url)
        return readFile(new URL('../fixtures/youtube.xml', import.meta.url), 'utf8')
      },
    },
  }
}

describe('youtubeFeedUrl', () => {
  it('채널 RSS 주소를 만든다', () => {
    expect(youtubeFeedUrl(CHANNEL_ID)).toBe(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
    )
  })
})

describe('fetchYoutubeItems', () => {
  it('채널 RSS 주소로 요청한다', async () => {
    const { ctx, requested } = fixtureContext()
    await fetchYoutubeItems(SOURCE, ctx)
    expect(requested).toEqual([youtubeFeedUrl(CHANNEL_ID)])
  })

  it('영상 항목을 RawItem으로 바꾼다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchYoutubeItems(SOURCE, ctx)
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({
      type: 'video',
      title: 'Deep Dive into Transformers',
      url: 'https://www.youtube.com/watch?v=AAAAAAAAAAA',
      publishedAt: '2026-08-21T15:00:00.000Z',
      excerpt: 'We build a transformer from scratch, step by step.',
      sourceName: 'Test Channel',
      lang: 'en',
    })
  })

  it('설명이 비어 있어도 버리지 않는다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchYoutubeItems(SOURCE, ctx)
    expect(items[1].title).toBe('Short Update')
    expect(items[1].excerpt).toBe('')
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/adapters/youtube.test.ts
```

기대: FAIL — 모듈 해석 실패.

- [ ] **Step 4: 구현**

`pipeline/adapters/youtube.ts`:

```ts
import { XMLParser } from 'fast-xml-parser'
import type { Source } from '../schema'
import type { FetchContext, RawItem } from './types'
import { asArray, toExcerpt, toIsoDate } from './util'

type YoutubeSource = Extract<Source, { type: 'youtube' }>

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

export function youtubeFeedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
}

function firstLinkHref(link: unknown): string | undefined {
  for (const entry of asArray(link as Record<string, string> | Record<string, string>[])) {
    const href = entry?.['@_href']
    if (href) return href
  }
  return undefined
}

export async function fetchYoutubeItems(
  source: YoutubeSource,
  ctx: FetchContext,
): Promise<RawItem[]> {
  const xml = await ctx.fetchText(youtubeFeedUrl(source.channelId))
  const doc = parser.parse(xml) as Record<string, any>
  const feed = doc?.feed ?? {}
  const sourceName = String(feed.title ?? '').trim() || 'YouTube'

  const items: RawItem[] = []
  for (const entry of asArray<Record<string, any>>(feed.entry)) {
    const url = firstLinkHref(entry.link)
    if (!url) continue
    const publishedAt = toIsoDate(entry.published)
    if (!publishedAt) continue
    const title = String(entry.title ?? '').trim()
    if (!title) continue

    const description = entry['media:group']?.['media:description']
    items.push({
      type: 'video',
      title,
      url,
      publishedAt,
      excerpt: toExcerpt(description === undefined ? '' : String(description)),
      sourceName,
      lang: 'en',
    })
  }
  return items
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run tests/adapters/youtube.test.ts
```

기대: 4건 PASS.

- [ ] **Step 6: 커밋**

```bash
git add pipeline/adapters/youtube.ts tests/adapters/youtube.test.ts tests/fixtures/youtube.xml
git commit -m "feat: YouTube 채널 어댑터"
```

---

### Task 6: arXiv 어댑터

**Files:**
- Create: `pipeline/adapters/arxiv.ts`
- Test: `tests/adapters/arxiv.test.ts`
- Test fixture: `tests/fixtures/arxiv.xml`

**Interfaces:**
- Consumes: `FetchContext`, `RawItem`, `toExcerpt`, `toIsoDate`, `asArray` (모두 Task 4)
- Produces: `fetchArxivItems(source: Extract<Source, { type: 'arxiv' }>, ctx: FetchContext): Promise<RawItem[]>`, `arxivQueryUrl(author: string): string`, 상수 `ARXIV_MIN_INTERVAL_MS = 3000`

- [ ] **Step 1: 픽스처 작성**

`tests/fixtures/arxiv.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2508.12345v1</id>
    <updated>2026-08-22T09:00:00Z</updated>
    <published>2026-08-20T17:45:00Z</published>
    <title>A Study of
      Long Context Models</title>
    <summary>  We study how models handle very long contexts,
      and report several findings.
    </summary>
    <author><name>Jane Researcher</name></author>
    <author><name>Andrej Karpathy</name></author>
    <link href="http://arxiv.org/abs/2508.12345v1" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2508.12345v1" rel="related" type="application/pdf"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2507.00001v2</id>
    <published>2026-07-01T00:00:00Z</published>
    <title>Older Paper</title>
    <summary>An older abstract.</summary>
    <author><name>Andrej Karpathy</name></author>
    <link href="http://arxiv.org/abs/2507.00001v2" rel="alternate" type="text/html"/>
  </entry>
</feed>
```

- [ ] **Step 2: 실패하는 테스트 작성**

`tests/adapters/arxiv.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { arxivQueryUrl, fetchArxivItems } from '../../pipeline/adapters/arxiv'
import type { FetchContext } from '../../pipeline/adapters/types'

const SOURCE = { type: 'arxiv' as const, author: 'Karpathy_A' }

function fixtureContext(): { ctx: FetchContext; requested: string[] } {
  const requested: string[] = []
  return {
    requested,
    ctx: {
      async fetchText(url) {
        requested.push(url)
        return readFile(new URL('../fixtures/arxiv.xml', import.meta.url), 'utf8')
      },
    },
  }
}

describe('arxivQueryUrl', () => {
  it('저자명을 인용부호로 감싸 인코딩한다', () => {
    const url = arxivQueryUrl('Karpathy_A')
    expect(url).toContain('search_query=au%3A%22Karpathy_A%22')
    expect(url).toContain('sortBy=submittedDate')
    expect(url).toContain('sortOrder=descending')
  })
})

describe('fetchArxivItems', () => {
  it('논문 항목을 RawItem으로 바꾼다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchArxivItems(SOURCE, ctx)
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      type: 'paper',
      url: 'http://arxiv.org/abs/2508.12345v1',
      publishedAt: '2026-08-20T17:45:00.000Z',
      sourceName: 'arXiv',
      lang: 'en',
    })
  })

  it('제목과 초록의 줄바꿈과 여분 공백을 정리한다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchArxivItems(SOURCE, ctx)
    expect(items[0].title).toBe('A Study of Long Context Models')
    expect(items[0].excerpt).toBe(
      'We study how models handle very long contexts, and report several findings.',
    )
  })

  it('published를 쓰고 updated는 쓰지 않는다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchArxivItems(SOURCE, ctx)
    expect(items[0].publishedAt).not.toBe('2026-08-22T09:00:00.000Z')
  })

  it('저자가 한 명인 항목도 처리한다', async () => {
    const { ctx } = fixtureContext()
    const items = await fetchArxivItems(SOURCE, ctx)
    expect(items[1].title).toBe('Older Paper')
  })
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/adapters/arxiv.test.ts
```

기대: FAIL — 모듈 해석 실패.

- [ ] **Step 4: 구현**

`pipeline/adapters/arxiv.ts`:

```ts
import { XMLParser } from 'fast-xml-parser'
import type { Source } from '../schema'
import type { FetchContext, RawItem } from './types'
import { asArray, toExcerpt, toIsoDate } from './util'

type ArxivSource = Extract<Source, { type: 'arxiv' }>

/** arXiv는 요청 간 3초 간격을 요구한다. collect.ts가 이 값을 사용한다. */
export const ARXIV_MIN_INTERVAL_MS = 3000

const MAX_RESULTS = 20

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

export function arxivQueryUrl(author: string): string {
  const params = new URLSearchParams({
    search_query: `au:"${author}"`,
    sortBy: 'submittedDate',
    sortOrder: 'descending',
    max_results: String(MAX_RESULTS),
  })
  return `http://export.arxiv.org/api/query?${params.toString()}`
}

function collapse(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

export async function fetchArxivItems(
  source: ArxivSource,
  ctx: FetchContext,
): Promise<RawItem[]> {
  const xml = await ctx.fetchText(arxivQueryUrl(source.author))
  const doc = parser.parse(xml) as Record<string, any>
  const feed = doc?.feed ?? {}

  const items: RawItem[] = []
  for (const entry of asArray<Record<string, any>>(feed.entry)) {
    const url = collapse(entry.id)
    if (!url) continue
    const publishedAt = toIsoDate(entry.published)
    if (!publishedAt) continue
    const title = collapse(entry.title)
    if (!title) continue

    items.push({
      type: 'paper',
      title,
      url,
      publishedAt,
      excerpt: toExcerpt(collapse(entry.summary)),
      sourceName: 'arXiv',
      lang: 'en',
    })
  }
  return items
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run tests/adapters/arxiv.test.ts
```

기대: 5건 PASS.

- [ ] **Step 6: 커밋**

```bash
git add pipeline/adapters/arxiv.ts tests/adapters/arxiv.test.ts tests/fixtures/arxiv.xml
git commit -m "feat: arXiv 저자 어댑터"
```

---

### Task 7: 콘텐츠 스토어

**Files:**
- Create: `pipeline/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `Item`, `State`, `Highlight`, `EMPTY_STATE` (Task 2)
- Produces: `createFileStore(root: string): Store`

```ts
export interface UpsertResult { created: Item[]; merged: Item[] }
export interface Store {
  loadState(): Promise<State>
  saveState(state: State): Promise<void>
  loadAllItems(): Promise<Item[]>
  upsertItems(candidates: Item[]): Promise<UpsertResult>
  loadHighlight(week: string): Promise<Highlight | null>
  saveHighlight(highlight: Highlight): Promise<void>
  listWeeks(): Promise<string[]>
}
```

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/store.test.ts`:

```ts
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFileStore, type Store } from '../pipeline/store'
import type { Item } from '../pipeline/schema'

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'a'.repeat(40),
    personIds: ['person-a'],
    type: 'paper',
    title: 'Sample',
    url: 'https://arxiv.org/abs/2508.00001',
    publishedAt: '2026-08-20T00:00:00.000Z',
    collectedAt: '2026-08-20T06:00:00.000Z',
    lang: 'en',
    sourceName: 'arXiv',
    excerpt: 'abstract',
    summaryKo: null,
    tags: [],
    ...overrides,
  }
}

let root: string
let store: Store

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'store-'))
  store = createFileStore(root)
})

describe('state', () => {
  it('파일이 없으면 빈 상태를 준다', async () => {
    expect(await store.loadState()).toEqual({ version: 1, sources: {} })
  })

  it('저장한 상태를 다시 읽는다', async () => {
    await store.saveState({
      version: 1,
      sources: {
        'p:rss:https://x/feed': {
          lastRunAt: '2026-08-20T06:00:00.000Z',
          seenIds: ['a'.repeat(40)],
          consecutiveFailures: 0,
          lastError: null,
        },
      },
    })
    const state = await store.loadState()
    expect(state.sources['p:rss:https://x/feed'].seenIds).toEqual(['a'.repeat(40)])
  })
})

describe('upsertItems', () => {
  it('새 아이템을 발행 월 파일에 쓴다', async () => {
    const result = await store.upsertItems([makeItem()])
    expect(result.created).toHaveLength(1)
    expect(result.merged).toHaveLength(0)
    const written = JSON.parse(
      await readFile(path.join(root, 'content/items/2026-08.json'), 'utf8'),
    )
    expect(written).toHaveLength(1)
    expect(written[0].title).toBe('Sample')
  })

  it('같은 id면 새로 만들지 않고 personIds를 합친다', async () => {
    await store.upsertItems([makeItem({ personIds: ['person-a'] })])
    const result = await store.upsertItems([makeItem({ personIds: ['person-b'] })])
    expect(result.created).toHaveLength(0)
    expect(result.merged).toHaveLength(1)
    const all = await store.loadAllItems()
    expect(all).toHaveLength(1)
    expect(all[0].personIds.sort()).toEqual(['person-a', 'person-b'])
  })

  it('이미 있는 personId를 중복으로 넣지 않는다', async () => {
    await store.upsertItems([makeItem()])
    await store.upsertItems([makeItem()])
    const all = await store.loadAllItems()
    expect(all[0].personIds).toEqual(['person-a'])
  })

  it('한 번의 호출 안에서도 같은 id를 합친다', async () => {
    const result = await store.upsertItems([
      makeItem({ personIds: ['person-a'] }),
      makeItem({ personIds: ['person-b'] }),
    ])
    expect(result.created).toHaveLength(1)
    expect(result.created[0].personIds.sort()).toEqual(['person-a', 'person-b'])
  })

  it('월별로 파일을 나눈다', async () => {
    await store.upsertItems([
      makeItem({ id: 'a'.repeat(40), publishedAt: '2026-08-20T00:00:00.000Z' }),
      makeItem({ id: 'b'.repeat(40), publishedAt: '2026-07-20T00:00:00.000Z' }),
    ])
    const all = await store.loadAllItems()
    expect(all).toHaveLength(2)
    await expect(
      readFile(path.join(root, 'content/items/2026-07.json'), 'utf8'),
    ).resolves.toContain('Sample')
  })

  it('월 파일 안에서 최신순으로 정렬한다', async () => {
    await store.upsertItems([
      makeItem({ id: 'a'.repeat(40), publishedAt: '2026-08-10T00:00:00.000Z' }),
      makeItem({ id: 'b'.repeat(40), publishedAt: '2026-08-25T00:00:00.000Z' }),
    ])
    const written = JSON.parse(
      await readFile(path.join(root, 'content/items/2026-08.json'), 'utf8'),
    )
    expect(written[0].publishedAt).toBe('2026-08-25T00:00:00.000Z')
  })
})

describe('highlights', () => {
  it('없는 주차는 null을 준다', async () => {
    expect(await store.loadHighlight('2026-W35')).toBeNull()
  })

  it('저장하고 읽고 목록에 나타난다', async () => {
    await store.saveHighlight({
      week: '2026-W35',
      generatedAt: '2026-08-25T00:00:00.000Z',
      intro: '이번 주 흐름.',
      picks: [{ itemId: 'a'.repeat(40), reason: '중요하다' }],
      origin: 'llm',
    })
    expect((await store.loadHighlight('2026-W35'))?.intro).toBe('이번 주 흐름.')
    expect(await store.listWeeks()).toEqual(['2026-W35'])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/store.test.ts
```

기대: FAIL — 모듈 해석 실패.

- [ ] **Step 3: 구현**

`pipeline/store.ts`:

```ts
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  EMPTY_STATE,
  HighlightSchema,
  ItemSchema,
  StateSchema,
  type Highlight,
  type Item,
  type State,
} from './schema'

export interface UpsertResult {
  created: Item[]
  merged: Item[]
}

export interface Store {
  loadState(): Promise<State>
  saveState(state: State): Promise<void>
  loadAllItems(): Promise<Item[]>
  upsertItems(candidates: Item[]): Promise<UpsertResult>
  loadHighlight(week: string): Promise<Highlight | null>
  saveHighlight(highlight: Highlight): Promise<void>
  listWeeks(): Promise<string[]>
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function createFileStore(root: string): Store {
  const itemsDir = path.join(root, 'content/items')
  const highlightsDir = path.join(root, 'content/highlights')
  const statePath = path.join(root, 'content/state.json')

  async function listMonths(): Promise<string[]> {
    try {
      return (await readdir(itemsDir))
        .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
        .map((f) => f.replace(/\.json$/, ''))
        .sort()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  async function loadMonth(month: string): Promise<Item[]> {
    const raw = await readJson<unknown[]>(path.join(itemsDir, `${month}.json`))
    if (!raw) return []
    return ItemSchema.array().parse(raw)
  }

  return {
    async loadState() {
      const raw = await readJson<unknown>(statePath)
      if (!raw) return structuredClone(EMPTY_STATE)
      return StateSchema.parse(raw)
    },

    async saveState(state) {
      await writeJson(statePath, StateSchema.parse(state))
    },

    async loadAllItems() {
      const months = await listMonths()
      const all: Item[] = []
      for (const month of months) all.push(...(await loadMonth(month)))
      all.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      return all
    },

    async upsertItems(candidates) {
      const months = await listMonths()
      const byMonth = new Map<string, Item[]>()
      for (const month of months) byMonth.set(month, await loadMonth(month))

      const index = new Map<string, { month: string; item: Item }>()
      for (const [month, items] of byMonth) {
        for (const item of items) index.set(item.id, { month, item })
      }

      const created: Item[] = []
      const merged: Item[] = []
      const touched = new Set<string>()

      for (const raw of candidates) {
        const candidate = ItemSchema.parse(raw)
        const existing = index.get(candidate.id)

        if (existing) {
          const before = existing.item.personIds.length
          const union = [...new Set([...existing.item.personIds, ...candidate.personIds])].sort()
          if (union.length !== before) {
            existing.item.personIds = union
            touched.add(existing.month)
            if (!merged.some((m) => m.id === candidate.id)) merged.push(existing.item)
          }
          continue
        }

        const month = monthKey(candidate.publishedAt)
        const bucket = byMonth.get(month) ?? []
        const item: Item = { ...candidate, personIds: [...new Set(candidate.personIds)].sort() }
        bucket.push(item)
        byMonth.set(month, bucket)
        index.set(item.id, { month, item })
        touched.add(month)
        created.push(item)
      }

      for (const month of touched) {
        const items = (byMonth.get(month) ?? []).slice()
        items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        await writeJson(path.join(itemsDir, `${month}.json`), items)
      }

      return { created, merged }
    },

    async loadHighlight(week) {
      const raw = await readJson<unknown>(path.join(highlightsDir, `${week}.json`))
      if (!raw) return null
      return HighlightSchema.parse(raw)
    },

    async saveHighlight(highlight) {
      const parsed = HighlightSchema.parse(highlight)
      await writeJson(path.join(highlightsDir, `${parsed.week}.json`), parsed)
    },

    async listWeeks() {
      try {
        return (await readdir(highlightsDir))
          .filter((f) => /^\d{4}-W\d{2}\.json$/.test(f))
          .map((f) => f.replace(/\.json$/, ''))
          .sort()
          .reverse()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw error
      }
    },
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/store.test.ts
```

기대: 10건 PASS.

`listWeeks`는 최신 주차가 앞에 오도록 역순 정렬하는데, 테스트에 주차가 하나뿐이라 순서가 드러나지 않는다. 이는 의도된 것이며 Task 13의 `/weekly` 인덱스가 이 순서에 의존한다.

- [ ] **Step 5: 커밋**

```bash
git add pipeline/store.ts tests/store.test.ts
git commit -m "feat: 콘텐츠 스토어 (월별 병합, state, 하이라이트)"
```

---

### Task 8: 요약기

**Files:**
- Create: `pipeline/summarize.ts`
- Test: `tests/summarize.test.ts`

**Interfaces:**
- Consumes: `ItemType` (Task 2)
- Produces:

```ts
export interface SummarizeInput {
  title: string
  excerpt: string
  type: ItemType
  personNames: string[]
  allowedTags: string[]
}
export interface SummarizeOutput { summaryKo: string; tags: string[] }
export interface Summarizer { summarize(input: SummarizeInput): Promise<SummarizeOutput> }
export function sanitizeOutput(raw: SummarizeOutput, allowedTags: string[]): SummarizeOutput
export function buildPrompt(input: SummarizeInput): string
export function createAnthropicSummarizer(options?: { apiKey?: string }): Summarizer
```

`sanitizeOutput`은 모델이 목록 밖의 태그나 4개 이상의 태그를 냈을 때 마지막 방어선이다. 구조화 출력이 1차 방어선이고 이것이 2차다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/summarize.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildPrompt, sanitizeOutput } from '../pipeline/summarize'

const ALLOWED = ['llm', 'agents', 'safety']

describe('sanitizeOutput', () => {
  it('허용 목록에 없는 태그를 버린다', () => {
    const result = sanitizeOutput({ summaryKo: '요약', tags: ['llm', 'quantum'] }, ALLOWED)
    expect(result.tags).toEqual(['llm'])
  })

  it('태그를 3개로 자른다', () => {
    const result = sanitizeOutput(
      { summaryKo: '요약', tags: ['llm', 'agents', 'safety', 'llm'] },
      ALLOWED,
    )
    expect(result.tags).toHaveLength(3)
  })

  it('중복 태그를 제거한다', () => {
    const result = sanitizeOutput({ summaryKo: '요약', tags: ['llm', 'llm'] }, ALLOWED)
    expect(result.tags).toEqual(['llm'])
  })

  it('요약 앞뒤 공백을 정리한다', () => {
    const result = sanitizeOutput({ summaryKo: '  요약  ', tags: [] }, ALLOWED)
    expect(result.summaryKo).toBe('요약')
  })

  it('빈 요약은 에러를 던진다', () => {
    expect(() => sanitizeOutput({ summaryKo: '   ', tags: [] }, ALLOWED)).toThrow()
  })
})

describe('buildPrompt', () => {
  it('제목, 저자, 발췌, 허용 태그를 모두 담는다', () => {
    const prompt = buildPrompt({
      title: 'On Scaling',
      excerpt: 'A note about scaling.',
      type: 'blog',
      personNames: ['Andrej Karpathy'],
      allowedTags: ALLOWED,
    })
    expect(prompt).toContain('On Scaling')
    expect(prompt).toContain('Andrej Karpathy')
    expect(prompt).toContain('A note about scaling.')
    expect(prompt).toContain('llm, agents, safety')
  })

  it('발췌가 비어 있으면 제목만으로 요약하라고 지시한다', () => {
    const prompt = buildPrompt({
      title: 'Title Only',
      excerpt: '',
      type: 'video',
      personNames: ['Someone'],
      allowedTags: ALLOWED,
    })
    expect(prompt).toContain('제목만')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/summarize.test.ts
```

기대: FAIL — 모듈 해석 실패.

- [ ] **Step 3: 구현**

`pipeline/summarize.ts`:

```ts
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
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/summarize.test.ts
```

기대: 7건 PASS.

- [ ] **Step 5: 실제 API로 1회 검증**

```bash
export ANTHROPIC_API_KEY=<본인 키>
npx tsx -e "
import { createAnthropicSummarizer } from './pipeline/summarize'
const s = createAnthropicSummarizer()
s.summarize({
  title: 'Attention Is All You Need',
  excerpt: 'We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.',
  type: 'paper',
  personNames: ['Ashish Vaswani'],
  allowedTags: ['llm', 'agents', 'reasoning'],
}).then(r => console.log(JSON.stringify(r, null, 2)))
"
```

기대: `summaryKo`에 한국어 3문장, `tags`는 `["llm"]` 또는 `["llm","reasoning"]` 형태.

> **만약 `zodOutputFormat` 호출에서 스키마 변환 에러가 난다면** (SDK의 zod 헬퍼가 설치된 zod 메이저 버전과 맞지 않는 경우), `summarize` 구현을 아래로 교체한다. 프롬프트 끝에 JSON 형식을 지정하고 텍스트 블록을 직접 파싱하는 방식이며, `ResponseSchema`로 검증하므로 안전성은 동일하다.
>
> ```ts
>       const response = await client.messages.create({
>         model: SUMMARY_MODEL,
>         max_tokens: 1024,
>         thinking: { type: 'disabled' },
>         output_config: { effort: 'low' },
>         messages: [
>           {
>             role: 'user',
>             content: `${buildPrompt(input)}\n\n출력은 다른 말 없이 JSON 객체 하나만: {"summaryKo": string, "tags": string[]}`,
>           },
>         ],
>       })
>       const text = response.content
>         .filter((block): block is Anthropic.TextBlock => block.type === 'text')
>         .map((block) => block.text)
>         .join('')
>       const match = /\{[\s\S]*\}/.exec(text)
>       if (!match) throw new Error('JSON 응답을 찾지 못했습니다')
>       const parsed = ResponseSchema.parse(JSON.parse(match[0]))
>       return sanitizeOutput(parsed, input.allowedTags)
> ```

- [ ] **Step 6: 커밋**

```bash
git add pipeline/summarize.ts tests/summarize.test.ts
git commit -m "feat: Claude Sonnet 5 기반 한국어 요약기"
```

---

### Task 9: 수집 진입점

**Files:**
- Create: `pipeline/collect.ts`
- Test: `tests/collect.test.ts`

**Interfaces:**
- Consumes: `loadRegistry` (2), `itemId` (3), 어댑터 3종 (4·5·6), `createFileStore` (7), `Summarizer` (8)
- Produces:
  - `sourceKey(personId: string, source: Source): string`
  - `runCollect(deps: CollectDeps, options?: CollectOptions): Promise<CollectReport>`
  - `main()` (파일 직접 실행 시)

```ts
export interface CollectDeps {
  registry: Registry
  store: Store
  fetchers: {
    rss(source: Extract<Source, { type: 'rss' }>, ctx: FetchContext): Promise<RawItem[]>
    youtube(source: Extract<Source, { type: 'youtube' }>, ctx: FetchContext): Promise<RawItem[]>
    arxiv(source: Extract<Source, { type: 'arxiv' }>, ctx: FetchContext): Promise<RawItem[]>
  }
  ctx: FetchContext
  summarizer: Summarizer | null   // null이면 요약을 건너뛰고 summaryKo를 null로 둔다
  now: () => Date
}

export interface CollectOptions { limit?: number }

export interface CollectReport {
  created: number
  merged: number
  summarized: number
  summaryFailures: number
  sourceFailures: { key: string; error: string; consecutive: number }[]
  alerts: { key: string; error: string; consecutive: number }[]  // consecutive >= 5
}
```

**핵심 규칙 세 가지** (테스트가 이것을 검증한다):
1. **첫 실행 제한** — 그 소스의 `seenIds`가 비어 있으면 최신 3건만 채택하되, 가져온 나머지도 전부 `seenIds`에 기록한다. 기록하지 않으면 6시간 뒤 실행이 밀린 과거 항목을 한꺼번에 끌어온다.
2. **나이 제한** — `publishedAt`이 180일보다 오래된 항목은 채택하지 않는다.
3. **실패 격리** — 한 소스가 던져도 나머지는 계속 처리하고, 실패는 `consecutiveFailures`에 누적된다. 5 이상이면 `alerts`에 담긴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/collect.test.ts`:

```ts
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { runCollect, sourceKey, type CollectDeps } from '../pipeline/collect'
import { createFileStore, type Store } from '../pipeline/store'
import type { RawItem } from '../pipeline/adapters/types'
import type { Person, Source } from '../pipeline/schema'

const NOW = new Date('2026-08-27T00:00:00.000Z')

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: 'person-a',
    name: 'Person A',
    nameKo: '인물 A',
    affiliation: 'Lab',
    formerly: [],
    fields: ['llm'],
    bio: '설명',
    links: {},
    avatar: null,
    sources: [{ type: 'rss', url: 'https://a.example.com/feed' }],
    ...overrides,
  }
}

function raw(overrides: Partial<RawItem> = {}): RawItem {
  return {
    type: 'blog',
    title: 'Post',
    url: 'https://a.example.com/post-1',
    publishedAt: '2026-08-25T00:00:00.000Z',
    excerpt: '발췌',
    sourceName: 'A Blog',
    lang: 'en',
    ...overrides,
  }
}

function deps(store: Store, over: Partial<CollectDeps> = {}): CollectDeps {
  return {
    registry: { people: [person()], fields: [{ key: 'llm', nameKo: 'LLM' }] },
    store,
    fetchers: {
      async rss() { return [raw()] },
      async youtube() { return [] },
      async arxiv() { return [] },
    },
    ctx: { async fetchText() { return '' } },
    summarizer: { async summarize() { return { summaryKo: '요약.', tags: ['llm'] } } },
    now: () => NOW,
    ...over,
  }
}

let store: Store

beforeEach(async () => {
  store = createFileStore(await mkdtemp(path.join(tmpdir(), 'collect-')))
})

describe('sourceKey', () => {
  it('소스 종류별로 구분되는 키를 만든다', () => {
    const rssSource: Source = { type: 'rss', url: 'https://a.example.com/feed' }
    const ytSource: Source = { type: 'youtube', channelId: 'UC'.padEnd(24, 'a') }
    expect(sourceKey('p', rssSource)).not.toBe(sourceKey('p', ytSource))
    expect(sourceKey('p', rssSource)).toContain('rss')
  })
})

describe('runCollect', () => {
  it('첫 실행에서는 소스당 최신 3건만 채택한다', async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      raw({ url: `https://a.example.com/post-${i}`, publishedAt: `2026-08-${10 + i}T00:00:00.000Z` }),
    )
    const report = await runCollect(deps(store, {
      fetchers: { async rss() { return many }, async youtube() { return [] }, async arxiv() { return [] } },
    }))
    expect(report.created).toBe(3)
    const items = await store.loadAllItems()
    expect(items.map((i) => i.publishedAt)).toEqual([
      '2026-08-17T00:00:00.000Z',
      '2026-08-16T00:00:00.000Z',
      '2026-08-15T00:00:00.000Z',
    ])
  })

  it('첫 실행에서 밀린 나머지는 확인 완료로 표시해 다시 끌어오지 않는다', async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      raw({ url: `https://a.example.com/post-${i}`, publishedAt: `2026-08-${10 + i}T00:00:00.000Z` }),
    )
    const fixed = deps(store, {
      fetchers: { async rss() { return many }, async youtube() { return [] }, async arxiv() { return [] } },
    })
    await runCollect(fixed)
    const second = await runCollect(fixed)
    expect(second.created).toBe(0)
  })

  it('두 번째 실행에서는 새 항목만 채택한다', async () => {
    await runCollect(deps(store))
    const report = await runCollect(deps(store, {
      fetchers: {
        async rss() { return [raw(), raw({ url: 'https://a.example.com/post-2' })] },
        async youtube() { return [] },
        async arxiv() { return [] },
      },
    }))
    expect(report.created).toBe(1)
  })

  it('180일보다 오래된 항목은 버린다', async () => {
    const report = await runCollect(deps(store, {
      fetchers: {
        async rss() { return [raw({ publishedAt: '2020-01-01T00:00:00.000Z' })] },
        async youtube() { return [] },
        async arxiv() { return [] },
      },
    }))
    expect(report.created).toBe(0)
  })

  it('한 소스가 실패해도 다른 소스는 계속 처리한다', async () => {
    const two = [
      person({ id: 'person-a', sources: [{ type: 'rss', url: 'https://a.example.com/feed' }] }),
      person({ id: 'person-b', sources: [{ type: 'youtube', channelId: 'UC'.padEnd(24, 'a') }] }),
    ]
    const report = await runCollect(deps(store, {
      registry: { people: two, fields: [{ key: 'llm', nameKo: 'LLM' }] },
      fetchers: {
        async rss() { throw new Error('feed is dead') },
        async youtube() { return [raw({ type: 'video', url: 'https://youtube.com/watch?v=x' })] },
        async arxiv() { return [] },
      },
    }))
    expect(report.created).toBe(1)
    expect(report.sourceFailures).toHaveLength(1)
    expect(report.sourceFailures[0].error).toContain('feed is dead')
  })

  it('연속 5회 실패하면 alerts에 담는다', async () => {
    const failing = deps(store, {
      fetchers: {
        async rss() { throw new Error('dead') },
        async youtube() { return [] },
        async arxiv() { return [] },
      },
    })
    let report = await runCollect(failing)
    for (let i = 0; i < 4; i += 1) report = await runCollect(failing)
    expect(report.alerts).toHaveLength(1)
    expect(report.alerts[0].consecutive).toBe(5)
  })

  it('성공하면 실패 카운터를 0으로 되돌린다', async () => {
    await runCollect(deps(store, {
      fetchers: { async rss() { throw new Error('dead') }, async youtube() { return [] }, async arxiv() { return [] } },
    }))
    await runCollect(deps(store))
    const state = await store.loadState()
    const key = sourceKey('person-a', { type: 'rss', url: 'https://a.example.com/feed' })
    expect(state.sources[key].consecutiveFailures).toBe(0)
  })

  it('요약 결과를 아이템에 담는다', async () => {
    await runCollect(deps(store))
    const items = await store.loadAllItems()
    expect(items[0].summaryKo).toBe('요약.')
    expect(items[0].tags).toEqual(['llm'])
  })

  it('요약이 실패해도 아이템을 버리지 않는다', async () => {
    const report = await runCollect(deps(store, {
      summarizer: { async summarize() { throw new Error('rate limited') } },
    }))
    expect(report.created).toBe(1)
    expect(report.summaryFailures).toBe(1)
    const items = await store.loadAllItems()
    expect(items[0].summaryKo).toBeNull()
  })

  it('요약기가 null이면 호출하지 않는다', async () => {
    const report = await runCollect(deps(store, { summarizer: null }))
    expect(report.summarized).toBe(0)
    expect((await store.loadAllItems())[0].summaryKo).toBeNull()
  })

  it('같은 URL을 두 인물이 내면 아이템 하나에 두 인물을 붙인다', async () => {
    const two = [
      person({ id: 'person-a', sources: [{ type: 'rss', url: 'https://a.example.com/feed' }] }),
      person({ id: 'person-b', sources: [{ type: 'rss', url: 'https://b.example.com/feed' }] }),
    ]
    const report = await runCollect(deps(store, {
      registry: { people: two, fields: [{ key: 'llm', nameKo: 'LLM' }] },
      fetchers: {
        async rss() { return [raw({ url: 'https://arxiv.org/abs/2508.00001' })] },
        async youtube() { return [] },
        async arxiv() { return [] },
      },
    }))
    expect(report.created).toBe(1)
    const items = await store.loadAllItems()
    expect(items[0].personIds).toEqual(['person-a', 'person-b'])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/collect.test.ts
```

기대: FAIL — 모듈 해석 실패.

- [ ] **Step 3: 구현**

`pipeline/collect.ts`:

```ts
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ARXIV_MIN_INTERVAL_MS, fetchArxivItems } from './adapters/arxiv'
import { fetchRssItems } from './adapters/rss'
import { fetchYoutubeItems } from './adapters/youtube'
import type { FetchContext, RawItem } from './adapters/types'
import { itemId } from './normalize'
import { loadRegistry, type Registry } from './registry'
import type { Item, Person, Source, SourceState } from './schema'
import { createFileStore, type Store } from './store'
import { createAnthropicSummarizer, type Summarizer } from './summarize'

const FIRST_RUN_LIMIT = 3
const MAX_AGE_DAYS = 180
const ALERT_THRESHOLD = 5
const MAX_SEEN_IDS = 500
const MAX_SUMMARIES_PER_RUN = 60
const ALERTS_FILE = '.pipeline-out/alerts.json'

export interface CollectDeps {
  registry: Registry
  store: Store
  fetchers: {
    rss(source: Extract<Source, { type: 'rss' }>, ctx: FetchContext): Promise<RawItem[]>
    youtube(source: Extract<Source, { type: 'youtube' }>, ctx: FetchContext): Promise<RawItem[]>
    arxiv(source: Extract<Source, { type: 'arxiv' }>, ctx: FetchContext): Promise<RawItem[]>
  }
  ctx: FetchContext
  summarizer: Summarizer | null
  now: () => Date
}

export interface CollectOptions {
  limit?: number
}

export interface SourceFailure {
  key: string
  error: string
  consecutive: number
}

export interface CollectReport {
  created: number
  merged: number
  summarized: number
  summaryFailures: number
  sourceFailures: SourceFailure[]
  alerts: SourceFailure[]
}

export function sourceKey(personId: string, source: Source): string {
  switch (source.type) {
    case 'rss':
      return `${personId}:rss:${source.url}`
    case 'youtube':
      return `${personId}:youtube:${source.channelId}`
    case 'arxiv':
      return `${personId}:arxiv:${source.author}`
  }
}

function emptySourceState(): SourceState {
  return { lastRunAt: null, seenIds: [], consecutiveFailures: 0, lastError: null }
}

async function fetchFor(
  deps: CollectDeps,
  source: Source,
): Promise<RawItem[]> {
  switch (source.type) {
    case 'rss':
      return deps.fetchers.rss(source, deps.ctx)
    case 'youtube':
      return deps.fetchers.youtube(source, deps.ctx)
    case 'arxiv':
      return deps.fetchers.arxiv(source, deps.ctx)
  }
}

export async function runCollect(
  deps: CollectDeps,
  options: CollectOptions = {},
): Promise<CollectReport> {
  const now = deps.now()
  const nowIso = now.toISOString()
  const oldestAllowed = new Date(now.getTime() - MAX_AGE_DAYS * 86_400_000).toISOString()
  const state = await deps.store.loadState()
  const fieldKeys = deps.registry.fields.map((f) => f.key)

  const sourceFailures: SourceFailure[] = []
  const candidates = new Map<string, Item>()

  const tasks: { person: Person; source: Source; key: string }[] = []
  for (const person of deps.registry.people) {
    for (const source of person.sources) {
      tasks.push({ person, source, key: sourceKey(person.id, source) })
    }
  }

  let lastArxivAt = 0
  for (const task of tasks) {
    const previous = state.sources[task.key] ?? emptySourceState()

    if (task.source.type === 'arxiv') {
      const wait = ARXIV_MIN_INTERVAL_MS - (Date.now() - lastArxivAt)
      if (lastArxivAt !== 0 && wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
      lastArxivAt = Date.now()
    }

    let fetched: RawItem[]
    try {
      fetched = await fetchFor(deps, task.source)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const consecutive = previous.consecutiveFailures + 1
      state.sources[task.key] = {
        ...previous,
        lastRunAt: nowIso,
        consecutiveFailures: consecutive,
        lastError: message,
      }
      sourceFailures.push({ key: task.key, error: message, consecutive })
      continue
    }

    const seen = new Set(previous.seenIds)
    const isFirstRun = previous.seenIds.length === 0

    let accepted = fetched
      .filter((raw) => raw.publishedAt >= oldestAllowed)
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))

    if (isFirstRun) accepted = accepted.slice(0, FIRST_RUN_LIMIT)

    // 첫 실행에서 채택하지 않은 나머지도 "확인 완료"로 기록한다.
    // 그러지 않으면 다음 실행이 밀린 과거 항목을 한꺼번에 끌어온다.
    const fetchedIds = fetched.map((raw) => itemId(raw.url))

    for (const raw of accepted) {
      const id = itemId(raw.url)
      if (seen.has(id)) continue

      const existing = candidates.get(id)
      if (existing) {
        existing.personIds = [...new Set([...existing.personIds, task.person.id])].sort()
        continue
      }
      candidates.set(id, {
        id,
        personIds: [task.person.id],
        type: raw.type,
        title: raw.title,
        url: raw.url,
        publishedAt: raw.publishedAt,
        collectedAt: nowIso,
        lang: raw.lang,
        sourceName: raw.sourceName,
        excerpt: raw.excerpt,
        summaryKo: null,
        tags: [],
      })
    }

    const mergedSeen = [...new Set([...fetchedIds, ...previous.seenIds])].slice(0, MAX_SEEN_IDS)
    state.sources[task.key] = {
      lastRunAt: nowIso,
      seenIds: mergedSeen,
      consecutiveFailures: 0,
      lastError: null,
    }
  }

  const peopleById = new Map(deps.registry.people.map((p) => [p.id, p]))
  const budget = options.limit ?? MAX_SUMMARIES_PER_RUN
  const toSummarize = [...candidates.values()]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, budget)

  let summarized = 0
  let summaryFailures = 0
  if (deps.summarizer) {
    for (const item of toSummarize) {
      try {
        const result = await deps.summarizer.summarize({
          title: item.title,
          excerpt: item.excerpt,
          type: item.type,
          personNames: item.personIds.map((id) => peopleById.get(id)?.name ?? id),
          allowedTags: fieldKeys,
        })
        item.summaryKo = result.summaryKo
        item.tags = result.tags
        summarized += 1
      } catch {
        summaryFailures += 1
      }
    }
  }

  const upsert = await deps.store.upsertItems([...candidates.values()])
  await deps.store.saveState(state)

  const alerts = sourceFailures.filter((f) => f.consecutive >= ALERT_THRESHOLD)

  return {
    created: upsert.created.length,
    merged: upsert.merged.length,
    summarized,
    summaryFailures,
    sourceFailures,
    alerts,
  }
}

async function main(): Promise<void> {
  const root = process.cwd()
  const dryRun = process.argv.includes('--dry-run')
  const limitFlag = process.argv.indexOf('--limit')
  const limit = limitFlag >= 0 ? Number(process.argv[limitFlag + 1]) : undefined

  const registry = await loadRegistry(root)
  const store = createFileStore(root)

  const ctx: FetchContext = {
    async fetchText(url) {
      const response = await fetch(url, {
        headers: { 'user-agent': 'ai-tech-followup/1.0 (+https://github.com)' },
        signal: AbortSignal.timeout(20_000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status} — ${url}`)
      return response.text()
    },
  }

  const report = await runCollect(
    {
      registry,
      store,
      fetchers: { rss: fetchRssItems, youtube: fetchYoutubeItems, arxiv: fetchArxivItems },
      ctx,
      summarizer: dryRun ? null : createAnthropicSummarizer(),
      now: () => new Date(),
    },
    { limit },
  )

  console.log(JSON.stringify(report, null, 2))

  if (report.alerts.length > 0) {
    const file = path.join(root, ALERTS_FILE)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(report.alerts, null, 2)}\n`, 'utf8')
  }
}

if (process.argv[1] && process.argv[1].endsWith('collect.ts')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack : error)
    process.exitCode = 1
  })
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/collect.test.ts
```

기대: 12건 PASS.

- [ ] **Step 5: 실제 피드로 dry-run**

```bash
npm run collect -- --dry-run
```

기대: `created`가 1 이상이고 `sourceFailures`가 빈 배열. `content/items/`에 JSON이 생기고 `summaryKo`는 전부 `null`이다.

**소스가 실패하면 여기서 고친다.** `sourceFailures`에 나온 키의 URL·채널 ID·저자명을 브라우저로 직접 열어 확인하고 `registry/people/*.yaml`을 수정한다. 특히 다음을 확인한다:
- `karpathy.bearblog.dev/feed/` 가 200을 반환하는가
- `https://www.youtube.com/feeds/videos.xml?channel_id=UCXUPKJO5MZQN11PqgIvyuvQ` 가 카파시 채널을 반환하는가
- arXiv `au:"Karpathy_A"` 결과가 동명이인이 아닌지

고친 뒤 `git checkout content && npm run collect -- --dry-run`으로 다시 확인한다.

- [ ] **Step 6: 요약을 포함한 실제 실행**

```bash
git checkout content 2>/dev/null || rm -rf content
export ANTHROPIC_API_KEY=<본인 키>
npm run collect
cat content/items/*.json | head -40
```

기대: `summaryKo`에 한국어 3문장이 들어가고 `tags`가 `fields.yaml`의 키로 채워진다.

- [ ] **Step 7: 커밋**

```bash
git add pipeline/collect.ts tests/collect.test.ts content
git commit -m "feat: 수집 진입점 (첫 실행 제한, 실패 격리, 요약 연결)"
```

---

### Task 10: 주간 하이라이트

**Files:**
- Create: `pipeline/highlights.ts`
- Create: `pipeline/weekly.ts`
- Test: `tests/highlights.test.ts`

**Interfaces:**
- Consumes: `Item`, `Highlight` (2), `isoWeek`/`itemsInWeek` (3), `Store` (7)
- Produces:
  - `heuristicPicks(items: Item[]): { itemId: string; reason: string }[]`
  - `buildHighlight(items: Item[], week: string, curator: Curator | null, now: Date): Promise<Highlight>`
  - `interface Curator { curate(items: Item[]): Promise<{ intro: string; picks: { itemId: string; reason: string }[] }> }`
  - `createAnthropicCurator(): Curator`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/highlights.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildHighlight, heuristicPicks } from '../pipeline/highlights'
import type { Item } from '../pipeline/schema'

const NOW = new Date('2026-08-31T00:00:00.000Z')

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id: id.padEnd(40, '0'),
    personIds: ['person-a'],
    type: 'blog',
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    publishedAt: '2026-08-26T00:00:00.000Z',
    collectedAt: '2026-08-26T06:00:00.000Z',
    lang: 'en',
    sourceName: 'Blog',
    excerpt: '발췌',
    summaryKo: '요약.',
    tags: ['llm'],
    ...overrides,
  }
}

describe('heuristicPicks', () => {
  it('논문을 블로그보다, 블로그를 영상보다 앞세운다', () => {
    const items = [item('a', { type: 'video' }), item('b', { type: 'paper' }), item('c', { type: 'blog' })]
    expect(heuristicPicks(items).map((p) => p.itemId)).toEqual([
      'b'.padEnd(40, '0'),
      'c'.padEnd(40, '0'),
      'a'.padEnd(40, '0'),
    ])
  })

  it('관련 인물이 많은 항목을 우선한다', () => {
    const items = [
      item('a', { type: 'paper', personIds: ['x'] }),
      item('b', { type: 'paper', personIds: ['x', 'y', 'z'] }),
    ]
    expect(heuristicPicks(items)[0].itemId).toBe('b'.padEnd(40, '0'))
  })

  it('최대 3건만 고른다', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id))
    expect(heuristicPicks(items)).toHaveLength(3)
  })

  it('선정 이유를 채운다', () => {
    expect(heuristicPicks([item('a', { type: 'paper' })])[0].reason).not.toBe('')
  })
})

describe('buildHighlight', () => {
  const weekItems = [item('a', { type: 'paper' }), item('b')]

  it('큐레이터가 없으면 휴리스틱으로 만든다', async () => {
    const highlight = await buildHighlight(weekItems, '2026-W35', null, NOW)
    expect(highlight.origin).toBe('heuristic')
    expect(highlight.picks).toHaveLength(2)
    expect(highlight.week).toBe('2026-W35')
    expect(highlight.generatedAt).toBe(NOW.toISOString())
  })

  it('큐레이터가 성공하면 그 결과를 쓴다', async () => {
    const curator = {
      async curate() {
        return {
          intro: '이번 주는 긴 컨텍스트가 화두였다.',
          picks: [{ itemId: 'a'.padEnd(40, '0'), reason: '가장 인용될 논문' }],
        }
      },
    }
    const highlight = await buildHighlight(weekItems, '2026-W35', curator, NOW)
    expect(highlight.origin).toBe('llm')
    expect(highlight.intro).toBe('이번 주는 긴 컨텍스트가 화두였다.')
    expect(highlight.picks).toHaveLength(1)
  })

  it('큐레이터가 실패하면 휴리스틱으로 폴백한다', async () => {
    const curator = { async curate(): Promise<never> { throw new Error('api down') } }
    const highlight = await buildHighlight(weekItems, '2026-W35', curator, NOW)
    expect(highlight.origin).toBe('heuristic')
    expect(highlight.picks.length).toBeGreaterThan(0)
  })

  it('큐레이터가 없는 itemId를 내면 걸러낸다', async () => {
    const curator = {
      async curate() {
        return { intro: '인트로', picks: [{ itemId: 'z'.padEnd(40, '0'), reason: '없는 항목' }] }
      },
    }
    const highlight = await buildHighlight(weekItems, '2026-W35', curator, NOW)
    expect(highlight.origin).toBe('heuristic')
  })

  it('그 주에 항목이 없으면 빈 picks를 준다', async () => {
    const highlight = await buildHighlight([], '2026-W35', null, NOW)
    expect(highlight.picks).toEqual([])
    expect(highlight.intro).not.toBe('')
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/highlights.test.ts
```

기대: FAIL — 모듈 해석 실패.

- [ ] **Step 3: 구현**

`pipeline/highlights.ts`:

```ts
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
```

> Task 8 Step 5에서 `zodOutputFormat` 폴백을 적용했다면 여기도 같은 방식으로 바꾼다.

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/highlights.test.ts
```

기대: 10건 PASS.

- [ ] **Step 5: 주간 진입점 작성**

`pipeline/weekly.ts`:

```ts
import { buildHighlight, createAnthropicCurator } from './highlights'
import { createFileStore } from './store'
import { isoWeek, itemsInWeek } from './week'

async function main(): Promise<void> {
  const root = process.cwd()
  const dryRun = process.argv.includes('--dry-run')
  const weekFlag = process.argv.indexOf('--week')
  const now = new Date()
  const week = weekFlag >= 0 ? process.argv[weekFlag + 1] : isoWeek(now)

  const store = createFileStore(root)
  const all = await store.loadAllItems()
  const weekItems = itemsInWeek(all, week)

  const highlight = await buildHighlight(
    weekItems,
    week,
    dryRun ? null : createAnthropicCurator(),
    now,
  )

  await store.saveHighlight(highlight)
  console.log(
    JSON.stringify(
      { week, itemCount: weekItems.length, origin: highlight.origin, picks: highlight.picks.length },
      null,
      2,
    ),
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})
```

- [ ] **Step 6: 실제 데이터로 실행**

```bash
export ANTHROPIC_API_KEY=<본인 키>
npm run weekly
cat content/highlights/*.json
```

기대: `origin`이 `"llm"`이고 `picks`가 최대 3건. 이번 주 수집분이 없다면 `--week`로 항목이 있는 주차를 지정해 확인한다.

```bash
npm run weekly -- --week 2026-W35
```

- [ ] **Step 7: 커밋**

```bash
git add pipeline/highlights.ts pipeline/weekly.ts tests/highlights.test.ts content
git commit -m "feat: 주간 하이라이트 생성 (LLM 큐레이터 + 휴리스틱 폴백)"
```

---

### Task 11: 사이트 데이터 레이어와 공용 컴포넌트

**Files:**
- Create: `src/lib/content.ts`
- Create: `src/lib/format.ts`
- Create: `src/components/monogram.tsx`
- Create: `src/components/person-avatar.tsx`
- Create: `src/components/item-card.tsx`
- Create: `src/components/person-card.tsx`
- Create: `src/components/site-header.tsx`
- Create: `src/components/site-footer.tsx`
- Test: `tests/content.test.ts`

**Interfaces:**
- Consumes: `Item`, `Person`, `Field`, `Highlight` (2), `loadRegistry` (2), `createFileStore` (7)
- Produces:
  - `getSiteData(): Promise<SiteData>` — `{ people, fields, items, weeks }`, 프로세스 내 1회만 읽는다
  - `getHighlight(week: string): Promise<Highlight | null>`
  - `peopleById(data: SiteData): Map<string, Person>`
  - `fieldsOfItem(item: Item, peopleById: Map<string, Person>): string[]` — 태그가 비면 저자의 분야로 폴백
  - `itemsByField(data: SiteData, fieldKey: string): Item[]`
  - `itemsByPerson(data: SiteData, personId: string): Item[]`
  - `fieldName(data: SiteData, key: string): string`
  - `formatDate(iso: string): string` — `"2026.08.20"`
  - `TYPE_LABEL: Record<Item['type'], string>`, `weekLabel(week: string): string`
  - 컴포넌트: `<Monogram name seed />`, `<PersonAvatar person size />`, `<ItemCard item people />`, `<PersonCard person count />`, `<SiteHeader />`, `<SiteFooter />`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/content.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fieldsOfItem, itemsByField, itemsByPerson, type SiteData } from '../src/lib/content'
import type { Item, Person } from '../pipeline/schema'

function person(id: string, fields: string[]): Person {
  return {
    id,
    name: id,
    nameKo: id,
    affiliation: 'Lab',
    formerly: [],
    fields,
    bio: '설명',
    links: {},
    avatar: null,
    sources: [{ type: 'rss', url: 'https://example.com/feed' }],
  }
}

function item(id: string, overrides: Partial<Item> = {}): Item {
  return {
    id: id.padEnd(40, '0'),
    personIds: ['alice'],
    type: 'blog',
    title: `Title ${id}`,
    url: `https://example.com/${id}`,
    publishedAt: '2026-08-20T00:00:00.000Z',
    collectedAt: '2026-08-20T06:00:00.000Z',
    lang: 'en',
    sourceName: 'Blog',
    excerpt: '발췌',
    summaryKo: '요약.',
    tags: ['llm'],
    ...overrides,
  }
}

const DATA: SiteData = {
  people: [person('alice', ['llm', 'safety']), person('bob', ['robotics'])],
  fields: [
    { key: 'llm', nameKo: 'LLM' },
    { key: 'safety', nameKo: '안전' },
    { key: 'robotics', nameKo: '로보틱스' },
  ],
  items: [
    item('a', { tags: ['llm'] }),
    item('b', { tags: [], personIds: ['bob'] }),
    item('c', { tags: ['safety'], personIds: ['alice', 'bob'] }),
  ],
  weeks: ['2026-W34'],
}

const PEOPLE_BY_ID = new Map(DATA.people.map((p) => [p.id, p]))

describe('fieldsOfItem', () => {
  it('태그가 있으면 태그를 쓴다', () => {
    expect(fieldsOfItem(DATA.items[0], PEOPLE_BY_ID)).toEqual(['llm'])
  })

  it('태그가 비면 저자의 분야로 폴백한다', () => {
    expect(fieldsOfItem(DATA.items[1], PEOPLE_BY_ID)).toEqual(['robotics'])
  })

  it('저자가 여럿이면 분야를 합친다', () => {
    const orphan = item('d', { tags: [], personIds: ['alice', 'bob'] })
    expect(fieldsOfItem(orphan, PEOPLE_BY_ID).sort()).toEqual(['llm', 'robotics', 'safety'])
  })
})

describe('itemsByField', () => {
  it('해당 분야 항목만 최신순으로 준다', () => {
    expect(itemsByField(DATA, 'llm').map((i) => i.title)).toEqual(['Title a'])
    expect(itemsByField(DATA, 'robotics').map((i) => i.title)).toEqual(['Title b'])
  })
})

describe('itemsByPerson', () => {
  it('해당 인물이 관련된 항목만 준다', () => {
    expect(itemsByPerson(DATA, 'bob').map((i) => i.title).sort()).toEqual(['Title b', 'Title c'])
  })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

```bash
npx vitest run tests/content.test.ts
```

기대: FAIL — 모듈 해석 실패.

- [ ] **Step 3: 데이터 레이어 작성**

`src/lib/content.ts`:

```ts
import { loadRegistry } from '../../pipeline/registry'
import type { Field, Highlight, Item, Person } from '../../pipeline/schema'
import { createFileStore } from '../../pipeline/store'

export type { Field, Highlight, Item, Person }

export interface SiteData {
  people: Person[]
  fields: Field[]
  items: Item[]
  weeks: string[]
}

let cached: Promise<SiteData> | null = null

export function getSiteData(): Promise<SiteData> {
  if (!cached) {
    cached = (async () => {
      const root = process.cwd()
      const { people, fields } = await loadRegistry(root)
      const store = createFileStore(root)
      const [items, weeks] = await Promise.all([store.loadAllItems(), store.listWeeks()])
      return { people, fields, items, weeks }
    })()
  }
  return cached
}

export async function getHighlight(week: string): Promise<Highlight | null> {
  return createFileStore(process.cwd()).loadHighlight(week)
}

export function peopleById(data: SiteData): Map<string, Person> {
  return new Map(data.people.map((p) => [p.id, p]))
}

export function fieldsOfItem(item: Item, people: Map<string, Person>): string[] {
  if (item.tags.length > 0) return item.tags
  const inherited = new Set<string>()
  for (const id of item.personIds) {
    for (const key of people.get(id)?.fields ?? []) inherited.add(key)
  }
  return [...inherited].sort()
}

export function itemsByField(data: SiteData, fieldKey: string): Item[] {
  const people = peopleById(data)
  return data.items.filter((item) => fieldsOfItem(item, people).includes(fieldKey))
}

export function itemsByPerson(data: SiteData, personId: string): Item[] {
  return data.items.filter((item) => item.personIds.includes(personId))
}

export function fieldName(data: SiteData, key: string): string {
  return data.fields.find((f) => f.key === key)?.nameKo ?? key
}
```

`data.items`는 `loadAllItems`가 이미 최신순으로 정렬해 돌려주므로 파생 함수들은 정렬을 다시 하지 않는다.

- [ ] **Step 4: 테스트 통과 확인**

```bash
npx vitest run tests/content.test.ts
```

기대: 5건 PASS.

- [ ] **Step 5: 포맷 유틸 작성**

`src/lib/format.ts`:

```ts
import type { Item } from '../../pipeline/schema'

export function formatDate(iso: string): string {
  const date = new Date(iso)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}.${month}.${day}`
}

export const TYPE_LABEL: Record<Item['type'], string> = {
  blog: '글',
  paper: '논문',
  video: '영상',
}

export function weekLabel(week: string): string {
  const [year, number] = week.split('-W')
  return `${year}년 ${Number(number)}주차`
}
```

- [ ] **Step 6: 모노그램과 아바타 작성**

`src/components/monogram.tsx`:

```tsx
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
```

`src/components/person-avatar.tsx`:

```tsx
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
```

- [ ] **Step 7: 카드 컴포넌트 작성**

`src/components/item-card.tsx`:

```tsx
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { Item, Person } from '@/lib/content'
import { formatDate, TYPE_LABEL } from '@/lib/format'

export function ItemCard({
  item,
  people,
  emphasis = false,
}: {
  item: Item
  people: Map<string, Person>
  emphasis?: boolean
}) {
  const authors = item.personIds.map((id) => people.get(id)).filter((p): p is Person => Boolean(p))

  return (
    <article
      className={`group flex h-full flex-col gap-3 rounded-xl border p-5 transition-colors hover:border-foreground/30 ${
        emphasis ? 'border-foreground/25 bg-muted/40' : 'border-border'
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{TYPE_LABEL[item.type]}</Badge>
        <span>{item.sourceName}</span>
        <span aria-hidden>·</span>
        <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
      </div>

      <h3 className={emphasis ? 'text-xl font-semibold leading-snug' : 'text-base font-semibold leading-snug'}>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-4 hover:underline"
        >
          {item.title}
        </a>
      </h3>

      <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
        {item.summaryKo ?? item.excerpt}
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {authors.map((person) => (
          <Link
            key={person.id}
            href={`/people/${person.id}`}
            className="text-muted-foreground hover:text-foreground"
          >
            {person.nameKo}
          </Link>
        ))}
      </div>
    </article>
  )
}
```

`src/components/person-card.tsx`:

```tsx
import Link from 'next/link'
import type { Person } from '@/lib/content'
import { PersonAvatar } from './person-avatar'

export function PersonCard({ person, count }: { person: Person; count: number }) {
  return (
    <Link
      href={`/people/${person.id}`}
      className="flex items-center gap-4 rounded-xl border border-border p-4 transition-colors hover:border-foreground/30"
    >
      <PersonAvatar person={person} size={48} />
      <div className="min-w-0">
        <div className="truncate font-semibold">{person.nameKo}</div>
        <div className="truncate text-sm text-muted-foreground">{person.affiliation}</div>
        <div className="mt-1 text-xs text-muted-foreground">{count}건</div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 8: 헤더·푸터 작성**

`src/components/site-header.tsx`:

```tsx
import Link from 'next/link'

const NAV = [
  { href: '/fields', label: '분야' },
  { href: '/people', label: '인물' },
  { href: '/weekly', label: '주간' },
]

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          AI Tech Followup
        </Link>
        <nav className="flex gap-5 text-sm text-muted-foreground">
          {NAV.map((entry) => (
            <Link key={entry.href} href={entry.href} className="hover:text-foreground">
              {entry.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
```

`src/components/site-footer.tsx`:

```tsx
export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border">
      <div className="mx-auto max-w-5xl px-6 py-8 text-xs leading-relaxed text-muted-foreground">
        <p>
          이 사이트는 각 저자가 공개한 피드에서 제목과 발췌만 수집해 한국어 요약과 원문 링크를
          제공합니다. 원문 본문을 보관하지 않으며, 모든 저작권은 원저자에게 있습니다.
        </p>
        <p className="mt-2">
          <a href="/feed.xml" className="hover:text-foreground">
            RSS
          </a>
        </p>
      </div>
    </footer>
  )
}
```

- [ ] **Step 9: 레이아웃에 헤더·푸터 연결**

`src/app/layout.tsx`의 `<body>` 내부를 아래로 교체한다(폰트 클래스와 `metadata`는 create-next-app이 넣은 것을 유지).

```tsx
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SiteHeader />
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
        <SiteFooter />
      </body>
```

파일 상단에 import를 추가한다:

```tsx
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
```

또한 `metadata`를 아래로 바꾼다:

```tsx
export const metadata: Metadata = {
  title: 'AI Tech Followup',
  description: 'AI 분야 연구자와 기술자들의 새 글·논문·강연을 한국어 요약으로 따라갑니다.',
}
```

- [ ] **Step 10: 타입체크와 커밋**

```bash
npm run typecheck && npx vitest run tests/content.test.ts
git add src tests/content.test.ts
git commit -m "feat: 사이트 데이터 레이어와 공용 컴포넌트"
```

---

### Task 12: 홈과 분야 페이지

**Files:**
- Modify: `src/app/page.tsx` (전체 교체)
- Create: `src/app/fields/page.tsx`
- Create: `src/app/fields/[field]/page.tsx`
- Create: `src/components/field-row.tsx`

**Interfaces:**
- Consumes: Task 11의 전부
- Produces: `<FieldRow field items people />` — 분야 하나의 가로 스크롤 행

- [ ] **Step 1: FieldRow 컴포넌트 작성**

`src/components/field-row.tsx`:

```tsx
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
```

- [ ] **Step 2: 홈 페이지 작성**

`src/app/page.tsx` 전체를 아래로 교체한다.

```tsx
import Link from 'next/link'
import { ItemCard } from '@/components/item-card'
import { PersonAvatar } from '@/components/person-avatar'
import {
  fieldsOfItem,
  getHighlight,
  getSiteData,
  peopleById,
  type Item,
  type Person,
} from '@/lib/content'
import { weekLabel } from '@/lib/format'
import { isoWeek, itemsInWeek } from '../../pipeline/week'

export default async function HomePage() {
  const data = await getSiteData()
  const people = peopleById(data)

  const latestWeek = data.weeks[0] ?? isoWeek(new Date())
  const highlight = await getHighlight(latestWeek)
  const weekItems = itemsInWeek(data.items, latestWeek)
  const itemsById = new Map(data.items.map((item) => [item.id, item]))

  const picks = (highlight?.picks ?? [])
    .map((pick) => ({ item: itemsById.get(pick.itemId), reason: pick.reason }))
    .filter((entry): entry is { item: Item; reason: string } => Boolean(entry.item))

  const activePeople = [...new Set(weekItems.flatMap((item) => item.personIds))]
    .map((id) => people.get(id))
    .filter((person): person is Person => person !== undefined)

  const fieldCounts = data.fields
    .map((field) => ({
      field,
      count: weekItems.filter((item) => fieldsOfItem(item, people).includes(field.key)).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)

  return (
    <div>
      <section className="mb-12">
        <div className="mb-1 text-sm text-muted-foreground">{weekLabel(latestWeek)} 하이라이트</div>
        <p className="mb-8 text-2xl font-semibold leading-snug tracking-tight">
          {highlight?.intro ?? '아직 수집된 항목이 없습니다.'}
        </p>

        {picks.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            {picks.map(({ item, reason }, index) => (
              <div key={item.id} className={index === 0 ? 'md:col-span-3' : ''}>
                <ItemCard item={item} people={people} emphasis={index === 0} />
                <p className="mt-2 px-1 text-xs text-muted-foreground">{reason}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {activePeople.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold">이번 주 활동한 사람</h2>
          <div className="flex flex-wrap gap-5">
            {activePeople.map((person) => (
              <Link
                key={person.id}
                href={`/people/${person.id}`}
                className="flex w-20 flex-col items-center gap-2 text-center"
              >
                <PersonAvatar person={person} size={56} />
                <span className="text-xs leading-tight text-muted-foreground">{person.nameKo}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {fieldCounts.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold">분야별</h2>
          <div className="flex flex-wrap gap-2">
            {fieldCounts.map(({ field, count }) => (
              <Link
                key={field.key}
                href={`/fields/${field.key}`}
                className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              >
                {field.nameKo} <span className="text-xs">{count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">최근 올라온 것</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {data.items.slice(0, 12).map((item) => (
            <ItemCard key={item.id} item={item} people={people} />
          ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 3: 분야 인덱스 페이지 작성**

`src/app/fields/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { FieldRow } from '@/components/field-row'
import { getSiteData, itemsByField, peopleById } from '@/lib/content'

export const metadata: Metadata = { title: '분야별 · AI Tech Followup' }

export default async function FieldsPage() {
  const data = await getSiteData()
  const people = peopleById(data)

  return (
    <div>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">분야별</h1>
      {data.fields.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          items={itemsByField(data, field.key)}
          people={people}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 분야 상세 페이지 작성**

`src/app/fields/[field]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ItemCard } from '@/components/item-card'
import { fieldName, getSiteData, itemsByField, peopleById } from '@/lib/content'

type Params = { params: Promise<{ field: string }> }

export async function generateStaticParams() {
  const data = await getSiteData()
  return data.fields.map((field) => ({ field: field.key }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { field } = await params
  const data = await getSiteData()
  return { title: `${fieldName(data, field)} · AI Tech Followup` }
}

export default async function FieldPage({ params }: Params) {
  const { field } = await params
  const data = await getSiteData()
  if (!data.fields.some((f) => f.key === field)) notFound()

  const people = peopleById(data)
  const items = itemsByField(data, field)

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">{fieldName(data, field)}</h1>
      <p className="mb-8 text-sm text-muted-foreground">{items.length}건</p>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} people={people} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 빌드와 육안 확인**

```bash
npm run build && npm run dev
```

브라우저에서 `http://localhost:3000`, `/fields`, `/fields/llm`을 연다.

확인 항목:
- 홈 상단에 주간 인트로와 하이라이트 카드가 나온다
- 카드의 제목 링크를 누르면 새 탭에서 원문이 열린다
- `/fields`에서 각 분야 행이 가로로 스크롤된다
- 콘솔에 에러가 없다

- [ ] **Step 6: 커밋**

```bash
git add src/app/page.tsx src/app/fields src/components/field-row.tsx
git commit -m "feat: 홈(매거진형)과 분야 페이지(가로 섹션)"
```

---

### Task 13: 인물·주간 페이지와 RSS 출력

**Files:**
- Create: `src/app/people/page.tsx`
- Create: `src/app/people/[id]/page.tsx`
- Create: `src/app/weekly/page.tsx`
- Create: `src/app/weekly/[week]/page.tsx`
- Create: `src/app/feed.xml/route.ts`

**Interfaces:**
- Consumes: Task 11·12의 전부
- Produces: 없음 (터미널 라우트)

- [ ] **Step 1: 인물 인덱스 작성**

`src/app/people/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { PersonCard } from '@/components/person-card'
import { getSiteData, itemsByPerson } from '@/lib/content'

export const metadata: Metadata = { title: '인물 · AI Tech Followup' }

export default async function PeoplePage() {
  const data = await getSiteData()

  return (
    <div>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">인물</h1>
      {data.fields.map((field) => {
        const members = data.people.filter((person) => person.fields.includes(field.key))
        if (members.length === 0) return null
        return (
          <section key={field.key} className="mb-10">
            <h2 className="mb-4 text-lg font-semibold">{field.nameKo}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {members.map((person) => (
                <PersonCard
                  key={person.id}
                  person={person}
                  count={itemsByPerson(data, person.id).length}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
```

인물은 여러 분야에 속할 수 있어 여러 섹션에 중복 노출된다. 이는 의도된 것이다 — 분야별로 훑는 것이 이 페이지의 목적이므로, 한 곳에만 넣으면 찾기가 어려워진다.

- [ ] **Step 2: 인물 상세 작성**

`src/app/people/[id]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ItemCard } from '@/components/item-card'
import { PersonAvatar } from '@/components/person-avatar'
import { fieldName, getSiteData, itemsByPerson, peopleById } from '@/lib/content'

type Params = { params: Promise<{ id: string }> }

export async function generateStaticParams() {
  const data = await getSiteData()
  return data.people.map((person) => ({ id: person.id }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params
  const data = await getSiteData()
  const person = data.people.find((p) => p.id === id)
  return { title: `${person?.nameKo ?? id} · AI Tech Followup` }
}

export default async function PersonPage({ params }: Params) {
  const { id } = await params
  const data = await getSiteData()
  const person = data.people.find((p) => p.id === id)
  if (!person) notFound()

  const people = peopleById(data)
  const items = itemsByPerson(data, person.id)
  const links = Object.entries(person.links) as [string, string][]

  return (
    <div>
      <header className="mb-10 flex flex-wrap items-start gap-5">
        <PersonAvatar person={person} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{person.nameKo}</h1>
          <p className="text-sm text-muted-foreground">{person.name}</p>
          <p className="mt-2 text-sm">
            {person.affiliation}
            {person.formerly.length > 0 && (
              <span className="text-muted-foreground"> · 전 {person.formerly.join(', ')}</span>
            )}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{person.bio}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {person.fields.map((key) => (
              <span key={key} className="rounded-full border border-border px-2.5 py-0.5 text-xs">
                {fieldName(data, key)}
              </span>
            ))}
          </div>

          {links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              {links.map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  {label}
                </a>
              ))}
            </div>
          )}
        </div>
      </header>

      <h2 className="mb-4 text-lg font-semibold">타임라인 ({items.length})</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} people={people} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 주간 인덱스 작성**

`src/app/weekly/page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { getHighlight, getSiteData } from '@/lib/content'
import { weekLabel } from '@/lib/format'
import { itemsInWeek } from '../../../pipeline/week'

export const metadata: Metadata = { title: '주간 아카이브 · AI Tech Followup' }

export default async function WeeklyIndexPage() {
  const data = await getSiteData()
  const rows = await Promise.all(
    data.weeks.map(async (week) => ({
      week,
      intro: (await getHighlight(week))?.intro ?? '',
      count: itemsInWeek(data.items, week).length,
    })),
  )

  return (
    <div>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">주간 아카이브</h1>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.week} className="py-5">
            <Link href={`/weekly/${row.week}`} className="group block">
              <div className="text-sm text-muted-foreground">
                {weekLabel(row.week)} · {row.count}건
              </div>
              <p className="mt-1 leading-snug group-hover:underline">{row.intro}</p>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">아직 아카이브가 없습니다.</p>}
    </div>
  )
}
```

- [ ] **Step 4: 주간 상세 작성**

`src/app/weekly/[week]/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ItemCard } from '@/components/item-card'
import { getHighlight, getSiteData, peopleById, type Item } from '@/lib/content'
import { weekLabel } from '@/lib/format'
import { itemsInWeek } from '../../../../pipeline/week'

type Params = { params: Promise<{ week: string }> }

export async function generateStaticParams() {
  const data = await getSiteData()
  return data.weeks.map((week) => ({ week }))
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { week } = await params
  return { title: `${weekLabel(week)} · AI Tech Followup` }
}

export default async function WeekPage({ params }: Params) {
  const { week } = await params
  const data = await getSiteData()
  if (!data.weeks.includes(week)) notFound()

  const people = peopleById(data)
  const highlight = await getHighlight(week)
  const items = itemsInWeek(data.items, week)
  const itemsById = new Map(data.items.map((item) => [item.id, item]))

  const picks = (highlight?.picks ?? [])
    .map((pick) => ({ item: itemsById.get(pick.itemId), reason: pick.reason }))
    .filter((entry): entry is { item: Item; reason: string } => Boolean(entry.item))
  const pickIds = new Set(picks.map((p) => p.item.id))

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">{weekLabel(week)}</h1>
      <p className="mb-10 leading-relaxed text-muted-foreground">{highlight?.intro}</p>

      {picks.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-semibold">하이라이트</h2>
          <div className="grid gap-4">
            {picks.map(({ item, reason }) => (
              <div key={item.id}>
                <ItemCard item={item} people={people} emphasis />
                <p className="mt-2 px-1 text-xs text-muted-foreground">{reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">이번 주 전체 ({items.length})</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {items
            .filter((item) => !pickIds.has(item.id))
            .map((item) => (
              <ItemCard key={item.id} item={item} people={people} />
            ))}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 5: RSS 출력 작성**

`src/app/feed.xml/route.ts`:

```ts
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
```

- [ ] **Step 6: 빌드와 확인**

```bash
npm run build
```

기대: 빌드 로그에 `/people/[id]`와 `/weekly/[week]`가 정적 페이지로 생성되고, `/feed.xml`이 `○ (Static)`으로 표시된다.

```bash
npm run dev
```

`/people`, `/people/andrej-karpathy`, `/weekly`, `/weekly/<주차>`, `/feed.xml`을 열어 확인한다. `/feed.xml`은 RSS 리더에 넣어봐도 좋다.

- [ ] **Step 7: 커밋**

```bash
git add src/app/people src/app/weekly src/app/feed.xml
git commit -m "feat: 인물·주간 페이지와 사이트 RSS 출력"
```

---

### Task 14: GitHub Actions 자동화와 배포

**Files:**
- Create: `.github/workflows/collect.yml`
- Create: `.github/workflows/weekly.yml`
- Create: `.github/scripts/report-alerts.sh`
- Create: `README.md`

**Interfaces:**
- Consumes: `npm run collect`, `npm run weekly` (Task 9·10), `.pipeline-out/alerts.json` (Task 9)
- Produces: 6시간마다 자동 수집·커밋, 매주 화요일 하이라이트 생성·커밋

- [ ] **Step 1: 알림 스크립트 작성**

`.github/scripts/report-alerts.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ALERTS=".pipeline-out/alerts.json"
[ -f "$ALERTS" ] || { echo "죽은 소스 없음"; exit 0; }

count=$(jq 'length' "$ALERTS")
echo "연속 실패 소스 ${count}개"

for i in $(seq 0 $((count - 1))); do
  key=$(jq -r ".[$i].key" "$ALERTS")
  err=$(jq -r ".[$i].error" "$ALERTS")
  n=$(jq -r ".[$i].consecutive" "$ALERTS")
  title="소스 수집 실패: ${key}"

  existing=$(gh issue list --state open --search "$title" --json title \
    --jq "[.[] | select(.title == \"$title\")] | length")
  if [ "$existing" != "0" ]; then
    echo "이미 이슈가 열려 있음: $title"
    continue
  fi

  gh issue create --title "$title" --label "source-down" --body "$(cat <<EOF
소스 \`${key}\` 가 ${n}회 연속으로 실패했습니다.

마지막 에러:
\`\`\`
${err}
\`\`\`

확인할 것:
- 피드 URL / 채널 ID / arXiv 저자명이 아직 유효한가
- 사이트가 피드 제공을 중단했는가

고칠 곳: \`registry/people/\` 아래 해당 인물 YAML
EOF
)"
done
```

```bash
chmod +x .github/scripts/report-alerts.sh
```

`source-down` 라벨은 없으면 `gh issue create`가 실패한다. 미리 만든다:

```bash
gh label create source-down --description "수집 소스가 연속 실패" --color D93F0B
```

(원격이 아직 없으면 Step 5 이후에 실행한다.)

- [ ] **Step 2: 수집 워크플로 작성**

`.github/workflows/collect.yml`:

```yaml
name: collect

on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch:

concurrency:
  group: content-write
  cancel-in-progress: false

permissions:
  contents: write
  issues: write

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: 수집과 요약
        run: npm run collect
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - name: 변경분 커밋
        run: |
          if [ -z "$(git status --porcelain content)" ]; then
            echo "새 아이템 없음 — 커밋하지 않음"
            exit 0
          fi
          git config user.name "followup-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add content
          git commit -m "chore(content): $(date -u +%Y-%m-%dT%H:%MZ) 수집"
          git push
      - name: 죽은 소스 이슈 생성
        if: always()
        run: ./.github/scripts/report-alerts.sh
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: 주간 워크플로 작성**

`.github/workflows/weekly.yml`:

```yaml
name: weekly

on:
  schedule:
    - cron: '0 0 * * 2'
  workflow_dispatch:

concurrency:
  group: content-write
  cancel-in-progress: false

permissions:
  contents: write

jobs:
  highlight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: 주간 하이라이트 생성
        run: npm run weekly
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - name: 변경분 커밋
        run: |
          if [ -z "$(git status --porcelain content)" ]; then
            echo "변경 없음"
            exit 0
          fi
          git config user.name "followup-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add content
          git commit -m "chore(content): 주간 하이라이트 생성"
          git push
```

`concurrency.group`을 두 워크플로가 `content-write`로 공유한다. 둘 다 `content/`에 커밋하고 push하므로 동시에 돌면 push가 충돌한다.

- [ ] **Step 4: README 작성**

`README.md`:

```markdown
# AI Tech Followup

AI 분야 연구자·기술자들의 새 글·논문·강연을 자동으로 모아 한국어 요약과 원문 링크로 보여주는 사이트.

## 어떻게 돌아가나

- GitHub Actions가 6시간마다 `registry/people/*.yaml`에 적힌 소스(RSS·arXiv·YouTube)를 수집한다.
- 새 항목은 Claude Sonnet 5가 한국어 3문장으로 요약하고 분야 태그를 붙인다.
- 결과는 `content/`에 JSON으로 커밋되고, 그 push를 Vercel이 감지해 정적 사이트를 재배포한다.
- 원문 본문은 크롤링하지도 저장하지도 않는다. 요약과 링크만 보관한다.

로컬 머신에서 상시 실행되는 프로세스는 없다.

## 인물 추가하기

`registry/people/<id>.yaml`을 만든다. 파일명과 `id`가 같아야 한다.

```yaml
id: someone
name: Some One
nameKo: 썸원
affiliation: Some Lab
formerly: []
fields: [llm]            # registry/fields.yaml의 key만 허용
bio: 한 문장 소개.
links: { homepage: https://example.com }
avatar: null             # null이면 이니셜 아바타 자동 생성
sources:
  - { type: rss, url: https://example.com/feed.xml }
```

검증:

```bash
npm run validate:registry
```

## 명령

```bash
npm run dev                  # 개발 서버
npm run build                # 정적 빌드
npm test                     # 단위 테스트
npm run typecheck            # 타입 검사
npm run validate:registry    # registry YAML 검증
npm run collect              # 수집 + 요약 (ANTHROPIC_API_KEY 필요)
npm run collect -- --dry-run # 요약 없이 수집만
npm run weekly               # 주간 하이라이트 생성
npm run weekly -- --week 2026-W35
```

## 시크릿

- GitHub Secrets: `ANTHROPIC_API_KEY`
- Vercel 환경변수: `SITE_URL`

## 저작권

각 항목의 저작권은 원저자에게 있다. 이 사이트는 각 저자가 공개한 피드에서 제목과 발췌만 받아 요약하고 원문으로 링크한다.
```

- [ ] **Step 5: GitHub 레포 생성과 push**

```bash
git add -A
git commit -m "feat: 자동 수집·주간 워크플로와 README"
gh repo create AI-Tech-Followup --public --source=. --remote=origin --push
```

기대: 원격이 생성되고 `main`이 push된다. `gh repo view --web`으로 확인한다.

- [ ] **Step 6: GitHub 시크릿과 라벨 등록**

```bash
gh secret set ANTHROPIC_API_KEY
gh label create source-down --description "수집 소스가 연속 실패" --color D93F0B
```

- [ ] **Step 7: 워크플로 수동 실행으로 검증**

```bash
gh workflow run collect.yml
gh run watch
```

기대: 워크플로가 성공하고, 새 항목이 있었다면 `chore(content): ...` 커밋이 원격에 올라온다. 실패하면 `gh run view --log-failed`로 원인을 확인한다.

- [ ] **Step 8: Vercel 배포**

이 단계는 브라우저 로그인이 필요하다.

```bash
npx vercel login
npx vercel link
npx vercel env add SITE_URL production
# 값은 배포 후 확정되므로 일단 https://ai-tech-followup.vercel.app 를 넣고,
# 실제 주소가 다르면 Step 9에서 고친다
npx vercel --prod
```

또는 Vercel 대시보드에서 GitHub 레포를 Import한다(이쪽이 push 자동 배포 연결까지 한 번에 된다).

- [ ] **Step 9: 자동 배포 확인**

Vercel 프로젝트 설정에서 Git 연동이 `main` 브랜치에 걸려 있는지 확인한다. 그 다음:

```bash
gh workflow run collect.yml
gh run watch
```

수집 커밋이 push된 뒤 Vercel 대시보드에 새 배포가 뜨는지 확인한다. 실제 배포 주소가 `SITE_URL`과 다르면 고친다:

```bash
npx vercel env rm SITE_URL production
npx vercel env add SITE_URL production
```

- [ ] **Step 10: 최종 확인과 커밋**

```bash
npm test && npm run typecheck && npm run validate:registry && npm run build
git status
```

기대: 모두 통과하고 워킹 트리가 깨끗하다.

배포된 사이트에서 확인한다:
- 홈에 하이라이트가 보인다
- `/people/andrej-karpathy` 등 인물 페이지가 열린다
- `/feed.xml`이 RSS로 열린다
- 카드의 원문 링크가 새 탭에서 열린다

---

## 1단계 완료 조건

- `npm test`, `npm run typecheck`, `npm run validate:registry`, `npm run build`가 모두 통과한다.
- `gh workflow run collect.yml`이 성공하고 새 항목이 커밋된다.
- 커밋 push가 Vercel 배포를 자동으로 트리거한다.
- 배포된 사이트에서 홈·분야·인물·주간·RSS가 모두 동작한다.
- 로컬 머신을 꺼도 위가 계속 동작한다.

2단계(구독과 이메일)는 별도 계획으로 작성한다.
