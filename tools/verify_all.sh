#!/bin/sh
# 배포 전 전체 검증. 실패가 하나라도 있으면 0 이 아닌 값으로 종료한다.
cd "$(dirname "$0")/.." || exit 1
rc=0
echo "── 1. 정적 검증 (구문·참조·일관성) ────────────────────────────"
python3 tools/verify.py || rc=1
echo
echo "── 2. 로직 검증 (실제 실행) ───────────────────────────────────"
python3 tools/extract_and_test.py || rc=1
echo
[ "$rc" -eq 0 ] && echo "✅ 전체 통과" || echo "⚠️ 실패 항목 있음 — 위 내용 확인"
exit $rc
