#!/usr/bin/env bash
# test-r143-decisions-grandfathering.sh — R143-D1 回归锚：verify-completeness 决策账本检查的版本化边界
#
# 真实执勤实证（2026-11-07 trade-forge R143 再生成）：字段全量 schema 检查（type/ai_suggestion/
# user_action 非空）自 e642c4d0d（2026-10-28）才引入 _vc_check_decisions；此前写入的历史记录
# （如 trade-forge D-140-01/02/03，2026-10-24，有 type/context/decision 无 ai_suggestion/
# user_action）在再生成 --verify-completeness 时被全账本套新 schema → legacy 项目再生成必红。
# 根治=SCHEMA_EPOCH 边界 grandfathering（账本 append-only 不回改历史）；本测试锁五断言：
#   ① legacy 记录缺新字段不再报红  ② 边界后记录缺字段仍红（防豁免吞新缺陷）
#   ③ ts 不可解析视为历史（保守豁免）  ④ UserChallenge:incomplete 全时域仍红
#   ⑤ 边界后 UserChallenge 缺三要素仍红（legacy UserChallenge 豁免三要素但 incomplete 判据保留）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
GEN="scripts/generate-skill.sh"
TMP="$(mktemp -d /tmp/dgf.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

PROJ="$TMP/demo-api"
mkdir -p "$PROJ/src" "$PROJ/.claude/skills"
printf '{ "name": "demo-api", "version": "1.0.0" }\n' > "$PROJ/package.json"
bash "$GEN" demo-api "$PROJ" >/dev/null 2>&1
SKILL_DIR="$PROJ/.claude/skills/demo-api"
[[ -d "$SKILL_DIR" ]] && ok "create 完成" || { bad "create 失败"; echo "FAIL test-r143-decisions-grandfathering" >&2; exit 1; }
DEC="$SKILL_DIR/.swarm-yuan/decisions.jsonl"
mkdir -p "$(dirname "$DEC")"

run_vc() { bash "$GEN" --verify-completeness "$SKILL_DIR" 2>&1; }

# ① legacy（ts=2026-10-24 < 边界 2026-10-28）缺 ai_suggestion/user_action → 不报字段缺失
printf '%s\n' '{"id":"D-140-01","ts":"2026-10-24T01:40:00+08:00","type":"Taste","title":"legacy 决策","context":"c","decision":"d"}' > "$DEC"
out=$(run_vc)
grep -q '缺 type/ai_suggestion/user_action' <<<"$out" \
  && bad "① legacy 记录被新 schema 误杀（grandfathering 失效）" \
  || ok "① legacy 记录豁免全量字段检查"

# ② 边界后（ts=2026-11-07）同形态 → 必须报字段缺失
printf '%s\n' '{"id":"D-143-01","ts":"2026-11-07T09:00:00+08:00","type":"Mechanical","title":"新记录","context":"c","decision":"d"}' > "$DEC"
out=$(run_vc)
grep -q '缺 type/ai_suggestion/user_action' <<<"$out" \
  && ok "② 边界后缺字段仍红" \
  || bad "② 边界后记录缺字段未报（豁免面过宽）"

# ③ ts 不可解析（无 ts 字段）→ 视为历史豁免，但不炸
printf '%s\n' '{"type":"Mechanical","title":"无时间戳旧记录","decision":"d"}' > "$DEC"
out=$(run_vc)
grep -q '缺 type/ai_suggestion/user_action' <<<"$out" \
  && bad "③ 无 ts 记录被误杀（应保守豁免）" \
  || ok "③ ts 不可解析保守豁免"

# ④ UserChallenge:incomplete 全时域仍拦（legacy 也拦——这是激活语义不是 schema）
printf '%s\n' '{"ts":"2026-10-24T01:40:00+08:00","type":"UserChallenge:incomplete","title":"x"}' > "$DEC"
out=$(run_vc)
grep -q 'UserChallenge:incomplete 不得作为完整决策激活' <<<"$out" \
  && ok "④ incomplete 全时域拦截" \
  || bad "④ incomplete 拦截丢失"

# ⑤ 边界后 UserChallenge 缺三要素仍红；全字段合格记录零报
printf '%s\n' '{"ts":"2026-11-07T09:00:00+08:00","type":"UserChallenge","ai_suggestion":"s","user_action":"approved","rationale":"r"}' > "$DEC"
out=$(run_vc)
grep -q 'UserChallenge 缺' <<<"$out" \
  && ok "⑤ 边界后 UserChallenge 缺三要素仍红" \
  || bad "⑤ 边界后 UserChallenge 三要素检查丢失"
printf '%s\n' '{"ts":"2026-11-07T09:00:00+08:00","type":"Mechanical","ai_suggestion":"s","user_action":"approved","rationale":"r","outcome":"implemented","actor":"t"}' > "$DEC"
out=$(run_vc)
grep -E "decisions\\.jsonl:" <<<"$out" | grep -qE '非法JSON|缺 type/ai_suggestion|UserChallenge' \
  && bad "⑤b 合格新记录仍报决策问题: $(grep -E "decisions\\.jsonl:" <<<"$out" | grep -E '非法JSON|缺 type|UserChallenge' | head -2)" \
  || ok "⑤b 合格新记录零报（骨架清单行不计）"

[[ $FAIL -eq 0 ]] && { echo "PASS test-r143-decisions-grandfathering"; exit 0; } || { echo "FAIL test-r143-decisions-grandfathering" >&2; exit 1; }
