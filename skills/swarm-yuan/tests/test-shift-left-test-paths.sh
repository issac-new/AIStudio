#!/usr/bin/env bash
# test-shift-left-test-paths.sh — 测试先行门禁跨栈测试文件识别回归锁
# 旧实现只认 JS 的 .test./.spec./__tests__ 与 Rust tests/*.rs：
# Java *Test.java / Go *_test.go / Python test_*.py 明明先提交了测试，仍被判"无 test 文件提交"。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
BASE="$(pwd)"
TMP="$(mktemp -d /tmp/sltp.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

make_repo() { # $1=目录名
  P="$TMP/$1"
  mkdir -p "$P/scripts" "$P/docs" "$P/src" "$P/tests"
  cp "$BASE/assets/precheck.sh" "$BASE/assets/gates-warn.sh" \
     "$BASE/assets/gates-strict.sh" "$BASE/assets/gates-advisory.sh" \
     "$BASE/assets/gate-enforce-level.conf" "$BASE/assets/memory-backends.sh" \
     "$P/scripts/" 2>/dev/null || true
  cat > "$P/docs/spec.md" <<'EOF'
# 测试 spec
## 11. 测试策略
| 测试类型 | 覆盖范围 | 案例/数据 | 覆盖率目标 | 预期结果 |
| 单元测试 | core | data | 80% | pass |
| 接口测试 | api | data | 80% | pass |
## 19. 测试左移
### 19.1 测试策略
| 单元测试 | core | pytest | pytest | 80% |
### 19.2 用例骨架
| 用例名 | Given | When | Then | 边界/异常 |
| normal | a | b | c | none |
| empty | a | b | c | empty |
| invalid | a | b | c | invalid |
### 19.3 测试左移声明
- [x] done
## 21. 可观测性约束
日志 + metrics + trace。
回滚方式：git revert。
EOF
  cat > "$P/docs/plan.md" <<'EOF'
# 变更 plan
## 20. 变更左移
| 文件 | 消费方 | 影响类型 | 回归范围 |
| src/app.py | api | internal | tests |
EOF
  cat > "$P/scripts/precheck.conf" <<EOF
PROJECT_DIR="$P"
BASE_BRANCH="HEAD~1"
WRITABLE_DIRS=("src")
TEST_DESIGN_FILE="docs/spec.md"
CHANGE_IMPACT_FILE="docs/plan.md"
OBSERVABILITY_FILE="docs/spec.md"
EOF
  ( cd "$P" && git init -q && git config user.email t@example.com && git config user.name t \
    && git add docs scripts && git commit -q -m 'chore: scaffold' )
}

# 1) Java + Go + Python 测试文件均被识别，且生产文件 contest.py 不误判为测试
make_repo p1
( cd "$P" && mkdir -p src/main/java src/test/java src/main/go \
  && printf 'print("impl")\n' > src/app.py \
  && printf 'print("prod")\n' > src/contest.py \
  && printf 'test("x", () => {})\n' > tests/test_app.py \
  && printf 'public class App {}\n' > src/main/java/App.java \
  && printf 'public class AppTest {}\n' > src/test/java/AppTest.java \
  && printf 'package main\n' > src/main/go/app.go \
  && printf 'package main\n' > src/main/go/app_test.go \
  && git add -A && git commit -q -m 'feat: cross-stack tests first' )
out=$( cd "$P" && bash scripts/precheck.sh --shift-left 2>&1 || true )
grep -qF '本次变更有 test 文件提交（3 test + 4 impl）' <<<"$out" \
  && ! grep -qF '无 test 文件提交' <<<"$out" \
  && ok "Java/Go/Python 测试文件均识别（3 test + 4 impl）" || bad "跨栈测试文件识别异常: $out"

# 2) 只有 impl 无 test → 仍须 warn（防修复过头）
make_repo p2
( cd "$P" && printf 'print("impl")\n' > src/app.py \
  && git add -A && git commit -q -m 'feat: impl only' )
out=$( cd "$P" && bash scripts/precheck.sh --shift-left 2>&1 || true )
grep -qF '无 test 文件提交' <<<"$out" \
  && ok "有 impl 无 test → warn" || bad "无 test 场景漏报: $out"

[[ $FAIL -eq 0 ]] && { echo "PASS test-shift-left-test-paths"; exit 0; } || { echo "FAIL test-shift-left-test-paths" >&2; exit 1; }
