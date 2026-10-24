#!/usr/bin/env bash
# 真实 CLI 回归：零匹配清单、升档契约、失败回滚与待写路径保护。
set -uo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
GEN="$BASE/scripts/generate-skill.sh"
T="$(mktemp -d "${TMPDIR:-/tmp}/generator-reliability.XXXXXX")"
T="$(cd "$T" && pwd)"
trap 'rm -rf "$T"' EXIT
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); printf '  ✓ %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf '  ✗ %s\n' "$1" >&2; }
# trace-log 的默认工作目录也限于临时夹具。
cd "$T" || exit 1

for manifest in Cargo.toml pom.xml go.mod; do
  mkdir -p "$T/zero-$manifest"
  printf '\n' > "$T/zero-$manifest/$manifest"
  if bash "$GEN" "zero-${manifest%%.*}" "$T/zero-$manifest" "$T/zero-out" > "$T/zero-$manifest.log" 2>&1; then
    ok "auto 接受零匹配 $manifest"
  else
    bad "auto 拒绝零匹配 $manifest"; tail -n 3 "$T/zero-$manifest.log"
  fi
done
mkdir -p "$T/zero-package/sub"
printf '{}\n' > "$T/zero-package/sub/package.json"
if bash "$GEN" zero-package "$T/zero-package" "$T/zero-out" > "$T/zero-package.log" 2>&1; then
  ok "auto 接受子目录零依赖 package.json"
else
  bad "auto 拒绝子目录零依赖 package.json"; tail -n 3 "$T/zero-package.log"
fi

PROJ="$T/project with spaces"
OUT="$T/out"
mkdir -p "$PROJ/src"
printf 'console.log("fixture");\n' > "$PROJ/src/index.js"
printf 'flask>=3.0\n' > "$PROJ/requirements.txt"
if ! bash "$GEN" --profile lite demo "$PROJ" "$OUT" > "$T/create.log" 2>&1; then
  bad "基础 lite 生成失败"; tail -n 10 "$T/create.log"; exit 1
fi
SKILL="$OUT/demo"
printf '\nUSER-BODY-PRESERVE\n' >> "$SKILL/SKILL.md"
printf '\nUSER_CONF_PRESERVE=1\n' >> "$SKILL/scripts/precheck.conf"
printf '\nACTIVE_FRAMEWORKS=("flask") # user selected\n' >> "$SKILL/scripts/precheck.conf"
sed -i.bak 's/^status: draft/status: active/' "$SKILL/SKILL.md"
rm -f "$SKILL/SKILL.md.bak"
cp "$SKILL/scripts/precheck.conf" "$T/conf.before"
# 升档应补技能内挂钩，不重写项目既有挂钩或 core.hooksPath。
git -C "$PROJ" init -q
mkdir -p "$PROJ/.swarm-yuan/hooks"
printf 'USER-HOOK-PRESERVE\n' > "$PROJ/.swarm-yuan/hooks/pre-commit"
git -C "$PROJ" config core.hooksPath custom-hooks
cp "$PROJ/.swarm-yuan/hooks/pre-commit" "$T/hook.before"
if bash "$GEN" --upgrade --profile compliance demo "$PROJ" "$OUT" > "$T/upgrade.log" 2>&1; then
  ok "lite 升 compliance 返回成功"
else
  bad "lite 升 compliance 失败"; tail -n 10 "$T/upgrade.log"
fi
if grep -rlE '\.swarm-yuan-upgrade\.|\.swarm-yuan-previous\.' "$SKILL" > "$T/stage-paths.log" 2>/dev/null; then
  bad "发布产物包含暂存路径"; cat "$T/stage-paths.log"
else
  ok "发布产物不含暂存路径"
fi
grep -q '^profile: compliance$' "$SKILL/SKILL.md" && ok "升档同步 profile" || bad "升档 profile 仍旧档"
grep -q '^status: draft$' "$SKILL/SKILL.md" && ok "升档回 draft 等待新增内容验真" || bad "升档半成品仍 active"
grep -q '^USER-BODY-PRESERVE$' "$SKILL/SKILL.md" && ok "用户正文保留" || bad "用户正文被覆盖"
cmp -s "$T/conf.before" "$SKILL/scripts/precheck.conf" && ok "用户主配置逐字保留" || bad "用户主配置被覆盖"
for file in scripts/precheck.arch.conf scripts/precheck.compliance.conf references/workflow.md references/recipes.md hooks/hooks.json commands/spec.md; do
  [[ -f "$SKILL/$file" ]] && ok "升档补齐 $file" || bad "升档缺少 $file"
done
active=$( (set +u; . "$SKILL/scripts/precheck.conf"; printf '%s' "${ACTIVE_FRAMEWORKS[*]}") )
[[ "$active" == flask ]] && ok "新增分层配置保留既有框架值" || bad "新增配置清空框架（${active}）"
grep -q '_fw_flask_check()' "$SKILL/scripts/precheck.sh" && ok "升档框架门禁仍注入" || bad "升档丢失框架门禁"
cmp -s "$T/hook.before" "$PROJ/.swarm-yuan/hooks/pre-commit" && [[ "$(git -C "$PROJ" config core.hooksPath)" == custom-hooks ]] \
  && ok "升级保留项目 hooks" || bad "升级改写项目 hooks"
# 隐式 upgrade / draft resume 均继承现有档位，不把小项目重新降 lite。
if bash "$GEN" --upgrade demo "$PROJ" "$OUT" > "$T/inherit.log" 2>&1 && grep -q '^profile: compliance$' "$SKILL/SKILL.md"; then
  ok "未指定 profile 的升级继承 compliance"
else
  bad "未指定 profile 的升级未继承 compliance"
fi

# 同档升级保留 active 状态；draft 续传继承档位并补缺失的高档文件。
sed -i.bak 's/^status: draft/status: active/' "$SKILL/SKILL.md"
rm -f "$SKILL/SKILL.md.bak"
if bash "$GEN" --upgrade demo "$PROJ" "$OUT" > "$T/active.log" 2>&1 && grep -q '^status: active$' "$SKILL/SKILL.md"; then
  ok "同档升级保留 active 状态"
else
  bad "同档升级改变 active 状态"
fi
sed -i.bak 's/^status: active/status: draft/' "$SKILL/SKILL.md"
rm -f "$SKILL/SKILL.md.bak" "$SKILL/references/crypto-spec.md"
if bash "$GEN" demo "$PROJ" "$OUT" > "$T/resume.log" 2>&1 && [[ -f "$SKILL/references/crypto-spec.md" ]]; then
  ok "draft 续传继承 compliance 并补齐其文件"
else
  bad "draft 续传错档导致文件未补齐"
fi
# 至少一份升级归档应同时含元数据和用户主配置。
backup_complete=0
for backup in "$SKILL"/.upgrade-backup-*/; do
  if [[ -f "$backup/SKILL.md" && -f "$backup/.swarm-yuan-version" && -f "$backup/scripts/precheck.conf" ]]; then
    backup_complete=1
  fi
done
[[ "$backup_complete" -eq 1 ]] && ok "升级归档含元数据和完整旧配置" || bad "升级归档缺少旧元数据"

# 失败前后比较整个可交付目录（包括版本戳），而非只看 exit code。
printf '\nUSER-SPEC-PRESERVE\n' >> "$SKILL/assets/spec-template.md"
cp -Rp "$SKILL" "$T/before-failure"
if SKILLS_PATH_REWRITE='s|' bash "$GEN" --upgrade demo "$PROJ" "$OUT" > "$T/rewrite.log" 2>&1; then
  bad "非法重写表达式被成功接受"
else
  ok "非法重写表达式返回失败"
fi
diff -rq "$T/before-failure" "$SKILL" >/dev/null && ok "重写失败后目录逐字不变" || bad "重写失败留下半升级目录"

# 在若干模板已复制后注入复制故障，覆盖运行途中失败，不能只靠参数预检。
mkdir -p "$T/bin"
cat > "$T/bin/cp" <<'CP'
#!/usr/bin/env bash
for arg in "$@"; do last="$arg"; done
if [[ "$last" == */scripts/gates-warn.sh ]]; then
  printf 'fixture: copy failed after earlier templates\n' >&2
  exit 73
fi
exec /bin/cp "$@"
CP
chmod +x "$T/bin/cp"
if PATH="$T/bin:$PATH" bash "$GEN" --upgrade demo "$PROJ" "$OUT" > "$T/copy-failure.log" 2>&1; then
  bad "中途复制故障被成功接受"
else
  ok "中途复制故障返回失败"
fi
diff -rq "$T/before-failure" "$SKILL" >/dev/null && ok "中途复制失败后原目录逐字不变" || bad "中途复制失败留下混合模板"

# 发布到正式目录失败，以及正式目录发布后归档失败，都必须恢复完整原件。
cat > "$T/bin/mv" <<'MV'
#!/usr/bin/env bash
first="$1"
for arg in "$@"; do last="$arg"; done
case "${GEN_TEST_FAIL_RENAME:-}" in
  publish)
    if [[ "$first" == */.swarm-yuan-upgrade.*/skill && "$last" == "$GEN_TEST_LIVE" ]]; then exit 74; fi ;;
  archive)
    if [[ "$last" == "$GEN_TEST_LIVE"/.upgrade-backup-* ]]; then exit 75; fi ;;
  interrupt)
    if [[ "$first" == */.swarm-yuan-upgrade.*/skill && "$last" == "$GEN_TEST_LIVE" ]]; then
      /bin/mv "$@" || exit $?
      kill -TERM "$PPID"
      exit 0
    fi ;;
esac
exec /bin/mv "$@"
MV
chmod +x "$T/bin/mv"
# cp 故障仅用于上一案例，避免掩盖发布阶段。
rm "$T/bin/cp"
for fail_phase in publish archive interrupt; do
  if GEN_TEST_LIVE="$SKILL" GEN_TEST_FAIL_RENAME="$fail_phase" PATH="$T/bin:$PATH" \
      bash "$GEN" --upgrade demo "$PROJ" "$OUT" > "$T/$fail_phase.log" 2>&1; then
    bad "$fail_phase 阶段重命名失败被成功接受"
  else
    ok "$fail_phase 阶段重命名失败返回失败"
  fi
  diff -rq "$T/before-failure" "$SKILL" >/dev/null && ok "$fail_phase 失败恢复原目录" || bad "$fail_phase 失败未恢复原目录"
done
rm "$T/bin/mv"
leftovers=$(find "$OUT" -maxdepth 1 -name '.swarm-yuan-*' -print)
[[ -z "$leftovers" ]] && ok "失败路径清理暂存目录" || bad "遗留暂存目录: $leftovers"

# 待写文件符号链接不可透过副本写到外部；无关只读链接应仍可保留。
printf 'EXTERNAL-PRESERVE\n' > "$T/external.md"
rm "$SKILL/assets/spec-template.md"
ln -s "$T/external.md" "$SKILL/assets/spec-template.md"
if bash "$GEN" --upgrade demo "$PROJ" "$OUT" > "$T/symlink.log" 2>&1; then
  bad "待写符号链接未被拒绝"
else
  ok "待写符号链接被拒绝"
fi
[[ "$(cat "$T/external.md")" == EXTERNAL-PRESERVE ]] && ok "外部符号链接目标未被改写" || bad "符号链接导致外部内容被覆盖"
rm "$SKILL/assets/spec-template.md"
cp "$T/before-failure/assets/spec-template.md" "$SKILL/assets/spec-template.md"

  # 续传且缺 SKILL.md 时会生成临时索引；该临时路径同样不能写穿符号链接。
  mv "$SKILL/SKILL.md" "$T/SKILL.md.saved"
  ln -s "$T/external.md" "$SKILL/.universal-files-index.md"
  if bash "$GEN" demo "$PROJ" "$OUT" > "$T/index-symlink.log" 2>&1; then
    bad "临时索引符号链接未被拒绝"
  else
    ok "临时索引符号链接被拒绝"
  fi
  [[ "$(cat "$T/external.md")" == EXTERNAL-PRESERVE ]] && ok "临时索引外部目标未被改写" || bad "临时索引写穿符号链接"
  rm "$SKILL/.universal-files-index.md"
  mv "$T/SKILL.md.saved" "$SKILL/SKILL.md"

ln -s "$T/external.md" "$SKILL/user-reference.md"
rm "$SKILL/references/reference-manual.md"
ln -s "$T/external.md" "$SKILL/references/reference-manual.md"
if bash "$GEN" --upgrade demo "$PROJ" "$OUT" > "$T/readonly-link.log" 2>&1 && [[ -L "$SKILL/user-reference.md" && -L "$SKILL/references/reference-manual.md" ]]; then
  ok "无关只读链接保留且不阻断升级"
else
  bad "无关只读链接被误拒绝"
fi
printf '\ntest-generator-reliability: PASS %s / FAIL %s\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
