#!/usr/bin/env bash
# test-r133-offline-complete.sh — R133 完整离线包能力锁
# 背景：用户目标环境「仅可使用 pip 及 npm」（npm/pip 源可达，GitHub 不可达）。三项能力：
#   ① comet 由 github 通道切 npm scoped 真包 @rpamis/comet——全部功能运行时可经 npm/pip 源安装
#     （github 通道仅剩 superpowers/gstack 方法论引用，无需安装）；
#   ② install-offline.sh 两层安装：本地 vendor 包优先 → 未随包/失败条目自动经目标机 npm/pip 源安装
#     （--no-vendor 包=全部走源；旧版只打印提示命令不动手）；
#   ③ 版本溯源随包 .bundle-version——离线包无 .git，install.sh --version 与安装记录不再落 unknown。
# 锁矩阵：态1 清单通道 ｜ 态2 novendor 构建产物（版本文件/对账表/安装器语法/校验和覆盖）
# ｜ 态3 安装器走源实跑（PATH 桩 npm/python3 逐 spec 断言）｜ 态4 --version 版本兜底。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

M="$PWD/scripts/offline-manifest.conf"

# 态1 清单通道：comet=npm scoped；github 仅剩两行方法论引用
if grep -q '^comet|npm|@rpamis/comet@' "$M"; then
  ok "态1a comet 走 npm scoped 真包（@rpamis/comet）"
else
  bad "态1a comet 通道未切 npm：$(grep '^comet|' "$M" | cut -c1-60)"
fi
_gh=$(grep -c '|github|' "$M")
if [[ "$_gh" -eq 3 ]] && grep -q '^superpowers|github|' "$M" && grep -q '^gstack|github|' "$M" && grep -q '^ecc|github|' "$M"; then
  ok "态1b github 通道仅剩 superpowers/gstack/ecc（方法论引用，无需安装；R134 起 ecc 入清单）"
else
  bad "态1b github 行数=${_gh}（预期 2）"
fi

# 态2 novendor 构建（离线快路径：不 npm pack 不 pip download）
T="$(mktemp -d /tmp/r133b.XXXXXX)"
bash scripts/make-offline-bundle.sh "$T" --no-vendor >"$T/build.log" 2>&1
_zip="$(ls "$T"/*.zip 2>/dev/null | head -1)"
BD="${_zip%.zip}"
if [[ -d "$BD" ]]; then ok "态2a novendor 构建成功"; else bad "态2a 构建失败：$(tail -3 "$T/build.log" | tr '\n' ' ')"; fi
if [[ -f "$BD/swarm-yuan/.bundle-version" ]] && grep -q '^version=v' "$BD/swarm-yuan/.bundle-version"; then
  ok "态2b .bundle-version 随包（$(sed -n 's/^version=//p' "$BD/swarm-yuan/.bundle-version" | head -1)）"
else
  bad "态2b 缺 .bundle-version 或无 version= 行"
fi
_nsk=$(awk -F'\t' 'NR>1 && ($2=="npm"||$2=="pip") && $5=="skipped"' "$BD/vendor/vendor-status.tsv" | wc -l | tr -d ' ')
_ghx=$(awk -F'\t' 'NR>1 && $2=="github" && $5=="-excluded"' "$BD/vendor/vendor-status.tsv" | wc -l | tr -d ' ')
if [[ "$_nsk" -eq 10 && "$_ghx" -eq 3 ]]; then
  ok "态2c 对账表：npm/pip skipped 10 行（含 comet）+ github excluded 3 行"
else
  bad "态2c 对账表计数异常：skipped=$_nsk excluded=$_ghx"
fi
if bash -n "$BD/install-offline.sh" 2>/dev/null; then
  ok "态2d 生成的 install-offline.sh 语法通过"
else
  bad "态2d install-offline.sh 语法失败：$(bash -n "$BD/install-offline.sh" 2>&1 | head -1)"
fi
if grep -q "swarm-yuan/.bundle-version" "$BD/SHA256SUMS" 2>/dev/null; then
  ok "态2e SHA256SUMS 覆盖 .bundle-version"
else
  bad "态2e SHA256SUMS 未覆盖 .bundle-version"
fi

# 态3 安装器走源实跑：桩掉 npm/python3 与技能安装，断言逐 spec 经源安装
if [[ -d "$BD" ]]; then
  SB="$T/stubs"; mkdir -p "$SB"
  printf '#!/usr/bin/env bash\necho "$@" >> "%s/npm.log"\nexit 0\n' "$SB" > "$SB/npm"; chmod +x "$SB/npm"
  printf '#!/usr/bin/env bash\necho "$@" >> "%s/py.log"\nif [ "$1" = "-m" ]; then exit 0; fi\nexit 0\n' "$SB" > "$SB/python3"; chmod +x "$SB/python3"
  printf '#!/usr/bin/env bash\necho "install.sh $@" >> "%s/skill.log"\nexit 0\n' "$SB" > "$BD/swarm-yuan/install.sh"; chmod +x "$BD/swarm-yuan/install.sh"
  # 桩入后同步该行校验和（安装器完整性门会拒绝被改文件——这正是设计；测试只验走源逻辑）
  _h=$(shasum -a 256 "$BD/swarm-yuan/install.sh" 2>/dev/null | awk '{print $1}')
  [[ -n "$_h" ]] || _h=$(sha256sum "$BD/swarm-yuan/install.sh" | awk '{print $1}')
  awk -v h="$_h" 'BEGIN{OFS="  "} $2=="swarm-yuan/install.sh"{$1=h} {print}' "$BD/SHA256SUMS" > "$T/sums.new" && mv "$T/sums.new" "$BD/SHA256SUMS"
  ( cd "$BD" && PATH="$SB:$PATH" bash install-offline.sh --claude --with-npm --with-pip ) >"$T/inst.log" 2>&1
  _rc=$?
  _npm_specs=$(grep -c 'install -g ' "$SB/npm.log" 2>/dev/null || echo 0)
  if [[ $_rc -eq 0 && "$_npm_specs" -eq 9 ]] && grep -q 'install -g @rpamis/comet@0.5.0' "$SB/npm.log" 2>/dev/null; then
    ok "态3a npm 走源：9 条 spec 全部 npm i -g（含 @rpamis/comet@0.5.0）"
  else
    bad "态3a npm 走源异常 rc=$_rc 条数=${_npm_specs}：$(tail -3 "$T/inst.log" | tr '\n' ' ')"
  fi
  if grep -q 'pip install graphifyy==0.9.95' "$SB/py.log" 2>/dev/null; then
    ok "态3b pip 走源：graphifyy==0.9.95 经 python3 -m pip install"
  else
    bad "态3b pip 走源未命中：$(cat "$SB/py.log" 2>/dev/null | tr '\n' ' ')"
  fi
  if grep -q '^install.sh --claude$' "$SB/skill.log" 2>/dev/null; then
    ok "态3c 技能本体安装入口被调用（--claude）"
  else
    bad "态3c 技能安装入口未被调用：$(cat "$SB/skill.log" 2>/dev/null | tr '\n' ' ')"
  fi
fi

# 态4 版本兜底：从包内（无 .git）跑 install.sh --version 不落 unknown
# （还原被桩掉的 install.sh：用构建机原版重拷）
if [[ -d "$BD" ]]; then
  cp "$PWD/install.sh" "$BD/swarm-yuan/install.sh"
  _v=$(cd "$BD/swarm-yuan" && bash install.sh --version 2>/dev/null | head -1)
  if printf '%s' "$_v" | grep -q 'installer v' && ! printf '%s' "$_v" | grep -q 'unknown'; then
    ok "态4 --version 兜底 .bundle-version（${_v}）"
  else
    bad "态4 版本兜底失败：$_v"
  fi
  # 态4b 非 git 且无 .bundle-version：须 rc 0 + unknown（缺文件 sed rc=2 曾触发 set -e 早退——r118 态5b 实抓）
  rm -f "$BD/swarm-yuan/.bundle-version"
  _v2=$(cd "$BD/swarm-yuan" && bash install.sh --version 2>/dev/null | head -1); _rc2=$?
  if [[ $_rc2 -eq 0 ]] && printf '%s' "$_v2" | grep -q 'installer unknown'; then
    ok "态4b 无 git 无 .bundle-version → unknown 且不早退（rc 0）"
  else
    bad "态4b 缺版本文件时异常 rc=${_rc2}：$_v2"
  fi
fi

rm -rf "$T"
if [[ "$FAIL" -eq 0 ]]; then
  echo "test-r133-offline-complete: 全部通过"
  exit 0
else
  echo "test-r133-offline-complete: 存在失败" >&2
  exit 1
fi
