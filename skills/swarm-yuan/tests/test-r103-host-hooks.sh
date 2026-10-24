#!/usr/bin/env bash
# test-r103-host-hooks.sh — 五宿主 L1 写时拦截整合守门测试（R103）
# 覆盖：①桥归一化矩阵（五家 payload 形态 + 显式参数 + 放行/阻断/修好放行）
#      ②五渲染器 schema 锁（各家官方文档格式，防与 Claude 嵌套形混用）
#      ③幂等与用户配置保全 ④三态安全线 ⑤kimi 产品更替 ⑥随发登记
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }
TMP="$(mktemp -d /tmp/r103.XXXXXX)"
BASE="$(pwd)"
trap 'rm -rf "$TMP"' EXIT

# ===== 共用夹具：fake skill（bridge+hook+lib+conf）+ fake proj + fake HOME =====
SK="$TMP/skill"; PJ="$TMP/proj"; FH="$TMP/fakehome"
mkdir -p "$SK/scripts" "$PJ/src" "$FH"
cp assets/hooks/spec-first-bridge.sh assets/hooks/fail-gate-hook.sh assets/spec-first-lib.sh "$SK/scripts/"
printf -- '---\nname: demo-skill\ndescription: 测试技能\nstatus: active\n---\n' > "$SK/SKILL.md"
cat > "$SK/scripts/precheck.conf" <<EOF
PROJECT_DIR="$PJ"
WRITABLE_DIRS=("src")
SPEC_REQUIRED="\${SPEC_REQUIRED:-1}"
SPEC_GLOB="\${SPEC_GLOB:-docs/specs/*.md}"
GATE_ENFORCE_DENY=""
EOF

# ===== ① 桥归一化矩阵 =====
BR="$SK/scripts/spec-first-bridge.sh"
cd "$PJ"
run_br() { # $1=host $2=payload → rc 全局 BRRC
  printf '%s' "$2" | bash "$BR" --host "$1" >/dev/null 2>&1; BRRC=$?
}
run_br gemini "{\"tool_name\":\"write_file\",\"tool_args\":{\"file_path\":\"$PJ/src/a.py\",\"content\":\"x\"}}"
[[ $BRRC -eq 2 ]] && ok "1a gemini write_file 无 spec → exit 2" || bad "1a gemini 未拦（rc=${BRRC}）"
run_br devin '{"hook_event_name":"PreToolUse","tool_name":"exec","tool_input":{"command":"ls"}}'
[[ $BRRC -eq 0 ]] && ok "1b devin exec → 放行（spec 域外）" || bad "1b devin 误拦（rc=${BRRC}）"
run_br cursor '{"toolName":"Shell","toolInput":{"command":"ls"}}'
[[ $BRRC -eq 0 ]] && ok "1c cursor Shell→Bash → 放行" || bad "1c cursor 误拦（rc=${BRRC}）"
run_br kimi "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$PJ/src/c.py\"}}"
[[ $BRRC -eq 2 ]] && ok "1d kimi Write 无 spec → exit 2" || bad "1d kimi 未拦（rc=${BRRC}）"
run_br cursor "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$PJ/src/w.py\"}}"
[[ $BRRC -eq 2 ]] && ok "1e cursor Write 无 spec → exit 2" || bad "1e cursor 未拦（rc=${BRRC}）"
bash "$BR" --host opencode --tool write --path "$PJ/src/b.py" --cmd "" >/dev/null 2>&1
[[ $? -eq 2 ]] && ok "1f 显式参数（opencode 插件形态）→ exit 2" || bad "1f 显式参数未拦"
mkdir -p "$PJ/docs/specs"
printf '# X\n## 决策记录\n- A\n' > "$PJ/docs/specs/001.md"
run_br gemini "{\"tool_name\":\"write_file\",\"tool_args\":{\"file_path\":\"$PJ/src/a.py\"}}"
[[ $BRRC -eq 0 ]] && ok "1g 有已批准 spec → 放行" || bad "1g 有 spec 仍拦（rc=${BRRC}）"
run_br gemini '{"tool_name":"write_file"}'
[[ $BRRC -eq 0 ]] && ok "1h payload 缺入参 → fail-open 放行" || bad "1h 误拦"
printf 'not-json' | bash "$BR" --host gemini >/dev/null 2>&1
[[ $? -eq 0 ]] && ok "1i 非 JSON payload → fail-open 放行" || bad "1i 误拦"
cd "$BASE"

# ===== ②③ 渲染器 schema 锁 + 幂等/保用户配置（假 HOME） =====
# shellcheck disable=SC1091
( export HOME="$FH"
  export TA_DIR="$BASE/assets/tool-adapters" TA_SKILL_NAME="demo-skill" TA_SKILL_DESC="测试技能" TA_FRAMEWORKS="未配置"
  export TA_BODY="$TMP/body.md"
  printf '规则正文\n' > "$TA_BODY"
  # 用户配置预置（保全断言用）：cursor 既有条目 + gemini 既有设置键
  mkdir -p "$FH/.cursor" "$FH/.gemini" "$FH/.kimi-code"
  printf '{"version": 1, "hooks": {"preToolUse": [{"command": "user-cmd", "matcher": "X"}]}}' > "$FH/.cursor/hooks.json"
  printf '{"theme": "dark"}' > "$FH/.gemini/settings.json"
  printf '# 用户已有配置\n[identity]\nname = "me"\n' > "$FH/.kimi-code/config.toml"
  . "$TA_DIR/common.sh"
  . "$TA_DIR/cursor.sh"; . "$TA_DIR/gemini.sh"; . "$TA_DIR/windsurf.sh"; . "$TA_DIR/kimi.sh"; . "$TA_DIR/opencode.sh"
  render_tool_cursor "$SK" "$FH" "user" >/dev/null 2>&1
  render_tool_gemini "$SK" "$FH" "user" >/dev/null 2>&1
  render_tool_windsurf "$SK" "$FH" "user" >/dev/null 2>&1
  render_tool_kimi "$SK" "$FH" "user" >/dev/null 2>&1
  render_tool_opencode "$SK" "$FH" "user" >/dev/null 2>&1
  # 幂等：二次渲染
  render_tool_cursor "$SK" "$FH" "user" >/dev/null 2>&1
  render_tool_gemini "$SK" "$FH" "user" >/dev/null 2>&1
) || bad "渲染子壳失败"

python3 - "$FH" "$SK" <<'PYEOF'
import json, sys, re
fh, sk = sys.argv[1], sys.argv[2]
fails = []
def okc(cond, msg):
    print(("  \u2713 " if cond else "  \u2717 ") + msg)
    if not cond: fails.append(msg)

# cursor：version:1 + preToolUse 扁平条目（command 平级，非 hooks 数组）+ 用户条目保全 + 幂等
d = json.load(open(f"{fh}/.cursor/hooks.json"))
okc(d.get("version") == 1, "2a cursor version:1")
arr = d["hooks"]["preToolUse"]
ours = [e for e in arr if "spec-first-bridge" in json.dumps(e)]
okc(len(ours) == 1, "2b cursor 桥条目幂等（恰 1）")
okc(ours and "command" in ours[0] and "hooks" not in ours[0], "2c cursor 条目扁平形（command 平级）")
okc(any("user-cmd" in json.dumps(e) for e in arr), "2d cursor 用户既有条目保全")

# gemini：settings hooks.BeforeTool 嵌套（hooks 数组+timeout 毫秒）+ theme 键保全 + 幂等
d = json.load(open(f"{fh}/.gemini/settings.json"))
okc(d.get("theme") == "dark", "2e gemini 用户既有键保全")
arr = d["hooks"]["BeforeTool"]
ours = [e for e in arr if "spec-first-bridge" in json.dumps(e)]
okc(len(ours) == 1, "2f gemini 桥条目幂等（恰 1）")
okc(ours and isinstance(ours[0].get("hooks"), list) and isinstance(ours[0]["hooks"][0].get("timeout"), int), "2g gemini 嵌套形+timeout")

# devin（windsurf CLI 面）：hooks 对象即整文件（无外层 hooks 键）+ 嵌套条目
d = json.load(open(f"{fh}/.devin/hooks.v1.json"))
okc("hooks" not in d and "PreToolUse" in d, "2h devin bare 形（事件挂顶层）")
okc(d["PreToolUse"] and isinstance(d["PreToolUse"][0].get("hooks"), list), "2i devin 嵌套条目")

# kimi：TOML 标记块 + [[hooks]] + 用户已有配置保全
t = open(f"{fh}/.kimi-code/config.toml").read()
okc("[[hooks]]" in t and "event = \"PreToolUse\"" in t and "spec-first-bridge" in t, "2j kimi [[hooks]] 写入")
okc("# >>> swarm-yuan:kimi:demo-skill >>>" in t, "2k kimi TOML 风格标记")
okc("name = \"me\"" in t, "2l kimi 用户已有配置保全")

# opencode：插件 JS 含阻断语义
j = open(f"{fh}/.config/opencode/plugins/swarm-yuan-spec-first.js").read()
okc("tool.execute.before" in j and "throw new Error" in j and "spec-first-bridge" in j, "2m opencode 插件含 throw 阻断链")
okc("$`bash" in j and "${t}" in j, "2n opencode 模板转义正确（JS 模板串未被 bash 展开）")
sys.exit(1 if fails else 0)
PYEOF
[[ $? -eq 0 ]] || FAIL=1

# ===== ④ 三态安全线 =====
TB_DIR="$BASE/assets/tool-adapters"
for t in claude codex zcode; do
  body=$(TA_DIR="$TB_DIR" bash -c "source '$TB_DIR/common.sh'; TA_SKILL_NAME=x; TA_SKILL_DESC=x; TA_FRAMEWORKS=; ta_build_body '/sk' '$t'" 2>/dev/null)
  printf '%s' "$body" | grep -q "已接 spec-first deny（宿主 hooks，L1，活体实证）" && ok "4$t hook 态安全线" || bad "4$t 安全线缺失"
done
for t in cursor gemini opencode kimi; do
  body=$(TA_DIR="$TB_DIR" bash -c "source '$TB_DIR/common.sh'; TA_SKILL_NAME=x; TA_SKILL_DESC=x; TA_FRAMEWORKS=; ta_build_body '/sk' '$t'" 2>/dev/null)
  printf '%s' "$body" | grep -q "已渲染写时拦截配置（L1，官方 schema 文档锚、未活体实证）" && ok "4$t rendered 态安全线" || bad "4$t 安全线缺失"
done
body=$(TA_DIR="$TB_DIR" bash -c "source '$TB_DIR/common.sh'; TA_SKILL_NAME=x; TA_SKILL_DESC=x; TA_FRAMEWORKS=; ta_build_body '/sk' windsurf" 2>/dev/null)
printf '%s' "$body" | grep -q "Devin CLI 面（.devin/hooks.v1.json），Windsurf 桌面端 Cascade 仅 advisory" && ok "4windsurf 双面注" || bad "4windsurf 双面注缺失"

# ===== ⑤ kimi 产品更替 =====
grep -q 'kimi-code' install.sh && ok "5a install.sh 检测/安装面向 kimi-code" || bad "5a kimi-code 未入 install"
grep -q '"$HOME/.kimi-code"|"$HOME/.kimi"' assets/tool-adapters/common.sh 2>/dev/null || grep -q '"$HOME/.kimi-code"' assets/tool-adapters/common.sh && ok "5b ta_is_user_level 含 ~/.kimi-code" || bad "5b 缺 kimi-code home"
# 5c ~/.kimi-code 缺失时 hooks 跳过披露（不建文件不报错）
( export HOME="$TMP/nohome"; mkdir -p "$TMP/nohome"
  export TA_DIR="$BASE/assets/tool-adapters" TA_SKILL_NAME="demo-skill" TA_BODY="$TMP/body.md"
  printf 'x\n' > "$TA_BODY"
  . "$TA_DIR/common.sh"; . "$TA_DIR/kimi.sh"
  out=$(render_tool_kimi_hooks "$SK" 2>&1)
  [[ ! -e "$TMP/nohome/.kimi-code/config.toml" ]] && printf '%s' "$out" | grep -q "kimi-code 不存在" && exit 0 || exit 1
) && ok "5c kimi-code 缺失 → 跳过披露" || bad "5c 缺失行为异常"

# ===== ⑥ 随发登记 =====
grep -q '"scripts/spec-first-bridge.sh|hook|standard"' scripts/generate-skill.sh && ok "6a bridge 入 UNIVERSAL_FILES" || bad "6a 未登记"
grep -q '^FACT_HOST_HOOKS_RENDERED=5' assets/facts.conf && ok "6b FACT_HOST_HOOKS_RENDERED=5 记账" || bad "6b 记账缺失"

if [[ $FAIL -eq 0 ]]; then echo "test-r103-host-hooks: PASS"; else echo "test-r103-host-hooks: FAIL" >&2; fi
exit $FAIL
