#!/usr/bin/env bash
# claude.sh — Claude Code 适配器：不渲染（hooks/commands/MCP 已深度集成，维持现状）
# TA_TIER=deep（hooks/commands/MCP 深度集成，no-op 因已深度集成）
# 依据：docs/research/R1-self-design.md 第四节「三层同心圆」——Claude Code 为深度集成层，
#   hooks.json（SessionStart/PreToolUse）+ commands/*.md 已随 skill 生成，无需额外规则文件。
render_tool_claude() {  # <skill_dir> <proj> <level>
  echo "  · Claude Code: hooks/commands 已深度集成，无需额外规则文件（维持现状）"
  return 0
}

# R128 卸载对偶（--uninstall）：Claude Code 无适配器渲染面——hooks/commands 随技能目录
# 整体存档，~/.claude/commands/swarm-yuan.md 的 slash command 注册由 install.sh 卸载主流程
# 移除（install_to 写到哪、uninstall_to 就删哪）。no-op 披露而非静默。
unrender_tool_claude() {  # <skill_dir> <proj> <level>
  echo "  · Claude Code: hooks/commands 随技能目录存档，slash command 由 install.sh 卸载流程移除（适配器面 no-op）"
  return 0
}
