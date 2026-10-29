#!/usr/bin/env bash
# test-default-skill-dir.sh — 安装/落盘目录默认值守门（2026-10-29 对齐 Agent Skills 开放标准）
# 锁两层默认：swarm-yuan 自身安装默认 ~/.agent/skills（--agent 显式 + auto 空宿主兜底）；
# 生成研发技能默认项目内 .agent/skills（探测序首位 + 新建兜底；存量 .claude/skills 复用不迁移）。
# 防复发面：默认值回退到 .claude/skills、或产物内部引用与落盘目录脱节（SKILLS_PATH_REWRITE
# 自动推导失效）时本测试当场红。
# 安全约束：安装断言全部在 mktemp 伪造 HOME 下执行，绝不触碰真实 ~/.agent。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
GEN="$BASE/scripts/generate-skill.sh"
INSTALL="$BASE/install.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/defsd.XXXXXX")"
trap 'rm -rf "${TMP}"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# ===== ① 生成默认落点：空项目 → .agent/skills（新建兜底）=====
P1="$TMP/fresh-proj"; mkdir -p "$P1/src"
printf '[package]\nname = "svc"\nversion = "0.1.0"\nedition = "2021"\n' > "$P1/Cargo.toml"
printf 'fn main() {}\n' > "$P1/src/main.rs"
bash "$GEN" --profile lite defsd-fresh "$P1" >/dev/null 2>&1
if [[ -f "$P1/.agent/skills/defsd-fresh/SKILL.md" ]]; then
  ok "①a 空项目默认落 .agent/skills"
else
  bad "①a 空项目未落 .agent/skills（默认回退？）: $(ls "$P1" 2>/dev/null | tr '\n' ' ')"
fi
[[ ! -d "$P1/.claude/skills" ]] && ok "①b 未额外创建 .claude/skills" || bad "①b 意外创建了 .claude/skills"

# ===== ② 产物内部引用与落盘目录一致（自动推导 SKILLS_PATH_REWRITE）=====
_gw="$P1/.agent/skills/defsd-fresh/scripts/gates-strict.sh"
if [[ -f "$_gw" ]] && grep -q '\.agent/skills' "$_gw" && ! grep -qE "grep -vE '\^\(\\\.claude/skills/" "$_gw"; then
  ok "② 产物 gates 豁免引用已按 .agent/skills 改写"
else
  bad "② 产物内部仍引用 .claude/skills（自动重写失效）"
fi

# ===== ③ 存量兼容：已有 .claude/skills → 复用不迁移 =====
P2="$TMP/legacy-proj"; mkdir -p "$P2/src" "$P2/.claude/skills"
printf '[package]\nname = "svc"\nversion = "0.1.0"\nedition = "2021"\n' > "$P2/Cargo.toml"
printf 'fn main() {}\n' > "$P2/src/main.rs"
bash "$GEN" --profile lite defsd-legacy "$P2" >/dev/null 2>&1
if [[ -f "$P2/.claude/skills/defsd-legacy/SKILL.md" && ! -d "$P2/.agent/skills" ]]; then
  ok "③ 存量 .claude/skills 复用、未新建 .agent/skills"
else
  bad "③ 存量项目落点漂移（应复用 .claude/skills）"
fi

# ===== ④ 双目录并存：探测序 .agent 优先 =====
P3="$TMP/dual-proj"; mkdir -p "$P3/src" "$P3/.claude/skills" "$P3/.agent/skills"
printf '[package]\nname = "svc"\nversion = "0.1.0"\nedition = "2021"\n' > "$P3/Cargo.toml"
printf 'fn main() {}\n' > "$P3/src/main.rs"
bash "$GEN" --profile lite defsd-dual "$P3" >/dev/null 2>&1
[[ -f "$P3/.agent/skills/defsd-dual/SKILL.md" ]] && ok "④ 双目录并存时 .agent/skills 优先" || bad "④ 双目录并存未优先 .agent/skills"

# ===== ⑤ 安装 --agent：伪造 HOME 实装卸（沙箱）=====
FH="$TMP/fake-home"; mkdir -p "$FH"
if HOME="$FH" bash "$INSTALL" --agent </dev/null >/dev/null 2>&1 && [[ -f "$FH/.agent/skills/swarm-yuan/SKILL.md" ]]; then
  ok "⑤a install --agent 装到伪造 HOME 的 ~/.agent/skills"
else
  bad "⑤a --agent 安装未落 ~/.agent/skills"
fi
HOME="$FH" bash "$INSTALL" --uninstall --agent </dev/null >/dev/null 2>&1
_arc="$(ls -d "$FH/.agent/skills"/swarm-yuan.uninstalled.* 2>/dev/null | head -1 || true)"
if [[ ! -d "$FH/.agent/skills/swarm-yuan" && -n "$_arc" ]]; then
  ok "⑤b 卸载存档移除（uninstalled.* 存档在）"
else
  bad "⑤b 卸载未按存档语义移除"
fi

# ===== ⑥ auto 空宿主兜底：伪造 HOME + 缩窄 PATH（剥离宿主 CLI）→ 装 ~/.agent/skills =====
# 判据含「CLI 在 PATH」，真实机器 PATH 恒有宿主 CLI——须同时缩窄 PATH 才能构造空宿主形态。
FH2="$TMP/fake-home2"; mkdir -p "$FH2"
if HOME="$FH2" PATH="/usr/bin:/bin" bash "$INSTALL" </dev/null >/dev/null 2>&1 && [[ -f "$FH2/.agent/skills/swarm-yuan/SKILL.md" ]]; then
  ok "⑥ auto 空宿主兜底装 ~/.agent/skills"
else
  bad "⑥ auto 空宿主兜底未落 ~/.agent/skills"
fi

if [[ "$FAIL" -eq 0 ]]; then echo "PASS test-default-skill-dir"; else echo "FAIL test-default-skill-dir"; exit 1; fi
