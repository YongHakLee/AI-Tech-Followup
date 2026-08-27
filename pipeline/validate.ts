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
