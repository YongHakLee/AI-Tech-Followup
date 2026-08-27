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
