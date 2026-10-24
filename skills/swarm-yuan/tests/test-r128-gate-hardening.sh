#!/usr/bin/env bash
# test-r128-gate-hardening.sh — R128 门禁引擎三处加固回归锁
#   ① check_scope：READONLY_DIRS 值此前直接插进 ERE——目录名含 . [ + 等元字符即误配
#     （lib.v2 匹配 libXv2，假阳性）；正则非法时 grep rc=2 被 || true 吞成「无违规」（假阴性）
#   ② check_layer：层在 LAYER_DEFS 命中但未登记 LAYER_ORDER 时默认索引 0（最顶层）——
#     方向性误判且零披露；改为披露一次并跳过方向判定
#   ③ gate-rules：$(…)/反引号替换体作为子命令递归求值（态23 在 test-gate-rules.sh）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"
TMP="$(mktemp -d /tmp/r128g.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

mk_proj() {  # $1=dir；拷贝开发态门禁套件（布局同 run-gate-fixture.sh）
  mkdir -p "$1/scripts" "$1/.swarm-yuan"
  for _f in precheck.sh gates-strict.sh gates-warn.sh gates-advisory.sh memory-backends.sh gate-enforce-level.conf; do
    cp "$BASE/assets/$_f" "$1/scripts/$_f"
  done
  [[ -f "$BASE/scripts/diagram-check.sh" ]] && cp "$BASE/scripts/diagram-check.sh" "$1/scripts/diagram-check.sh"
}

# ===== 态1：check_scope 元字符目录名不误配/不漏配 =====
P1="$TMP/p1"; mk_proj "$P1"
( cd "$P1" && git init -q && git config user.email t@t && git config user.name t \
  && mkdir -p src && printf 'x\n' > src/a.txt && git add -A && git commit -qm init )
cat > "$P1/scripts/precheck.conf" <<EOF
PROJECT_DIR="$P1"
BRANCH_REGEX='.*'
PROTECTED_BRANCHES=()
READONLY_DIRS=("lib.v2")
EOF
mkdir -p "$P1/libXv2"; printf 'y\n' > "$P1/libXv2/a.txt"      # 旧 ERE ^lib.v2 会把 . 当通配命中 libXv2
out="$(cd "$P1" && bash scripts/precheck.sh --scope 2>&1)"; rc=$?
if [[ $rc -eq 0 ]] && ! printf '%s' "$out" | grep -q '只读目录有改动'; then
  ok "态1a lib.v2 不误配 libXv2（元字符不当通配）"
else
  bad "态1a 假阳性 rc=${rc}：$(printf '%s' "$out" | grep '只读' | head -2)"
fi
mkdir -p "$P1/lib.v2"; printf 'z\n' > "$P1/lib.v2/b.txt"
out="$(cd "$P1" && bash scripts/precheck.sh --scope 2>&1)"; rc=$?
if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -q '只读目录有改动: lib.v2'; then
  ok "态1b lib.v2 真实改动仍检出"
else
  bad "态1b 漏报 rc=${rc}：$(printf '%s' "$out" | tail -3)"
fi
# 1c：目录名含 [ 旧版正则非法 → grep rc=2 被吞成无违规（假阴性）
cat > "$P1/scripts/precheck.conf" <<EOF
PROJECT_DIR="$P1"
BRANCH_REGEX='.*'
PROTECTED_BRANCHES=()
READONLY_DIRS=("vendor[legacy]")
EOF
mkdir -p "$P1/vendor[legacy]"; printf 'w\n' > "$P1/vendor[legacy]/c.txt"
out="$(cd "$P1" && bash scripts/precheck.sh --scope 2>&1)"; rc=$?
if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -q '只读目录有改动: vendor\[legacy\]'; then
  ok "态1c 含 [ 的目录名改动检出（不再被非法正则吞成假阴性）"
else
  bad "态1c 假阴性 rc=${rc}：$(printf '%s' "$out" | tail -3)"
fi

# ===== 态2：check_layer 未登记层披露+跳过（不再默认最顶层误判） =====
P2="$TMP/p2"; mk_proj "$P2"
mkdir -p "$P2/src/app" "$P2/src/domain" "$P2/src/ghost"
printf 'export const a = 1;\n' > "$P2/src/app/a.js"
printf 'export const d = 1;\n' > "$P2/src/domain/d.js"
printf 'import { a } from "../app/a";\n' > "$P2/src/ghost/g.js"    # ghost 未登记 LAYER_ORDER
cat > "$P2/scripts/precheck.conf" <<EOF
PROJECT_DIR="$P2"
BRANCH_REGEX='.*'
PROTECTED_BRANCHES=()
LAYER_DEFS=("app=src/app/**" "domain=src/domain/**" "ghost=src/ghost/**")
LAYER_ORDER=("app" "domain")
EOF
out="$(cd "$P2" && bash scripts/precheck.sh --layer 2>&1)"; rc=$?
if printf '%s' "$out" | grep -q '未登记 LAYER_ORDER'; then
  ok "态2a 未登记层披露（ghost）"
else
  bad "态2a 未披露：$(printf '%s' "$out" | tail -4)"
fi
if ! printf '%s' "$out" | grep -q '层依赖违规.*ghost'; then
  ok "态2b 未登记层不按最顶层误判倒置"
else
  bad "态2b 方向性误判仍在：$(printf '%s' "$out" | grep '层依赖违规')"
fi
# 2c：登记齐全后真实倒置仍检出（domain → app 向上依赖）
printf 'import { a } from "../app/a";\n' > "$P2/src/domain/d.js"
cat > "$P2/scripts/precheck.conf" <<EOF
PROJECT_DIR="$P2"
BRANCH_REGEX='.*'
PROTECTED_BRANCHES=()
LAYER_DEFS=("app=src/app/**" "domain=src/domain/**")
LAYER_ORDER=("app" "domain")
EOF
rm -rf "$P2/src/ghost"
out="$(cd "$P2" && bash scripts/precheck.sh --layer 2>&1)"; rc=$?
if [[ $rc -ne 0 ]] && printf '%s' "$out" | grep -q '层依赖违规'; then
  ok "态2c 登记齐全时真实倒置检出"
else
  bad "态2c 真实倒置漏报 rc=${rc}：$(printf '%s' "$out" | tail -3)"
fi

echo ""
if [[ $FAIL -eq 0 ]]; then
  echo "✓ test-r128-gate-hardening 全绿（scope 元字符三态 + layer 未登记层三态）"
else
  echo "✗ test-r128-gate-hardening 存在失败项" >&2
fi
exit $FAIL
