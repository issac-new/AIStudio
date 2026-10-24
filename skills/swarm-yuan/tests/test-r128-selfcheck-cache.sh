#!/usr/bin/env bash
# test-r128-selfcheck-cache.sh — R128 两项回归锁
#   A. self-check 框架规则集核验内容哈希缓存（.swarm-yuan/selfcheck-cache/fw-ruleset.sum）：
#      冷跑全绿落盘 / 二轮命中跳过 / NOCACHE 强制重跑不读缓存 / CI 与 --ci 不读不写 /
#      输入改一个字节即失效（哈希敏感）/ 有 fail 不写且清陈旧缓存
#   B. cli-ab-test.sh 基线可配（CLI_AB_BASE）：缺省与 =HEAD 逐字节等价 / 指向历史提交
#      可捕获已提交改动 / 不可解析 ref fail-closed 报错 / 非 git 目录维持未配置跳过
# 沙箱策略：A 用裁剪框架面（仅 spring-boot+django，每框架 verify≈1.3s，控制时长）的
# swarm-yuan 副本——断言缓存行为，不改真实仓库任何文件；B 用 stub precheck 双提交
# git 沙箱（对齐 test-r128-gate-hardening / test-verifier-reliability 的沙箱范式，
# git 写操作仅发生在 mktemp 沙箱内）。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"   # swarm-yuan/
REPO="$(cd "$BASE/.." && pwd)"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1" >&2; }
TMP="$(mktemp -d "${TMPDIR:-/tmp}/r128sc.XXXXXX")" || exit 2
trap 'rm -rf "$TMP"' EXIT

# ===== A. fw_ruleset_verify 内容哈希缓存 =====
SB="$TMP/sb"
mkdir -p "$SB/swarm-yuan"
for _d in scripts assets references tests; do cp -R "$BASE/$_d" "$SB/swarm-yuan/$_d"; done
# 框架面裁剪：规则库/门禁片段/fixture 三处同步只留两框架（_template.md 留作守卫路径）
for _f in "$SB/swarm-yuan/references/frameworks/"*.md; do
  _id="$(basename "$_f" .md)"
  case "$_id" in spring-boot|django|_template) ;; *) rm -f "$_f" ;; esac
done
for _f in "$SB/swarm-yuan/assets/framework-gates/"*.sh; do
  _id="$(basename "$_f" .sh)"
  case "$_id" in spring-boot|django) ;; *) rm -f "$_f" ;; esac
done
for _d in "$SB/swarm-yuan/tests/fixtures/"*/; do
  _id="$(basename "$_d")"
  case "$_id" in spring-boot|django) ;; *) rm -rf "$_d" ;; esac
done
SC="$SB/swarm-yuan/scripts/self-check.sh"
CACHE="$SB/swarm-yuan/.swarm-yuan/selfcheck-cache/fw-ruleset.sum"

run_sc() { # $1=日志路径 $2=CI 值(空=解绑) $3=NOCACHE 值 $4...=额外旗标
  local _log="$1" _ci="$2" _nc="$3"; shift 3
  if [[ -n "$_ci" ]]; then
    env -u CI CI="$_ci" SWARM_YUAN_SELFCHECK_NOCACHE="$_nc" \
      bash "$SC" --check-only "$@" > "$_log" 2>&1
  else
    env -u CI SWARM_YUAN_SELFCHECK_NOCACHE="$_nc" \
      bash "$SC" --check-only "$@" > "$_log" 2>&1
  fi
}

# A1 冷跑：全绿后缓存落盘
rm -f "$CACHE"
run_sc "$TMP/a1.log" "" 0
if grep -q '框架规则集核验全部通过（2/2）' "$TMP/a1.log" && [[ -f "$CACHE" ]]; then
  ok "A1 冷跑全绿落盘（缓存 $(cat "$CACHE")）"
else
  bad "A1 冷跑未落缓存或缺『全部通过（2/2）』：$(grep '规则集核验' "$TMP/a1.log" | head -2)"
fi

# A2 二轮：内容哈希未变 → 命中跳过
run_sc "$TMP/a2.log" "" 0
if grep -q '缓存命中（内容哈希' "$TMP/a2.log" && grep -q '跳过 2 框架逐个重执行' "$TMP/a2.log"; then
  ok "A2 命中跳过（$(grep -o '内容哈希 [0-9]*' "$TMP/a2.log" | head -1)）"
else
  bad "A2 未命中：$(grep '规则集核验' "$TMP/a2.log" | head -2)"
fi

# A3 NOCACHE=1：不读缓存强制重跑（缓存文件内容不动）
_sum_before=$(cat "$CACHE" 2>/dev/null)
run_sc "$TMP/a3.log" "" 1
if ! grep -q '缓存命中' "$TMP/a3.log" && grep -q '全部通过（2/2）' "$TMP/a3.log" \
   && [[ "$(cat "$CACHE" 2>/dev/null)" == "$_sum_before" ]]; then
  ok "A3 NOCACHE=1 强制重跑不读缓存（缓存文件未被触碰）"
else
  bad "A3 NOCACHE 仍命中或缓存被改动"
fi

# A4 字节敏感：门禁片段追加一行注释（语义中性）→ 哈希变 → 未命中 → 全绿后写新指纹
_sum_before=$(cat "$CACHE" 2>/dev/null)
printf '# r128 字节探针（语义中性注释）\n' >> "$SB/swarm-yuan/assets/framework-gates/spring-boot.sh"
run_sc "$TMP/a4.log" "" 0
_sum_after=$(cat "$CACHE" 2>/dev/null)
if ! grep -q '缓存命中' "$TMP/a4.log" && grep -q '全部通过（2/2）' "$TMP/a4.log" \
   && [[ "$_sum_after" != "$_sum_before" && -n "$_sum_after" ]]; then
  ok "A4 输入改一字节即失效（${_sum_before} → ${_sum_after}）"
else
  bad "A4 哈希对字节改动不敏感（before=${_sum_before} after=${_sum_after}）"
fi

# A5 CI 环境不启用：CI=true 冷跑全绿也不写缓存；--ci 旗标同口径
rm -f "$CACHE"
run_sc "$TMP/a5.log" true 0
if ! grep -q '缓存命中' "$TMP/a5.log" && grep -q '全部通过（2/2）' "$TMP/a5.log" && [[ ! -e "$CACHE" ]]; then
  ok "A5a CI=true 不读不写（全量重跑且未落缓存）"
else
  bad "A5a CI=true 写了缓存或误命中"
fi
run_sc "$TMP/a5b.log" "" 0 --ci
if ! grep -q '缓存命中' "$TMP/a5b.log" && [[ ! -e "$CACHE" ]]; then
  ok "A5b --ci 旗标同口径（不读不写）"
else
  bad "A5b --ci 旗标下发生缓存读写"
fi

# A6 有 fail 不写缓存：破坏 django fixture 双态 → 核验未通过且陈旧缓存被清
run_sc "$TMP/a6-prep.log" "" 0   # 先恢复绿色缓存
if [[ -f "$CACHE" ]]; then
  ok "A6-预置 绿色缓存已就位"
else
  bad "A6-预置 缓存未落盘，A6 主断言失去前提"
fi
rm -rf "$SB/swarm-yuan/tests/fixtures/django/compliant"
run_sc "$TMP/a6.log" "" 0
if grep -q '框架规则集核验未通过' "$TMP/a6.log" && [[ ! -e "$CACHE" ]]; then
  ok "A6 有 fail 不写缓存且清除陈旧指纹"
else
  bad "A6 失败轮缓存处理不符（存在=$([[ -e "$CACHE" ]] && echo y || echo n)）：$(grep '规则集核验未通过' "$TMP/a6.log" | head -1)"
fi

# ===== B. cli-ab-test.sh 基线可配（CLI_AB_BASE）=====
GB="$TMP/gb"
mkdir -p "$GB/swarm-yuan/assets" \
  "$GB/swarm-yuan/tests/gate-fixtures/summary/compliant" \
  "$GB/swarm-yuan/tests/gate-fixtures/sensitive/violating" \
  "$GB/verifier/v1"
cp "$REPO/verifier/v1/cli-ab-test.sh" "$GB/verifier/v1/"
mk_stub() { # $1=版本标记；$* 用单引号格式保留给 stub 自身（不在本层展开）
  printf 'GATE_FLAGS=(--demo)\n'
  printf 'echo "STUB %s"\n' "$1"
  printf 'echo "argv:[$*]"\n'
  printf 'exit 0\n'
}
mk_stub ver-A > "$GB/swarm-yuan/assets/precheck.sh"
( cd "$GB" && git init -q && git config user.email t@t && git config user.name t \
  && git add -A && git commit -qm vA )
mk_stub ver-B > "$GB/swarm-yuan/assets/precheck.sh"
( cd "$GB" && git add -A && git commit -qm vB )
# 工作区==HEAD（ver-B，已提交）：缺省口径 A==B 恒等全绿；CLI_AB_BASE=HEAD 须逐字节等价
bash "$GB/verifier/v1/cli-ab-test.sh" "$GB" > "$TMP/b-default.log" 2>&1; _rc_def=$?
CLI_AB_BASE=HEAD bash "$GB/verifier/v1/cli-ab-test.sh" "$GB" > "$TMP/b-head.log" 2>&1; _rc_head=$?
if [[ "$_rc_def" -eq "$_rc_head" ]] && cmp -s "$TMP/b-default.log" "$TMP/b-head.log"; then
  ok "B1 CLI_AB_BASE=HEAD 与缺省行为逐字节一致（rc=${_rc_def}）"
else
  bad "B1 缺省 vs =HEAD 输出或退出码不一致（${_rc_def} vs ${_rc_head}）"
fi
if [[ "$_rc_def" -eq 0 ]] && grep -q 'CLI_AB_FAILS 0' "$TMP/b-default.log"; then
  ok "B2 工作区==HEAD 全绿（缺省语义未变，不因可配基线回归）"
else
  bad "B2 缺省口径不再全绿：$(tail -3 "$TMP/b-default.log")"
fi
# 基线指 HEAD~1：A=ver-A（改动前）↔ B=ver-B（已提交）——提交后仍可测的关键场景
CLI_AB_BASE=HEAD~1 bash "$GB/verifier/v1/cli-ab-test.sh" "$GB" > "$TMP/b-old.log" 2>&1; _rc_old=$?
if [[ "$_rc_old" -eq 1 ]] && grep -q 'STUB ver-A' "$TMP/b-old.log" && grep -q 'STUB ver-B' "$TMP/b-old.log"; then
  ok "B3 基线指 HEAD~1 捕获已提交改动（A/B 如期 DIFF，rc=1）"
else
  bad "B3 对账历史基线未按预期报 DIFF（rc=${_rc_old}）"
fi
# 显式不可解析 ref：fail-closed 报错而非静默比较
CLI_AB_BASE=no-such-ref-xyz bash "$GB/verifier/v1/cli-ab-test.sh" "$GB" > "$TMP/b-badref.log" 2>&1; _rc_bad=$?
if [[ "$_rc_bad" -ne 0 ]] && grep -q 'CLI_AB FAIL' "$TMP/b-badref.log"; then
  ok "B4 不可解析 ref 明确报错 rc=${_rc_bad}（非静默比较/假绿）"
else
  bad "B4 不可解析 ref 未 fail-closed（rc=${_rc_bad}）"
fi
# 非 git 目录 + 缺省 HEAD：维持「未配置静默跳过」既有语义
NOGIT="$TMP/nogit"
mkdir -p "$NOGIT/swarm-yuan/assets" \
  "$NOGIT/swarm-yuan/tests/gate-fixtures/summary/compliant" \
  "$NOGIT/swarm-yuan/tests/gate-fixtures/sensitive/violating" \
  "$NOGIT/verifier/v1"
cp "$GB/swarm-yuan/assets/precheck.sh" "$NOGIT/swarm-yuan/assets/"
cp "$REPO/verifier/v1/cli-ab-test.sh" "$NOGIT/verifier/v1/"
bash "$NOGIT/verifier/v1/cli-ab-test.sh" "$NOGIT" > "$TMP/b-nogit.log" 2>&1; _rc_ng=$?
if [[ "$_rc_ng" -eq 0 ]] && grep -q 'CLI_AB_SKIP' "$TMP/b-nogit.log"; then
  ok "B5 非 git 目录维持未配置静默跳过（rc=0）"
else
  bad "B5 非 git 目录未按未配置跳过（rc=${_rc_ng}）"
fi

echo "test-r128-selfcheck-cache: PASS $PASS / FAIL $FAIL"
[[ "$FAIL" -eq 0 ]]
