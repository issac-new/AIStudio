#!/usr/bin/env bash
# 用法: run-gate-fixture.sh [gate] —— 合规/通用门禁 fixture 运行器
#   遍历 tests/gate-fixtures/<gate>/ 下 violating*/ 目录（期望退出非 0）与
#   compliant*/ 目录（期望退出 0）。无参数时遍历 tests/gate-fixtures/ 下全部组。
#   每个 fixture 为自包含项目结构：
#     scripts/precheck.conf  conf（__REPO_ROOT__ 占位符，运行时替换为 fixture 根）
#     其余文件              项目样本（源码/文档/lockfile 等）
#   运行时拷贝当前 assets/precheck.sh 到临时目录执行（precheck.sh 与同目录 conf 联动）。
# 可选断言文件（置于 fixture 根，逐行字面串；空行与 # 注释行跳过）：
#   expected-ids    fail id 清单，输出须全部命中
#   forbidden-ids   输出不得命中
#   expect-output   输出须包含
# 可选钩子：scripts/setup.sh（precheck 执行前，cwd=fixture）与 scripts/teardown.sh
# （执行后无条件调用）——用于运行时生成被 .gitignore 排除的样本（如 node_modules mock）。
# gate → flag 映射：summary=--all-full 特例；其余组名与 GATE_FLAGS 注册表 1:1 同名
# （如 link-depth→--link-depth），运行时自 precheck.sh 注册表解析校验，扩缩容自动跟随。
set -u
BASE="$(cd "$(dirname "$0")/.." && pwd)"
GATE="${1:-}"

# flag 解析：summary 特例；其余按同名规则派生并到 B 版注册表校验（fail-closed）
GATE_FLAGS_REG="$(sed -n 's/^GATE_FLAGS=(\([^)]*\)).*/\1/p' "$BASE/assets/precheck.sh")"
flag_for() { # $1=gate；stdout=flag
  local g="$1" f
  if [[ "$g" == "summary" ]]; then printf '%s' "--all-full"; return 0; fi
  f="--$g"
  case " $GATE_FLAGS_REG " in
    *" $f "*) printf '%s' "$f"; return 0;;
    *) return 1;;
  esac
}

if [[ -n "$GATE" ]]; then
  FLAG="$(flag_for "$GATE")" || { echo "✗ 未知门禁组：${GATE}（注册表无同名 flag 且非 summary）" >&2; exit 2; }
else
  FLAG=""
fi

# 逐行字面串断言：$1=断言文件 $2=must（须命中）|miss（不得命中）$3=输出文本
assert_lines() {
  local file="$1" mode="$2" out="$3" ln
  [[ -f "$file" ]] || return 0
  while IFS= read -r ln || [[ -n "$ln" ]]; do
    [[ -z "$ln" ]] && continue
    case "$ln" in \#*) continue;; esac
    if [[ "$mode" == "must" ]]; then
      if ! printf '%s\n' "$out" | grep -qF "$ln"; then
        echo "  ✗ 断言未命中（$(basename "$file")）：$ln"
        return 1
      fi
    else
      if printf '%s\n' "$out" | grep -qF "$ln"; then
        echo "  ✗ 禁中断言被命中（$(basename "$file")）：$ln"
        return 1
      fi
    fi
  done < "$file"
  return 0
}

# $1=fixture 目录  $2=expect fail|pass
run_one() {
  local fx="$1" expect="$2" name tmp out="" rc=2 ok=0 hook_rc
  name="$(basename "$fx")"
  tmp="$(mktemp -d /tmp/gfx.XXXXXX)"
  mkdir -p "$tmp/scripts"
  cp "$BASE/assets/precheck.sh" "$tmp/scripts/precheck.sh"
  # WP-Q1.3：拆分后 precheck.sh 依赖 memory-backends + gates-strict/warn/advisory.sh（source 守卫）
  # 打包态（install.sh bundle）下这些文件已内联，无需 cp；开发态需随拷
  for _gf in memory-backends.sh gates-strict.sh gates-warn.sh gates-advisory.sh gate-enforce-level.conf; do
    [[ -f "$BASE/assets/$_gf" ]] && cp "$BASE/assets/$_gf" "$tmp/scripts/$_gf"
  done
  # R122：diagram 门禁机械分支依赖 scripts/diagram-check.sh（源在 scripts/，不在 assets/）
  [[ -f "$BASE/scripts/diagram-check.sh" ]] && cp "$BASE/scripts/diagram-check.sh" "$tmp/scripts/diagram-check.sh"
  # conf 中 __REPO_ROOT__ 占位符替换为 fixture 根（机器无关化）
  sed "s|__REPO_ROOT__|$fx|g" "$fx/scripts/precheck.conf" > "$tmp/scripts/precheck.conf"
  # setup 钩子：运行时生成被 .gitignore 排除的样本（如 node_modules mock）
  if [[ -f "$fx/scripts/setup.sh" ]]; then
    ( cd "$fx" && bash scripts/setup.sh ); hook_rc=$?
    if [[ "$hook_rc" -ne 0 ]]; then
      echo "  ✗ ${name}：setup 失败（rc=${hook_rc}）"
      ok=1
    fi
  fi
  if [[ "$ok" -eq 0 ]]; then
    out="$( bash "$tmp/scripts/precheck.sh" "$FLAG" 2>&1 )"
    rc=$?
  fi
  rm -rf "$tmp"
  # R126-test9：fail 侧 precheck 会向 PROJECT_DIR（fixture 目录）写 .gate-fail-flag——
  # 与 .sbom-out 同款收尾清理（历史残留 35 处，且并行 runner 会读到旧 flag）。
  rm -f "$fx/.swarm-yuan/.gate-fail-flag" 2>/dev/null || true
  # teardown 钩子（无条件）+ SBOM 门禁产物目录清理（fixture 内 .sbom-out，conf 约定）
  if [[ -f "$fx/scripts/teardown.sh" ]]; then
    ( cd "$fx" && bash scripts/teardown.sh ); hook_rc=$?
    if [[ "$hook_rc" -ne 0 ]]; then
      echo "  ✗ ${name}：teardown 失败（rc=${hook_rc}）"
      ok=1
    fi
  fi
  rm -rf "$fx/.sbom-out"
  # R126：precheck FAIL>0 会把 .gate-fail-flag 写进 fixture 树（PROJECT_DIR=fixture 根）——
  # 清掉运行残留，避免脏工作树与并发互踩（cognition/compliant 有 tracked .swarm-yuan/notes，
  # 故只删 flag 文件不整目录 rm）
  rm -f "$fx/.swarm-yuan/.gate-fail-flag"
  [[ "$ok" -eq 0 ]] || return 1
  if [[ "$expect" == "fail" ]]; then
    [[ $rc -ne 0 ]] || { echo "  ✗ ${name}：期望退出非 0，实际 ${rc}"; ok=1; }
  else
    [[ $rc -eq 0 ]] || { echo "  ✗ ${name}：期望退出 0，实际 ${rc}"; ok=1; }
  fi
  assert_lines "$fx/expected-ids" must "$out" || ok=1
  assert_lines "$fx/forbidden-ids" miss "$out" || ok=1
  assert_lines "$fx/expect-output" must "$out" || ok=1
  if [[ $ok -eq 0 ]]; then
    echo "  ✓ $name → 退出 ${rc}（符合预期：${expect}）"
    return 0
  fi
  return 1
}

# 单组运行：$1=组名；FLAG 为 run_one 读取的全局；逐组独立计数（set -u 安全：先初始化）
run_group() {
  local g="$1" fx FAIL_N=0 TOTAL=0
  FLAG="$(flag_for "$g")" || { echo "✗ 未知门禁组：${g}（注册表无同名 flag 且非 summary）" >&2; return 2; }
  for fx in "$BASE/tests/gate-fixtures/$g"/violating*/ "$BASE/tests/gate-fixtures/$g"/compliant*/; do
    [[ -d "$fx" ]] || continue
    fx="${fx%/}"
    TOTAL=$((TOTAL+1))
    case "$(basename "$fx")" in
      violating*)  run_one "$fx" fail || FAIL_N=$((FAIL_N+1));;
      compliant*)  run_one "$fx" pass || FAIL_N=$((FAIL_N+1));;
    esac
  done
  echo "gate-fixture [$g]：共 ${TOTAL}，PASS $((TOTAL-FAIL_N))，FAIL ${FAIL_N}"
  [[ $FAIL_N -eq 0 ]]
}

if [[ -n "$GATE" ]]; then
  run_group "$GATE"
else
  # 无参数：遍历 tests/gate-fixtures/ 下全部组，任一组失败则整体非 0
  GROUP_N=0; BAD_GROUP_N=0
  for fx in "$BASE/tests/gate-fixtures"/*/; do
    [[ -d "$fx" ]] || continue
    GROUP_N=$((GROUP_N+1))
    run_group "$(basename "${fx%/}")" || BAD_GROUP_N=$((BAD_GROUP_N+1))
  done
  echo "gate-fixture 全量：共 $GROUP_N 组，失败组 $BAD_GROUP_N"
  [[ $BAD_GROUP_N -eq 0 ]]
fi
