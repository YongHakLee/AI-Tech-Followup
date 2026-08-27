import { buildHighlight, createAnthropicCurator } from './highlights'
import { createFileStore } from './store'
import { completedWeek, itemsInWeek } from './week'

async function main(): Promise<void> {
  const root = process.cwd()
  const dryRun = process.argv.includes('--dry-run')
  const weekFlag = process.argv.indexOf('--week')
  const now = new Date()
  const week = weekFlag >= 0 ? process.argv[weekFlag + 1] : completedWeek(now)

  const store = createFileStore(root, { readOnly: dryRun })
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
