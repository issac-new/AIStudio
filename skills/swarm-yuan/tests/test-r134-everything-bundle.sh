#!/usr/bin/env bash
# test-r134-everything-bundle.sh — everything 全量零降级离线包能力锁
# 背景（R134，用户指令「离线安装所有的全量，不允许任何降级及丢失」）：
#   ① --with-docs：仓库 docs/ 档案随包（包根 docs/，离线环境无 GitHub 也可读）；
#   ② --with-github-src：gstack/superpowers/ECC 源码包内嵌 vendor/github/（MIT；
#      release-src-packages.sh --no-upload 本地产出，SRC-PINS.txt 记钉定 SHA）；
#   ③ install-offline.sh --with-github：按 self-check install_from_src_release 同语义安装
#      （gstack→~/.claude/skills + ./setup --no-browser；superpowers/ECC→~/.claude/plugins）；
#   ④ --with-knowledge：vendor-knowledge 复制进已装技能目录（支付 profile 离线生成可用）。
# 夹具：file:// 本地 git 仓三件（SWARM_YUAN_SRC_URL_* 覆盖，无网络）；bun/npm 与技能安装全桩。
set -uo pipefail
SWARM_YUAN_HOME="$(cd "$(dirname "${0}")/.." && pwd)"
SWARM_YUAN_SOURCE_ROOT="$(cd "$SWARM_YUAN_HOME/../.." && pwd)"
cd "$SWARM_YUAN_HOME" || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

T="$(mktemp -d /tmp/r134t.XXXXXX)"

# 夹具源仓（gstack 带 setup 脚本）+ 钉定覆写（env 优先于 scripts/src-pins.conf——夹具无真上游 SHA）
_FIXPINS=""
for n in gstack superpowers ecc; do
  D="$T/src/$n"; mkdir -p "$D"
  ( cd "$D" && git init -q && git config user.email t@t && git config user.name t \
    && printf 'MIT fixture\n' > LICENSE && printf 'marker-%s\n' "$n" > MARKER \
    && { [[ "$n" == gstack ]] && { printf '#!/usr/bin/env bash\ntouch setup-ran\n' > setup; chmod +x setup; } || true; } \
    && git add -A && git commit -qm fixture )
  _FIXPINS="${_FIXPINS} ${n}=$(git -C "$D" rev-parse HEAD)"
done
export SWARM_YUAN_SRC_PINS="${_FIXPINS# }"

# 构建：--no-vendor（不联网拉 npm/pip）+ --with-vendor(knowledge) + --with-docs + --with-github-src
OUT="$T/out"
if SWARM_YUAN_SRC_URL_GSTACK="file://$T/src/gstack" \
   SWARM_YUAN_SRC_URL_SUPERPOWERS="file://$T/src/superpowers" \
   SWARM_YUAN_SRC_URL_ECC="file://$T/src/ecc" \
   bash scripts/make-offline-bundle.sh "$OUT" --no-vendor --with-vendor --with-docs --with-github-src >"$T/build.log" 2>&1; then
  ok "态1 构建成功（knowledge+docs+github-src，无 npm/pip 联网）"
else
  bad "态1 构建失败：$(tail -3 "$T/build.log" | tr '\n' ' ')"
fi
BD="$(find "$OUT" -maxdepth 1 -type d -name 'swarm-yuan-offline-*' | head -1)"

[[ -f "$BD/vendor/github/gstack-src.zip" && -f "$BD/vendor/github/superpowers-src.zip" && -f "$BD/vendor/github/ecc-src.zip" && -f "$BD/vendor/github/SRC-PINS.txt" ]] \
  && ok "态2 三源码包 + SRC-PINS.txt 内嵌" || bad "态2 源码包缺件：$(ls "$BD/vendor/github" 2>/dev/null | tr '\n' ' ')"
_ghok=$(awk -F'\t' 'NR>1 && $2=="github" && $5=="ok"' "$BD/vendor/vendor-status.tsv" | wc -l | tr -d ' ')
[[ "${_ghok:-0}" -eq 3 ]] && ok "态3 对账表 github 行 3 条=ok（内嵌源码包）" || bad "态3 github ok 行数=${_ghok:-0}"
[[ -d "$BD/docs" ]] && [[ "$(find "$BD/docs" -type f | wc -l | tr -d ' ')" -gt 20 ]] \
  && ok "态4 docs/ 档案随包（包根）" || bad "态4 docs/ 未随包"
grep -q '[[:space:]]docs/' "$BD/SHA256SUMS" && grep -q 'vendor/github/gstack-src.zip' "$BD/SHA256SUMS" \
  && ok "态5 SHA256SUMS 覆盖 docs 与 github 源码包" || bad "态5 校验和未覆盖新资产"
[[ -d "$BD/swarm-yuan/vendor-knowledge" ]] && ok "态6 vendor-knowledge 随包（--with-vendor）" || bad "态6 vendor-knowledge 缺"

# 安装器实跑（桩：bun 存在→跳过 npm；npm 备位；技能安装桩建目录）
if [[ -n "$BD" ]]; then
  SB="$T/stubs"; mkdir -p "$SB"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$SB/bun"; chmod +x "$SB/bun"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$SB/npm"; chmod +x "$SB/npm"
  printf '#!/usr/bin/env bash\nfor _h in .zcode .hermes .dsh; do mkdir -p "$HOME/$_h/skills/swarm-yuan"; touch "$HOME/$_h/skills/swarm-yuan/SKILL.md"; done\necho ok\n' > "$BD/swarm-yuan/install.sh"; chmod +x "$BD/swarm-yuan/install.sh"
  _h=$(shasum -a 256 "$BD/swarm-yuan/install.sh" 2>/dev/null | awk '{print $1}')
  awk -v h="$_h" 'BEGIN{OFS="  "} $2=="swarm-yuan/install.sh"{$1=h} {print}' "$BD/SHA256SUMS" > "$BD/.sums" && mv "$BD/.sums" "$BD/SHA256SUMS"
  H="$T/home"; mkdir -p "$H"
  ( cd "$BD" && HOME="$H" PATH="$SB:$PATH" bash install-offline.sh --minimal --zcode --with-github --with-knowledge ) >"$T/inst.log" 2>&1
  _rc=$?
  [[ $_rc -eq 0 ]] && ok "态7 --minimal 显式路径安装 rc 0（--minimal=关一键默认）" || bad "态7 rc=${_rc}：$(tail -3 "$T/inst.log" | tr '\n' ' ')"
  [[ -f "$H/.claude/skills/gstack/MARKER" && -f "$H/.claude/skills/gstack/setup-ran" ]] \
    && ok "态8 gstack 装入 ~/.claude/skills 且 setup --no-browser 已执行" || bad "态8 gstack 未装/未跑 setup"
  [[ -f "$H/.claude/plugins/superpowers/MARKER" && -f "$H/.claude/plugins/ecc/MARKER" ]] \
    && ok "态9 superpowers/ECC 装入 ~/.claude/plugins" || bad "态9 plugins 未装"
  [[ -f "$H/.zcode/skills/swarm-yuan/vendor-knowledge/MANIFEST.md" ]] \
    && ok "态10 vendor-knowledge 入驻已装技能目录（--with-knowledge）" || bad "态10 knowledge 未入驻"
fi

# 态11：hermes/dsh/ccswitch 三安装目标（用户指令：三工具用户级目录或 cc-switch 统一库）
H2="$T/h2"; mkdir -p "$H2/.hermes" "$H2/.dsh" "$H2/.cc-switch"
_ok3=0
for _f in --hermes --dsh --ccswitch; do
  HOME="$H2" bash scripts/../install.sh "$_f" >/dev/null 2>&1 || true
done
for _d in "$H2/.hermes/skills/swarm-yuan/SKILL.md" "$H2/.dsh/skills/swarm-yuan/SKILL.md" "$H2/.cc-switch/skills/swarm-yuan/SKILL.md"; do
  [[ -f "$_d" ]] && _ok3=$((_ok3+1))
done
[[ "$_ok3" -eq 3 ]] && ok "态11 hermes/dsh/ccswitch 三目标实体安装（--list/--all 已纳检测）" || bad "态11 三目标缺件（${_ok3}/3）"
grep -q -- '--hermes|--dsh|--ccswitch' "$BD/install-offline.sh" 2>/dev/null \
  && ok "态12 离线安装器透传三新宿主旗标" || bad "态12 离线安装器未透传新旗标"

# 态13（审计 R1 锁）：无 gh / gh 不可用时 --no-upload 仍可本地打包
SBG="$T/sbg"; mkdir -p "$SBG"; printf '#!/usr/bin/env bash\nexit 1\n' > "$SBG/gh"; chmod +x "$SBG/gh"
if PATH="$SBG:$PATH" SWARM_YUAN_SRC_URL_GSTACK="file://$T/src/gstack" SWARM_YUAN_SRC_URL_SUPERPOWERS="file://$T/src/superpowers" \
   SWARM_YUAN_SRC_URL_ECC="file://$T/src/ecc" bash scripts/release-src-packages.sh --no-upload --out "$T/srcout" >"$T/src.log" 2>&1 \
   && [[ -f "$T/srcout/gstack-src.zip" ]]; then
  ok "态13 gh 不可用时 --no-upload 本地打包成功（审计 R1）"
else
  bad "态13 --no-upload 仍依赖 gh：$(tail -2 "$T/src.log" | tr '\n' ' ')"
fi
# 态14（审计 R7 锁）：文件名含连续双空格的校验和解析保真
if [[ -n "$BD" ]]; then
  printf 'x\n' > "$BD/swarm-yuan/dbl  space.md"
  _hd=$(shasum -a 256 "$BD/swarm-yuan/dbl  space.md" | awk '{print $1}')
  printf '%s  %s\n' "$_hd" "swarm-yuan/dbl  space.md" >> "$BD/SHA256SUMS"
  ( cd "$BD" && HOME="$T/h3" PATH="$SB:$PATH" bash install-offline.sh --minimal --zcode ) >"$T/dbl.log" 2>&1
  grep -q '校验通过' "$T/dbl.log" && ok "态14 双空格文件名校验保真（审计 R7）" || bad "态14 双空格文件名被截断：$(grep -E '缺文件|校验失败' "$T/dbl.log" | head -1)"
fi

# 态15（R139）：一键默认空检测回落通用安装 + 缺 node/npm 披露式跳过（诚实降级）
# 桩 install.sh（态7 换入）对 --list 只回 ok 无 ✅ → 模拟零宿主机器；
# SB2 只放 python3 成功桩（pip 段静默过）不放 npm → 模拟缺 node/npm。
if [[ -n "$BD" ]]; then
  SB2="$T/sb2"; mkdir -p "$SB2"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$SB2/python3"; chmod +x "$SB2/python3"
  H4="$T/h4"; mkdir -p "$H4"
  ( cd "$BD" && HOME="$H4" PATH="$SB2:/usr/bin:/bin" bash install-offline.sh ) >"$T/inst15.log" 2>&1; _rc15=$?
  [[ $_rc15 -eq 0 ]] && ok "态15 一键默认空检测整包 rc 0（回落通用安装而非中止）" || bad "态15 rc=${_rc15}：$(tail -3 "$T/inst15.log" | tr '\n' ' ')"
  grep -q '回落通用安装' "$T/inst15.log" && ok "态15b 空检测回落文案在位" || bad "态15b 未回落（仍 --all 空检测中止）"
  grep -q '缺 node/npm' "$T/inst15.log" && ok "态15c 缺 npm 披露式跳过（不计 FAIL）" || bad "态15c 缺 npm 处理不符"
  [[ -f "$H4/.zcode/skills/swarm-yuan/SKILL.md" ]] && ok "态15d 技能本体经回落通道装入（桩标记）" || bad "态15d 技能未装"
fi

# 态16：未显式给输出目录时，默认 dist 归当前源码仓根，而不是旧的 skills/ 父目录。
DF="$T/default-layout"
mkdir -p "$DF/skills/swarm-yuan/scripts"
cp scripts/make-offline-bundle.sh scripts/offline-manifest.conf "$DF/skills/swarm-yuan/scripts/"
printf '# fixture skill\n' > "$DF/skills/swarm-yuan/SKILL.md"
printf '#!/usr/bin/env bash\nexit 0\n' > "$DF/skills/swarm-yuan/install.sh"
SWARM_YUAN_DIR="$DF/skills/swarm-yuan" bash "$DF/skills/swarm-yuan/scripts/make-offline-bundle.sh" --no-vendor >"$T/default-layout.log" 2>&1
_rc16=$?
if [[ $_rc16 -eq 0 && -d "$DF/dist" && ! -e "$DF/skills/dist" ]]; then
  ok '态16 默认离线包输出到 SWARM_YUAN_SOURCE_ROOT/dist'
else
  bad "态16 默认输出目录漂移（rc=${_rc16}）：$(tail -2 "$T/default-layout.log" | tr '\n' ' ')"
fi

rm -rf "$T"
if [[ "$FAIL" -eq 0 ]]; then
  echo "test-r134-everything-bundle: 全部通过"
  exit 0
else
  echo "test-r134-everything-bundle: 存在失败" >&2
  exit 1
fi
