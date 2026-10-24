#!/usr/bin/env bash
# gemini.sh — Gemini CLI 适配器：项目级 <proj>/GEMINI.md；用户级 ~/.gemini/GEMINI.md（标记区块包裹）
# TA_TIER=cli（目录复制 + --render-tools 规则派生）
# 依据（访问 2026-07-20）：https://gist.github.com/hungson175/76131bb8434f9d58ee7b2f08c3242624
#   GEMINI.md 为 Gemini CLI 原生项目上下文文件（ analogous to CLAUDE.md），纯 markdown 无 frontmatter。
# hooks 格式依据（访问 2026-10-09）：https://geminicli.com/docs/hooks/reference/ ——
#   settings.json 的 hooks 段，事件（BeforeTool）条目嵌套形 {"matcher","sequential","hooks":[{...}]}；
#   hook 元素 {"type":"command","command":...,"timeout":毫秒}；阻断=decision deny（reason 必填）
#   或 exit 2；matcher 为工具名正则。项目层 <proj>/.gemini/settings.json > 用户层 ~/.gemini/settings.json。
render_tool_gemini() {  # <skill_dir> <proj> <level>
  local dest
  if [[ "$3" == "user" ]]; then dest="$HOME/.gemini/GEMINI.md"; else dest="$2/GEMINI.md"; fi
  ta_upsert_marker_block "$dest" "gemini" "$TA_SKILL_NAME" "$TA_BODY"
  render_tool_gemini_hooks "$1" "$2"
}

# spec-first 写时拦截（L1）：合并进 settings.json hooks.BeforeTool（幂等保用户配置）。
render_tool_gemini_hooks() {  # <skill_dir> <proj>
  local _bridge; _bridge="$(ta_hook_path "$1" spec-first-bridge.sh)"
  if [[ -z "$_bridge" ]]; then
    echo "  ⚠ Gemini hooks 未渲染：$1 无 spec-first-bridge.sh（scripts/ 与 assets/hooks/ 均无）——如实披露，不写死命令"
    return 0
  fi
  local entry; entry="$(mktemp "${TMPDIR:-/tmp}/rtgemh.XXXXXX")"
  python3 - "$_bridge" > "$entry" <<'PYEOF'
import json, sys
bridge = sys.argv[1]
print(json.dumps({
    "matcher": "write_file|replace|run_shell_command",
    "sequential": True,
    "hooks": [{"type": "command",
               "command": "bash \"%s\" --host gemini" % bridge,
               "timeout": 30000}]
}, ensure_ascii=False))
PYEOF
  # R118 ⑨：判别键用技能绝对路径，按技能合并（同项目多技能共享 settings.json 时互不吞并）
  local rc=0
  ta_merge_json_hook "$2/.gemini/settings.json" "hooks" "BeforeTool" "$entry" "$_bridge" || rc=$?
  rm -f "$entry"
  return $rc
}

# R128 卸载对偶（--uninstall）：移除 GEMINI.md 标记块 + 剔 settings.json hooks.BeforeTool
# 本技能条目（用户条目/其他事件保留；判别键回退同 cursor——目录已消失时用目录前缀）。
unrender_tool_gemini() {  # <skill_dir> <proj> <level>
  local dest
  if [[ "$3" == "user" ]]; then dest="$HOME/.gemini/GEMINI.md"; else dest="$2/GEMINI.md"; fi
  local rc=0
  ta_remove_marker_block "$dest" "gemini" "$TA_SKILL_NAME" || rc=1
  local _id; _id="$(ta_hook_path "$1" spec-first-bridge.sh)"
  [[ -z "$_id" ]] && _id="$1"
  ta_remove_json_hook "$2/.gemini/settings.json" "hooks" "BeforeTool" "$_id" || rc=1
  return $rc
}
