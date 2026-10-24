#!/usr/bin/env bash
# zcode.sh — ZCode 适配器：项目级 <proj>/AGENTS.md；用户级 ~/.zcode/AGENTS.md（标记区块包裹）
# TA_TIER=cli（目录复制 + --render-tools 规则派生 + 项目级 spec-first hooks 注册，R101）
# 依据：ZCode 以 AGENTS.md 为用户默认指令与项目指令载体（用户级 ~/.zcode/AGENTS.md、
#   项目级仓库根 AGENTS.md），纯 markdown 无 frontmatter——与 Codex 的 AGENTS.md 标准同形态。
#
# R101 写时强拦截（L1）实证记录（2026-10-09，zcode.cjs 0.16.9 活体验证，证据链见
#   docs/research/R101-spec-first-universal.md）：
#   ① ZCode 插件面支持 PreToolUse deny：hooks.json 用嵌套形态
#      {"matcher": M, "hooks": [{"type": "command", "command": C}]}，hook stdout 输出
#      Claude Code 同款 deny JSON（hookSpecificOutput.permissionDecision=deny）即硬拦
#      （工具不执行、模型收到 reason+additionalContext）——fail-gate-hook 无需改造直接复用；
#   ② 扁平形态 {"matcher": M, "command": C} 被静默丢弃（plugins list 计 hooks: 0，
#      无任何报错）——与 Codex 回归 #23 同型的 serde 静默失效坑；
#   ③ 插件目录须含 .zcode-plugin/plugin.json（.claude-plugin/plugin.json 亦被接受），
#      裸目录注册后同样静默忽略（hooks: 0）；
#   ④ 注册面是用户级 ~/.zcode/cli/config.json plugins.dirs（无项目级 hooks 发现路径）；
#   ⑤ config.json hooks.events 直挂的 PreToolUse 钩子输出 deny JSON 只降级为建议
#      （reason 注入工具结果但调用照常执行）——不构成强拦截，勿走该通道。
# 故整合形态：<skill>/zcode-plugin/ 独立插件目录（.zcode-plugin manifest + 嵌套 hooks.json，
#   命令用绝对路径直调 fail-gate-hook，不动 Claude Code 侧 hooks/hooks.json），
#   项目级渲染时注册进 config.json（fail-gate-hook 按 cwd/conf 自限，未配置项目零干扰）。
render_tool_zcode() {  # <skill_dir> <proj> <level>
  local dest
  if [[ "$3" == "user" ]]; then dest="$HOME/.zcode/AGENTS.md"; else dest="$2/AGENTS.md"; fi
  # fail-closed：标记区块失败（缺闭标记等）先短路——AGENTS.md 未落成时不注册 hooks，
  # 防尾调用吞返回码（态5 锁：缺闭标记必须 rc=1 且零改动）
  if ! ta_upsert_marker_block "$dest" "zcode" "$TA_SKILL_NAME" "$TA_BODY"; then
    return 1
  fi
  if [[ "$3" != "user" ]]; then
    render_tool_zcode_hooks "$1" "$2"
  fi
}

# spec-first 写时强拦截注册（项目级；与 codex.sh render_tool_codex_hooks 同范式）。
# 幂等：manifest/hooks.json 内容一致即 no-op；config.json 已含目录不重复注册。
# 降级：python3 缺失时 config.json 不改（JSON 无可靠 bash 3.2 合并通道），打印手工接入步骤。
render_tool_zcode_hooks() {  # <skill_dir> <proj>
  local skill_dir="$1"
  # R126：fail-gate-hook 路径按实际布局探测——生成器自身布局 hooks 在 assets/hooks/，
  # 旧版硬编码 scripts/ 渲染出指向不存在文件的死命令（装完即 404）。
  local _fg; _fg="$(ta_hook_path "$skill_dir" fail-gate-hook.sh)"
  if [[ -z "$_fg" ]]; then
    echo "  ⚠ ZCode 插件未渲染：$skill_dir 无 fail-gate-hook.sh（scripts/ 与 assets/hooks/ 均无）——如实披露，不写死命令"
    return 0
  fi
  local plug_dir="${skill_dir}/zcode-plugin"
  mkdir -p "${plug_dir}/.zcode-plugin" "${plug_dir}/hooks"
  # manifest（幂等重写；内容不含时间戳）
  cat > "${plug_dir}/.zcode-plugin/plugin.json" <<'MJEOF'
{
  "name": "swarm-yuan-spec-first",
  "version": "1.0.0",
  "description": "swarm-yuan spec-first write-time enforcement bridge for ZCode (fail-gate-hook deny via PreToolUse)."
}
MJEOF
  # hooks.json：嵌套形态（实证②）+ 绝对路径（实证④无项目级发现；fail-gate-hook 的
  # conf/判定库三级解析中脚本自位候选独立成立，不依赖 CLAUDE_PLUGIN_ROOT）
  cat > "${plug_dir}/hooks/hooks.json" <<HJEOF
{
  "hooks": {
    "PreToolUse": [
      {"matcher": "Write|Edit|MultiEdit|Bash", "hooks": [{"type": "command", "command": "bash \"${_fg}\" 2>/dev/null || true", "timeout": 5}]}
    ]
  }
}
HJEOF
  # 注册进用户级 config.json（实证④；幂等 + 原子写；ZCode 每次会话启动重读）
  local _zcfg="$HOME/.zcode/cli/config.json"
  if command -v python3 >/dev/null 2>&1 && [[ -f "$_zcfg" ]]; then
    if python3 - "$plug_dir" "$_zcfg" <<'PYEOF'
import json, os, sys
plug, cfg = sys.argv[1], sys.argv[2]
d = json.load(open(cfg))
dirs = d.setdefault('plugins', {}).setdefault('dirs', [])
if plug in dirs:
    print('  · ZCode 插件已注册（幂等）: %s' % plug)
    sys.exit(0)
dirs.append(plug)
tmp = cfg + '.swarm-tmp'
json.dump(d, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
os.replace(tmp, cfg)
print('  ✓ ZCode spec-first 写时拦截已注册: %s → %s plugins.dirs' % (plug, cfg))
PYEOF
    then :; else
      echo "  ⚠ ZCode config.json 注册失败（python3 异常，未改动）——手工接入：把 ${plug_dir} 加入 ~/.zcode/cli/config.json 的 plugins.dirs 数组"
    fi
  else
    echo "  ⚠ ZCode 写时拦截未注册：缺 python3 或 ${_zcfg}——插件文件已生成于 ${plug_dir}，手工接入：把该目录加入 config.json 的 plugins.dirs 数组（L2 pre-commit/L3 门禁仍然生效）"
  fi
}

# R128 卸载对偶（--uninstall）：移除 AGENTS.md 标记块 + 从 ~/.zcode/cli/config.json 的
# plugins.dirs 剔除本插件目录（其他 dirs 保留）。注册面是用户级 config.json（实证④），
# 与渲染的 project 级门槛无关——只要 config 在就尝试剔除（幂等），覆盖「项目级渲染注册、
# 生成器目录卸载」的交叉面。<skill_dir>/zcode-plugin 目录位于技能目录内，随 install.sh
# 卸载主流程的技能目录存档一并消失，无需单独删除。
unrender_tool_zcode() {  # <skill_dir> <proj> <level>
  local dest rc=0
  if [[ "$3" == "user" ]]; then dest="$HOME/.zcode/AGENTS.md"; else dest="$2/AGENTS.md"; fi
  ta_remove_marker_block "$dest" "zcode" "$TA_SKILL_NAME" || rc=1
  unrender_tool_zcode_hooks "$1" || rc=1
  return $rc
}

unrender_tool_zcode_hooks() {  # <skill_dir>
  local _zcfg="$HOME/.zcode/cli/config.json"
  local _plug="$1/zcode-plugin"
  if [[ ! -f "$_zcfg" ]]; then
    echo "  · ${_zcfg} 不存在——ZCode 插件注册已不在（幂等）"
    return 0
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  ⚠ 缺 python3，${_zcfg} 插件注册未移除（手工：从 plugins.dirs 数组删除 ${_plug}）"
    return 0
  fi
  if python3 - "$_zcfg" "$_plug" <<'PYEOF'
import json, os, sys
cfg, plug = sys.argv[1], sys.argv[2]
def fail(msg):
    sys.stderr.write('  ✗ %s: %s——已跳过，未写回\n' % (cfg, msg))
    sys.exit(3)
try:
    d = json.load(open(cfg, encoding='utf-8'))
except Exception as e:
    fail('config.json 解析失败（%s）' % e)
if not isinstance(d, dict):
    fail('config.json 顶层不是对象')
plugins = d.get('plugins')
if not isinstance(plugins, dict) or not isinstance(plugins.get('dirs'), list):
    print('  · %s: 无 plugins.dirs（幂等，未改动）' % cfg)
    sys.exit(0)
kept = [x for x in plugins['dirs'] if x != plug]
if len(kept) == len(plugins['dirs']):
    print('  · %s: plugins.dirs 无本插件目录（幂等，未改动）' % cfg)
    sys.exit(0)
if kept:
    plugins['dirs'] = kept
else:
    del plugins['dirs']
    if not plugins:
        del d['plugins']
tmp = cfg + '.swarm-tmp'
json.dump(d, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
os.replace(tmp, cfg)
print('  ✓ ZCode 插件注册已剔除: %s（plugins.dirs）' % plug)
PYEOF
  then :; else
    echo "  ⚠ ZCode config.json 剔除失败（python3 异常，未改动）——手工：从 ${_zcfg} 的 plugins.dirs 数组删除 ${_plug}"
    return 1
  fi
  return 0
}
