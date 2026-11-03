#!/usr/bin/env bash
# floor-guard.sh — 降标守卫：只报"把质量底线往下挪"的 diff 动作（棘轮的执法面）
#
# 机制来源：addyosmani/agent-skills constraint-driven-development/references/floor-guard.md。
# 契约：
#   输入 = merge base 到工作树的 diff（含新增/删除行 + 未跟踪文件）
#   只报五类降标：阈值下调 / 测试变松 / 断言删除 / 静默检查器 / 新增例外行
#   "Tightening is silent, loosening is loud." —— 收紧不报，放宽才响
# 退出码：0 干净；1 有降标（阻断）；2 无法运行（非 git 仓/无 merge base）——2 绝不读成 0
#
# 用法: bash floor-guard.sh [--base <ref>] [--root <仓库根>]
#   默认 base：BASE_BRANCH（env/conf）→ origin/main → main → HEAD~1

set -u

BASE_REF="${BASE_BRANCH:-}"
ROOT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --base) BASE_REF="${2:-}"; shift 2 ;;
    --root) ROOT="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "floor-guard: 未知参数 $1" >&2; exit 2 ;;
  esac
done

if [[ -n "$ROOT" ]]; then cd "$ROOT" 2>/dev/null || { echo "floor-guard: root 不可进入：$ROOT" >&2; exit 2; }; fi
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "floor-guard: 非 git 仓库，无法判定（exit 2）" >&2; exit 2; }

TOP="$(git rev-parse --show-toplevel 2>/dev/null)"
[[ -n "$TOP" ]] || { echo "floor-guard: 取不到仓库根（exit 2）" >&2; exit 2; }
cd "$TOP" || exit 2

if [[ -z "$BASE_REF" ]]; then
  for c in origin/main main master; do
    if git rev-parse --verify --quiet "$c" >/dev/null 2>&1; then BASE_REF="$c"; break; fi
  done
fi
[[ -n "$BASE_REF" ]] || BASE_REF="HEAD~1"

MB="$(git merge-base "$BASE_REF" HEAD 2>/dev/null)"
[[ -n "$MB" ]] || { echo "floor-guard: 无 merge base（base=${BASE_REF}）（exit 2）" >&2; exit 2; }

TMP="$(mktemp "${TMPDIR:-/tmp}/swarm-floor.XXXXXX")"
trap 'rm -f "$TMP"' EXIT

{
  git diff --unified=0 "$MB" -- . 2>/dev/null || { echo "floor-guard: diff 失败（exit 2）" >&2; exit 2; }
  # 未跟踪文件：git diff 看不到新文件
  git ls-files --others --exclude-standard 2>/dev/null | while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    git diff --no-index --unified=0 /dev/null "$f" 2>/dev/null || true
  done
} > "$TMP" || { echo "floor-guard: 收集 diff 失败（exit 2）" >&2; exit 2; }

awk '
BEGIN {
  SUPPRESS = "@ts-ignore|@ts-nocheck|eslint-disable|biome-ignore|# *noqa|# *type: *ignore|istanbul ignore|nosemgrep|gitleaks:allow|Stryker disable"
  STUB = "throw new (Error|NotImplemented)[^\\n]*[Nn]ot implemented|catch[[:space:]]*\\([A-Za-z_]*\\)[[:space:]]*\\{[[:space:]]*\\}|catch[[:space:]]*\\{[[:space:]]*\\}|\\bTODO\\b|pass[[:space:]]*#[[:space:]]*stub"
  SKIPONLY = "\\.(skip|todo)\\b|\\bxit\\(|\\bxdescribe\\(|@pytest\\.mark\\.skip|t\\.Skip\\("
  n = 0
}
/^diff / { infile = 1; inhead = 1; file = ""; old = ""; next }
/^@@/ { inhead = 0; next }
inhead && /^--- / { old = substr($0, 5); next }
inhead && /^\+\+\+ / {
  f = substr($0, 5)
  if (f == "/dev/null") { file = old; DEL[file] = 1 } else { file = f }
  sub(/^[ab]\//, "", file)
  if (f == "/dev/null") sub(/^[ab]\//, "", old)
  if (f == "/dev/null") file = old
  next
}
inhead { next }
/^\+/ && !/^\+\+\+/ { ADD[++na] = file "\t" substr($0, 2); next }
/^-/ && !/^---/ { REM[++nr] = file "\t" substr($0, 2); next }
END {
  bad = 0
  for (i = 1; i <= na; i++) {
    split(ADD[i], p, "\t"); f = p[1]; t = p[2]
    # 文档与守卫自身不参与"代码动作"判定：md 里描述这些模式不是降标行为，
    # 守卫自身携带的检测正则也不是（否则守卫一落地就把自己判成降标）
    if (f ~ /\.md$/ || f ~ /floor-guard.*\.sh$/ || f ~ /test-floor-guard/) {
      if (f ~ /CONSTRAINTS/ && t ~ /^\| *[WE][0-9]+ *\|/) { printf "降标[新增例外] %s: %s\n", f, substr(t, 1, 120); bad++ }
      continue
    }
    if (t ~ SUPPRESS) { printf "降标[静默检查器] %s: %s\n", f, substr(t, 1, 120); bad++ }
    else if (t ~ SKIPONLY) { printf "降标[测试变松] %s: %s\n", f, substr(t, 1, 120); bad++ }
    else if (t ~ STUB) { printf "降标[未完成工作] %s: %s\n", f, substr(t, 1, 120); bad++ }
    else if (f ~ /(CONSTRAINTS|precheck[a-z.]*\.conf|rules\.d\/.*\.rules)$/ && t ~ /^\| *[WE][0-9]+ *\|/) { printf "降标[新增例外] %s: %s\n", f, substr(t, 1, 120); bad++ }
  }
  # 删除测试文件
  for (f in DEL) if (f ~ /(\.test\.|\.spec\.|_test\.|test_)/) { printf "降标[测试变松] %s: 文件被删除\n", f; bad++ }
  # 删除断言（文件仍存在）
  for (i = 1; i <= nr; i++) {
    split(REM[i], p, "\t"); f = p[1]; t = p[2]
    if (f in DEL) continue
    if (f ~ /(\.test\.|\.spec\.|_test\.|test_)/ && t ~ /(expect|assert|should|SHOULD|ASSERT)/) {
      printf "降标[断言删除] %s: %s\n", f, substr(t, 1, 120); bad++
    }
  }
  # 阈值下调：同名 KEY 先删后加且新值更小（只比纯数字）
  for (i = 1; i <= nr; i++) {
    split(REM[i], p, "\t"); f = p[1]; t = p[2]
    if (t !~ /^[A-Z_][A-Z0-9_]*=[0-9]+/) continue
    split(t, kv, "="); key = kv[1]; oldv = kv[2] + 0
    for (j = 1; j <= na; j++) {
      split(ADD[j], q, "\t")
      if (q[1] != f) continue
      if (q[2] !~ ("^" key "=[0-9]+")) continue
      split(q[2], kv2, "="); newv = kv2[2] + 0
      if (newv < oldv) { printf "降标[阈值下调] %s: %s %d → %d\n", f, key, oldv, newv; bad++ }
    }
  }
  if (bad == 0) printf "floor-guard: 无降标动作（只报放宽，收紧静默）\n"
  exit(bad > 0 ? 1 : 0)
}
' "$TMP"
rc=$?
exit "$rc"
