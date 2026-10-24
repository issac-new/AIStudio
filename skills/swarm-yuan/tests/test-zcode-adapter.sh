#!/usr/bin/env bash
# test-zcode-adapter.sh — ZCode 适配器锚（AGENTS.md 标记区块形态，与 codex 适配器同范式）
# 覆盖：项目级/用户级 dest 判定、标记区块开闭成对、幂等（内容一致 no-op）、
# 已有内容不被破坏、缺闭标记 fail-closed 中止、用户级写假 HOME（不碰真实环境）。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d /tmp/zcodead.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# shellcheck disable=SC1091
. "assets/tool-adapters/common.sh"
# shellcheck disable=SC1091
. "assets/tool-adapters/zcode.sh"
TA_DIR="$(pwd)/assets/tool-adapters"

# 造一个最小 skill 目录（SKILL.md frontmatter 供字段解析）
# R126：物化 fail-gate-hook.sh——适配器 hooks 注册改为布局探测（ta_hook_path），
# 缺脚本即跳过注册并披露（不再渲染指向不存在文件的死命令），夹具镜像真实生成物。
SKILL="$TMP/skill"
mkdir -p "$SKILL/scripts"
printf '#!/usr/bin/env bash\nexit 0\n' > "$SKILL/scripts/fail-gate-hook.sh"
cat > "$SKILL/SKILL.md" <<'SEOF'
---
name: demo-skill
description: 测试技能
---
# demo
SEOF
TA_SKILL_NAME="demo-skill"
TA_SKILL_DESC="测试技能"
TA_FRAMEWORKS="未配置"
TA_BODY="$TMP/body.md"
printf '规则正文行A\n规则正文行B\n' > "$TA_BODY"

# 态1 项目级渲染 → <proj>/AGENTS.md 生成
# R101 起项目级渲染附带 hooks 注册（写 ~/.zcode/cli/config.json）——全部项目级渲染
# 一律在假 HOME 子壳内执行，不碰真实环境（与态6 用户级同款隔离）。
FAKE_HOME="$TMP/fakehome"; mkdir -p "$FAKE_HOME"
PROJ="$TMP/proj"; mkdir -p "$PROJ"
( export HOME="$FAKE_HOME"; export TA_DIR TA_SKILL_NAME TA_SKILL_DESC TA_FRAMEWORKS TA_BODY
  render_tool_zcode "$SKILL" "$PROJ" "project" ) >/dev/null 2>&1
AG="$PROJ/AGENTS.md"
if [[ -f "$AG" ]]; then ok "态1 项目级 <proj>/AGENTS.md 生成"; else bad "态1 AGENTS.md 未生成"; exit 1; fi

# 态2 标记区块开闭成对且正文在区块内
grep -qF '<!-- >>> swarm-yuan:zcode:demo-skill >>>' "$AG" && ok "态2 开标记存在" || bad "态2 开标记缺失"
grep -qF '<!-- <<< swarm-yuan:zcode:demo-skill <<<' "$AG" && ok "态2b 闭标记存在" || bad "态2b 闭标记缺失"
grep -qF '规则正文行A' "$AG" && ok "态2c 规则正文入区块" || bad "态2c 正文缺失"

# 态3 幂等：重复渲染内容一致（第二次 no-op，不重复追加区块）
n_open_before=$(grep -cF '>>> swarm-yuan:zcode:demo-skill >>>' "$AG")
( export HOME="$FAKE_HOME"; export TA_DIR TA_SKILL_NAME TA_SKILL_DESC TA_FRAMEWORKS TA_BODY
  render_tool_zcode "$SKILL" "$PROJ" "project" ) >/dev/null 2>&1
n_open_after=$(grep -cF '>>> swarm-yuan:zcode:demo-skill >>>' "$AG")
if [[ "$n_open_before" == "1" && "$n_open_after" == "1" ]]; then ok "态3 幂等（区块数恒 1）"; else bad "态3 区块数漂移（${n_open_before}→${n_open_after}）"; fi

# 态4 已有内容不被破坏（区块外的既有行保留）
printf '# 既有项目说明\n' > "$AG.tmp"
cat "$AG" >> "$AG.tmp" && mv "$AG.tmp" "$AG"
( export HOME="$FAKE_HOME"; export TA_DIR TA_SKILL_NAME TA_SKILL_DESC TA_FRAMEWORKS TA_BODY
  render_tool_zcode "$SKILL" "$PROJ" "project" ) >/dev/null 2>&1
grep -qF '# 既有项目说明' "$AG" && ok "态4 区块外既有内容保留" || bad "态4 既有内容被破坏"

# 态5 缺闭标记 fail-closed 中止（开标记在、闭标记缺 → 不改动文件）
sed 's/<!-- <<< swarm-yuan:zcode:demo-skill <<< -->//' "$AG" > "$AG.broken" && mv "$AG.broken" "$AG"
md5_before=$(md5 -q "$AG" 2>/dev/null || md5sum "$AG" | cut -d' ' -f1)
if ( export HOME="$FAKE_HOME"; export TA_DIR TA_SKILL_NAME TA_SKILL_DESC TA_FRAMEWORKS TA_BODY
     render_tool_zcode "$SKILL" "$PROJ" "project" ) >/dev/null 2>&1; then
  bad "态5 缺闭标记未中止（返回 0）"
else
  md5_after=$(md5 -q "$AG" 2>/dev/null || md5sum "$AG" | cut -d' ' -f1)
  if [[ "$md5_before" == "$md5_after" ]]; then ok "态5 缺闭标记 fail-closed 中止且未改动"; else bad "态5 中止但文件被改动"; fi
fi

# 态6 用户级渲染 → 假 HOME 下的 ~/.zcode/AGENTS.md（HOME 环境重定向，不碰真实环境；用户级不注册 hooks）
( export HOME="$FAKE_HOME"; export TA_DIR TA_SKILL_NAME TA_SKILL_DESC TA_FRAMEWORKS TA_BODY
  render_tool_zcode "$SKILL" "$FAKE_HOME" "user" ) >/dev/null 2>&1
if [[ -f "$FAKE_HOME/.zcode/AGENTS.md" ]]; then
  grep -qF '>>> swarm-yuan:zcode:demo-skill >>>' "$FAKE_HOME/.zcode/AGENTS.md" && ok "态6 用户级 ~/.zcode/AGENTS.md 写入（假 HOME）" || bad "态6 用户级文件无区块"
else
  bad "态6 用户级 ~/.zcode/AGENTS.md 未生成"
fi
if [[ ! -f "$FAKE_HOME/.zcode/cli/config.json" ]]; then
  ok "态6b 用户级渲染不注册 hooks（无 config.json 写入）"
else
  bad "态6b 用户级渲染意外写 config.json"
fi

# 态7 调度器接线：ta_render_tools 全链路含 zcode（渲染顺序注册 + 适配器可发现）
rm -rf "$PROJ"; mkdir -p "$PROJ"
out="$(HOME="$FAKE_HOME" TA_DIR="$TA_DIR" bash -c 'source assets/tool-adapters/common.sh; ta_render_tools "$1" "$2" zcode' _ "$SKILL" "$PROJ" 2>&1)"
if [[ -f "$PROJ/AGENTS.md" ]]; then ok "态7 ta_render_tools 定向渲染 zcode 接线"; else bad "态7 调度器未产出 zcode 规则：$out"; fi

# 态8 R101 spec-first 写时拦截注册（假 HOME 预置 config.json，不碰真实环境）
FAKE_CFG="$FAKE_HOME/.zcode/cli/config.json"
mkdir -p "$FAKE_HOME/.zcode/cli"
printf '{"plugins": {"dirs": []}}' > "$FAKE_CFG"
( export HOME="$FAKE_HOME"; export TA_DIR TA_SKILL_NAME TA_SKILL_DESC TA_FRAMEWORKS TA_BODY
  render_tool_zcode "$SKILL" "$PROJ" "project" ) >/dev/null 2>&1
PLUG="$SKILL/zcode-plugin"
# 8a manifest 存在且 JSON 合法
if python3 -m json.tool "$PLUG/.zcode-plugin/plugin.json" >/dev/null 2>&1; then ok "态8a .zcode-plugin/plugin.json 生成且合法"; else bad "态8a manifest 缺失或非法"; fi
# 8b hooks.json 为嵌套形态（ZCode 实证②：扁平形态被静默丢弃）
grep -q '"matcher": "Write|Edit|MultiEdit|Bash", "hooks": \[{"type": "command"' "$PLUG/hooks/hooks.json" \
  && ok "态8b hooks.json 嵌套形态（防 Codex#23 同型静默失效）" || bad "态8b hooks.json 非嵌套形态"
python3 -m json.tool "$PLUG/hooks/hooks.json" >/dev/null 2>&1 && ok "态8b2 hooks.json JSON 合法" || bad "态8b2 hooks.json 非法 JSON"
# 8c 命令为 fail-gate-hook 绝对路径
grep -qF "fail-gate-hook.sh" "$PLUG/hooks/hooks.json" && ok "态8c 命令指向 fail-gate-hook" || bad "态8c 未指向 fail-gate-hook"
# 8d config.json 注册 + 幂等
python3 -c "
import json,sys
d=json.load(open('$FAKE_CFG'))
dirs=d['plugins']['dirs']
sys.exit(0 if '$PLUG' in dirs and len(dirs)==1 else 1)" && ok "态8d config.json 注册成功" || bad "态8d 注册缺失或重复"
( export HOME="$FAKE_HOME"; export TA_DIR TA_SKILL_NAME TA_SKILL_DESC TA_FRAMEWORKS TA_BODY
  render_tool_zcode "$SKILL" "$PROJ" "project" ) >/dev/null 2>&1
python3 -c "
import json,sys
d=json.load(open('$FAKE_CFG'))
sys.exit(0 if d['plugins']['dirs'].count('$PLUG')==1 else 1)" && ok "态8e 注册幂等（二次渲染不重复）" || bad "态8e 注册重复"

if [[ $FAIL -eq 0 ]]; then echo "test-zcode-adapter: PASS"; else echo "test-zcode-adapter: FAIL" >&2; fi
exit $FAIL
