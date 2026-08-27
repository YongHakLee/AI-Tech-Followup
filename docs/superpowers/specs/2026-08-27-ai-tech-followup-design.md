# AI Tech Followup — 설계 문서

- 작성일: 2026-08-27
- 상태: 확정 (구현 계획 수립 대기)

## 1. 목표

최첨단 AI 분야의 저명한 연구자·기술자들이 새로 내놓는 글·논문·강연을 자동으로 모아, 한국어 요약과 원문 링크로 정리해 보여주는 웹사이트. 사람 손을 거의 타지 않고 스스로 갱신되며, 원하는 사람은 이메일로 주간 요약을 받는다.

## 2. 범위와 운영 형태

- 개인이 주로 보는 대시보드지만 URL은 공개한다. 예상 구독자는 수십~수백 명.
- 무료 티어 안에서 운영한다. 유일한 고정 지출은 LLM 요약 비용(월 약 3달러)이다.
- 1단계에서는 도메인을 사지 않고 `*.vercel.app` 주소로 운영한다.

## 3. 확정된 결정

| 항목 | 결정 |
|---|---|
| 콘텐츠 소스 | RSS(블로그·뉴스레터), arXiv, YouTube 채널 RSS |
| 제외한 소스 | X(트위터) — 공식 API가 유료 전용이고 비공식 우회는 ToS 위반 소지 |
| 발행 방식 | 전자동 (수집 → LLM 요약 → 즉시 공개, 사람 승인 없음) |
| 인물·소스 관리 | 레포지토리 내 YAML 파일 (어드민 UI 없음) |
| 이메일 알림 | 주간 다이제스트 1종 (분야별·인물별 구독 없음) |
| 요약 모델 | `claude-sonnet-5` |
| 호스팅 | Vercel (정적 생성) + GitHub Actions (파이프라인) + Neon Postgres (구독자만) |
| 홈 레이아웃 | 매거진형 — 주간 하이라이트 중심 |
| `/fields` 레이아웃 | 분야별 가로 섹션 (넷플릭스형) |

### 3.1 아키텍처를 정한 근거

원문 본문을 호스팅하지 않고 요약과 링크만 제공하기로 했으므로, 개별 아티클의 상세 페이지가 필요 없다. 그 결과 사이트의 페이지 수는 `홈 + 분야 수 + 인물 수 + 주차 수` 수준으로 작게 유지되고, 이는 정적 생성에 정확히 들어맞는다. 콘텐츠를 데이터베이스에 둘 이유가 사라지고, DB는 구독자 관리에만 쓰인다.

## 4. 시스템 구성

```
GitHub Actions (cron)
  ├─ 6시간마다: RSS/arXiv/YouTube 수집 → LLM 요약 → content/ 커밋
  └─ 매주 화요일: 주간 하이라이트 생성 → 커밋 → 다이제스트 발송 API 호출 (2단계부터)
        ↓ git push
Vercel
  ├─ 정적 사이트 빌드·배포 (콘텐츠는 빌드타임에 JSON에서 읽음)
  └─ Route Handler: 구독 / 인증 / 해지 / 다이제스트 발송
        ↓
Neon Postgres (구독자)      Resend (메일 발송)
```

로컬 개발 머신은 코드를 편집하고 push하는 역할만 한다. 상시 실행되는 로컬 프로세스는 없으며, 머신이 꺼져 있거나 교체되어도 서비스는 영향을 받지 않는다. 로컬에만 존재하는 데이터도 없다.

## 5. 레포지토리 구조

사람이 편집하는 파일과 자동화가 커밋하는 파일을 디렉터리 단위로 분리한다. 같은 파일을 양쪽이 건드리면 6시간마다 충돌이 난다.

```
AI-Tech-Followup/
├─ registry/                 사람만 편집 (파이프라인은 읽기 전용)
│  ├─ people/*.yaml
│  └─ fields.yaml
├─ content/                  파이프라인만 커밋
│  ├─ items/YYYY-MM.json
│  ├─ highlights/YYYY-Www.json
│  └─ state.json
├─ pipeline/                 Actions가 실행하는 Node 스크립트
├─ src/                      Next.js 앱
├─ db/                       Drizzle 스키마·마이그레이션
├─ tests/
└─ .github/workflows/
```

## 6. 데이터 모델

### 6.1 인물 (`registry/people/<id>.yaml`)

```yaml
id: andrej-karpathy            # 파일명과 동일, URL slug로 사용
name: Andrej Karpathy
nameKo: 안드레이 카파시
affiliation: Eureka Labs
formerly: [Tesla, OpenAI]
fields: [llm, education]       # fields.yaml의 키만 허용
bio: 신경망 학습과 AI 교육에 관한 글을 쓴다.
links:
  homepage: https://karpathy.ai
  x: https://x.com/karpathy
  github: https://github.com/karpathy
avatar: null                   # null이면 이니셜 모노그램 SVG 자동 생성
sources:
  - { type: rss,     url: https://karpathy.bearblog.dev/feed/ }
  - { type: youtube, channelId: UCXUPKJO5MZQN11PqgIvyuvQ }
  - { type: arxiv,   author: "Karpathy_A" }
```

파일 하나가 인물 한 명이다. Zod 스키마로 검증하며, 검증 실패는 배포가 아니라 CI에서 막는다.

`avatar`의 기본값은 `null`이다. 인물 사진은 대부분 저작권이 있으므로, 본인이 공개적으로 배포한 이미지임이 확실한 경우에만 URL을 넣는다. 그 외에는 이름 이니셜로 모노그램 SVG를 생성해 쓴다.

### 6.2 분야 (`registry/fields.yaml`)

분야는 고정 택소노미다. LLM이 태그를 자유 생성하면 태그가 무한히 늘어나 필터가 무의미해지므로, 아래 목록 안에서만 고르게 한다.

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

### 6.3 수집 아이템 (`content/items/YYYY-MM.json`)

```jsonc
{
  "id": "a3f9c1...",                    // 정규화한 URL의 SHA-1
  "personIds": ["andrej-karpathy"],     // 배열인 이유는 6.4 참조
  "type": "blog | paper | video",
  "title": "...",
  "url": "https://...",
  "publishedAt": "2026-08-20T00:00:00Z",
  "collectedAt": "2026-08-20T06:00:00Z",
  "lang": "en",
  "sourceName": "arXiv",
  "excerpt": "피드가 제공한 원문 발췌 (최대 600자)",
  "summaryKo": "한국어 3문장 요약",      // 요약 실패 시 null
  "tags": ["llm", "reasoning"]           // fields.yaml의 키, 최대 3개
}
```

월별로 파일을 나눈다. 한 파일에 모두 넣으면 커밋 diff가 매번 거대해지고 병합이 어려워진다.

### 6.4 중복 처리

아이템 ID는 URL을 정규화(`utm_*` 등 트래킹 파라미터 제거, 소문자화, 후행 슬래시 정리)한 뒤의 SHA-1이다. 이미 같은 ID가 존재하면 새 아이템을 만들지 않고 `personIds`에 저자만 추가한다.

이것이 배열인 이유는 공저 논문 때문이다. 등록된 인물 세 명이 같은 논문의 공저자이면, 이 처리가 없을 때 같은 논문이 사이트와 다이제스트에 세 번 나타난다.

### 6.5 파이프라인 상태 (`content/state.json`)

소스별로 마지막 수집 시각, 이미 본 아이템 ID 집합, 연속 실패 횟수를 기록한다. 이 파일이 매 실행의 시작점이자 중복 수집 방지 장치다.

### 6.6 구독자 (Neon Postgres)

```sql
CREATE TABLE subscribers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL UNIQUE,
  status              text NOT NULL CHECK (status IN ('pending','active','unsubscribed','bounced')),
  verify_token_hash   text,
  token_expires_at    timestamptz,
  unsubscribe_token   text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  verified_at         timestamptz
);

CREATE TABLE digest_sends (
  week        text PRIMARY KEY,          -- ISO 주차, 예: 2026-W35
  sent_at     timestamptz NOT NULL,
  recipients  integer NOT NULL
);
```

인증 토큰은 랜덤 32바이트를 생성해 사용자에게 보내고, DB에는 SHA-256 해시만 저장한다. 유효기간은 24시간이다. DB가 유출되어도 타인의 구독을 인증하거나 해지할 수 없어야 한다.

`digest_sends`는 같은 주차를 두 번 발송하는 것을 막는 멱등성 장치다.

콘텐츠는 DB에 저장하지 않는다.

## 7. 수집·요약 파이프라인

`pipeline/run.ts`를 GitHub Actions가 6시간마다 실행한다.

### 7.1 수집 어댑터

| type | 접근 방법 | 비고 |
|---|---|---|
| `rss` | 피드 URL 직접 요청 | RSS 2.0 / Atom 모두 `rss-parser`로 처리 |
| `youtube` | `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>` | API 키 불필요. 최근 15개 반환 |
| `arxiv` | `http://export.arxiv.org/api/query?search_query=au:"<author>"` | 공식 API. 요청 간 3초 간격 준수 |

세 소스 모두 인증이 필요 없고 이용 조건상 프로그램 접근이 허용된다.

### 7.2 요약

```
LLM 입력 = 제목 + 저자 + 피드가 스스로 제공한 발췌/초록
LLM 출력 = { summaryKo: 3문장, tags: fields.yaml 키 중 최대 3개 }
저장     = 요약 + 메타데이터만
```

**원문 페이지를 크롤링하지 않는다.** 피드가 발췌를 제공하면 그것을 쓰고, 제목만 제공하면 제목만으로 요약한다. 이 규칙이 저작권 리스크를 구조적으로 제거하고 항목당 입력 토큰을 1,000~1,500으로 묶는다.

피드가 전문을 제공하는 경우에도 본문은 요약 입력으로만 쓰고 레포에 저장하지 않는다. `excerpt` 필드에는 최대 600자까지만 남긴다.

출력은 Claude의 구조화 출력(`output_config.format`)으로 스키마를 강제한다. 태그가 목록 밖의 값으로 나오는 것을 파싱 단계가 아니라 API 단계에서 막는다.

비용 추정: 인물 40명 기준 월 약 600건, 건당 입력 1.2K·출력 250토큰, `claude-sonnet-5` 기준 월 약 3달러.

### 7.3 커밋 정책

새 아이템이 없으면 커밋하지 않는다. 커밋이 없으면 Vercel 배포도 일어나지 않는다. 변경 없는 재빌드를 6시간마다 반복하지 않기 위한 것이다.

### 7.4 실패 처리

- 소스 하나의 실패가 전체 실행을 중단시키지 않는다. 실패는 `state.json`에 소스별로 누적된다.
- **연속 5회 실패하면 워크플로가 GitHub Issue를 자동으로 연다.** RSS 주소는 예고 없이 사라지며, 이 알림이 없으면 몇 달 뒤에야 누락을 알게 된다.
- 요약만 실패한 아이템은 버리지 않고 `summaryKo: null`로 저장한다. 사이트는 `excerpt`로 폴백하고, 다음 실행에서 요약을 재시도한다.
- **첫 실행 폭주 방지**: `state.json`이 비어 있으면 소스당 최근 3건만 가져오고 나머지는 확인 완료로 표시한다. 이 장치가 없으면 첫 실행에 수백 건이 한 번에 요약된다.

## 8. 주간 하이라이트

전자동 운영이므로 하이라이트도 사람이 고르지 않는다. 주 1회 LLM을 호출한다.

```
입력: 해당 주에 수집된 40~60건의 제목·요약·인물·타입 (약 6K 토큰)
출력: 하이라이트 3건 + 각 선정 이유 한 줄 + "이번 주 흐름" 2문장
```

결과는 `content/highlights/YYYY-Www.json`에 저장되어 **홈 상단과 다이제스트 메일 도입부에 함께 재사용**된다. 한 번의 호출로 두 곳을 채운다.

LLM 호출이 실패하면 휴리스틱으로 폴백한다: 타입 가중치(논문 > 글 > 영상), 연관 인물 수, 최신성으로 점수를 매겨 상위 3건을 고른다. 하이라이트 생성 실패가 다이제스트 발송을 막지 않게 한다.

## 9. 사이트

### 9.1 라우트

| 경로 | 내용 | 렌더링 |
|---|---|---|
| `/` | 주간 하이라이트 + 활동 인물 레일 + 분야별 요약 (매거진형) | 정적 |
| `/fields` | 분야 인덱스 | 정적 |
| `/fields/[field]` | 분야별 가로 섹션 (넷플릭스형) | 정적 |
| `/people` | 인물 인덱스, 분야별 그룹 카드 그리드 | 정적 |
| `/people/[id]` | 인물 프로필 + 해당 인물의 전체 타임라인 | 정적 |
| `/weekly` | 주간 아카이브 인덱스 | 정적 |
| `/weekly/[YYYY-Www]` | 해당 주 다이제스트의 웹 버전 | 정적 |
| `/feed.xml` | 이 사이트 자체의 RSS | 정적 |
| `/privacy` | 개인정보 처리방침 | 정적 |
| `/subscribe` `/verify` `/unsubscribe` | 구독 흐름 | Route Handler |

### 9.2 아이템 상세 페이지를 만들지 않는다

원문을 호스팅하지 않기 때문이다. 카드의 유일한 행동은 원문으로 나가는 것(`target="_blank" rel="noopener noreferrer"`)이며, 이는 원저자에게 트래픽이 돌아가는 구조이기도 하다.

### 9.3 검색과 필터

전부 클라이언트 사이드로 처리한다. 검색 인덱스에는 **최근 12개월치의 제목·인물·태그만** 포함하고 요약 본문은 제외한다. 4,000건 기준 gzip 약 150KB이다. 그 이전 콘텐츠는 `/weekly` 아카이브로 접근한다. 서버가 필요 없으므로 정적 배포가 유지된다.

### 9.4 스택

Next.js 16 App Router, Tailwind CSS, shadcn/ui, TypeScript. 콘텐츠는 빌드타임에 `content/*.json`을 읽으므로 ISR이나 런타임 캐시 전략이 필요 없다. 배포 시점에 전부 정적 HTML이다.

## 10. 이메일

### 10.1 구독 흐름 (더블 옵트인)

1. `/subscribe`에 이메일 제출
   - 응답은 가입 여부와 무관하게 항상 동일하다 ("메일을 확인해주세요"). 등록된 주소인지 알아내는 열거 공격을 막는다.
   - `pending` 레코드를 만들고 랜덤 32바이트 토큰을 생성한다. DB에는 SHA-256 해시만, 유효기간 24시간.
   - Resend로 인증 메일을 보낸다.
2. 메일의 링크 → `/verify?token=...` → 해시 대조 → `status = active`, 토큰 폐기.
3. 매주 화요일 09:00 KST에 `weekly.yml`이 `POST /api/digest/send`를 호출한다. 요청은 `Bearer CRON_SECRET`으로 인증하며, `digest_sends`에 해당 주차 기록이 있으면 중복 발송하지 않는다.
4. 모든 메일 하단에 1클릭 해지 링크를 넣는다. 해지 토큰은 만료가 없고 로그인이 필요 없다. `List-Unsubscribe` 헤더도 함께 보내 메일 앱의 해지 버튼이 동작하게 한다.

### 10.2 남용 방지

- 폼에 honeypot 필드를 두고, IP당 시간당 5회로 제한한다. 타인의 주소로 인증 메일을 대량 발송시키는 남용을 막는다.
- `pending` 상태로 7일이 지난 레코드는 주간 정리 작업이 삭제한다.
- Resend 웹훅으로 hard bounce를 받아 `status = bounced`로 바꾼다. 죽은 주소로 계속 발송하면 발신 평판이 떨어진다.

### 10.3 도메인과 발송 한도 (중요한 제약)

1단계에서는 도메인을 사지 않는다. 사이트는 `*.vercel.app`에서 아무 문제 없이 동작하지만, **이메일에는 제약이 있다.**

- `vercel.app`은 Vercel 소유라 SPF·DKIM·DMARC 레코드를 등록할 수 없다.
- 따라서 Resend의 테스트 발신 주소를 쓰게 되며, 이 주소는 **Resend 계정 소유자 본인에게만 발송할 수 있다.**
- 즉 1단계에서는 구독 폼·인증·발송 코드를 모두 완성하고 본인 메일로 전 과정을 검증하되, 외부 구독자는 받지 못한다.

외부 구독자를 받으려면 도메인을 구입해 Resend에 인증한 뒤 `EMAIL_FROM` 환경변수만 바꾸면 된다. 코드 변경은 없다.

**Resend 무료 티어의 실질 상한**: 월 3,000통이지만 **하루 100통 제한이 함께 걸린다.** 주 1회 발송이므로 구독자가 100명을 넘으면 하루에 다 보낼 수 없다. 100명을 넘는 시점에는 이틀에 나누어 발송하거나 유료 플랜으로 전환해야 한다. 이 한도를 넘기 전에 판단할 수 있도록, 발송 스크립트는 대상자 수가 90명을 넘으면 경고를 로그에 남긴다.

### 10.4 개인정보

이메일 주소를 수집하므로 `/privacy` 페이지에 수집 항목, 목적, 보관 기간, 파기 방법, 해지 방법을 명시한다. 수집하는 것은 이메일 주소와 구독 시각뿐이며, 해지 시 즉시 삭제한다.

## 11. 자동화

### 11.1 워크플로

| 파일 | 트리거 | 하는 일 |
|---|---|---|
| `collect.yml` | `0 */6 * * *` + `workflow_dispatch` | 수집 → 요약 → `content/` 커밋 |
| `weekly.yml` | `0 0 * * 2` (화 09:00 KST) + `workflow_dispatch` | 하이라이트 생성 → 커밋 → (2단계부터) 발송 API 호출 |
| `ci.yml` | PR·push | 타입체크, 린트, registry 스키마 검증, 단위 테스트 |

- 세 워크플로 모두 `workflow_dispatch`를 지원한다. cron을 기다리지 않고 즉시 실행할 수 있어야 디버깅이 가능하다.
- `concurrency` 그룹을 지정해 이전 실행이 끝나기 전에 다음 cron이 겹쳐 도는 것을 막는다.
- Vercel은 GitHub 연동으로 push를 감지하므로 Actions 봇의 커밋도 배포를 트리거한다.
- GitHub는 60일간 활동이 없는 레포의 예약 워크플로를 자동 비활성화하지만, 이 프로젝트는 매주 커밋이 발생하므로 해당되지 않는다.

### 11.2 시크릿

```
GitHub Secrets  : ANTHROPIC_API_KEY, CRON_SECRET, SITE_URL
Vercel 환경변수 : DATABASE_URL, RESEND_API_KEY, CRON_SECRET, EMAIL_FROM
```

`CRON_SECRET`이 양쪽에 존재하는 것이 핵심이다. 다이제스트 발송 엔드포인트는 공개 URL이므로, 이 값을 Bearer 토큰으로 대조하지 않으면 누구나 호출해 구독자 전원에게 메일을 보낼 수 있다.

로컬 `.env.local`은 개발용 사본일 뿐이며 git에 올리지 않는다. 다른 머신으로 옮길 때는 위 두 곳에서 다시 받아오면 된다.

## 12. 테스트 전략

LLM과 네트워크가 개입하면 테스트가 불안정해진다. 검증 가치가 높고 순수한 부분에 집중한다.

- **순수 함수**: URL 정규화, 중복 병합, ISO 주차 계산, 하이라이트 폴백 점수 계산
- **어댑터**: 저장해둔 실제 피드 샘플(fixture)로 파싱을 검증한다. 네트워크를 타지 않는다.
- **LLM 호출**: 인터페이스 뒤로 숨기고 테스트에서는 스텁으로 대체한다.
- **registry 검증**: 잘못된 YAML(존재하지 않는 field 키, 필수 항목 누락)이 CI에서 걸리는지 확인한다.
- **구독 흐름**: 만료된 토큰, 재사용된 토큰, 잘못된 토큰, 해지, 중복 구독 시 동일 응답.

## 13. 단계 계획

**1단계 — 스스로 갱신되는 사이트**

registry 스키마와 검증, 수집 어댑터 3종, 중복 처리, LLM 요약, 주간 하이라이트 생성, 정적 사이트(홈·분야·인물·주간), `feed.xml`, `collect.yml`, `weekly.yml`(하이라이트 생성·커밋까지). 이 단계만으로 사이트는 사람 손 없이 갱신된다.

홈이 매거진형이라 하이라이트에 의존하므로, 하이라이트 생성은 이메일보다 앞선 1단계에 속한다.

**2단계 — 구독**

Neon 스키마, 구독·인증·해지 Route Handler, 다이제스트 메일 템플릿, `weekly.yml`에 발송 API 호출 단계 추가, `/privacy`.

**3단계 — 다듬기**

클라이언트 사이드 검색, OG 이미지 자동 생성, 소스 사망 감지 이슈 자동 생성, Resend 바운스 웹훅, `pending` 정리 작업.

## 14. 범위에 넣지 않는 것

아래는 의도적으로 제외한다. 지금 규모에서 비용 대비 효용이 낮거나 법적 리스크가 있다.

- 로그인과 개인화 피드
- 분야별·인물별 선택 구독 (주간 다이제스트 1종으로 충분)
- 댓글
- 원문 전체 번역 (저작권)
- X(트위터) 수집 (API 비용 및 ToS)
- 조회수 통계 대시보드
- 인물 추천 알고리즘
- 어드민 UI (YAML로 충분)

## 15. 알려진 리스크

| 리스크 | 대응 |
|---|---|
| RSS 주소가 조용히 사라짐 | 연속 5회 실패 시 GitHub Issue 자동 생성 |
| LLM 요약 품질 편차 | 요약이 틀리면 JSON을 직접 고쳐 커밋한다. 원문 링크가 항상 병기되므로 요약이 최종 근거가 아니다 |
| 아이템 누적으로 빌드 지연 | 월별 파일 분할. 검색 인덱스는 12개월로 제한. 연 4,000건 규모까지는 문제없다 |
| Resend 하루 100통 제한 | 구독자 90명 초과 시 경고 로그. 초과 시 분할 발송 또는 유료 전환 |
| arXiv 저자명 동명이인 | `author` 쿼리 결과를 소속·공저자로 후처리 필터링하고, 오탐이 보이면 YAML에서 해당 소스를 제거한다 |
