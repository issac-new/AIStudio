#!/usr/bin/env bash
# test-r118-install-hardening.sh — R118 安装器/宿主适配层加固回归（问题 1-14）
# 安全约束：所有安装/渲染都在 mktemp 目录内的伪造 HOME 下执行，绝不触碰真实 ~/.claude、
# ~/.codex、~/.kimi-code、~/.zcode 等目录；不联网。
#
# 覆盖：
#  ① .gitattributes eol + install.sh CRLF 自检        ② --version 取源树版本
#  ③ 符号链接调用 install.sh                         ④ 多运行时 + 非交互 stdin
#  ⑤ 源树外指符号链接拒绝 / chmod 不跟随 / 命令文件不写穿
#  ⑥ hooks JSON 非法 fail-closed                     ⑦ Cursor version:1
#  ⑧ Codex 用户级不误报失败                          ⑨ 多技能共享 hooks
#  ⑩ CRLF 标记块可更新                               ⑪ 备份保留最近 3 份
#  ⑫ 非法交互选择报错                               ⑬ Usage 含 --zcode
#  ⑭ WSL HOME（仅静态断言；Windows 实机未验证）
set -uo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$BASE/.." && pwd)"
INSTALL="$BASE/install.sh"
TA_DIR="$BASE/assets/tool-adapters"

TMP="$(mktemp -d /tmp/r118.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

newhome() { local d="$TMP/home-$1"; mkdir -p "$d"; printf '%s\n' "$d"; }

make_skill() {  # <dir> <name> → stdout=dir
  mkdir -p "$1/scripts"
  printf -- '---\nname: %s\ndescription: 测试技能 %s\n---\n' "$2" "$2" > "$1/SKILL.md"
  # R126：物化 hooks 脚本——真实生成物 scripts/ 必带这批 hook（UNIVERSAL_FILES 清单），
  # 适配器 R126 起按布局探测（ta_hook_path），缺脚本即跳过注册并披露（不再渲染死命令）；
  # 夹具补齐以镜像真实生成物，无脚本的跳过面由 ⑮ 态专项断言。
  for _hs in spec-first-bridge.sh fail-gate-hook.sh codex-gate-wrapper.sh failure-detector.sh; do
    printf '#!/usr/bin/env bash\nexit 0\n' > "$1/scripts/$_hs"
  done
  printf '%s\n' "$1"
}

printf 'R118 规则正文\n' > "$TMP/body.md"
mkdir -p "$TMP/render-home"

# 渲染适配器（子壳隔离；HOME 由 RHOME 指定，缺省为 TMP/render-home）
render_tool() {  # <tool> <skill_dir> <proj> <level> [name] [body]
  local tool="$1" sk="$2" proj="$3" level="$4" name="${5:-demo}" body="${6:-$TMP/body.md}"
  (
    export HOME="${RHOME:-$TMP/render-home}"
    export TA_DIR TA_SKILL_NAME="$name" TA_SKILL_DESC="测试技能 ${name}" TA_FRAMEWORKS="未配置" TA_BODY="$body"
    # shellcheck disable=SC1090,SC1091
    . "$TA_DIR/common.sh" || exit 1
    # shellcheck disable=SC1090
    . "$TA_DIR/$tool.sh" || exit 1
    "render_tool_$tool" "$sk" "$proj" "$level"
  )
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

# pty 驱动：等待 token 出现后写入 input，返回子进程退出码，pty 输出落 outfile。
cat > "$TMP/ptyrun.py" <<'PY'
import os, pty, select, sys, time
inp = sys.argv[1].encode('utf-8')
outfile = sys.argv[2]
token = sys.argv[3].encode('utf-8')
cmd = sys.argv[4:]
pid, fd = pty.fork()
if pid == 0:
    os.execvpe(cmd[0], cmd, os.environ)
out = b""
sent = False
deadline = time.time() + 40
while time.time() < deadline:
    r, _, _ = select.select([fd], [], [], 0.2)
    if fd in r:
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        out += chunk
        if not sent and token in out:
            os.write(fd, inp)
            sent = True
_, st = os.waitpid(pid, 0)
with open(outfile, 'wb') as f:
    f.write(out)
sys.exit(os.waitstatus_to_exitcode(st))
PY

# ============================================================
# ① .gitattributes eol 规则 + install.sh 自身 CRLF 检测
# ============================================================
echo "[1] .gitattributes 换行规则 + CRLF 自检"
if grep -qx '\* text=auto' "$REPO/.gitattributes"; then ok "1a * text=auto"; else bad "1a 缺 * text=auto"; fi
if grep -qx '\*.sh text eol=lf' "$REPO/.gitattributes"; then ok "1b *.sh eol=lf"; else bad "1b 缺 *.sh eol=lf"; fi
if grep -qx '\*.bat text eol=crlf' "$REPO/.gitattributes"; then ok "1c *.bat eol=crlf"; else bad "1c 缺 *.bat eol=crlf"; fi
# 8cc5b03 起 LFS 规则收敛为一条宽匹配（vendor-knowledge/**）；旧断言"恰 3 条"未随收敛同步。
if grep -q '^swarm-yuan/vendor-knowledge/\*\* filter=lfs' "$REPO/.gitattributes"; then ok "1d 既有 vendor LFS 规则保留"; else bad "1d LFS 规则被破坏"; fi

# 混合 CR（bash 可解析的形态）：脚本应显式报 CRLF 错误而非继续执行
awk 'NR==1 { printf "%s\r\n", $0; next } { print }' "$INSTALL" > "$TMP/install-crlf-mixed.sh"
FH1="$(newhome 1)"
out1="$(HOME="$FH1" bash "$TMP/install-crlf-mixed.sh" --version 2>&1)"; rc1=$?
if [[ $rc1 -ne 0 && "$out1" == *"CRLF"* ]]; then ok "1e 含 CR 的 install.sh 明确报 CRLF（rc=${rc1}）"; else bad "1e CRLF 自检未触发（rc=${rc1}）"; fi

# ============================================================
# ② --version 取源树版本（与 cwd 无关）
# ============================================================
echo "[2] --version 源树版本"
mkdir -p "$TMP/notgit"
out2="$(cd "$TMP/notgit" && HOME="$FH1" bash "$INSTALL" --version 2>&1)"; rc2=$?
expected_ver="$(git -C "$BASE" describe --tags --always 2>/dev/null || echo unknown)"
if [[ $rc2 -eq 0 && "$expected_ver" != "unknown" && "$out2" == *"installer ${expected_ver}"* ]]; then
  ok "2a 非 git cwd 下仍输出源树版本 ${expected_ver}"
else
  bad "2a 版本与源树不一致（rc=${rc2} out=${out2} expected=${expected_ver}）"
fi

# ============================================================
# ③ 通过符号链接调用 install.sh
# ============================================================
echo "[3] 符号链接调用"
FH3="$(newhome 3)"; mkdir -p "$FH3/.claude/skills"
ln -s "$INSTALL" "$TMP/install-link.sh"
out3="$(HOME="$FH3" bash "$TMP/install-link.sh" --claude 2>&1)"; rc3=$?
if [[ $rc3 -eq 0 && -f "$FH3/.claude/skills/swarm-yuan/SKILL.md" && "$out3" != *"未找到 SKILL.md"* ]]; then
  ok "3a 经符号链接调用可定位 SKILL.md 并完成安装"
else
  bad "3a 符号链接调用失败（rc=${rc3}）"
fi

# ============================================================
# ④ 多运行时 + 非交互 stdin
# ============================================================
echo "[4] 非交互 stdin（多运行时）"
FH4="$(newhome 4)"; mkdir -p "$FH4/.claude/skills" "$FH4/.codex/skills"
out4="$(HOME="$FH4" bash "$INSTALL" </dev/null 2>&1)"; rc4=$?
if [[ $rc4 -ne 0 && "$out4" == *"--all"* && ! -e "$FH4/.claude/skills/swarm-yuan" ]]; then
  ok "4a 非交互多运行时明确报错并提示 --all（rc=${rc4}）"
else
  bad "4a 非交互行为不符（rc=${rc4}）"
fi
out4b="$(HOME="$FH4" bash "$INSTALL" --all </dev/null 2>&1)"; rc4b=$?
if [[ $rc4b -eq 0 && -f "$FH4/.claude/skills/swarm-yuan/SKILL.md" && -f "$FH4/.codex/skills/swarm-yuan/SKILL.md" ]]; then
  ok "4b --all 非交互可完成全部安装"
else
  bad "4b --all 非交互失败（rc=${rc4b}）: ${out4b}"
fi

# ============================================================
# ⑤ 源树外指符号链接拒绝 / chmod 不跟随 / 命令文件不写穿
# ============================================================
echo "[5] 符号链接安全"
FS="$TMP/fakesrc"; mkdir -p "$FS/scripts"
cp "$INSTALL" "$FS/install.sh"
printf -- '---\nname: fake-src\ndescription: fake\n---\n' > "$FS/SKILL.md"
printf '#!/usr/bin/env bash\ntrue\n' > "$FS/scripts/ok.sh"
printf 'TARGET\n' > "$FS/target.sh"; chmod 644 "$FS/target.sh"
ln -s ../target.sh "$FS/scripts/link.sh"
printf 'EVIL\n' > "$TMP/outside.txt"
ln -s "$TMP/outside.txt" "$FS/evil.sh"
FH5="$(newhome 5)"
out5="$(HOME="$FH5" bash "$FS/install.sh" --claude 2>&1)"; rc5=$?
if [[ $rc5 -ne 0 && "$out5" == *"符号链接"* && ! -e "$FH5/.claude/skills/swarm-yuan" ]]; then
  ok "5a 源树外指链接被拒绝且零写入"
else
  bad "5a 外指链接未被拒绝（rc=${rc5}）"
fi
rm -f "$FS/evil.sh"
HOME="$FH5" bash "$FS/install.sh" --claude >/dev/null 2>&1; rc5b=$?
# GNU stat 优先（Linux CI），BSD/macOS 回退；旧顺序在 GNU 上把文件系统信息当 mode（CI 实证）。
mode5="$(stat -c '%a' "$FS/target.sh" 2>/dev/null || stat -f '%Lp' "$FS/target.sh" 2>/dev/null)"
if [[ $rc5b -eq 0 && "$mode5" == "644" ]]; then
  ok "5b 内部链接安装成功且 chmod 未跟随链接改到源文件（mode=${mode5}）"
else
  bad "5b chmod 跟随链接或安装失败（rc=${rc5b} mode=${mode5}）"
fi

FH5c="$(newhome 5c)"; mkdir -p "$FH5c/.claude/commands"
printf 'KEEP-OUTSIDE\n' > "$TMP/outside-cmd.md"
ln -s "$TMP/outside-cmd.md" "$FH5c/.claude/commands/swarm-yuan.md"
HOME="$FH5c" bash "$INSTALL" --claude >/dev/null 2>&1; rc5c=$?
if [[ $rc5c -eq 0 && ! -L "$FH5c/.claude/commands/swarm-yuan.md" \
      && "$(cat "$TMP/outside-cmd.md")" == "KEEP-OUTSIDE" \
      && -s "$FH5c/.claude/commands/swarm-yuan.md" ]]; then
  ok "5c 目标命令文件为符号链接时替换链接、不写穿目标"
else
  bad "5c 命令文件写入穿透了符号链接（rc=${rc5c}）"
fi

# ============================================================
# ⑥ hooks JSON 非法 → fail-closed（cursor/gemini/devin/codex）
# ============================================================
echo "[6] 非法 hooks JSON fail-closed"
SK6="$(make_skill "$TMP/sk6" demo6)"
for spec6 in "cursor:hooks.json" "gemini:settings.json" "windsurf:hooks.v1.json"; do
  tool6="${spec6%%:*}"
  PJ6="$TMP/pj6-$tool6"; mkdir -p "$PJ6"
  case "$tool6" in
    cursor)   mkdir -p "$PJ6/.cursor";      target6="$PJ6/.cursor/hooks.json" ;;
    gemini)   mkdir -p "$PJ6/.gemini";      target6="$PJ6/.gemini/settings.json" ;;
    windsurf) mkdir -p "$PJ6/.devin";       target6="$PJ6/.devin/hooks.v1.json" ;;
  esac
  printf '{"version": 1, "hooks": {' > "$target6"
  before6="$(cksum "$target6")"
  render_tool "$tool6" "$SK6" "$PJ6" project >/dev/null 2>&1; rc6=$?
  after6="$(cksum "$target6")"
  if [[ $rc6 -ne 0 && "$before6" == "$after6" ]]; then
    ok "6-${tool6} 非法 JSON 跳过且未写回"
  else
    bad "6-${tool6} 非法 JSON 被覆盖或未报错（rc=${rc6}）"
  fi
done
PJ6c="$TMP/pj6-codex"; mkdir -p "$PJ6c/.codex"
printf '{"hooks": {' > "$PJ6c/.codex/hooks.json"
before6c="$(cksum "$PJ6c/.codex/hooks.json")"
render_tool codex "$SK6" "$PJ6c" project >/dev/null 2>&1; rc6c=$?
after6c="$(cksum "$PJ6c/.codex/hooks.json")"
if [[ $rc6c -ne 0 && "$before6c" == "$after6c" ]]; then
  ok "6-codex 非法 JSON 跳过且未写回"
else
  bad "6-codex 非法 JSON 被覆盖或未报错（rc=${rc6c}）"
fi

# ============================================================
# ⑦ Cursor version:1（补缺失；保留用户已有值）
# ============================================================
echo "[7] Cursor version:1"
PJ7="$TMP/pj7"; mkdir -p "$PJ7"
render_tool cursor "$SK6" "$PJ7" project >/dev/null 2>&1
json_assert "$PJ7/.cursor/hooks.json" "d.get('version') == 1" "7a 新文件补 version:1"
PJ7b="$TMP/pj7b"; mkdir -p "$PJ7b/.cursor"
printf '{"version": 7, "hooks": {"preToolUse": []}}' > "$PJ7b/.cursor/hooks.json"
render_tool cursor "$SK6" "$PJ7b" project >/dev/null 2>&1
json_assert "$PJ7b/.cursor/hooks.json" "d.get('version') == 7" "7b 保留用户已有 version"

# ============================================================
# ⑧ Codex 用户级渲染返回 0（不误报失败）
# ============================================================
echo "[8] Codex 用户级 rc"
FH8="$(newhome 8)"; mkdir -p "$FH8/.codex/skills"
RHOME="$FH8" render_tool codex "$SK6" "$FH8" user demo6 >/dev/null 2>&1; rc8=$?
if [[ $rc8 -eq 0 && -f "$FH8/.codex/AGENTS.md" ]] \
   && grep -qF '<!-- >>> swarm-yuan:codex:demo6 >>>' "$FH8/.codex/AGENTS.md" \
   && [[ ! -e "$FH8/.codex/hooks.json" ]]; then
  ok "8a 用户级渲染 rc=0 且不写项目 hooks"
else
  bad "8a 用户级渲染 rc=${rc8} 或被误报失败"
fi

# ============================================================
# ⑨ 多技能共享 hooks（按技能合并）
# ============================================================
echo "[9] 多技能共享 hooks"
SKA="$(make_skill "$TMP/sk9a" alpha)"; SKB="$(make_skill "$TMP/sk9b" beta)"
PJ9="$TMP/pj9"; mkdir -p "$PJ9/.cursor"
printf '{"version": 1, "hooks": {"preToolUse": [{"command": "user-cmd", "matcher": "X"}], "sessionStart": [{"command": "keep-me"}]}}' > "$PJ9/.cursor/hooks.json"
render_tool cursor "$SKA" "$PJ9" project alpha >/dev/null 2>&1
render_tool cursor "$SKB" "$PJ9" project beta >/dev/null 2>&1
render_tool cursor "$SKA" "$PJ9" project alpha >/dev/null 2>&1
json_assert "$PJ9/.cursor/hooks.json" \
  "sum(1 for e in d['hooks']['preToolUse'] if '$SKA/scripts/spec-first-bridge.sh' in __import__('json').dumps(e)) == 1" \
  "9a 技能 A 条目恰 1（重复渲染幂等）"
json_assert "$PJ9/.cursor/hooks.json" \
  "sum(1 for e in d['hooks']['preToolUse'] if '$SKB/scripts/spec-first-bridge.sh' in __import__('json').dumps(e)) == 1" \
  "9b 技能 B 条目不被 A 吞并"
json_assert "$PJ9/.cursor/hooks.json" \
  "any('user-cmd' in __import__('json').dumps(e) for e in d['hooks']['preToolUse']) and any('keep-me' in __import__('json').dumps(e) for e in d['hooks']['sessionStart'])" \
  "9c 用户条目与未知事件保留"

PJ9c="$TMP/pj9c"; mkdir -p "$PJ9c/.codex"
printf '{"description": "user", "hooks": {"SessionStart": [{"matcher": "x", "hooks": [{"type": "command", "command": "user-hook"}]}]}}' > "$PJ9c/.codex/hooks.json"
render_tool codex "$SKA" "$PJ9c" project alpha >/dev/null 2>&1
render_tool codex "$SKB" "$PJ9c" project beta >/dev/null 2>&1
render_tool codex "$SKA" "$PJ9c" project alpha >/dev/null 2>&1
json_assert "$PJ9c/.codex/hooks.json" \
  "sum(1 for g in d['hooks']['PreToolUse'] for h in g.get('hooks', []) if '$SKA/scripts/codex-gate-wrapper.sh' in __import__('json').dumps(h)) == 1" \
  "9d Codex 技能 A 条目恰 1"
json_assert "$PJ9c/.codex/hooks.json" \
  "sum(1 for g in d['hooks']['PreToolUse'] for h in g.get('hooks', []) if '$SKB/scripts/codex-gate-wrapper.sh' in __import__('json').dumps(h)) == 1" \
  "9e Codex 技能 B 条目不被 A 吞并"
json_assert "$PJ9c/.codex/hooks.json" \
  "d.get('description') == 'user' and any('user-hook' in __import__('json').dumps(g) for g in d['hooks']['SessionStart'])" \
  "9f Codex 用户条目与未知事件保留"

# ============================================================
# ⑩ CRLF 的 AGENTS/GEMINI/Kimi config 标记块可更新
# ============================================================
echo "[10] CRLF 标记块更新"
FH10="$(newhome 10)"; mkdir -p "$FH10/.codex" "$FH10/.gemini" "$FH10/.kimi-code"
check_crlf_block() {  # <file> <open> <body> <desc>
  local f="$1" open="$2" newbody="$3" desc="$4"
  [[ "$(grep -Fc "$open" "$f" 2>/dev/null)" -eq 1 ]] || { bad "10 ${desc}: 开标记不是恰 1 个"; return; }
  grep -qF "$newbody" "$f" || { bad "10 ${desc}: 新正文未写入"; return; }
  ! grep -qF 'OLD-BODY' "$f" || { bad "10 ${desc}: 旧正文残留"; return; }
  grep -qF 'user-line' "$f" || { bad "10 ${desc}: 用户内容丢失"; return; }
  grep -q "$(printf '\r')" "$f" || { bad "10 ${desc}: CRLF 风格丢失"; return; }
  ok "10 ${desc}: 单块更新 + 用户内容/CRLF 保留"
}

codex_open='<!-- >>> swarm-yuan:codex:crlfskill >>> （由 generate-skill.sh --render-tools 维护，勿手改） -->'
printf 'user-line\r\n%s\r\nOLD-BODY\r\n<!-- <<< swarm-yuan:codex:crlfskill <<< -->\r\n' "$codex_open" > "$FH10/.codex/AGENTS.md"
printf 'NEW-BODY-CODEX\n' > "$TMP/body-crlf.md"
RHOME="$FH10" render_tool codex "$SK6" "$FH10" user "crlfskill" "$TMP/body-crlf.md" >/dev/null 2>&1
check_crlf_block "$FH10/.codex/AGENTS.md" "$codex_open" 'NEW-BODY-CODEX' 'AGENTS.md'
sum10a="$(cksum "$FH10/.codex/AGENTS.md")"
RHOME="$FH10" render_tool codex "$SK6" "$FH10" user "crlfskill" "$TMP/body-crlf.md" >/dev/null 2>&1
if [[ "$sum10a" == "$(cksum "$FH10/.codex/AGENTS.md")" ]]; then ok "10d AGENTS.md 二次渲染幂等"; else bad "10d AGENTS.md 二次渲染不幂等"; fi

gemini_open='<!-- >>> swarm-yuan:gemini:crlfskill >>> （由 generate-skill.sh --render-tools 维护，勿手改） -->'
printf 'user-line\r\n%s\r\nOLD-BODY\r\n<!-- <<< swarm-yuan:gemini:crlfskill <<< -->\r\n' "$gemini_open" > "$FH10/.gemini/GEMINI.md"
printf 'NEW-BODY-GEMINI\n' > "$TMP/body-crlf-g.md"
RHOME="$FH10" render_tool gemini "$SK6" "$FH10" user "crlfskill" "$TMP/body-crlf-g.md" >/dev/null 2>&1
check_crlf_block "$FH10/.gemini/GEMINI.md" "$gemini_open" 'NEW-BODY-GEMINI' 'GEMINI.md'

kimi_open='# >>> swarm-yuan:kimi:crlfskill >>> （由 generate-skill.sh --render-tools 维护，勿手改）'
printf 'user-line\r\n%s\r\nOLD-BODY\r\n# <<< swarm-yuan:kimi:crlfskill <<<\r\n' "$kimi_open" > "$FH10/.kimi-code/config.toml"
printf 'NEW-BODY-KIMI\n' > "$TMP/body-crlf-k.md"
RHOME="$FH10" render_tool kimi "$SK6" "$FH10" user "crlfskill" "$TMP/body-crlf-k.md" >/dev/null 2>&1
# Kimi 的 config.toml 标记块承载的是 [[hooks]]（用户级无 AGENTS 规则块），
# 断言块被原位更新为本次渲染的 bridge 命令，而不是残留 OLD-BODY。
check_crlf_block "$FH10/.kimi-code/config.toml" "$kimi_open" 'spec-first-bridge.sh' 'kimi config.toml'

# ============================================================
# ⑪ 安装备份只保留最近 3 份
# ============================================================
echo "[11] 备份保留最近 3 份"
FH11="$(newhome 11)"; DEST11="$FH11/.claude/skills/swarm-yuan"
mkdir -p "$DEST11"; printf 'old-install\n' > "$DEST11/old.txt"
for i in 1 2 3 4 5; do
  mkdir -p "${DEST11}.bak.100${i}"
  touch -t 202001010000.00 "${DEST11}.bak.100${i}"
done
HOME="$FH11" bash "$INSTALL" --claude >/dev/null 2>&1; rc11=$?
count11="$(find "$FH11/.claude/skills" -maxdepth 1 -type d -name 'swarm-yuan.bak.[0-9]*' 2>/dev/null | wc -l | tr -d ' ')"
if [[ $rc11 -eq 0 && "$count11" -eq 3 && -f "$DEST11/SKILL.md" ]]; then
  ok "11a 连续安装后备份恰 3 份（旧 5 份被清理）"
else
  bad "11a 备份数量=${count11}（期望 3，rc=${rc11}）"
fi

# ============================================================
# ⑫ 非法交互选择（0/99）报错退出且不打印“安装完成”
# ============================================================
echo "[12] 非法交互选择"
FH12="$(newhome 12)"; mkdir -p "$FH12/.claude/skills" "$FH12/.codex/skills"
for badchoice in 0 99; do
  outfile="$TMP/pty-$badchoice.out"
  HOME="$FH12" python3 "$TMP/ptyrun.py" "${badchoice}"$'\n' "$outfile" "选择安装目标" bash "$INSTALL" >/dev/null 2>&1; rc12=$?
  if [[ $rc12 -ne 0 ]] && ! tr -d '\r' < "$outfile" | grep -q '安装完成' \
     && [[ ! -e "$FH12/.claude/skills/swarm-yuan" ]]; then
    ok "12-${badchoice} 无效选择报错退出（rc=${rc12}）且无「安装完成」"
  else
    bad "12-${badchoice} 无效选择仍走成功路径（rc=${rc12}）"
  fi
done
outfile="$TMP/pty-valid.out"
HOME="$FH12" python3 "$TMP/ptyrun.py" '1'$'\n' "$outfile" "选择安装目标" bash "$INSTALL" >/dev/null 2>&1; rc12v=$?
if [[ $rc12v -eq 0 && -f "$FH12/.claude/skills/swarm-yuan/SKILL.md" \
      && ! -e "$FH12/.codex/skills/swarm-yuan" ]] \
   && tr -d '\r' < "$outfile" | grep -q '安装完成'; then
  ok "12c 合法选择 1 正常安装并输出「安装完成」"
else
  bad "12c 合法选择路径被破坏（rc=${rc12v}）"
fi

# ============================================================
# ⑬ Usage 含 --zcode
# ============================================================
echo "[13] Usage 补全"
out13="$(HOME="$FH1" bash "$INSTALL" --definitely-invalid 2>&1)"; rc13=$?
if [[ $rc13 -eq 1 && "$out13" == *"--zcode"* ]]; then
  ok "13a Usage 列出 --zcode"
else
  bad "13a Usage 缺 --zcode（rc=${rc13}）"
fi

# ============================================================
# ⑭ WSL HOME（静态断言；实机未验证）
# ============================================================
echo "[14] WSL HOME（静态）"
if grep -q 'wslpath -u' "$BASE/install.bat" \
   && grep -q 'HOME=!WSL_HOME!' "$BASE/install.bat" \
   && grep -q 'Git Bash' "$BASE/install.bat"; then
  ok "14a install.bat 用 wslpath 取 Windows HOME，失败时要求 Git Bash（Windows 实机未验证）"
else
  bad "14a install.bat WSL 分支缺 wslpath/HOME/回退提示"
fi

# ============================================================
# ⑮ R126：无 hooks 脚本的技能不渲染死命令（生成器自身布局=assets/hooks/ 的
#     404 注册面根治；诚实降级=跳过+披露）
# ============================================================
echo "[15] hooks 布局探测"
SK15="$TMP/sk15"; mkdir -p "$SK15/scripts"
printf -- '---\nname: demo15\ndescription: 测试技能 15\n---\n' > "$SK15/SKILL.md"
PJ15="$TMP/pj15"; mkdir -p "$PJ15"
out15="$(render_tool cursor "$SK15" "$PJ15" project 2>&1)"; rc15=$?
if [[ ! -e "$PJ15/.cursor/hooks.json" ]] && printf '%s' "$out15" | grep -q '如实披露，不写死命令'; then
  ok "15a 无 bridge 脚本：hooks 不注册 + 披露（旧版渲染 404 死命令）"
else
  bad "15a 无脚本仍渲染或缺披露 rc=${rc15}：$out15"
fi
# 15b：assets/hooks/ 布局（生成器自身形态）→ 探测命中并渲染真实路径
SK15b="$TMP/sk15b"; mkdir -p "$SK15b/assets/hooks"
printf -- '---\nname: demo15b\ndescription: 测试技能 15b\n---\n' > "$SK15b/SKILL.md"
printf '#!/usr/bin/env bash\nexit 0\n' > "$SK15b/assets/hooks/spec-first-bridge.sh"
PJ15b="$TMP/pj15b"; mkdir -p "$PJ15b"
render_tool cursor "$SK15b" "$PJ15b" project >/dev/null 2>&1
if [[ -f "$PJ15b/.cursor/hooks.json" ]] \
   && grep -qF "$SK15b/assets/hooks/spec-first-bridge.sh" "$PJ15b/.cursor/hooks.json"; then
  ok "15b assets/hooks 布局探测命中（生成器自身安装面不再 404）"
else
  bad "15b assets/hooks 布局未命中: $(cat "$PJ15b/.cursor/hooks.json" 2>/dev/null)"
fi
# 15c：OpenCode 插件含 bun $ 导入（旧版裸用 $ 无 import，首次触发 ReferenceError）
SK15c="$(make_skill "$TMP/sk15c" demo15c)"; PJ15c="$TMP/pj15c"; mkdir -p "$PJ15c"
render_tool opencode "$SK15c" "$PJ15c" project >/dev/null 2>&1
if [[ -f "$PJ15c/.opencode/plugins/swarm-yuan-spec-first.js" ]] \
   && grep -q 'import { \$ } from "bun"' "$PJ15c/.opencode/plugins/swarm-yuan-spec-first.js"; then
  ok "15c OpenCode 插件含 bun \$ import"
else
  bad "15c 插件缺 bun import: $(head -8 "$PJ15c/.opencode/plugins/swarm-yuan-spec-first.js" 2>/dev/null)"
fi
# 15d：SHA256SUMS 覆盖安装器自身（供应链完整性链不在入口断环）
if grep -q 'install-offline.sh install-offline.bat README-OFFLINE.md' "$BASE/scripts/make-offline-bundle.sh"; then
  ok "15d SHA256SUMS 覆盖安装器三件套"
else
  bad "15d SHA256SUMS 未覆盖安装器"
fi
# 15e：user 级渲染宿主存在性守卫（未安装宿主不写配置）+ 批量安装故障隔离
if grep -q 'ta_tool_home()' "$TA_DIR/common.sh" \
   && grep -q 'user 级渲染跳过' "$TA_DIR/common.sh"; then
  ok "15e user 级渲染宿主存在性守卫在位"
else
  bad "15e 缺宿主存在性守卫"
fi
if grep -q 'install_all_found()' "$BASE/install.sh" \
   && grep -q '批量安装汇总' "$BASE/install.sh"; then
  ok "15f 批量安装故障隔离+汇总在位"
else
  bad "15f 缺 install_all_found 故障隔离"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "test-r118-install-hardening: PASS"
else
  echo "test-r118-install-hardening: FAIL" >&2
fi
exit $FAIL
