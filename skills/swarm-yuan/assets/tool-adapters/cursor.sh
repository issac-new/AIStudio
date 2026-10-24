#!/usr/bin/env bash
# cursor.sh — Cursor 适配器：<proj>/.cursor/rules/<skill>.mdc
# TA_TIER=cli（目录复制 + --render-tools 规则派生）
# 格式依据（访问 2026-07-20）：https://qaskills.sh/blog/cursor-skill-md-frontmatter-schema-guide
#   frontmatter 三字段 description/globs/alwaysApply；description 有值 + globs 空 + alwaysApply:false
#   = Agent Requested（按描述相关性激活），与 skill 的语义触发一致。
#   user 级（proj=${HOME}）即 ~/.cursor/rules/，Cursor 用户规则位，同样生效。
# hooks 格式依据（访问 2026-10-09）：https://cursor.com/docs/agent/hooks —— hooks.json 顶层
#   {"version": 1, "hooks": {...}}，事件条目扁平（command/matcher/type/timeout 于条目层——
#   与 Claude 嵌套形不同，勿混用）；阻断=exit 2（"Exit code 2 - Block the action"）。
render_tool_cursor() {  # <skill_dir> <proj> <level>
  local dest="$2/.cursor/rules/${TA_SKILL_NAME}.mdc"
  local tmp; tmp="$(mktemp "${TMPDIR:-/tmp}/rtcursor.XXXXXX")"
  {
    printf -- '---\n'
    printf 'description: "%s"\n' "$(ta_yaml_dq "$TA_SKILL_DESC")"
    printf 'globs: ""\n'
    printf 'alwaysApply: false\n'
    printf -- '---\n\n'
    cat "$TA_BODY"
  } > "$tmp"
  ta_write_if_changed "$tmp" "$dest" "Cursor .cursor/rules/${TA_SKILL_NAME}.mdc"
  render_tool_cursor_hooks "$1" "$2"
}

# spec-first 写时拦截（L1）：合并进 <proj>/.cursor/hooks.json（用户级即 ~/.cursor/hooks.json）。
# 幂等合并保用户既有配置（ta_merge_json_hook）；preset 补 version:1（Cursor schema 必填）。
# R126：hooks 命令路径按实际布局探测（scripts/ 或 assets/hooks/，ta_hook_path）——
# 旧版硬编码 scripts/，对生成器自身布局渲染出指向不存在文件的死命令。
render_tool_cursor_hooks() {  # <skill_dir> <proj>
  local _bridge; _bridge="$(ta_hook_path "$1" spec-first-bridge.sh)"
  if [[ -z "$_bridge" ]]; then
    echo "  ⚠ Cursor hooks 未渲染：$1 无 spec-first-bridge.sh（scripts/ 与 assets/hooks/ 均无）——如实披露，不写死命令"
    return 0
  fi
  local entry; entry="$(mktemp "${TMPDIR:-/tmp}/rtcurh.XXXXXX")"
  python3 - "$_bridge" > "$entry" <<'PYEOF'
import json, sys
bridge = sys.argv[1]
print(json.dumps({
    "command": "bash \"%s\" --host cursor" % bridge,
    "matcher": "Shell|Write|Edit",
    "type": "command",
    "timeout": 5
}, ensure_ascii=False))
PYEOF
  # R118 ⑨：判别键用技能绝对路径（不用裸 "spec-first-bridge"）——同项目多技能共享
  # hooks.json 时按技能各保留一条；重复渲染本技能则原位更新。
  local rc=0
  ta_merge_json_hook "$2/.cursor/hooks.json" "hooks" "preToolUse" "$entry" "$_bridge" '{"version": 1}' || rc=$?
  rm -f "$entry"
  return $rc
}

# R128 卸载对偶（--uninstall）：删 .cursor/rules/<skill>.mdc 规则文件 + 剔 hooks.json
# 本技能条目（ta_remove_json_hook，按渲染期同一判别键；用户条目/其他事件保留）。
# 判别键回退：技能目录已消失（二次卸载/手工删除）时 ta_hook_path 探测不到脚本，
# 回退用技能目录前缀（渲染命令必含该前缀，两布局同源覆盖）。
unrender_tool_cursor() {  # <skill_dir> <proj> <level>
  local mdc="$2/.cursor/rules/${TA_SKILL_NAME}.mdc"
  if [[ -e "$mdc" ]]; then
    rm -f "$mdc"
    echo "  ✓ 已移除 Cursor 规则文件: ${mdc}"
  else
    echo "  · Cursor 规则文件已不存在: ${mdc}（幂等）"
  fi
  unrender_tool_cursor_hooks "$1" "$2"
}

unrender_tool_cursor_hooks() {  # <skill_dir> <proj>
  local _id; _id="$(ta_hook_path "$1" spec-first-bridge.sh)"
  [[ -z "$_id" ]] && _id="$1"
  ta_remove_json_hook "$2/.cursor/hooks.json" "hooks" "preToolUse" "$_id"
}
