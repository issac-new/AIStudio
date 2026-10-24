#!/usr/bin/env bash
# opencode.sh — OpenCode 适配器：项目级 <proj>/AGENTS.md；用户级 ~/.config/opencode/AGENTS.md（标记区块包裹）
# TA_TIER=cli（目录复制 + --render-tools 规则派生）
# 依据（访问 2026-07-20）：https://gist.github.com/hungson175/76131bb8434f9d58ee7b2f08c3242624
#   OpenCode 主读 AGENTS.md（另有 opencode.json 的 instructions[] 可挂额外路径，本适配器不改动 json 配置）。
# R103 hooks 格式依据（访问 2026-10-09）：https://opencode.ai/docs/plugins/ —— 本地插件放
#   .opencode/plugins/（项目）或 ~/.config/opencode/plugins/（全局），启动自动加载无需注册；
#   tool.execute.before 抛错即中止工具调用（官方 .env 防护示例同款语义）。
render_tool_opencode() {  # <skill_dir> <proj> <level>
  local dest pdir
  if [[ "$3" == "user" ]]; then
    dest="$HOME/.config/opencode/AGENTS.md"; pdir="$HOME/.config/opencode/plugins"
  else
    dest="$2/AGENTS.md"; pdir="$2/.opencode/plugins"
  fi
  ta_upsert_marker_block "$dest" "opencode" "$TA_SKILL_NAME" "$TA_BODY"
  render_tool_opencode_hooks "$1" "$pdir" "$2"
}

# spec-first 写时拦截（L1）：本地插件调 bridge（exit 2=deny）后 throw（tool.execute.before 阻断语义）。
# R126：hooks 命令路径按实际布局探测（ta_hook_path）；生成插件补 bun $ 导入——
# 旧版裸用 $\`...\` 无 import，首次触发即 ReferenceError，write/edit/bash 全部硬阻断。
render_tool_opencode_hooks() {  # <skill_dir> <plugins_dir> <proj>
  local _bridge; _bridge="$(ta_hook_path "$1" spec-first-bridge.sh)"
  if [[ -z "$_bridge" ]]; then
    echo "  ⚠ OpenCode 插件未渲染：$1 无 spec-first-bridge.sh（scripts/ 与 assets/hooks/ 均无）——如实披露，不写死命令"
    return 0
  fi
  local dest="$2/swarm-yuan-spec-first.js"
  local tmp; tmp="$(mktemp "${TMPDIR:-/tmp}/rtoph.XXXXXX")"
  cat > "$tmp" <<JSEOF
// swarm-yuan spec-first L1 写时拦截插件（由 generate-skill.sh --render-tools 维护，勿手改）
// 官方插件 API（https://opencode.ai/docs/plugins/）：tool.execute.before 抛错即中止工具调用；
// 判定链 = spec-first-bridge.sh（exit 2=deny + stderr 原因），判据单一事实源 fail-gate-hook。
import { \$ } from "bun"
export const SwarmYuanSpecFirst = async ({ directory }) => {
  return {
    "tool.execute.before": async (input, output) => {
      const t = (input && input.tool) || ""
      if (!["write", "edit", "bash"].includes(t)) return
      const args = (output && output.args) || {}
      const path = args.filePath || args.path || args.file_path || ""
      const cmd = args.command || ""
      const r = await \$\`bash "${_bridge}" --host opencode --tool \${t} --path \${path} --cmd \${cmd} --cwd \${directory || process.cwd()}\`.quiet().nothrow()
      if (r.exitCode === 2) {
        throw new Error((r.stderr && r.stderr.toString().trim()) || "swarm-yuan spec-first: DENY（无 spec 写源码）")
      }
    }
  }
}
JSEOF
  ta_write_if_changed "$tmp" "$dest" "OpenCode 插件 swarm-yuan-spec-first.js"
}

# R128 卸载对偶（--uninstall）：移除 AGENTS.md 标记块 + 删本地插件文件
# swarm-yuan-spec-first.js（openCode 插件无注册面，目录内文件即全部足迹）。
unrender_tool_opencode() {  # <skill_dir> <proj> <level>
  local dest pdir rc=0
  if [[ "$3" == "user" ]]; then
    dest="$HOME/.config/opencode/AGENTS.md"; pdir="$HOME/.config/opencode/plugins"
  else
    dest="$2/AGENTS.md"; pdir="$2/.opencode/plugins"
  fi
  ta_remove_marker_block "$dest" "opencode" "$TA_SKILL_NAME" || rc=1
  local js="$pdir/swarm-yuan-spec-first.js"
  if [[ -e "$js" ]]; then
    rm -f "$js"
    echo "  ✓ 已移除 OpenCode 插件: ${js}"
  else
    echo "  · OpenCode 插件已不存在: ${js}（幂等）"
  fi
  return $rc
}
