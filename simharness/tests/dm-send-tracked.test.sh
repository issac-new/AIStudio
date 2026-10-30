#!/bin/bash
# dm-send-tracked.test.sh — DM 送达保障守门（run23 挂账① 根治件配套）
# 四场景（违一即 FAIL）：
#   ①送达正常：mx_send 返回 event id 且回读在房 → 原样返回，零 ISSUE、零重发。
#   ②回读缺席死信：event id 发出但回读不在房 → 自动重发一次（幂等标记内嵌原
#     event_id），记 ISSUE dm-dead-letter，返回重发新 id。
#   ③网关容量丢弃：gateway.log 命中 dropping/Capacity 行 → 自动重递一次，记
#     ISSUE dm-capacity-drop，返回重递新 id。
#   ④三试全败：mx_send 恒 SEND-FAILED → 退避重试一次仍败 → 如实返回
#     SEND-FAILED，记 ISSUE dm-send-failed，绝不谎报送达。
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0

# 提取被测三件套 + dm_room（dm_send_tracked 依赖）
FNS=""
for fn in _gateway_dropped _dm_readback_has dm_send_tracked dm_room; do
  _src="$(sed -n "/^${fn}()/,/^}/p" "$HERE/mux/mx-scenario-lib.sh")"
  [[ -n "$_src" ]] || { echo "FAIL 提取 ${fn} 失败"; exit 1; }
  FNS="${FNS}${_src}
"
done

CTRL="$(mktemp -d /tmp/dm-send-tracked.XXXXXX)" || exit 1
trap 'rm -rf "$CTRL"' EXIT
export EVID_DIR="$CTRL/evidence" LOGS_DIR="$CTRL/logs"
mkdir -p "$EVID_DIR" "$LOGS_DIR"
STATE="$CTRL/state.env"; touch "$STATE"

# ── stub 外部面 ──
note() { printf '%s\n' "$*" >> "$EVID_DIR/note.log"; }
fail() { echo "FAIL(驱动) $*" >> "$EVID_DIR/note.log"; }
sget() { grep -s "^$1=" "$STATE" | head -1 | cut -d= -f2-; return 0; }
sset() { grep -v "^$1=" "$STATE" 2>/dev/null > "$STATE.tmp"; mv "$STATE.tmp" "$STATE"; echo "$1=$2" >> "$STATE"; }
load_token() { printf 'tok-stub'; }
human_mxid() { printf '@%s:stub' "$1"; }
mx_join() { :; }
# dm_room 建房面：createRoom 调用回固定 room_id（stub 房 !dmroom:stub）
mx() { printf '{"room_id":"!dmroom:stub"}'; }
# mx_send 可脚本化：CTRL/mx_send.results 每行一个结果逐次消费；空行=默认 evt-ok-<N>。
# 计数必须落文件——`$(mx_send …)` 命令替换开子壳，函数内变量自增不回传父壳
# （首轮实测两调用都记 #1 即此坑），多场景连续消费会串号。
mx_send() {
  local n r
  n=$(( $(cat "$CTRL/mx_seq" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$CTRL/mx_seq"
  r=$(sed -n "${n}p" "$CTRL/mx_send.results" 2>/dev/null)
  printf '%s' "${r:-evt-ok-${n}}"
  printf 'SEND|%s|%s|%s\n' "$2" "$3" "$4" >> "$CTRL/sent.log"
}
# 回读可脚本化：CTRL/readback.list 列出「在房」的 event id（缺席=不在房）。
# 输出须对齐生产 mx_messages 形态（事件对象数组，.event_id 取锚）——首轮 stub 只
# 回字符串数组，jq .event_id 恒 null → 送达被误判死信。
mx_messages() { cat "$CTRL/readback.list" 2>/dev/null | jq -R -s -c 'split("\n") | map(select(length>0)) | map({event_id: .})'; }

eval "$FNS"

issue_count() { grep -c "^ISSUE|" "$EVID_DIR/issues.log" 2>/dev/null || echo 0; }
# 计发送次数按 SEND| 前缀行——重发消息正文含换行，printf 落盘占多行，wc -l 会多数
sent_count() { grep -c "^SEND|" "$CTRL/sent.log" 2>/dev/null || echo 0; }

# ── ① 送达正常：回读在房 → 原样返回、零单、零重发 ──
{
  rm -f "$EVID_DIR/issues.log" "$CTRL/sent.log" "$CTRL/mx_send.results" "$CTRL/mx_seq" "$STATE"
  touch "$STATE"
  printf '$evt1\n' > "$CTRL/mx_send.results"
  printf '$evt1\n' > "$CTRL/readback.list"
  out=$(dm_send_tracked bella fanfan "需求私信测试")
  rc=$?
  [[ "$out" == '$evt1' ]] || { echo "FAIL ① 返回值应为 \$evt1 实得 ${out}"; fails=$((fails+1)); }
  [[ $rc -eq 0 ]] || { echo "FAIL ① 应恒返 0 实得 ${rc}"; fails=$((fails+1)); }
  [[ $(sent_count) -eq 1 ]] || { echo "FAIL ① 不应重发（实发 $(sent_count) 次）"; fails=$((fails+1)); }
  [[ $(issue_count) -eq 0 ]] || { echo "FAIL ① 正常送达不应记单"; fails=$((fails+1)); }
} 2>/dev/null

# ── ② 回读缺席死信：自动重发+记单+返回新 id ──
{
  rm -f "$EVID_DIR/issues.log" "$CTRL/sent.log" "$CTRL/mx_send.results" "$CTRL/mx_seq"
  : > "$CTRL/readback.list"   # 回读恒空=死信
  out=$(dm_send_tracked bella fanfan "回灌测试")
  [[ "$out" == 'evt-ok-2' ]] || { echo "FAIL ② 应回填重发 id evt-ok-2 实得 ${out}"; fails=$((fails+1)); }
  [[ $(sent_count) -eq 2 ]] || { echo "FAIL ② 应发 2 次（原发+重发）实发 $(sent_count)"; fails=$((fails+1)); }
  grep -q '^ISSUE|dm-dead-letter|' "$EVID_DIR/issues.log" 2>/dev/null || { echo "FAIL ② 应记 dm-dead-letter 单"; fails=$((fails+1)); }
  grep -q "重发标记.*evt-ok-1" "$CTRL/sent.log" || { echo "FAIL ② 重发消息应内嵌原 event_id 去重锚"; fails=$((fails+1)); }
} 2>/dev/null

# ── ③ 网关容量丢弃：重递+记 dm-capacity-drop ──
{
  rm -f "$EVID_DIR/issues.log" "$CTRL/sent.log" "$CTRL/mx_send.results" "$CTRL/mx_seq"
  printf '$evt1\n' > "$CTRL/readback.list"
  printf '$evt1\n' > "$CTRL/mx_send.results"
  printf 'dropping message for $evt1 room=!r\n' > "$LOGS_DIR/gateway.log"
  out=$(dm_send_tracked bella fanfan "容量测试")
  [[ "$out" == 'evt-ok-2' ]] || { echo "FAIL ③ 应回填重递 id evt-ok-2 实得 ${out}"; fails=$((fails+1)); }
  grep -q '^ISSUE|dm-capacity-drop|' "$EVID_DIR/issues.log" 2>/dev/null || { echo "FAIL ③ 应记 dm-capacity-drop 单"; fails=$((fails+1)); }
  grep -q "重递标记.*\$evt1" "$CTRL/sent.log" || { echo "FAIL ③ 重递消息应内嵌原 event_id"; fails=$((fails+1)); }
} 2>/dev/null

# ── ④ 三试全败：退避重试仍败 → 如实 SEND-FAILED+记单 ──
{
  rm -f "$EVID_DIR/issues.log" "$CTRL/sent.log" "$CTRL/mx_seq"
  printf 'SEND-FAILED\nSEND-FAILED\n' > "$CTRL/mx_send.results"
  out=$(dm_send_tracked bella fanfan "失败测试")
  [[ "$out" == 'SEND-FAILED' ]] || { echo "FAIL ④ 应如实返回 SEND-FAILED 实得 ${out}"; fails=$((fails+1)); }
  grep -q '^ISSUE|dm-send-failed|' "$EVID_DIR/issues.log" 2>/dev/null || { echo "FAIL ④ 应记 dm-send-failed 单"; fails=$((fails+1)); }
  [[ $(sent_count) -eq 2 ]] || { echo "FAIL ④ 应为三试+重试两轮 mx_send 实发 $(sent_count) 轮"; fails=$((fails+1)); }
} 2>/dev/null

if (( fails > 0 )); then
  echo "FAIL(dm-send-tracked) ${fails} 项断言未过"
  exit 1
fi
echo "PASS dm-send-tracked（送达确认/死信重发/容量重递/败果如实 四场景）"
