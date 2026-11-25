#!/usr/bin/env bash
# floor-guard.sh — 降标守卫：只报"把质量底线往下挪"的 diff 动作（棘轮的执法面）
#
# 机制来源：addyosmani/agent-skills constraint-driven-development/references/floor-guard.md。
# 契约：
#   输入 = merge base 到工作树的 diff（含新增/删除行 + 未跟踪文件）
#   范围 = --root 所指目录（缺省整个仓库）；项目只是大仓库里一个子目录时，别的目录的改动不判
#   只报五类降标：阈值下调 / 测试变松 / 断言删除 / 静默检查器 / 新增例外行
#   "Tightening is silent, loosening is loud." —— 收紧不报，放宽才响
# 退出码：0 干净；1 有降标（阻断）；2 无法运行（非 git 仓/无 merge base）——2 绝不读成 0
#
# 用法: bash floor-guard.sh [--base <ref>] [--root <仓库根或项目目录>]
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

# 判定范围＝启动时所在目录（--root）相对仓库根的子路径，就在仓库根时为整个仓库。
# 2026-11-25（挂账 N35-5）：此前一律上溯到仓库根、比较整个仓库。项目目录只是大仓库里一个
# 子目录时（单仓里的技能目录、仓库内的门禁夹具），别的目录里未推送的断言改动也被判进来，
# 守卫在各自机器上随别人的在途改动变红。逐行严格的规则不变，变的只是“判谁的改动”。
SCOPE="$(git rev-parse --show-prefix 2>/dev/null)"
[[ -n "$SCOPE" ]] || SCOPE="."

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
  git diff --unified=0 "$MB" -- "$SCOPE" 2>/dev/null || { echo "floor-guard: diff 失败（exit 2）" >&2; exit 2; }
  # 未跟踪文件：git diff 看不到新文件
  git ls-files --others --exclude-standard -- "$SCOPE" 2>/dev/null | while IFS= read -r f; do
    [[ -n "$f" ]] || continue
    git diff --no-index --unified=0 /dev/null "$f" 2>/dev/null || true
  done
} > "$TMP" || { echo "floor-guard: 收集 diff 失败（exit 2）" >&2; exit 2; }

awk '
BEGIN {
  SUPPRESS = "@ts-ignore|@ts-nocheck|eslint-disable|biome-ignore|# *noqa|# *type: *ignore|istanbul ignore|nosemgrep|gitleaks:allow|Stryker disable"
  # 词边界用显式字符类表达。awk 正则里的 \b 是退格符而不是词边界（2026-11-25 实测：macOS awk
  # 20200816 上 \bTODO\b、\.skip\b 一条都不命中），此前含 \b 的规则（.skip/.todo、xit(、
  # xdescribe(、TODO）从未生效——“测试变松”这一类一直是死的，而夹具只测过阈值下调与断言删除。
  WB = "(^|[^A-Za-z0-9_])"
  WE = "([^A-Za-z0-9_]|$)"
  STUB = "throw new (Error|NotImplemented)[^\\n]*[Nn]ot implemented|catch[[:space:]]*\\([A-Za-z_]*\\)[[:space:]]*\\{[[:space:]]*\\}|catch[[:space:]]*\\{[[:space:]]*\\}|" WB "TODO" WE "|pass[[:space:]]*#[[:space:]]*stub"
  # 通用的 .skip/.todo 只在测试文件里判：普通代码里的 reader.skip( 之类不是测试动作
  SKIP_TEST = "\\.(skip|todo)" WE
  SKIP_ANY = WB "xit\\(|" WB "xdescribe\\(|@pytest\\.mark\\.skip|t\\.Skip\\("
  TESTFILE = "(\\.test\\.|\\.spec\\.|_test\\.|test_)"
  n = 0
}
/^diff / { infile = 1; inhead = 1; file = ""; old = ""; next }
/^@@/ { inhead = 0; next }
inhead && /^--- / { old = substr($0, 5); sub(/^[ab]\//, "", old); next }
inhead && /^\+\+\+ / {
  f = substr($0, 5)
  # 被删除文件的记录键必须是不带 a/ 前缀的仓库路径：END 段按 ^vendor/ 排除、按 DEL 成员跳过
  # 已删文件的逐行判定，都依赖键的形态。此前先记键再去前缀，两条规则对被删除文件从未生效
  # （2026-11-24 复盘：上游基线升级删掉的 5 个 vendor 测试文件被误判为降标）。
  if (f == "/dev/null") { file = old; DEL[file] = 1 } else { file = f; sub(/^[ab]\//, "", file) }
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
    # 守卫自身携带的检测正则也不是（否则守卫一落地就把自己判成降标）；
    # 守卫的夹具目录同理——夹具里必须原样写着 .skip(、TODO 这些待判定的字样。
    if (f ~ /^vendor\//) { continue }
    if (f ~ /\.md$/ || f ~ /floor-guard.*\.sh$/ || f ~ /test-floor-guard/ || f ~ /gate-fixtures\/floor-guard\//) {
      if (f ~ /CONSTRAINTS/ && t ~ /^\| *[WE][0-9]+ *\|/) { printf "降标[新增例外] %s: %s\n", f, substr(t, 1, 120); bad++ }
      continue
    }
    if (t ~ SUPPRESS) { printf "降标[静默检查器] %s: %s\n", f, substr(t, 1, 120); bad++ }
    else if (t ~ SKIP_ANY || (f ~ TESTFILE && t ~ SKIP_TEST)) { printf "降标[测试变松] %s: %s\n", f, substr(t, 1, 120); bad++ }
    else if (t ~ STUB) { printf "降标[未完成工作] %s: %s\n", f, substr(t, 1, 120); bad++ }
    else if (f ~ /(CONSTRAINTS|precheck[a-z.]*\.conf|rules\.d\/.*\.rules)$/ && t ~ /^\| *[WE][0-9]+ *\|/) { printf "降标[新增例外] %s: %s\n", f, substr(t, 1, 120); bad++ }
  }
  # 删除测试文件
  for (f in DEL) { if (f ~ /^vendor\//) continue; if (f ~ /(\.test\.|\.spec\.|_test\.|test_)/) { printf "降标[测试变松] %s: 文件被删除\n", f; bad++ } }
  # 删除断言（文件仍存在）
  for (i = 1; i <= nr; i++) {
    split(REM[i], p, "\t"); f = p[1]; t = p[2]
    if (f in DEL) continue
    if (f ~ /^vendor\//) continue
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
