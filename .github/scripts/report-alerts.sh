#!/usr/bin/env bash
set -euo pipefail

ALERTS=".pipeline-out/alerts.json"
[ -f "$ALERTS" ] || { echo "죽은 소스 없음"; exit 0; }

count=$(jq 'length' "$ALERTS")
echo "연속 실패 소스 ${count}개"

# 이미 열려 있는 source-down 이슈 제목을 한 번만 가져와서 정확히 일치하는지 검사한다.
# gh issue list --search는 GitHub 전문 검색(텍스트 인덱싱·토큰화)에 의존하는데,
# 제목에 URL이 포함되어 있으면 특수문자 때문에 검색어가 지나치게 많은 토큰으로
# 쪼개지거나 인덱싱 지연으로 방금 만든 이슈를 못 찾을 수 있다. 그러면 같은 소스가
# 6시간마다 중복 이슈를 계속 새로 여는 결과가 된다. 그래서 검색 API 대신
# source-down 라벨이 붙은 열린 이슈 제목을 전부 받아 로컬에서 정확히 비교한다.
# 라벨로 범위를 좁혀 두면, 우연히 같은 제목의 이슈를 사람이 수동으로 만들어도
# (라벨이 없으므로) 알림이 영구히 묵음 처리되지 않는다.
open_titles=$(gh issue list --state open --label source-down --limit 100 --json title --jq '.[].title')

for i in $(seq 0 $((count - 1))); do
  key=$(jq -r ".[$i].key" "$ALERTS")
  err=$(jq -r ".[$i].error" "$ALERTS")
  n=$(jq -r ".[$i].consecutive" "$ALERTS")
  title="소스 수집 실패: ${key}"

  if grep -qxF "$title" <<< "$open_titles"; then
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
