#!/usr/bin/env bash
# test-r120-render-entry-paths.sh — R120 渲染入口路径按实际布局探测锚
# 背景：ta_build_body 曾硬编码 scripts/ 前缀，对生成器自身布局（precheck.sh/state-machine.sh
# 在 assets/，见 SKILL.md「路径约定」）渲染出指向不存在文件的命令（AGENTS.md 工具块实测
# No such file）。覆盖：assets 布局、scripts 布局（目标技能兼容）、双布局 scripts 优先、
# 双缺如实披露（不渲染假命令）、真实生成器目录渲染出的入口必须存在且语法可解析。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
TMP="$(mktemp -d /tmp/r120rp.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# shellcheck disable=SC1091
. "assets/tool-adapters/common.sh"
TA_DIR="$(pwd)/assets/tool-adapters"

mk_skill() {  # $1=dir $2=layout(assets|scripts|both|none)
  mkdir -p "$1"
  printf -- '---\nname: demo\ndescription: 测试\n---\n# demo\n' > "$1/SKILL.md"
  case "$2" in
    assets)
      mkdir -p "$1/assets"
      : > "$1/assets/precheck.sh"; : > "$1/assets/precheck.conf"; : > "$1/assets/state-machine.sh" ;;
    scripts)
      mkdir -p "$1/scripts"
      : > "$1/scripts/precheck.sh"; : > "$1/scripts/precheck.conf"; : > "$1/scripts/state-machine.sh" ;;
    both)
      mkdir -p "$1/assets" "$1/scripts"
      : > "$1/assets/precheck.sh"; : > "$1/assets/state-machine.sh"
      : > "$1/scripts/precheck.sh"; : > "$1/scripts/precheck.conf"; : > "$1/scripts/state-machine.sh" ;;
  esac
}

body_of() {  # $1=skill_dir → ta_build_body 正文写入 $TMP/last.body
  TA_SKILL_NAME="demo"; TA_SKILL_DESC="测试技能"; TA_FRAMEWORKS="未配置"
  ta_build_body "$1" "" > "$TMP/last.body"
}
gate_line() { grep -F '质量门禁' "$TMP/last.body"; }
sm_line()   { grep -F '流程状态机' "$TMP/last.body"; }

# 态A 生成器布局（assets/）：入口指向 assets/
A="$TMP/a"; mk_skill "$A" assets; body_of "$A"
if gate_line | grep -qF "bash \"$A/assets/precheck.sh\" --all"; then ok "态A 门禁入口指向 assets/precheck.sh"; else bad "态A 门禁入口未指向 assets/（实际：$(gate_line)）"; fi
if sm_line | grep -qF "bash \"$A/assets/state-machine.sh\" status"; then ok "态A 状态机入口指向 assets/state-machine.sh"; else bad "态A 状态机入口未指向 assets/"; fi
gate_line | grep -qF "（门禁配置：$A/assets/precheck.conf）" && ok "态A conf 括注随实际目录" || bad "态A conf 括注错位"

# 态B 目标技能布局（scripts/）：入口保持 scripts/（兼容既有目标技能）
B="$TMP/b"; mk_skill "$B" scripts; body_of "$B"
if gate_line | grep -qF "bash \"$B/scripts/precheck.sh\" --all"; then ok "态B 门禁入口保持 scripts/"; else bad "态B 门禁入口漂移（实际：$(gate_line)）"; fi
sm_line | grep -qF "bash \"$B/scripts/state-machine.sh\" status" && ok "态B 状态机入口保持 scripts/" || bad "态B 状态机入口漂移"

# 态C 双布局共存：scripts/ 优先（目标技能物化位置为准）
C="$TMP/c"; mk_skill "$C" both; body_of "$C"
gate_line | grep -qF "bash \"$C/scripts/precheck.sh\" --all" && ok "态C 双布局时 scripts/ 优先" || bad "态C 优先级错误（实际：$(gate_line)）"
sm_line | grep -qF "bash \"$C/scripts/state-machine.sh\" status" && ok "态C 状态机 scripts/ 优先" || bad "态C 状态机优先级错误"

# 态D 双缺失：如实披露，不渲染指向不存在文件的 bash 命令
D="$TMP/d"; mk_skill "$D" none; body_of "$D"
gate_line | grep -qF '未找到 precheck.sh' && ok "态D 门禁缺 如实披露" || bad "态D 门禁缺失未披露（实际：$(gate_line)）"
sm_line | grep -qF '未找到 state-machine.sh' && ok "态D 状态机缺 如实披露" || bad "态D 状态机缺失未披露"
if gate_line | grep -qF 'bash "'; then bad "态D 缺失仍渲染 bash 命令"; else ok "态D 无假命令"; fi

# 态E 真实生成器目录（本仓库 swarm-yuan/，assets 布局）：渲染入口必须存在且 bash -n 可解析
body_of "$(pwd)"
pc_path="$(gate_line | sed -n 's/.*bash "\([^"]*\)" --all.*/\1/p')"
sm_path="$(sm_line | sed -n 's/.*bash "\([^"]*\)" status.*/\1/p')"
if [[ -n "$pc_path" && -f "$pc_path" ]]; then ok "态E 门禁入口真实存在：$pc_path"; else bad "态E 门禁入口缺失（提取：${pc_path:-<空>}）"; fi
if [[ -n "$sm_path" && -f "$sm_path" ]]; then ok "态E 状态机入口真实存在：$sm_path"; else bad "态E 状态机入口缺失（提取：${sm_path:-<空>}）"; fi
[[ -n "$pc_path" ]] && bash -n "$pc_path" 2>/dev/null && ok "态E precheck.sh bash -n 语法通过" || bad "态E precheck.sh 语法解析失败"
[[ -n "$sm_path" ]] && bash -n "$sm_path" 2>/dev/null && ok "态E state-machine.sh bash -n 语法通过" || bad "态E state-machine.sh 语法解析失败"
conf_path="$(gate_line | sed -n 's/.*（门禁配置：\([^）]*\)）.*/\1/p')"
[[ -n "$conf_path" && -f "$conf_path" ]] && ok "态E conf 路径真实存在" || bad "态E conf 路径缺失（提取：${conf_path:-<空>}）"

if [[ $FAIL -eq 0 ]]; then echo "test-r120-render-entry-paths: PASS"; else echo "test-r120-render-entry-paths: FAIL" >&2; fi
exit $FAIL
