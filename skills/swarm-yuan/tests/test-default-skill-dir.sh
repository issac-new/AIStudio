#!/usr/bin/env bash
# test-default-skill-dir.sh — 安装/落盘目录默认值守门（2026-11-09 用户裁定统一家级 ~/.agents/skills）
# 锁两层默认：swarm-yuan 自身安装默认 ~/.agents/skills（--agents 显式 + auto 无论检测到几个宿主）；
# 生成研发技能默认家级 ~/.agents/skills（空项目兜底；存量项目内 skills 目录复用不迁移；
# 家级 legacy ~/.zcode/skills/<name> 原位续命）。口径沿革：2026-10-29 项目内 .agents/skills →
# 2026-11-09 家级统一（跨工具单副本，zcode 原生发现根）。
# 防复发面：默认值回退到 .claude/skills 或项目内、auto 按宿主分流、家级 legacy 升级失联、
# 或产物内部引用与落盘目录脱节（SKILLS_PATH_REWRITE 自动推导失效）时本测试当场红。
# 安全约束：安装与生成断言全部在 mktemp 伪造 HOME 下执行，绝不触碰真实 ~/.agents 与 ~/.zcode。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
GEN="$BASE/scripts/generate-skill.sh"
INSTALL="$BASE/install.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/defsd.XXXXXX")"
trap 'rm -rf "${TMP}"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

mkproj() {  # $1=dir
  mkdir -p "$1/src"
  printf '[package]\nname = "svc"\nversion = "0.1.0"\nedition = "2021"\n' > "$1/Cargo.toml"
  printf 'fn main() {}\n' > "$1/src/main.rs"
}

# ===== ① 生成默认落点：空项目 + 空假 HOME → 家级 ~/.agents/skills（新建兜底）=====
FH1="$TMP/fh1"; mkdir -p "$FH1"
P1="$TMP/fresh-proj"; mkproj "$P1"
HOME="$FH1" bash "$GEN" --profile lite defsd-fresh "$P1" >/dev/null 2>&1
if [[ -f "$FH1/.agents/skills/defsd-fresh/SKILL.md" ]]; then
  ok "①a 空项目默认落家级 ~/.agents/skills"
else
  bad "①a 空项目未落家级 ~/.agents/skills（默认回退？）：home=$(ls "$FH1" 2>/dev/null | tr '\n' ' ') proj=$(ls "$P1" 2>/dev/null | tr '\n' ' ')"
fi
[[ ! -d "$P1/.agents" && ! -d "$P1/.claude" ]] && ok "①b 项目内未创建任何 skills 目录" || bad "①b 项目内意外出现 skills 目录"

# ===== ② 家级目标不推导重写 + 项目级显式 target-dir 仍推导 =====
_gw="$FH1/.agents/skills/defsd-fresh/scripts/gates-strict.sh"
if [[ -f "$_gw" ]] && grep -q '\.claude/skills' "$_gw"; then
  ok "②a 家级产物保留 .claude/skills 兜底字面量（不推导重写，靠多根探测）"
else
  bad "②a 家级产物缺失 .claude/skills 兜底字面量（被意外重写？）"
fi
FH2="$TMP/fh2"; mkdir -p "$FH2"
P2="$TMP/proj-explicit"; mkproj "$P2"
_out2="$(HOME="$FH2" bash "$GEN" --profile lite defsd-proj "$P2" "$P2/.agents/skills" 2>&1)"
_gw2="$P2/.agents/skills/defsd-proj/scripts/gates-strict.sh"
if [[ -f "$_gw2" ]] && grep -q '\.agents/skills' "$_gw2" && [[ "$_out2" == *"自动应用路径重写"* ]]; then
  ok "②b 项目内显式 target-dir 自动推导重写仍生效"
else
  bad "②b 项目级落盘重写失效"
fi

# ===== ③ 存量兼容：项目内已有 .claude/skills → 复用不迁移 =====
FH3="$TMP/fh3"; mkdir -p "$FH3"
P3="$TMP/legacy-proj"; mkproj "$P3"; mkdir -p "$P3/.claude/skills"
HOME="$FH3" bash "$GEN" --profile lite defsd-legacy "$P3" >/dev/null 2>&1
if [[ -f "$P3/.claude/skills/defsd-legacy/SKILL.md" && ! -d "$FH3/.agents" ]]; then
  ok "③ 存量项目内 .claude/skills 复用、不新建家级"
else
  bad "③ 存量项目落点漂移（应复用项目内 .claude/skills）"
fi

# ===== ④ 双目录并存：项目内探测序 .agents 优先 =====
FH4="$TMP/fh4"; mkdir -p "$FH4"
P4="$TMP/dual-proj"; mkproj "$P4"; mkdir -p "$P4/.claude/skills" "$P4/.agents/skills"
HOME="$FH4" bash "$GEN" --profile lite defsd-dual "$P4" >/dev/null 2>&1
[[ -f "$P4/.agents/skills/defsd-dual/SKILL.md" ]] && ok "④ 项目内双目录并存时 .agents/skills 优先" || bad "④ 双目录并存未优先 .agents/skills"

# ===== ⑤ 家级正位命中：~/.agents/skills/<name> 已存在 → 原位（upgrade 不失联）=====
FH5="$TMP/fh5"; mkdir -p "$FH5"
mkproj "$TMP/seed-proj"
HOME="$FH5" bash "$GEN" --profile lite defsd-home "$TMP/seed-proj" "$FH5/.agents/skills" >/dev/null 2>&1
P5="$TMP/home-hit-proj"; mkproj "$P5"
_out5="$(HOME="$FH5" bash "$GEN" --upgrade defsd-home "$P5" 2>&1)"
if [[ "$_out5" == *"$FH5/.agents/skills"* && -f "$FH5/.agents/skills/defsd-home/SKILL.md" ]]; then
  ok "⑤ 家级 ~/.agents/skills/<name> 命中，upgrade 原位"
else
  bad "⑤ 家级命中失效（目标目录解析漂移）：$(printf '%s' "$_out5" | grep '目标 skill 目录' | head -1)"
fi

# ===== ⑥ 家级 legacy 续命：~/.zcode/skills/<name> 已存在 → 原位＋迁移建议 =====
FH6="$TMP/fh6"; mkdir -p "$FH6"
mkproj "$TMP/seed-proj2"
HOME="$FH6" bash "$GEN" --profile lite defsd-lg "$TMP/seed-proj2" "$FH6/.zcode/skills" >/dev/null 2>&1
P6="$TMP/legacy-home-proj"; mkproj "$P6"
_out6="$(HOME="$FH6" bash "$GEN" --upgrade defsd-lg "$P6" 2>&1)"
if [[ "$_out6" == *"$FH6/.zcode/skills"* && "$_out6" == *"legacy 家级安装"* ]]; then
  ok "⑥ 家级 legacy ~/.zcode/skills/<name> 原位续命＋迁移建议"
else
  bad "⑥ legacy 续命失效：$(printf '%s' "$_out6" | grep -E '目标 skill 目录|legacy' | head -2 | tr '\n' ' ')"
fi

# ===== ⑦ 安装 --agents：伪造 HOME 实装卸（沙箱）＋ zcode 交叉渲染 =====
FH7="$TMP/fake-home7"; mkdir -p "$FH7/.zcode"
if HOME="$FH7" bash "$INSTALL" --agents </dev/null >/dev/null 2>&1 && [[ -f "$FH7/.agents/skills/swarm-yuan/SKILL.md" ]]; then
  ok "⑦a install --agents 装到伪造 HOME 的 ~/.agents/skills"
else
  bad "⑦a --agents 安装未落 ~/.agents/skills"
fi
_zc_ag="$FH7/.zcode/AGENTS.md"
# 断言路径取归一形态：渲染正文写的是 cd+pwd 绝对化路径（TMPDIR 尾斜杠的 `T//` 被折叠），
# 而 HOME 保持原串注入——顺带持续覆盖 ta_is_user_level 的 HOME 归一化健壮性。
_n_path="$(cd "$FH7" && pwd)/.agents/skills/swarm-yuan"
if [[ -f "$_zc_ag" ]] && grep -q 'swarm-yuan:zcode:swarm-yuan' "$_zc_ag" \
   && grep -q "$_n_path" "$_zc_ag"; then
  ok "⑦b agents 安装交叉渲染 zcode 块（家级路径入 AGENTS.md）"
else
  bad "⑦b agents→zcode 交叉渲染缺失（zcode 集成块未指向 ~/.agents）"
fi
HOME="$FH7" bash "$INSTALL" --uninstall --agents </dev/null >/dev/null 2>&1
_arc="$(ls -d "$FH7/.agents/skills"/swarm-yuan.uninstalled.* 2>/dev/null | head -1 || true)"
if [[ ! -d "$FH7/.agents/skills/swarm-yuan" && -n "$_arc" ]]; then
  ok "⑦c 卸载存档移除（uninstalled.* 存档在）"
else
  bad "⑦c 卸载未按存档语义移除"
fi
if [[ ! -f "$_zc_ag" ]] || ! grep -q 'swarm-yuan:zcode:swarm-yuan' "$_zc_ag"; then
  ok "⑦d 卸载时 zcode 交叉渲染块同步注销"
else
  bad "⑦d 卸载后 zcode 块残留"
fi

# ===== ⑧ auto 空宿主兜底：伪造 HOME + 缩窄 PATH（剥离宿主 CLI）→ 装 ~/.agents/skills =====
# 判据含「CLI 在 PATH」，真实机器 PATH 恒有宿主 CLI——须同时缩窄 PATH 才能构造空宿主形态。
FH8="$TMP/fake-home8"; mkdir -p "$FH8"
if HOME="$FH8" PATH="/usr/bin:/bin" bash "$INSTALL" </dev/null >/dev/null 2>&1 && [[ -f "$FH8/.agents/skills/swarm-yuan/SKILL.md" ]]; then
  ok "⑧ auto 空宿主兜底装 ~/.agents/skills"
else
  bad "⑧ auto 空宿主兜底未落 ~/.agents/skills"
fi

# ===== ⑨ auto 检测到宿主仍统一家级（2026-11-09 起不分流）=====
FH9="$TMP/fake-home9"; mkdir -p "$FH9/.zcode"
if HOME="$FH9" PATH="/usr/bin:/bin" bash "$INSTALL" </dev/null >/dev/null 2>&1 \
   && [[ -f "$FH9/.agents/skills/swarm-yuan/SKILL.md" && ! -e "$FH9/.zcode/skills/swarm-yuan" ]]; then
  ok "⑨ auto 检测到 zcode 宿主仍统一装 ~/.agents/skills（不分流）"
else
  bad "⑨ auto 被宿主检测分流（应统一家级）"
fi

if [[ "$FAIL" -eq 0 ]]; then echo "PASS test-default-skill-dir"; else echo "FAIL test-default-skill-dir"; exit 1; fi
