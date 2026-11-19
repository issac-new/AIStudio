#!/usr/bin/env bash
# test-review-protocol.sh — 独立审查协议守门测试（EGM 吸收批）
#
# 查四件事：
#   ① 模板含协议必填键（reviewer_context/冷读输入/阶段完成/理解度/收敛/未运行项）
#   ② 合规记录在 REVIEW_RECORD_REQUIRED=1 下通过
#   ③ 四类反例被拦：缺字段、degraded 却通过、not_run_count>0 却 clean、禁词命中
#   ④ 未填写的模板不得通过（占位符检测）
#
# 退出码：0 全过；1 有失败。
set -u
SKILL="$(cd "$(dirname "${0}")/.." && pwd)"
PASS=0
FAIL=0
ok() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
bad() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

TMPROOT="$(mktemp -d "${TMPDIR:-/tmp}/review-protocol.XXXXXX")"
cleanup() { rm -rf "$TMPROOT"; }
trap cleanup EXIT

# 复制 assets 到隔离目录：conf 链会 source compliance.conf 的默认值，
# 测试用 patch 覆盖层（最后 source）设定 REVIEW_RECORD_REQUIRED，避免改生成器本体。
SKILLCOPY="$TMPROOT/skill"
mkdir -p "$SKILLCOPY"
cp -R "$SKILL/assets" "$SKILLCOPY/assets"

write_record() { # $1=文件 $2=context $3=结论 $4=clean $5=not_run_count $6=findings 追加词
  local _p="$1" _ctx="$2" _concl="$3" _clean="$4" _nr="$5" _extra="$6"
  cat > "$_p" <<EOF
# 审查记录 2026-11-19

| 字段 | 值 |
|------|-----|
| 评审人 | subagent-test |
| reviewer_context | ${_ctx} |
| 日期 | 2026-11-19 |
| 范围 | test |
| 结论 | ${_concl} |

## 冷读输入清单

| 项 | 值 |
|----|-----|
| 待审文档 | spec.md |
| 被引用源码 | src/a.ts |
| 是否传了会话历史/作者推理 | 否 |

## 阶段完成表

| 阶段 | 状态 | 产出文件 |
|------|------|---------|
| S1 全局审视 | completed | s1.md |
| S2 理解度审查 | completed | s2.md |
| S3 设计批判 | completed | s3.md |
| S4 实现就绪 | completed | s4.md |

## 理解度结论（S2）

- 复述标题：要做什么 / 不做什么 / 边界 / 验证
- 判定：可复述

## 五维审查要点（S3 内容检查表）

- **正确性**：边界条件已核
- **安全**：权限校验已核
- **性能**：无热路径阻塞
- **可维护**：分层符合约定
- **测试覆盖**：正常与失败路径均有断例

## 发现项

| # | 严重度 | 文件:行 | 问题 | 证据 | 修复建议 | 不修的后果 | 处置 |
|---|--------|---------|------|------|---------|-----------|------|
| 1 | should-fix | src/a.ts:10 | 重试只做一次${_extra} | 源码可见 | 补三次重试 | 事件丢失 | 已修 |

## 收敛声明

- 本轮：round 2
- clean: ${_clean}；consecutive_clean: 2；not_run_count: ${_nr}；converged: yes
- 残余风险：无

## 禁词自检

- 结果：无命中

## 未运行项

| 项 | 原因 | 影响 |
|----|------|------|
| 无 | - | - |
EOF
}

run_gate() { # $1=项目目录 [$2=开关]
  local _proj="$1" _req="${2:-1}"
  printf 'REVIEW_RECORD_REQUIRED=%s\n' "$_req" > "$SKILLCOPY/assets/precheck.patch.conf"
  ( cd "$_proj" && bash "$SKILLCOPY/assets/precheck.sh" --review 2>&1 )
}

expect_fail() { # $1=名称 $2=输出 $3=rc $4=期望错误码
  if [[ "$3" -ne 0 ]] && printf '%s' "$2" | grep -q "$4"; then
    ok "$1"
  else
    bad "$1（rc=$3，期望命中 $4）"
    printf '%s\n' "$2" | tail -15
  fi
}

expect_pass() { # $1=名称 $2=输出 $3=rc
  if [[ "$3" -eq 0 ]]; then
    ok "$1"
  else
    bad "$1（rc=$3）"
    printf '%s\n' "$2" | tail -15
  fi
}

# ① 模板必填键在位
for key in reviewer_context 冷读输入 阶段完成 理解度 收敛声明 not_run_count 未运行项 禁词自检; do
  if grep -q "$key" "$SKILL/assets/review-record-template.md"; then
    ok "模板含协议键: ${key}"
  else
    bad "模板缺协议键: ${key}"
  fi
done

# ② 合规记录通过
P1="$TMPROOT/compliant"
mkdir -p "$P1/references"
write_record "$P1/references/review-record.md" fresh "通过（带 1 项建议）" yes 0 ""
OUT="$(run_gate "$P1" 1)"; RC=$?
expect_pass "合规记录（fresh + 零 not-run）通过" "$OUT" "$RC"

# ③ 缺 reviewer_context
P2="$TMPROOT/missing-ctx"
mkdir -p "$P2/references"
write_record "$P2/references/review-record.md" fresh "通过" yes 0 ""
grep -v 'reviewer_context' "$P2/references/review-record.md" > "$P2/references/review-record.tmp"
mv "$P2/references/review-record.tmp" "$P2/references/review-record.md"
OUT="$(run_gate "$P2" 1)"; RC=$?
expect_fail "缺 reviewer_context 被拦" "$OUT" "$RC" 'gate_review_protocol_fields\|gate_review_context_missing'

# ④ degraded 却给通过结论
P3="$TMPROOT/degraded"
mkdir -p "$P3/references"
write_record "$P3/references/review-record.md" degraded "通过" yes 0 ""
OUT="$(run_gate "$P3" 1)"; RC=$?
expect_fail "degraded 上下文给通过被拦" "$OUT" "$RC" 'gate_review_context_not_fresh'

# ⑤ not_run_count>0 却 clean
P4="$TMPROOT/notrun"
mkdir -p "$P4/references"
write_record "$P4/references/review-record.md" fresh "通过（带 1 项建议）" yes 1 ""
OUT="$(run_gate "$P4" 1)"; RC=$?
expect_fail "not run 却声明 clean 被拦" "$OUT" "$RC" 'gate_review_notrun_clean'

# ⑥ 禁词命中
P5="$TMPROOT/banned"
mkdir -p "$P5/references"
write_record "$P5/references/review-record.md" fresh "通过（带 1 项建议）" yes 0 "（方案完美）"
OUT="$(run_gate "$P5" 1)"; RC=$?
expect_fail "评审禁词被拦" "$OUT" "$RC" 'gate_review_banned_words'

# ⑦ 未填写的模板
P6="$TMPROOT/unfilled"
mkdir -p "$P6/references"
write_record "$P6/references/review-record.md" "<fresh / degraded / unavailable>" "通过" yes 0 ""
OUT="$(run_gate "$P6" 1)"; RC=$?
expect_fail "未填写模板被拦" "$OUT" "$RC" 'gate_review_protocol_unfilled'

# ⑧ 默认档（REVIEW_RECORD_REQUIRED=0）只 warn 不 fail
P7="$TMPROOT/default-warn"
mkdir -p "$P7/references"
write_record "$P7/references/review-record.md" degraded "通过" yes 0 ""
OUT="$(run_gate "$P7" 0)"; RC=$?
expect_pass "默认档不过度拦截（degraded 仅 warn）" "$OUT" "$RC"

echo
echo "review-protocol: ${PASS} passed, ${FAIL} failed"
[[ "$FAIL" -eq 0 ]] || exit 1
exit 0
