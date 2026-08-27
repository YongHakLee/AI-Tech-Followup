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
