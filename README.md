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
