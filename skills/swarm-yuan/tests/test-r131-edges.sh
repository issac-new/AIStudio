#!/usr/bin/env bash
# test-r131-edges.sh — R131 四条边角收口锁：bridge awk \uXXXX 透传 / freshness 旗标禁缓存接线 / 活文档行号锚 / stat 回退链 stdout 污染
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"; SWARM_YUAN_SOURCE_ROOT="$(cd "${BASE}/../.." && pwd)"
TMP="$(mktemp -d /tmp/r131e.XXXXXX)"; trap 'rm -rf "$TMP"' EXIT
FAIL=0; ok(){ echo "  ✓ $1"; }; bad(){ echo "  ✗ $1" >&2; FAIL=1; }

# 态1 awk-only 降级路径 \uXXXX 透传（PATH 屏蔽 python3/jq/perl，只剩 awk）
BR="$BASE/assets/hooks/spec-first-bridge.sh"
mkdir -p "$TMP/bin"
for c in python3 jq perl; do printf '#!/bin/sh\nexit 127\n' > "$TMP/bin/$c"; chmod +x "$TMP/bin/$c"; done
P='{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"echo \\u4e2d rm -rf /tmp/x"},"cwd":"/tmp/st"}'
out="$(cd /tmp && printf '%s' "$P" | PATH="$TMP/bin:$PATH" bash "$BR" --__st-dump 2>&1)"
printf '%s' "$out" | grep -q 'command=.*\\u4e2d' && ok "态1 awk-only 提取的 cmd 原样含 \\u4e2d（旧版整个丢弃）" || bad "态1: $out"
# 态1b 对照：无 \\u 的常规命令 awk-only 仍可提取
P2='{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"ls -la"},"cwd":"/tmp/st"}'
out2="$(cd /tmp && printf '%s' "$P2" | PATH="$TMP/bin:$PATH" bash "$BR" --__st-dump 2>&1)"
printf '%s' "$out2" | grep -q 'command=ls -la' && ok "态1b 常规命令不受影响" || bad "态1b: $out2"

# 态2 freshness 旗标接线（静态 + 开关语义）
grep -q 'SWARM_YUAN_SELFCHECK_FRESHNESS_FLAGS' "$BASE/scripts/self-check.sh" \
  && grep -q 'vfy_flags} >/dev/null' "$BASE/scripts/self-check.sh" \
  && ok "态2a 旗标透传到 verify-framework-ruleset 调用" || bad "态2a 未接线"
grep -q -- '--strict-freshness.*cache_on=0' "$BASE/scripts/self-check.sh" \
  && ok "态2b --strict-freshness 在场即禁缓存（时间依赖不被缓存掩盖）" || bad "态2b 缺禁缓存分支"

# 态3 活文档行号锚（行为面由 test-doc-numbers 断言，此处锁锚改写后的稳定锚存在）
grep -q '_fg_emit_skill_md`（R128 拆分后函数名锚' "$BASE/docs/design-evolution.md" \
  && ok "态3a design-evolution 用函数名锚" || bad "态3a"
grep -q 'generate-skill\.sh:[0-9]' "$BASE/docs/design-evolution.md" && bad "态3b design-evolution 行号残留" || ok "态3b design-evolution 行号零残留"

# 态4 stat 回退链 stdout 污染锁：PATH 注入模拟 GNU stat（-f 失败前向 stdout 写 File 行）
# ——restore-journal 须 rc=0、stderr 为空。BSD-first 链会在 set -u 下报 unbound variable（CI Linux 实证）。
SM="$BASE/assets/state-machine.sh"
cat > "$TMP/bin/stat" <<'SH'
#!/bin/sh
if [ "$1" = "-f" ]; then echo 'File: "polluted"'; exit 1; fi
if [ "$1" = "-c" ]; then date +%s; exit 0; fi
exit 1
SH
chmod +x "$TMP/bin/stat"
mkdir -p "$TMP/proj"
out4="$(PROJECT_DIR="$TMP/proj" PATH="$TMP/bin:$PATH" bash "$SM" init edge 2>&1)"; rc4a=$?
printf '0\n' > "$TMP/proj/.swarm-yuan/.failure_count"
PROJECT_DIR="$TMP/proj" PATH="$TMP/bin:$PATH" bash "$SM" dump-journal >/dev/null 2>&1
out4="$(PROJECT_DIR="$TMP/proj" PATH="$TMP/bin:$PATH" bash "$SM" restore-journal 2>"$TMP/err4")"; rc4=$?
err4="$(cat "$TMP/err4")"
[[ $rc4a -eq 0 && $rc4 -eq 0 && -z "$err4" ]] \
  && printf '%s' "$out4" | grep -q 'phase=open failure_count=0 peak=L0' \
  && ok "态4 stat 回退链无 stdout 污染（restore-journal rc=0 stderr 空）" \
  || bad "态4 rc=$rc4/$rc4a err=$err4 out=$out4"

echo ""; [[ $FAIL -eq 0 ]] && echo "✓ test-r131-edges 全绿" || echo "✗ test-r131-edges 存在失败项" >&2
exit $FAIL
