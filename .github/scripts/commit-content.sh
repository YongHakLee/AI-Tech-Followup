#!/usr/bin/env bash
set -euo pipefail

MESSAGE="${1:?커밋 메시지가 필요합니다}"
BRANCH="${GITHUB_REF_NAME:-main}"

# content/state.json의 lastRunAt은 소스마다 매 실행 새로 쓰인다. 그래서
# `git status --porcelain content`는 절대 비지 않고, 순진한 "변경 없음" 가드는
# 죽은 코드가 된다 — 6시간마다 내용이 같은 커밋이 쌓이고 그때마다 재배포된다.
#
# 반대로 items/highlights만 보면 consecutiveFailures 증가분이 커밋되지 않아
# 5회 연속 실패 알림이 영원히 트리거되지 않는다. 둘 다 피하려면 lastRunAt만
# 무시하고 state를 비교해야 한다.
# content/ 자체가 사라졌다면 수집이 아니라 체크아웃이나 워크스페이스가 깨진 것이다.
# 이 상태로 `git add content`를 하면 저장소의 콘텐츠 전체 삭제가 커밋된다.
[ -d content ] || { echo "::error::content/ 디렉터리가 없습니다 — 커밋을 중단합니다"; exit 1; }

NORMALIZE='if .sources then .sources |= map_values(del(.lastRunAt)) else . end'

changed=no
if [ -n "$(git status --porcelain -- content/items content/highlights)" ]; then
  changed=yes
elif [ -f content/state.json ]; then
  if ! git show "HEAD:content/state.json" > /tmp/state-head.json 2>/dev/null; then
    echo '{}' > /tmp/state-head.json
  fi
  if ! diff -q \
      <(jq -S "$NORMALIZE" /tmp/state-head.json) \
      <(jq -S "$NORMALIZE" content/state.json) > /dev/null; then
    changed=yes
  fi
fi

if [ "$changed" = no ]; then
  echo "커밋할 변경 없음 (실행 시각만 바뀜)"
  exit 0
fi

git config user.name "followup-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add content
git commit -m "$MESSAGE"

# 이 실행의 state(seenIds, consecutiveFailures)는 push로만 남는다. 원격이 그사이
# 움직여 push가 거절되면 실행분 전체가 버려지고, 다음 실행이 같은 항목을 다시
# 받으며 실패 카운터도 리셋된다. concurrency 그룹은 이 두 워크플로만 직렬화할 뿐
# 사람의 push는 막지 못하므로 재시도가 필요하다.
for attempt in 1 2 3; do
  if git push origin "HEAD:${BRANCH}"; then
    echo "push 성공 (시도 ${attempt})"
    exit 0
  fi
  echo "push 거절 — 리베이스 후 재시도 (${attempt}/3)"
  git pull --rebase --autostash origin "$BRANCH"
done

echo "::error::push를 3회 시도했으나 실패했습니다"
exit 1
