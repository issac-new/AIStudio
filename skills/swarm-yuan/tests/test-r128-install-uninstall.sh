#!/usr/bin/env bash
# test-r128-install-uninstall.sh — R128 安装层：宿主检测因果化 + --uninstall 卸载通道回归
# 安全约束：所有安装/渲染/卸载都在 mktemp 目录内的伪造 HOME 下执行，绝不触碰真实
# ~/.claude、~/.cursor、~/.kimi-code、~/.zcode 等目录；不联网；PATH 受控段不含真实宿主 CLI。
#
# 覆盖：
#  ① 宿主检测因果化：家目录存在即检出（不再要求 skills 子目录）/ CLI 在 PATH 检出 /
#     双判据皆无不检出 / Kimi legacy ~/.kimi/skills 回退
#  ② 全链路闭环：install（8 宿主）→ render（hooks/标记块/插件/config 注册）→
#     --uninstall --all → 技能目录存档移除 + slash command 移除 + 各宿主配置注销
#     且用户自有配置原样保留（cursor/gemini/devin/kimi/zcode/AGENTS 族）
#  ③ 幂等：二次 --uninstall --all rc=0、不新增存档、无失败
#  ④ Codex 项目级组内剔条目（用户条目保留、空组/空事件收敛）
#  ⑤ fail-closed：用户 hooks JSON 非法时注销跳过不写回（rc=1 且文件逐字节不变；
#     技能目录存档与配置注销解耦，单点失败不放大）
#  ⑥ CRLF 标记块移除（html/toml 两风格，用户内容与 CRLF 风格保留）
#  ⑦ Usage：无效参数/--uninstall 缺目标/无效目标均 rc=1 且列出 --uninstall
set -uo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
INSTALL="$BASE/install.sh"
TA_DIR="$BASE/assets/tool-adapters"

TMP="$(mktemp -d /tmp/r128.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

newhome() { local d="$TMP/home-$1"; mkdir -p "$d"; printf '%s\n' "$d"; }

make_skill() {  # <dir> <name> → stdout=dir（镜像真实生成物：scripts/ 带 4 hook 脚本）
  mkdir -p "$1/scripts"
  printf -- '---\nname: %s\ndescription: 测试技能 %s\n---\n' "$2" "$2" > "$1/SKILL.md"
  for _hs in spec-first-bridge.sh fail-gate-hook.sh codex-gate-wrapper.sh failure-detector.sh; do
    printf '#!/usr/bin/env bash\nexit 0\n' > "$1/scripts/$_hs"
  done
  printf '%s\n' "$1"
}

json_assert() {  # <file> <python 表达式（文件内容绑定为 d）> <描述>
  local out
  out="$(python3 - "$1" "$2" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
print('OK' if eval(sys.argv[2]) else 'BAD')
PY
)" || out="BAD:parse"
  if [[ "$out" == "OK" ]]; then ok "$3"; else bad "${3}（${out}）"; fi
}

# 渲染/注销适配器（子壳隔离；HOME 由 RHOME 指定，缺省为 TMP/render-home）
render_tool() {  # <tool> <skill_dir> <proj> <level> [name]
  local tool="$1" sk="$2" proj="$3" level="$4" name="${5:-demo}"
  (
    export HOME="${RHOME:-$TMP/render-home}"
    export TA_DIR TA_SKILL_NAME="$name" TA_SKILL_DESC="测试技能 ${name}" TA_FRAMEWORKS="未配置"
    # shellcheck disable=SC1090,SC1091
    . "$TA_DIR/common.sh" || exit 1
    # shellcheck disable=SC1090
    . "$TA_DIR/$tool.sh" || exit 1
    "render_tool_$tool" "$sk" "$proj" "$level"
  )
}

# ============================================================
# ① 宿主检测判据因果化
# ============================================================
echo "[1] 检测判据：家目录 OR CLI"
# 1a：只建宿主家目录（无 skills 子目录）——旧判据下 7 家漏检的形态
FH1="$(newhome 1)"
mkdir -p "$FH1/.claude" "$FH1/.cursor" "$FH1/.codex" "$FH1/.gemini" "$FH1/.kimi-code" \
         "$FH1/.zcode" "$FH1/.config/opencode" "$FH1/.codeium/windsurf"
out1="$(HOME="$FH1" bash "$INSTALL" --list 2>&1)"
n1="$(printf '%s\n' "$out1" | grep -c '✅')"
if [[ "$n1" -eq 8 ]]; then ok "1a 仅家目录存在（无 skills 子目录）检出全部 8 宿主"; else bad "1a 检出数=${n1}（期望 8）: $out1"; fi

# 1b：家目录全无，仅 CLI 在 PATH（受控 PATH，剥掉真实宿主 CLI 所在目录）
FB="$TMP/fakebin"; mkdir -p "$FB"
printf '#!/bin/sh\nexit 0\n' > "$FB/cursor"; chmod +x "$FB/cursor"
printf '#!/bin/sh\nexit 0\n' > "$FB/zcode";  chmod +x "$FB/zcode"
FH1b="$(newhome 1b)"
# 注意：假设 /bin:/usr/bin 不含 8 家宿主 CLI（AI 助手 CLI 不随系统发行）；CI/macOS/Linux 标准布局成立
out1b="$(HOME="$FH1b" PATH="$FB:/bin:/usr/bin" /bin/bash "$INSTALL" --list 2>&1)"
if printf '%s\n' "$out1b" | grep -q 'Cursor' && printf '%s\n' "$out1b" | grep -q 'ZCode'; then
  ok "1b CLI 在 PATH 检出 Cursor/ZCode（无家目录）"
else
  bad "1b CLI 判据未生效: $out1b"
fi
for t in Claude Codex Gemini Windsurf OpenCode Kimi; do
  if printf '%s\n' "$out1b" | grep -q "$t"; then bad "1b 未装 ${t} 被误检（PATH 面污染）"; fi
done
[[ "$FAIL" -eq 0 ]] && ok "1b 未装宿主零误检"

# 1c：家目录与 CLI 皆无 → 未检测到
FH1c="$(newhome 1c)"
out1c="$(HOME="$FH1c" PATH="/bin:/usr/bin" /bin/bash "$INSTALL" --list 2>&1)"
if [[ "$out1c" == *"未检测到任何"* ]]; then ok "1c 双判据皆无不误检"; else bad "1c 空环境误检: $out1c"; fi

# 1d：Kimi legacy ~/.kimi/skills 回退保留
FH1d="$(newhome 1d)"; mkdir -p "$FH1d/.kimi/skills"
out1d="$(HOME="$FH1d" PATH="/bin:/usr/bin" /bin/bash "$INSTALL" --list 2>&1)"
if [[ "$out1d" == *".kimi/skills"* ]]; then ok "1d Kimi legacy ~/.kimi/skills 回退在位"; else bad "1d Kimi legacy 回退丢失: $out1d"; fi

# ============================================================
# ② 全链路：install（8 宿主）→ render → --uninstall --all
# ============================================================
echo "[2] install → render → uninstall --all 闭环"
FH2="$(newhome 2)"
mkdir -p "$FH2/.claude" "$FH2/.cursor" "$FH2/.codex" "$FH2/.gemini" "$FH2/.kimi-code" \
         "$FH2/.zcode" "$FH2/.config/opencode" "$FH2/.codeium/windsurf"
# 预置用户自有配置（卸载必须原样保留的面）
printf '{"version": 1, "hooks": {"preToolUse": [{"command": "user-cmd", "matcher": "X"}], "sessionStart": [{"command": "keep-me"}]}}' > "$FH2/.cursor/hooks.json"
printf '{"other": true}' > "$FH2/.gemini/settings.json"
mkdir -p "$FH2/.devin"
printf '{"PreToolUse": [{"matcher": "y", "hooks": [{"type": "command", "command": "devin-user"}]}]}' > "$FH2/.devin/hooks.v1.json"
printf 'user-toml-line = 1\n' > "$FH2/.kimi-code/config.toml"
mkdir -p "$FH2/.zcode/cli"
printf '{"theme": "dark", "plugins": {"dirs": ["/opt/other/plugin"]}}' > "$FH2/.zcode/cli/config.json"
printf 'USER-CODEX\n'   > "$FH2/.codex/AGENTS.md"
printf 'USER-GEMINI\n'  > "$FH2/.gemini/GEMINI.md"
printf 'USER-OP\n'      > "$FH2/.config/opencode/AGENTS.md"
printf 'USER-ZCODE\n'   > "$FH2/.zcode/AGENTS.md"
mkdir -p "$FH2/.codeium/windsurf/memories"
printf 'USER-WINDSURF\n' > "$FH2/.codeium/windsurf/memories/global_rules.md"

inst_fail=0
for t in claude cursor codex gemini kimi zcode opencode windsurf; do
  HOME="$FH2" bash "$INSTALL" --$t >/dev/null 2>&1 || { bad "2-install ${t} 安装失败"; inst_fail=1; }
done
[[ "$inst_fail" -eq 0 ]] && ok "2a 8 宿主安装全绿"
[[ -f "$FH2/.claude/commands/swarm-yuan.md" ]] && ok "2b slash command 已注册" || bad "2b slash command 未注册"

# zcode 插件注册面（渲染期只走 project 级）：项目级渲染把插件目录写进 ~/.zcode/cli/config.json
mkdir -p "$FH2/projx"
HOME="$FH2" bash "$BASE/scripts/generate-skill.sh" --render-tools "$FH2/.zcode/skills/swarm-yuan" "$FH2/projx" zcode >/dev/null 2>&1
json_assert "$FH2/.zcode/cli/config.json" "'/opt/other/plugin' in d['plugins']['dirs'] and any('zcode-plugin' in x for x in d['plugins']['dirs'])" "2c zcode 插件注册在位（项目级渲染）"

# 卸载
HOME="$FH2" bash "$INSTALL" --uninstall --all >/dev/null 2>&1; rc2=$?
if [[ "$rc2" -eq 0 ]]; then ok "2d --uninstall --all rc=0"; else bad "2d --uninstall --all rc=${rc2}"; fi

# 技能目录消失 + 存档存在（删除类先存档）
arc_n=0; dir_ok=1
for d in ".claude" ".cursor" ".codex" ".gemini" ".kimi-code" ".zcode" ".config/opencode" ".codeium/windsurf"; do
  [[ -e "$FH2/$d/skills/swarm-yuan" ]] && { bad "2e 技能目录未移除: $d/skills/swarm-yuan"; dir_ok=0; }
  arc="$(find "$FH2/$d/skills" -maxdepth 1 -type d -name 'swarm-yuan.uninstalled.*' 2>/dev/null | head -n 1)"
  [[ -n "$arc" ]] && arc_n=$((arc_n + 1))
done
[[ "$dir_ok" -eq 1 ]] && ok "2e 8 家技能目录全部移除"
if [[ "$arc_n" -eq 8 ]]; then ok "2f 8 家存档目录 *.uninstalled.<UTC时间戳> 全在"; else bad "2f 存档目录数=${arc_n}（期望 8）"; fi

# slash command 移除
if [[ ! -e "$FH2/.claude/commands/swarm-yuan.md" ]]; then ok "2g slash command 已移除"; else bad "2g slash command 残留"; fi

# cursor：本技能条目消失，用户条目/其他事件/version 保留
json_assert "$FH2/.cursor/hooks.json" \
  "not any('swarm-yuan' in __import__('json').dumps(e) for e in d['hooks'].get('preToolUse', []))" \
  "2h cursor 本技能条目已消失"
json_assert "$FH2/.cursor/hooks.json" \
  "any('user-cmd' in __import__('json').dumps(e) for e in d['hooks']['preToolUse']) and any('keep-me' in __import__('json').dumps(e) for e in d['hooks']['sessionStart']) and d.get('version') == 1" \
  "2i cursor 用户条目/sessionStart/version 保留"
if [[ ! -e "$FH2/.cursor/rules/swarm-yuan.mdc" ]]; then ok "2j cursor .mdc 规则文件已移除"; else bad "2j cursor .mdc 残留"; fi

# gemini：条目消失（hooks 段删空移除），用户 other 键保留
json_assert "$FH2/.gemini/settings.json" "d == {'other': True}" "2k gemini 条目移除 + other 保留（hooks 删空收敛）"

# devin（windsurf CLI 面）：本技能条目消失，用户条目保留
json_assert "$FH2/.devin/hooks.v1.json" \
  "not any('swarm-yuan' in __import__('json').dumps(g) for g in d.get('PreToolUse', [])) and any('devin-user' in __import__('json').dumps(g) for g in d['PreToolUse'])" \
  "2l devin 条目消失 + 用户条目保留"

# kimi：config.toml 标记块消失，块外用户行保留
if ! grep -q 'swarm-yuan:kimi' "$FH2/.kimi-code/config.toml" && grep -q 'user-toml-line' "$FH2/.kimi-code/config.toml"; then
  ok "2m kimi config.toml 标记块消失 + 块外内容保留"
else
  bad "2m kimi config.toml 清理不符: $(cat "$FH2/.kimi-code/config.toml")"
fi

# zcode：plugins.dirs 中本插件目录消失，其他 dirs/theme 保留
json_assert "$FH2/.zcode/cli/config.json" \
  "d.get('theme') == 'dark' and d['plugins']['dirs'] == ['/opt/other/plugin']" \
  "2n zcode 插件注册剔除 + 其他 dirs/theme 保留"

# AGENTS/GEMINI/global_rules 标记块族：块消失、块外用户内容保留
for spec in ".codex/AGENTS.md:USER-CODEX" ".gemini/GEMINI.md:USER-GEMINI" ".config/opencode/AGENTS.md:USER-OP" ".zcode/AGENTS.md:USER-ZCODE" ".codeium/windsurf/memories/global_rules.md:USER-WINDSURF"; do
  f="$FH2/${spec%%:*}"; keep="${spec##*:}"
  if ! grep -q 'swarm-yuan:' "$f" 2>/dev/null && grep -q "$keep" "$f" 2>/dev/null; then
    ok "2o ${f#$FH2/} 标记块消失 + 用户内容保留"
  else
    bad "2o ${f#$FH2/} 清理不符（块残留或用户内容丢失）"
  fi
done

# opencode 插件文件移除
if [[ ! -e "$FH2/.config/opencode/plugins/swarm-yuan-spec-first.js" ]]; then ok "2p opencode 插件已移除"; else bad "2p opencode 插件残留"; fi

# ============================================================
# ②b R139：skills-dir 三宿主（hermes/dsh/ccswitch）收口
# 旧缺口①：tool_key_of 缺三映射 → --uninstall --all 打「未知宿主」跳过卸载且整体 rc=1；
# 旧缺口②：检测判据倒置（skills 子目录存在才检出）→ 首装漏检。
# ============================================================
echo "[2b] skills-dir 三宿主：检测 → 安装 → --uninstall --all"
FH2b="$(newhome 2b)"
mkdir -p "$FH2b/.hermes" "$FH2b/.dsh" "$FH2b/.cc-switch"
out2b="$(HOME="$FH2b" PATH="/bin:/usr/bin" /bin/bash "$INSTALL" --list 2>&1)"
for t in Hermes DSH CC-Switch; do
  if printf '%s\n' "$out2b" | grep -q "$t"; then ok "2b-1 仅家目录（无 skills 子目录）检出 $t"; else bad "2b-1 $t 首装形态漏检: $out2b"; fi
done
inst2b=0
for t in hermes dsh ccswitch; do
  HOME="$FH2b" bash "$INSTALL" --$t >/dev/null 2>&1 || { bad "2b-2 ${t} 安装失败"; inst2b=1; }
done
[[ "$inst2b" -eq 0 ]] && ok "2b-2 三宿主安装全绿"
[[ -d "$FH2b/.hermes/skills/swarm-yuan" ]] && ok "2b-3 hermes 技能目录已装" || bad "2b-3 hermes 未装"
HOME="$FH2b" bash "$INSTALL" --uninstall --all >"$TMP/uninst2b.log" 2>&1; rc2b=$?
if [[ "$rc2b" -eq 0 ]]; then ok "2b-4 --uninstall --all rc=0（三宿主有映射）"; else bad "2b-4 --uninstall --all rc=${rc2b}"; fi
if grep -q '未知宿主' "$TMP/uninst2b.log"; then bad "2b-5 输出残留「未知宿主」（映射缺失复发）"; else ok "2b-5 无「未知宿主」"; fi
arc2b=0; left2b=0
for d in ".hermes" ".dsh" ".cc-switch"; do
  [[ -e "$FH2b/$d/skills/swarm-yuan" ]] && { bad "2b-6 技能目录未移除: $d/skills/swarm-yuan"; left2b=1; }
  arc="$(find "$FH2b/$d/skills" -maxdepth 1 -type d -name 'swarm-yuan.uninstalled.*' 2>/dev/null | head -n 1)"
  [[ -n "$arc" ]] && arc2b=$((arc2b + 1))
done
[[ "$left2b" -eq 0 ]] && ok "2b-6 三家技能目录全部移除"
if [[ "$arc2b" -eq 3 ]]; then ok "2b-7 三家存档目录全在"; else bad "2b-7 存档数=${arc2b}（期望 3）"; fi

# ============================================================
# ③ 幂等：二次 --uninstall --all
# ============================================================
echo "[3] 卸载幂等"
arc_before="$(find "$FH2" -type d -name 'swarm-yuan.uninstalled.*' | wc -l | tr -d ' ')"
HOME="$FH2" bash "$INSTALL" --uninstall --all >/dev/null 2>&1; rc3=$?
arc_after="$(find "$FH2" -type d -name 'swarm-yuan.uninstalled.*' | wc -l | tr -d ' ')"
if [[ "$rc3" -eq 0 && "$arc_before" == "$arc_after" ]]; then
  ok "3a 二次 --uninstall --all rc=0 且零新增存档（幂等）"
else
  bad "3a 二次卸载 rc=${rc3} 存档 ${arc_before}→${arc_after}"
fi

# ============================================================
# ④ Codex 项目级组内剔条目（matcher 组保留用户条目）
# ============================================================
echo "[4] Codex 组内剔除"
SK4="$(make_skill "$TMP/sk4" cdx)"
PJ4="$TMP/pj4"; mkdir -p "$PJ4/.codex"
printf '{"hooks": {"PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "user-keep"}]}]}}' > "$PJ4/.codex/hooks.json"
render_tool codex "$SK4" "$PJ4" project cdx >/dev/null 2>&1
(
  export HOME="$FH1" TA_DIR TA_SKILL_NAME="cdx"
  # shellcheck disable=SC1090,SC1091
  . "$TA_DIR/common.sh"
  # shellcheck disable=SC1090
  . "$TA_DIR/codex.sh"
  unrender_tool_codex "$SK4" "$PJ4" project
) >/dev/null 2>&1
json_assert "$PJ4/.codex/hooks.json" \
  "not any('codex-gate-wrapper' in __import__('json').dumps(h) or 'failure-detector' in __import__('json').dumps(h) for g in d.get('hooks', {}).get('PreToolUse', []) + d.get('hooks', {}).get('PostToolUse', []) for h in (g.get('hooks', []) if isinstance(g, dict) else [])) and any('user-keep' in __import__('json').dumps(h) for g in d['hooks']['PreToolUse'] for h in g['hooks'])" \
  "4a Codex 本技能条目消失 + 同组用户条目保留"

# ============================================================
# ⑤ fail-closed：用户 hooks JSON 非法 → 注销跳过不写回（且与目录存档解耦）
# ============================================================
echo "[5] 非法 JSON fail-closed"
FH5="$(newhome 5)"; mkdir -p "$FH5/.cursor"
HOME="$FH5" bash "$INSTALL" --cursor >/dev/null 2>&1
printf '{"version": 1, "hooks": {' > "$FH5/.cursor/hooks.json"
before5="$(cksum "$FH5/.cursor/hooks.json")"
HOME="$FH5" bash "$INSTALL" --uninstall --cursor >/dev/null 2>&1; rc5=$?
after5="$(cksum "$FH5/.cursor/hooks.json")"
if [[ "$rc5" -ne 0 && "$before5" == "$after5" ]]; then
  ok "5a 非法 JSON：rc=${rc5} 且文件逐字节不变（fail-closed）"
else
  bad "5a 非法 JSON 被写回或未报错（rc=${rc5}）"
fi
if [[ -n "$(find "$FH5/.cursor/skills" -maxdepth 1 -type d -name 'swarm-yuan.uninstalled.*' 2>/dev/null)" ]]; then
  ok "5b 配置注销失败不阻断技能目录存档（解耦）"
else
  bad "5b 配置失败放大为目录不存档（应解耦）"
fi

# ============================================================
# ⑥ CRLF 标记块移除（html + toml 两风格）
# ============================================================
echo "[6] CRLF 标记块移除"
(
  export TA_DIR
  # shellcheck disable=SC1091
  . "$TA_DIR/common.sh"
  # html 风格（AGENTS.md/GEMINI.md 形态）
  printf 'user-line\r\n<!-- >>> swarm-yuan:gemini:cz >>> （由 generate-skill.sh --render-tools 维护，勿手改） -->\r\nBODY\r\n<!-- <<< swarm-yuan:gemini:cz <<< -->\r\n' > "$TMP/g.md"
  ta_remove_marker_block "$TMP/g.md" gemini cz >/dev/null 2>&1; r1=$?
  # toml 风格（kimi config.toml 形态）
  printf 'user-t\r\n# >>> swarm-yuan:kimi:cz2 >>> （由 generate-skill.sh --render-tools 维护，勿手改）\r\n[[hooks]]\r\n# <<< swarm-yuan:kimi:cz2 <<<\r\n' > "$TMP/k.toml"
  ta_remove_marker_block "$TMP/k.toml" kimi cz2 toml >/dev/null 2>&1; r2=$?
  # 幂等：再次移除（块已不在）
  ta_remove_marker_block "$TMP/g.md" gemini cz >/dev/null 2>&1; r3=$?
  exit $(( r1 | r2 | r3 ))
)
rc6=$?
if [[ "$rc6" -eq 0 ]] \
   && grep -q 'user-line' "$TMP/g.md" && ! grep -q 'swarm-yuan:gemini' "$TMP/g.md" && grep -q "$(printf '\r')" "$TMP/g.md" \
   && grep -q 'user-t' "$TMP/k.toml" && ! grep -q 'swarm-yuan:kimi' "$TMP/k.toml" && grep -q "$(printf '\r')" "$TMP/k.toml"; then
  ok "6a CRLF 两风格块移除 + 用户内容/CRLF 风格保留 + 二次幂等"
else
  bad "6a CRLF 移除不符（rc=${rc6}）"
fi

# ============================================================
# ⑦ Usage 与目标校验
# ============================================================
echo "[7] Usage"
FH7="$(newhome 7)"
out7="$(HOME="$FH7" bash "$INSTALL" --definitely-invalid 2>&1)"; rc7=$?
if [[ "$rc7" -eq 1 && "$out7" == *"Usage:"* && "$out7" == *"--uninstall"* ]]; then
  ok "7a 无效参数 Usage 列出 --uninstall"
else
  bad "7a Usage 缺 --uninstall（rc=${rc7}）"
fi
HOME="$FH7" bash "$INSTALL" --uninstall >/dev/null 2>&1; rc7b=$?
[[ "$rc7b" -eq 1 ]] && ok "7b --uninstall 缺目标 rc=1" || bad "7b 缺目标 rc=${rc7b}"
HOME="$FH7" bash "$INSTALL" --uninstall --bogus >/dev/null 2>&1; rc7c=$?
[[ "$rc7c" -eq 1 ]] && ok "7c --uninstall 无效目标 rc=1" || bad "7c 无效目标 rc=${rc7c}"

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "test-r128-install-uninstall: PASS"
else
  echo "test-r128-install-uninstall: FAIL" >&2
fi
exit $FAIL
