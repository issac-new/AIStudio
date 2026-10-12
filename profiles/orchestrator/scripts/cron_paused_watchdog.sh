#!/bin/bash
# cron_paused_watchdog.sh — 暂停自愈白名单巡检（t_b989b4f3 统一重构版 2026-09-20）
# 白名单只含统一夜间 Loop Graph 入口一个 job（其余夜间碎片任务已退役，见 BANNED）
# 健康即静默（stdout 空 = cron no_agent 不投递）；有异常才输出
# 本文件为规范源；~/.hermes/scripts/ 同步副本内容与本文件保持一致（消除双源漂移）
H=~/.hermes/hermes-agent/venv/bin

WHITELIST=""
# 2026-10-10 用户裁决：免费优惠窗口结束，整批夜间 Loop 停役 →
#   3e1690d29660 统一夜间Loop入口 + 922320a901e3 存活看门狗 均为用户主动 paused，
#   白名单清空（不再自动 resume）。恢复排程时把两条 entry 加回并删本注释。
#   被停役的 loop 入口已列进 BANNED（防批量恢复误激活）。
BANNED_EXTRA="3e1690d29660"
# 黑名单：09-20 统一重构退役的夜间碎片任务（完整定义备份于
# ~/.hermes/profiles/orchestrator/cron/jobs.json.bak-0920 与
# ~/.hermes/profiles/ops-devops/cron/jobs.json.bak-0920）
# 任何批量操作/旧备份恢复把它们翻回 enabled → 告警留人裁，不自动删
BANNED="fa8b11f3d382 945dd52991e6 7b8452b4d749 09bdd396c6f5 04effdec924f 4b026c3ee590 3c1609780dd5 bd5c7d64a108 40347882a22e e8fb2e315b24 caaac2ebe13b 8f66158ce97e dae02132965e 89dfd510b3c4 56b0cd499076 413c65d20f1c 133c0de3f284 23677e40feb5 6150fd99b65e 7261d2499870 ab3878a6bb22 a541e2897627 c3758db30e77 6c7747615e93 248bd283e918 3c7e6d674e77 2582f5fd76e2 f48b97f81144 357c82c8c1e5 b9558bf9ef14 AAE41C4CC37D 173782D29A41 f9b7ff65168e 7982a7adbef6 4f9f45ff0c00 e4cfc1beec44 ae853c4c928e 6a892df56dc3 6a42ad9d3315 f70cb436dbab a00798ec2c68 ce3bda781e69 g9triageweekly1 3740f9965fa8 gh-threat-radar-daily aaad7e8586aa"
# c3758db30e77=worktree-daily-reclaim(04:00), 2026-09-21 并入统一夜间Loop v3.2 sweep步内 reclaim 步; 复活即双跑
# 2026-09-21 v3.3: 24 个批处理 cron 折入统一Loop(00:02入口), 全部退役列入 BANNED

# HERMES_HOME 视角（t_b989b4f3 实测坑）：裸 `hermes cron list` 只看主 profile 的
# jobs.json，统一入口 job 在 orchestrator profile 下——必须显式指 HERMES_HOME，
# 否则永远「状态未知」误报（09-04 hermes-env-perspective-diagnostics 同款根因）。
LIST=$(HERMES_HOME="$HOME/.hermes/profiles/orchestrator" "$H/hermes" cron list --all 2>/dev/null)
ALERT=""
for entry in $WHITELIST; do
  JID="${entry%%:*}"; NAME="${entry##*:}"
  # 提取该 job 的状态行（id 后第一行 [active]/[paused]/[completed]）
  ST=$(echo "$LIST" | grep -A1 "^  $JID " | head -1 | grep -oE '\[(active|paused|completed)\]' | tr -d '[]')
  if [ "$ST" = "paused" ]; then
    "$H/hermes" cron resume "$JID" >/dev/null 2>&1
    ALERT="${ALERT}⚠️ ${NAME}(${JID}) 曾 paused，已自动 resume\n"
  elif [ -z "$ST" ]; then
    ALERT="${ALERT}❓ ${NAME}(${JID}) 状态未知（list 无此 job？）\n"
  fi
done

# 黑名单检测：退役 job 复活即告警（RC6 双跑防线，09-08 建；09-20 统一重构扩容 22 条）
for B in $BANNED $BANNED_EXTRA; do
  # 只匹配 [active] 行——disabled/退役 job 仍会出现在 list --all 里（v3.3 24个退役id在册）
  if echo "$LIST" | grep -E "^  $B .*\[active\]" >/dev/null 2>&1; then
    ALERT="${ALERT}🔴 退役 job ${B} 复活为 active！已折入统一夜间Loop v3.3, 请人工核查\n"
  fi
done

if [ -n "$ALERT" ]; then
  echo "🔔 cron 巡检 $(date '+%F %H:%M')"
  echo "----------"
  printf "$ALERT"
fi
# 健康即静默（stdout 空 → cron 不投递）
