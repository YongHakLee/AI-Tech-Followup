# AI Tech Followup

AI 분야 연구자·기술자들의 새 글·논문·강연을 자동으로 모아 한국어 요약과 원문 링크로 보여주는 사이트.

## 어떻게 돌아가나

- GitHub Actions가 6시간마다 `registry/people/*.yaml`에 적힌 소스(RSS·arXiv·YouTube)를 수집한다.
- 새 항목은 Claude Sonnet 5가 한국어 3문장으로 요약하고 분야 태그를 붙인다.
- 매주 화요일 09:00 KST에 **직전에 끝난 주**의 하이라이트를 생성한다.
- 결과는 `content/`에 JSON으로 커밋되고, 그 push를 Vercel이 감지해 사이트를 재배포한다.
  실행 시각만 바뀐 경우에는 커밋하지 않는다 — 그러지 않으면 6시간마다 무의미한 재배포가 쌓인다.
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
  - { type: youtube, channelId: UCXXXXXXXXXXXXXXXXXXXXXX }
  - { type: arxiv, author: Karpathy_Andrej }
```

`arxiv`의 `author`는 반드시 **`성_이름`** 형식이어야 한다. `성_이니셜`(`Karpathy_A`)은
arXiv 인덱스와 매칭되지 않아 HTTP 200에 **0건**을 반환한다. 에러가 아니라 빈 결과라
연속 실패 알림에도 걸리지 않으므로, 소스를 추가한 직후 실제로 건수가 잡히는지 확인할 것.

검증:

```bash
npm run validate:registry
```

## 명령

```bash
npm run dev                  # 개발 서버
npm run build                # 프로덕션 빌드 (라우트 대부분이 정적 프리렌더)
npm test                     # 단위 테스트
npm run typecheck            # 타입 검사
npm run validate:registry    # registry YAML 검증
npm run collect              # 수집 + 요약 (ANTHROPIC_API_KEY 필요)
npm run collect -- --dry-run # 요약 없이 수집만
npm run collect -- --limit 5 # 이번 실행의 요약 건수 상한
npm run weekly               # 주간 하이라이트 생성 (기본 대상: 직전에 끝난 주)
npm run weekly -- --week 2026-W35   # 특정 주를 다시 생성
npm run weekly -- --dry-run          # LLM 큐레이션 없이 휴리스틱으로만
```

## 첫 설정

자동화가 돌기 전에 이 넷이 필요하다. 하나라도 빠지면 첫 실행에서 걸린다.

1. **GitHub Secrets에 `ANTHROPIC_API_KEY`** — 없으면 워크플로가 즉시 실패한다.
   (일부러 그렇게 했다. 키 없이 돌면 요약이 조용히 실패한 채 커밋되고, 그 항목들은
   `seenIds`에 올라가 다시는 요약되지 않는다.)
2. **`source-down` 라벨** — 죽은 소스 알림이 이 라벨로 이슈를 연다. 없으면 실패한다.
   ```bash
   gh label create source-down --description "수집 소스가 연속 실패" --color D93F0B
   ```
3. **Actions의 워크플로 권한을 "Read and write permissions"로** —
   Settings → Actions → General. 기본값(읽기 전용)이면 `contents: write`가 무력화되어
   모든 push가 실패한다.
4. **Vercel 환경변수 `SITE_URL`** — RSS의 `<link>`와 `<atom:link>`에 쓰인다.

## 저작권

각 항목의 저작권은 원저자에게 있다. 이 사이트는 각 저자가 공개한 피드에서 제목과 발췌만 받아 요약하고 원문으로 링크한다.
