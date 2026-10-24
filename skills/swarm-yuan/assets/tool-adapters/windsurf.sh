#!/usr/bin/env bash
# windsurf.sh — Windsurf 适配器：项目级 .windsurf/rules/<skill>.md；用户级全局 memories/global_rules.md
# TA_TIER=cli（目录复制 + --render-tools 规则派生）
# 格式依据（访问 2026-07-20）：https://thepromptshelf.dev/blog/windsurf-vs-cursor-vs-agents-md-2026/
#   trigger 四值 always_on|model_decision|glob|manual；model_decision 凭 description 由模型决定加载，
#   与 Cursor 的 Agent Requested 对齐。2026-06 起新版偏好 .devin/rules/，.windsurf/rules/ 保留回退
#   （https://skillwright.app/blog/windsurf-rules-guide）；全局规则 6,000 字符硬上限。
# R103 双面：Windsurf 文档已并入 Devin（docs.devin.ai），CLI 面（devin）有可阻断 PreToolUse
#   ——hooks 格式依据（访问 2026-10-09）：https://docs.devin.ai/cli/extensibility/hooks/overview.md
#   .devin/hooks.v1.json 的 hooks 对象即整文件（无外层键），条目 Claude 嵌套形
#   {"matcher","hooks":[{"type":"command",...}]}；阻断=decision block 或 exit 2；
#   桌面端 Cascade 插件 hook 仅 best-effort（官方明示），维持 advisory 降级线。
render_tool_windsurf() {  # <skill_dir> <proj> <level>
  local proj="$2" level="$3"
  local tmp; tmp="$(mktemp "${TMPDIR:-/tmp}/rtwindsurf.XXXXXX")"
  {
    printf -- '---\n'
    printf 'trigger: model_decision\n'
    printf 'description: "%s"\n' "$(ta_yaml_dq "$TA_SKILL_DESC")"
    printf -- '---\n\n'
    cat "$TA_BODY"
  } > "$tmp"
  if [[ "$level" == "user" ]]; then
    # 用户级全局规则为单文件（6,000 字符硬上限，超限静默失效），标记区块幂等 upsert
    local dest="$HOME/.codeium/windsurf/memories/global_rules.md"
    if ta_upsert_marker_block "$dest" "windsurf" "$TA_SKILL_NAME" "$tmp"; then
      local size; size="$(wc -c < "$dest" | tr -d ' ')"
      if [[ "$size" -gt 6000 ]]; then
        echo "  ⚠ $dest 已 ${size} 字符，超 Windsurf 全局规则 6,000 字符上限，请精简"
      fi
      rm -f "$tmp"
      render_tool_windsurf_hooks "$1" "$proj"
      return 0
    fi
    rm -f "$tmp"
    return 1
  fi
  ta_write_if_changed "$tmp" "$proj/.windsurf/rules/${TA_SKILL_NAME}.md" "Windsurf .windsurf/rules/${TA_SKILL_NAME}.md"
  render_tool_windsurf_hooks "$1" "$proj"
}

# spec-first 写时拦截（L1，Devin CLI 面）：合并进 .devin/hooks.v1.json（bare 形，幂等保用户配置）。
render_tool_windsurf_hooks() {  # <skill_dir> <proj>
  local _bridge; _bridge="$(ta_hook_path "$1" spec-first-bridge.sh)"
  if [[ -z "$_bridge" ]]; then
    echo "  ⚠ Devin/Windsurf hooks 未渲染：$1 无 spec-first-bridge.sh（scripts/ 与 assets/hooks/ 均无）——如实披露，不写死命令"
    return 0
  fi
  local entry; entry="$(mktemp "${TMPDIR:-/tmp}/rtdevh.XXXXXX")"
  python3 - "$_bridge" > "$entry" <<'PYEOF'
import json, sys
bridge = sys.argv[1]
print(json.dumps({
    "matcher": "write|edit|exec",
    "hooks": [{"type": "command",
               "command": "bash \"%s\" --host devin" % bridge,
               "timeout": 5}]
}, ensure_ascii=False))
PYEOF
  # R118 ⑨：判别键用技能绝对路径，按技能合并（同项目多技能共享 hooks.v1.json 时互不吞并）
  local rc=0
  ta_merge_json_hook "$2/.devin/hooks.v1.json" "bare" "PreToolUse" "$entry" "$_bridge" || rc=$?
  rm -f "$entry"
  return $rc
}

# R128 卸载对偶（--uninstall）：user 级移除 global_rules.md 标记块 / project 级删
# .windsurf/rules/<skill>.md + 剔 .devin/hooks.v1.json 本技能条目（bare 形，用户条目保留）。
unrender_tool_windsurf() {  # <skill_dir> <proj> <level>
  local rc=0
  if [[ "$3" == "user" ]]; then
    ta_remove_marker_block "$HOME/.codeium/windsurf/memories/global_rules.md" "windsurf" "$TA_SKILL_NAME" || rc=1
  else
    local rf="$2/.windsurf/rules/${TA_SKILL_NAME}.md"
    if [[ -e "$rf" ]]; then
      rm -f "$rf"
      echo "  ✓ 已移除 Windsurf 规则文件: ${rf}"
    else
      echo "  · Windsurf 规则文件已不存在: ${rf}（幂等）"
    fi
  fi
  local _id; _id="$(ta_hook_path "$1" spec-first-bridge.sh)"
  [[ -z "$_id" ]] && _id="$1"
  ta_remove_json_hook "$2/.devin/hooks.v1.json" "bare" "PreToolUse" "$_id" || rc=1
  return $rc
}
