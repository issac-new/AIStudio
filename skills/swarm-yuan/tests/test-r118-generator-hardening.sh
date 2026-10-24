#!/usr/bin/env bash
# test-r118-generator-hardening.sh — R118 生成器路径/升级健壮性回归锁
# 覆盖：含空格项目路径生成、子目录名命令注入、--remove 行尾注释、
#       skill 名路径穿越、部分填充模板保留、升级备份名无冒号、生成物自检不空过、
#       inventory-verify 项目路径注入。
set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
GEN="$BASE/scripts/generate-skill.sh"
T="$(mktemp -d "${TMPDIR:-/tmp}/r118gen.XXXXXX")"
trap 'rm -rf "$T"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

PROJ="$T/proj with space"
INJECT_DIR="$PROJ/\$(touch PWNED)"
OUT="$T/out"
mkdir -p "$INJECT_DIR" "$PROJ/src"
printf '{"name":"x","scripts":{"test":"echo ok","build":"echo ok"}}\n' > "$INJECT_DIR/package.json"
printf 'x\n' > "$PROJ/src/a.js"

# 1) 含空格路径生成成功（旧版 conf-render 未加引号 → 127）
bash "$GEN" --profile standard demo "$PROJ" "$OUT" > "$T/gen.log" 2>&1; rc=$?
if [[ "$rc" -eq 0 ]]; then ok "含空格项目路径生成 rc=0"; else bad "含空格路径生成失败（rc=${rc}）"; tail -10 "$T/gen.log"; fi
SKILL="$OUT/demo"
CONF="$SKILL/scripts/precheck.conf"

# 2) PROJECT_DIR 源码可还原；TEST_CMD 对注入目录名做了 shell 转义；执行后无 marker
got=$( (set +u; . "$CONF"; printf '%s' "${PROJECT_DIR:-}") )
# macOS mktemp 的 /var 与 /private/var 是同一目录的两种表示；断言“含空格且目录可达”即可。
if [[ "$got" == *"proj with space"* && -d "$got" ]]; then ok "PROJECT_DIR 源码还原含空格路径"; else bad "PROJECT_DIR 失真（${got}）"; fi
if grep -q 'PWNED' "$CONF" && grep -qF '\$' "$CONF"; then ok "TEST_CMD 注入目录名已转义"; else bad "TEST_CMD 未转义"; fi
( cd "$PROJ" && bash "$SKILL/scripts/precheck.sh" --test > "$T/test.log" 2>&1 ); rc=$?
if [[ "$rc" -eq 0 ]]; then ok "注入目录名执行 rc=0"; else bad "注入目录名执行 rc=${rc}"; tail -5 "$T/test.log"; fi
if [[ -z "$(find "$PROJ" -maxdepth 1 -type f -name 'PWNED' -print 2>/dev/null)" ]]; then ok "注入目录名未执行命令替换"; else bad "注入目录名执行了命令替换"; fi

# 3) --remove 必须剥掉行尾注释，不得产生 "flask)" / "#" 成员
ARCH="$SKILL/scripts/precheck.arch.conf"
printf '\nACTIVE_FRAMEWORKS=("flask")  # AUTO:detected\n' >> "$ARCH"
bash "$GEN" --inject-frameworks "$SKILL" --remove flask > "$T/remove.log" 2>&1; rc=$?
if [[ "$rc" -eq 0 ]] && grep -q '^ACTIVE_FRAMEWORKS=()' "$ARCH" && ! grep -qE 'flask\)|AUTO:detected' "$ARCH"; then
  ok "--remove 正确重建空 ACTIVE_FRAMEWORKS"
else
  bad "--remove 污染 ACTIVE_FRAMEWORKS"; grep -n '^ACTIVE_FRAMEWORKS=' "$ARCH" | head -3
fi

# 4) skill 名路径穿越必须拒绝
mkdir -p "$T/out2"
bash "$GEN" '../../escaped' "$PROJ" "$T/out2" > "$T/trav.log" 2>&1; rc=$?
if [[ "$rc" -eq 1 ]] && [[ ! -e "$T/escaped" ]]; then ok "skill 名路径穿越被拒绝"; else bad "skill 名路径穿越未拒绝（rc=${rc}）"; fi

# 5) 部分填充模板在 upgrade 时保留
printf 'USER-CONTENT-XYZ\n' >> "$SKILL/scripts/snippets.md"
bash "$GEN" --upgrade demo "$PROJ" "$OUT" > "$T/upgrade.log" 2>&1; rc=$?
if [[ "$rc" -eq 0 ]] && grep -q 'USER-CONTENT-XYZ' "$SKILL/scripts/snippets.md"; then
  ok "upgrade 保留部分填充模板"
else
  bad "upgrade 覆盖了用户模板内容（rc=${rc}）"
fi
bdir=$(find "$SKILL" -maxdepth 1 -type d -name '.upgrade-backup-*' -print 2>/dev/null | head -1)
if [[ -n "$bdir" ]] && ! printf '%s' "$(basename "$bdir")" | grep -q ':'; then
  ok "upgrade 备份目录名无冒号"
else
  bad "upgrade 备份目录名含冒号或缺失（${bdir:-无}）"
fi

# 6) 生成物自检：不空过，显示不适用
cp "$BASE/scripts/self-check.sh" "$SKILL/scripts/self-check.sh"
bash "$SKILL/scripts/self-check.sh" --check-only --ci > "$T/genself.log" 2>&1; rc=$?
if [[ "$rc" -eq 0 ]] && grep -q '不适用' "$T/genself.log" && ! grep -q '框架规则(0)' "$T/genself.log"; then
  ok "生成物自检显式不适用、无 0==0 假通过"
else
  bad "生成物自检仍空过（rc=${rc}）"; grep -n '框架规则\|不适用' "$T/genself.log" | head -5
fi

# 7) inventory-verify 项目路径注入不执行命令
P="$T/inv \$(touch PWN)"
mkdir -p "$P/src"
printf 'function x(){}\n' > "$P/src/a.js"
bash "$BASE/scripts/inventory-verify.sh" "$P" --skill-dir "$SKILL" --tsv > "$T/inv.log" 2>&1; rc=$?
if [[ ! -e "$T/PWN" && ! -e "$P/PWN" ]]; then ok "inventory-verify 路径注入未执行"; else bad "inventory-verify 路径注入被执行"; fi

echo ""
echo "test-r118-generator-hardening: PASS ${PASS} / FAIL ${FAIL}"
[[ "$FAIL" -eq 0 ]]
