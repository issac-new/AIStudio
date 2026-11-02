#!/bin/bash
# mx-gate-lib.sh — 闸门催办判定纯函数（2026-11-02 机制治理批·方案 C）
#
# 为什么单独成库：催办话术按闸别分流这件事，过去内联在 supervisor 里、只有整轮真跑
# 才暴露——run25 实录 22:45-23:16：G2 熔断死等被 G5 话术误催（催 READY-GATE-PASS，
# 而 run25 根本未到 G5），fanfan 每 20 分钟被抢占一个回合，累计烧掉 40 分钟关键路径。
#
# 本库只有纯函数：读入（文件路径/参数）→ 返回判定或文本，无网络、无 state 写入、
# 无 note 日志。行为测试直接 source 后调用（simharness/tests/mechanism-behavior.test.ts）。
#
# 约定：调用方负责 I/O（发消息、写日志）；本库不做任何副作用。

# mx_breaker_gates <breaker.json 路径> → 以逗号连接的闸键（failRounds>=2），空=无熔断
# 解析失败/文件缺失一律输出空串（fail-soft：催办宁可不发也不误催）。
mx_breaker_gates() {
  local path="${1:-}"
  [ -n "$path" ] && [ -f "$path" ] || { printf ''; return 0; }
  python3 -I -c '
import json, sys
try:
    d = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    print("", end="")
    raise SystemExit(0)
keys = []
for k, v in (d.items() if isinstance(d, dict) else []):
    if isinstance(v, dict) and int(v.get("failRounds") or 0) >= 2:
        keys.append(k)
print(",".join(keys), end="")
' "$path" 2>/dev/null
}

# mx_nudge_body_for_gate <gate-csv> <waited-sec> <rgid> <anchor-user> → 催办正文（stdout）
# 闸别语义：
#   G2   —— 催「以评审卡完整缺项清单为唯一依据做修订并推仓 + @arch 复评」。措辞与
#           场景脚本 G2 退回派单词同口径，顺带对冲「窄修循环」（run25 第 2 轮根因：
#           修订人取了更近的窄清单）。
#   G5   —— 催发布准出评审卡补缺项并重报 READY-GATE-PASS（run19 死等根治件原文）。
#   其他 —— 通用补证话术，不带 READY-GATE-PASS（不得假设闸别）。
# 空 gate（无熔断记录）按 G5 兼容旧行为——supervisor 只在熔断等待路径调用本函数。
mx_nudge_body_for_gate() {
  local gates="${1:-}" waited="${2:-?}" rgid="${3:-}" anchor="${4:-fanfan}"
  local prefix="@${anchor}-agent:matrix.test"
  case ",${gates:-G5}," in
    *,G2,*)
      printf '%s 【G2 熔断等待催办（自动，已等 %ss）】架构评审未翻正（指纹不变）。请以评审卡面完整缺项清单为唯一依据做概设全量修订并推 origin/main，随后 @arch-agent 复评（结论行同步更新卡 body）——卡面/判词变化即自动复位熔断。不许谎报。' \
        "$prefix" "$waited" ;;
    *,G5,*)
      printf '%s 【G5 熔断等待催办（自动，已等 %ss）】评审卡%s缺项仍未补（指纹不变）。请按 templates/release-plan.md 把缺项（回滚阈值/灰度计划/发布说明等以卡面 GAP/缺项清单为准）补进评审卡 body 并重报结论行 READY-GATE-PASS——卡面更新即证据变化自动复位熔断，无需人工。不许谎报。' \
        "$prefix" "$waited" "${rgid:+ ${rgid}}" ;;
    *)
      printf '%s 【%s 熔断等待催办（自动，已等 %ss）】闸判据证据未变化（指纹不变）。请按该闸卡面缺项清单补齐证据/材料并更新卡面——证据变化即自动复位熔断。不许谎报。' \
        "$prefix" "${gates}" "$waited" ;;
  esac
}
