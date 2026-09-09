#!/usr/bin/env bash
# worldmonitor 哨兵：该 skill 三次无声失踪，自动恢复+报警
set -u
M="$HOME/.hermes/skills/research/worldmonitor-intel/SKILL.md"
SRC="$HOME/.hermes/skills-archive/_backup_20260805_221413/profile-replaced/[已移除]/research/worldmonitor-intel"
if [ ! -f "$M" ]; then
  COPYFILE_DISABLE=1 cp -R "$SRC" "$HOME/.hermes/skills/research/worldmonitor-intel" 2>/dev/null
  if [ -f "$M" ]; then
    echo "🚨 worldmonitor-intel 第 N 次失踪，已自动从 archive 恢复。请排查删除源（嫌疑：hermes skills 索引器同步/[已移除] gateway）。"
    exit 1
  else
    echo "🚨 worldmonitor-intel 失踪且恢复失败，需人工介入"
    exit 1
  fi
fi
exit 0
