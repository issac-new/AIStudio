#!/usr/bin/env bash
# test-failure-detector.sh — failure-detector.sh + trace-log --key-node 测试（WP-Q2-lite）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FD="assets/hooks/failure-detector.sh"
TL="assets/trace-log.sh"
TMP="$(mktemp -d /tmp/q2test.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

mkdir -p "$TMP/proj"
export PROJECT_DIR="$TMP/proj"

# --- 态 1：单次失败无干预 ---
out=$(echo '{"tool_name":"Bash","tool_result":{"exit_code":1,"content":"error: foo"},"session_id":"s1"}' | bash "$FD" 2>&1)
[[ -z "$out" ]] && ok "态1 单次失败无干预" || bad "态1 输出: $out"

# --- 态 2：连续 2 次同签名失败 → L1 完整块 ---
out=$(echo '{"tool_name":"Bash","tool_result":{"exit_code":1,"content":"error: foo"},"session_id":"s1"}' | bash "$FD" 2>&1)
echo "$out" | grep -q 'L1 — 连续失败检测' && ok "态2 第二次同签名 L1 命中" || bad "态2 缺 L1: $out"

# --- 态 3：连续 3 次同签名 → SPINNING brief（不再发完整 L2）---
out=$(echo '{"tool_name":"Bash","tool_result":{"exit_code":1,"content":"error: foo"},"session_id":"s1"}' | bash "$FD" 2>&1)
echo "$out" | grep -q 'SPINNING brief — 同一错误第 3 次' && ok "态3 第三次 SPINNING brief 命中" || bad "态3 缺 brief: $out"
echo "$out" | grep -q 'L2 —' && bad "态3 误发完整 L2（应 brief）: $out" || ok "态3 无完整 L2（去重 OK）"

# --- 态 4：连续 4 次同签名 → SPINNING brief（不再发 L3）---
out=$(echo '{"tool_name":"Bash","tool_result":{"exit_code":1,"content":"error: foo"},"session_id":"s1"}' | bash "$FD" 2>&1)
echo "$out" | grep -q 'SPINNING brief — 同一错误第 4 次' && ok "态4 第四次 SPINNING brief 命中" || bad "态4 缺 brief: $out"
echo "$out" | grep -q 'L3 —' && bad "态4 误发完整 L3（应 brief）: $out" || ok "态4 无完整 L3（去重 OK）"

# --- 态 5：换签名 → same_sig_count 重置 → L 等级按 COUNT 走 ---
out=$(echo '{"tool_name":"Bash","tool_result":{"exit_code":1,"content":"error: different thing"},"session_id":"s1"}' | bash "$FD" 2>&1)
# 第 5 次失败，COUNT=5 → L4
echo "$out" | grep -qE 'L5 — 连续 5 次失败|L[1-4]' && ok "态5 换签名 L 等级命中（R13 形态）" || bad "态5 缺 L 块: $out"
# same_sig_count 应重置为 1
cnt=$(cat "$TMP/proj/.swarm-yuan/.same_sig_count" 2>/dev/null)
[[ "$cnt" == "1" ]] && ok "态5 换签名 same_sig_count 重置" || bad "态5 same_sig_count=$cnt 应=1"

# --- 态 6：成功后 same_sig_count 清 0（R45：普通成功不清 COUNT，只清签名周期） ---
echo '{"tool_name":"Bash","tool_result":{"exit_code":0,"content":"ok"},"session_id":"s1"}' | bash "$FD" >/dev/null 2>&1
cnt=$(cat "$TMP/proj/.swarm-yuan/.same_sig_count" 2>/dev/null || echo "0")
[[ "$cnt" == "0" ]] && ok "态6 成功后 same_sig_count 清 0" || bad "态6 未清 0: $cnt"

# --- 态 7：tone 软化——L3 不再有"3.25/毕业"话术（4 次都不同签名，避免 SPINNING brief 拦截）---
rm -rf "$TMP/proj/.swarm-yuan"
# 4 次连续失败，每次不同签名（避免 SPINNING 拦截）
for i in 1 2 3 4; do
  out=$(echo "{\"tool_name\":\"Bash\",\"tool_result\":{\"exit_code\":1,\"content\":\"error: thing $i happened\"},\"session_id\":\"s1\"}" | bash "$FD" 2>&1)
done
echo "$out" | grep -qE '3\.25|毕业' && bad "态7 tone 仍有 3.25/毕业话术: $out" || ok "态7 tone 软化（无 3.25/毕业）"
echo "$out" | grep -qE 'L[0-9] — 连续 [0-9] 次失败' && ok "态7 R13 L 块（数字级提示，叙事剧场已退役）" || bad "态7 缺 R13 L 块: $out"

# --- 态 8：trace-log --key-node 落盘 ---
mkdir -p "$TMP/proj8"
out=$(PROJECT_DIR="$TMP/proj8" bash "$TL" --key-node "①探查仓库" --actor "swarm-yuan/ai" --status started --note "三路并行" 2>&1)
echo "$out" | grep -q '→ \[关键节点\] ①探查仓库' && ok "态8 --key-node stdout 提示" || bad "态8 缺提示: $out"
[[ -f "$TMP/proj8/.swarm-yuan/key-nodes.jsonl" ]] && ok "态8 key-nodes.jsonl 落盘" || bad "态8 未落盘"
grep -q '"key_node":"①探查仓库"' "$TMP/proj8/.swarm-yuan/key-nodes.jsonl" && ok "态8 jsonl 含 key_node 字段" || bad "态8 jsonl 缺字段"

# --- 态 9：--key-node 缺节点名 → 降级 exit 0 ---
out=$(PROJECT_DIR="$TMP/proj8" bash "$TL" --key-node "" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态9 缺节点名 exit 0（降级）" || bad "态9 exit=$rc"

# --- 态 10：--key-node-summary 不实现（最小切片）；只验证 --key-node 不再破坏 --node 普通调用 ---
out=$(PROJECT_DIR="$TMP/proj8" bash "$TL" --node "test" --actor "ai" --tool "ls" --status done 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态10 --node 普通调用兼容" || bad "态10 --node exit=$rc"
echo "$out" | grep -q '→ \[test\] 调用 ai · ls' && ok "态10 --node stdout 提示" || bad "态10 缺提示: $out"

# --- 态 11：WP-R12-D --decision outcome 缺省推导（rejected→rejected；approved→implemented） ---
mkdir -p "$TMP/proj11"
PROJECT_DIR="$TMP/proj11" bash "$TL" --decision --type Taste --suggestion "用方案A" --user-action rejected --rationale "太贵" >/dev/null 2>&1
grep -q '"outcome":"rejected"' "$TMP/proj11/.swarm-yuan/decisions.jsonl" && ok "态11 rejected→outcome=rejected" || bad "态11 缺 outcome=rejected: $(cat "$TMP/proj11/.swarm-yuan/decisions.jsonl")"
PROJECT_DIR="$TMP/proj11" bash "$TL" --decision --type Mechanical --suggestion "格式化" --user-action approved >/dev/null 2>&1
grep -q '"outcome":"implemented"' "$TMP/proj11/.swarm-yuan/decisions.jsonl" && ok "态11 approved→outcome=implemented" || bad "态11 缺 outcome=implemented"
# 显式 --outcome 覆盖缺省推导
PROJECT_DIR="$TMP/proj11" bash "$TL" --decision --type Taste --suggestion "旧方案" --user-action approved --outcome superseded >/dev/null 2>&1
grep -q '"outcome":"superseded"' "$TMP/proj11/.swarm-yuan/decisions.jsonl" && ok "态11 显式 --outcome superseded 覆盖" || bad "态11 显式 outcome 未生效"

# --- 态 12：R45 grep 无匹配豁免（exit 1 + grep 命令 + 无 error 模式 = 信息非失败） ---
mkdir -p "$TMP/proj12"
out=$(PROJECT_DIR="$TMP/proj12" bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"grep -r TODO src/\"},\"tool_result\":{\"exit_code\":1,\"content\":\"\"},\"session_id\":\"s12\"}" | bash assets/hooks/failure-detector.sh' 2>&1)
[[ -z "$out" ]] && ok "态12 grep 无匹配豁免（无输出）" || bad "态12 不应有输出: $out"
cnt=$(cat "$TMP/proj12/.swarm-yuan/.failure_count" 2>/dev/null || echo "0")
[[ "$cnt" == "0" ]] && ok "态12 失败计数未涨" || bad "态12 计数=$cnt 应=0"

# --- 态 13：R45 grep 真错误仍计失败（exit 2 / 输出含 error → 不豁免） ---
mkdir -p "$TMP/proj13"
out=$(PROJECT_DIR="$TMP/proj13" bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"grep -r TODO /nonexistent-dir\"},\"tool_result\":{\"exit_code\":2,\"content\":\"grep: /nonexistent-dir: No such file or directory\"},\"session_id\":\"s13\"}" | bash assets/hooks/failure-detector.sh' 2>&1)
cnt=$(cat "$TMP/proj13/.swarm-yuan/.failure_count" 2>/dev/null || echo "0")
[[ "$cnt" == "1" ]] && ok "态13 grep 真错误（exit 2 + error 模式）仍计失败" || bad "态13 计数=$cnt 应=1"

# --- 态 14：R45 普通成功保持 COUNT；验证类成功清零 ---
mkdir -p "$TMP/proj14"
# 失败 1 次
PROJECT_DIR="$TMP/proj14" bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_result\":{\"exit_code\":1,\"content\":\"error: x\"},\"session_id\":\"s14\"}" | bash assets/hooks/failure-detector.sh' >/dev/null 2>&1
# 普通成功（ls）——COUNT 应保持 1
PROJECT_DIR="$TMP/proj14" bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"ls -la\"},\"tool_result\":{\"exit_code\":0,\"content\":\"file1 file2\"},\"session_id\":\"s14\"}" | bash assets/hooks/failure-detector.sh' >/dev/null 2>&1
cnt=$(cat "$TMP/proj14/.swarm-yuan/.failure_count" 2>/dev/null || echo "0")
[[ "$cnt" == "1" ]] && ok "态14 普通成功（ls）保持 COUNT=1" || bad "态14 COUNT=$cnt 应=1（普通成功不该清零）"
# 验证类成功（pytest）——COUNT 应清零
PROJECT_DIR="$TMP/proj14" bash -c 'echo "{\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"pytest tests/ -q\"},\"tool_result\":{\"exit_code\":0,\"content\":\"3 passed\"},\"session_id\":\"s14\"}" | bash assets/hooks/failure-detector.sh' >/dev/null 2>&1
cnt=$(cat "$TMP/proj14/.swarm-yuan/.failure_count" 2>/dev/null || echo "0")
[[ "$cnt" == "0" ]] && ok "态14 验证类成功（pytest）清零 COUNT" || bad "态14 COUNT=$cnt 应=0（验证成功应清零）"

# --- 态 15：R45 决策哈希链——三条决策写入，行含 seq/prev/checksum 且 JSON 合法，链校验 OK ---
mkdir -p "$TMP/proj15"
for i in 1 2 3; do
  PROJECT_DIR="$TMP/proj15" bash "$TL" --decision --type Taste --suggestion "方案$i" --user-action approved >/dev/null 2>&1
done
python3 -c "import json,sys; rows=[json.loads(l) for l in open('$TMP/proj15/.swarm-yuan/decisions.jsonl')]; assert [r['seq'] for r in rows]==[1,2,3]; assert all('checksum' in r and 'previous_checksum' in r for r in rows)" 2>/dev/null \
  && ok "态15 决策行含链字段且 JSON 合法（seq=1,2,3）" || bad "态15 链字段/JSON 异常: $(head -1 "$TMP/proj15/.swarm-yuan/decisions.jsonl" | cut -c-60)"
out=$(PROJECT_DIR="$TMP/proj15" bash "$TL" --verify-chain 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -q "链完整：3 行校验通过" && ok "态15 --verify-chain OK" || bad "态15 verify 异常: $out (rc=$rc)"
# prev 链：第 3 行 previous_checksum == 第 2 行 checksum
_p2=$(sed -n '2p' "$TMP/proj15/.swarm-yuan/decisions.jsonl" | sed -n 's/.*"checksum":"\([^"]*\)".*/\1/p')
_p3=$(sed -n '3p' "$TMP/proj15/.swarm-yuan/decisions.jsonl" | sed -n 's/.*"previous_checksum":"\([^"]*\)".*/\1/p')
[[ "$_p2" == "$_p3" && -n "$_p2" ]] && ok "态15 prev 链衔接（行3.prev==行2.checksum）" || bad "态15 prev 链断裂: p2=$_p2 p3=$_p3"

# --- 态 16：R45 篡改 body → verify-chain FAIL exit 1 ---
mkdir -p "$TMP/proj16/.swarm-yuan" && cp "$TMP/proj15/.swarm-yuan/decisions.jsonl" "$TMP/proj16/.swarm-yuan/decisions.jsonl"
sed -e 's/方案2/方案X/' "$TMP/proj16/.swarm-yuan/decisions.jsonl" > "$TMP/proj16/.swarm-yuan/decisions.jsonl.tmp" && mv "$TMP/proj16/.swarm-yuan/decisions.jsonl.tmp" "$TMP/proj16/.swarm-yuan/decisions.jsonl"
out=$(PROJECT_DIR="$TMP/proj16" bash "$TL" --verify-chain 2>&1); rc=$?
[[ $rc -eq 1 ]] && echo "$out" | grep -q "checksum 失配" && ok "态16 篡改 body → FAIL" || bad "态16 篡改未检出: $out (rc=$rc)"

# --- 态 17：R45 删中间行 → verify-chain FAIL exit 1（seq 断档 + prev 失配） ---
mkdir -p "$TMP/proj17/.swarm-yuan" && cp "$TMP/proj15/.swarm-yuan/decisions.jsonl" "$TMP/proj17/.swarm-yuan/decisions.jsonl"
sed -e '2d' "$TMP/proj17/.swarm-yuan/decisions.jsonl" > "$TMP/proj17/.swarm-yuan/decisions.jsonl.tmp" && mv "$TMP/proj17/.swarm-yuan/decisions.jsonl.tmp" "$TMP/proj17/.swarm-yuan/decisions.jsonl"
out=$(PROJECT_DIR="$TMP/proj17" bash "$TL" --verify-chain 2>&1); rc=$?
[[ $rc -eq 1 ]] && echo "$out" | grep -qE "断裂|失配" && ok "态17 删行 → FAIL" || bad "态17 删行未检出: $out (rc=$rc)"

# --- 态 18：R45 legacy 前导行兼容（旧格式行跳过，链自首个带链字段行起算）---
mkdir -p "$TMP/proj18/.swarm-yuan"
printf '%s\n' '{"ts":"2026-08-01T00:00:00Z","type":"Taste","ai_suggestion":"旧格式","user_action":"approved"}' > "$TMP/proj18/.swarm-yuan/decisions.jsonl"
PROJECT_DIR="$TMP/proj18" bash "$TL" --decision --type Mechanical --suggestion "新链行" --user-action approved >/dev/null 2>&1
out=$(PROJECT_DIR="$TMP/proj18" bash "$TL" --verify-chain 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -q "1 行 legacy 跳过" && ok "态18 legacy 前导兼容 OK" || bad "态18 legacy 处理异常: $out (rc=$rc)"

# --- 态 19：R45 文件不存在 → vacuously intact exit 0 ---
out=$(PROJECT_DIR="${TMP}/proj19-nonexistent" bash "$TL" --verify-chain 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态19 无文件 → exit 0" || bad "态19 rc=$rc: $out"

[[ $FAIL -eq 0 ]] && { echo "PASS test-failure-detector"; exit 0; } || { echo "FAIL test-failure-detector" >&2; exit 1; }
