# AI Tech Followup

A site that automatically collects new posts, papers, and talks from AI researchers and
engineers, and presents them as Korean summaries with links to the originals.

## How it works

- A GitHub Actions workflow runs every 6 hours and polls the sources listed in
  `registry/people/*.yaml` (RSS, arXiv, YouTube).
- New items are summarized by Claude Sonnet 5 into three Korean sentences and tagged by field.
- Every Tuesday at 09:00 KST, highlights are generated for the **most recently completed week**.
- Results are committed to `content/` as JSON, and that push triggers a Vercel redeploy.
  If only the run timestamp changed, nothing is committed — otherwise pointless redeploys
  would pile up every 6 hours.
- Source articles are never crawled or stored. Only summaries and links are kept.

Nothing runs continuously on a local machine.

## Adding a person

Create `registry/people/<id>.yaml`. The filename must match the `id`.

```yaml
id: someone
name: Some One
nameKo: 썸원
affiliation: Some Lab
formerly: []
fields: [llm]            # only keys defined in registry/fields.yaml
bio: One-sentence introduction.
links: { homepage: https://example.com }
avatar: null             # null generates an initials avatar
sources:
  - { type: rss, url: https://example.com/feed.xml }
  - { type: youtube, channelId: UCXXXXXXXXXXXXXXXXXXXXXX }
  - { type: arxiv, author: Karpathy_Andrej }
```

The `author` field of an `arxiv` source must use the **`Lastname_Firstname`** format.
`Lastname_Initial` (`Karpathy_A`) does not match the arXiv index and returns HTTP 200 with
**zero results**. Because that is an empty result rather than an error, it never trips the
consecutive-failure alert — so after adding a source, confirm that it actually returns items.

Validate with:

```bash
npm run validate:registry
```

## Commands

```bash
npm run dev                  # development server
npm run build                # production build (most routes are statically prerendered)
npm test                     # unit tests
npm run typecheck            # type checking
npm run validate:registry    # validate registry YAML
npm run collect              # collect + summarize (requires ANTHROPIC_API_KEY)
npm run collect -- --dry-run # collect only, no summarization
npm run collect -- --limit 5 # cap the number of summaries for this run
npm run weekly               # generate weekly highlights (defaults to the last completed week)
npm run weekly -- --week 2026-W35   # regenerate a specific week
npm run weekly -- --dry-run          # heuristics only, no LLM curation
```

## First-time setup

Four things must be in place before the automation can run. Missing any one of them will
break the first run.

1. **`ANTHROPIC_API_KEY` in GitHub Secrets** — without it the workflow fails immediately.
   (This is deliberate. Running without a key would silently commit failed summaries, and
   those items would be recorded in `seenIds` and never summarized again.)
2. **A `source-down` label** — dead-source alerts open issues with this label, and fail
   without it.
   ```bash
   gh label create source-down --description "Collection source failing repeatedly" --color D93F0B
   ```
3. **Workflow permissions set to "Read and write permissions"** —
   Settings → Actions → General. With the read-only default, `contents: write` has no effect
   and every push fails.
4. **The `SITE_URL` environment variable on Vercel** — used for `<link>` and `<atom:link>`
   in the RSS feed.

## Copyright

Each item remains the copyright of its original author. This site takes only the title and
excerpt from feeds published by the authors themselves, summarizes them, and links back to
the original.
