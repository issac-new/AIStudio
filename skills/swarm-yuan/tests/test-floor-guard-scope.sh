#!/usr/bin/env bash
# test-floor-guard-scope.sh — 降标守卫的判定范围（2026-11-25，挂账 N35-5）
# 事故形态：守卫拿到项目目录后一律上溯到 git 仓库根、比较整个仓库相对基线的改动。项目目录只是
# 大仓库里一个子目录时（单仓里的技能目录、仓库内的门禁夹具），别的目录里未推送的断言改动也被
# 判进来，守卫在各自机器上随别人的在途改动变红；夹具因此不密封。
# 锁四件事：①范围之外的断言删除不判；②范围内的断言删除照拦；③未给 --root 时仍是整个仓库；
#          ④--root 给相对路径、从别的目录启动，结论相同。
set -uo pipefail

BASE="$(cd "$(dirname "$0")/.." && pwd)"
RUNNER="$BASE/scripts/floor-guard.sh"

pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/swarm-floor-scope.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
REPO="$WORK/mono"
mkdir -p "$REPO"
(
  cd "$REPO" || exit 1
  git init -q
  git symbolic-ref HEAD refs/heads/main
  mkdir -p proj other
  printf 'test("a", () => { expect(1).toBe(1) })\ntest("a2", () => { expect(2).toBe(2) })\n' > proj/a.test.js
  printf 'test("b", () => { expect(2).toBe(2) })\ntest("c", () => { expect(3).toBe(3) })\n' > other/b.test.js
  git add proj other
  git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
) || { echo "  ✗ 夹具仓库搭建失败"; exit 2; }

# ① 范围之外的断言删除：项目目录＝proj，删除发生在 other
printf 'test("b", () => { expect(2).toBe(2) })\n' > "$REPO/other/b.test.js"
if out="$(bash "$RUNNER" --root "$REPO/proj" 2>&1)"; then
  ok "范围之外的断言删除不判（--root proj）"
else
  bad "范围之外的断言删除被误判：$out"
fi

# ③ 未给 --root（在仓库根启动）仍是整个仓库：同一处删除必须被拦
if out="$(cd "$REPO" && bash "$RUNNER" 2>&1)"; then
  bad "整仓范围下漏判了断言删除"
else
  if grep -q '降标\[断言删除\] other/b.test.js' <<<"$out"; then
    ok "整仓范围照拦，并指出是 other/b.test.js"
  else
    bad "整仓范围下结论对但条目不对：$out"
  fi
fi

# 恢复 other，改在 proj 之内删断言
printf 'test("b", () => { expect(2).toBe(2) })\ntest("c", () => { expect(3).toBe(3) })\n' > "$REPO/other/b.test.js"
printf 'test("a", () => { expect(1).toBe(1) })\n' > "$REPO/proj/a.test.js"

# ② 范围之内的断言删除：项目目录＝proj，删除就发生在 proj
if out="$(bash "$RUNNER" --root "$REPO/proj" 2>&1)"; then
  bad "范围内的断言删除被放行"
else
  if grep -q '降标\[断言删除\] proj/a.test.js' <<<"$out"; then
    ok "范围内的断言删除照拦（--root proj）"
  else
    bad "范围内结论对但条目不对：$out"
  fi
fi

# ④ --root 给相对路径、从别的目录启动：结论与绝对路径一致
if out="$(cd "$WORK" && bash "$RUNNER" --root "mono/proj" 2>&1)"; then
  bad "相对路径 --root 下漏判了范围内的断言删除"
else
  if grep -q '降标\[断言删除\] proj/a.test.js' <<<"$out"; then
    ok "--root 相对路径与绝对路径结论一致"
  else
    bad "相对路径 --root 条目不对：$out"
  fi
fi

# 范围内的未跟踪新文件也在判定之内：新测试文件里一上来就 .skip → 测试变松
printf 'test("d", () => { expect(4).toBe(4) })\ntest.skip("e", () => { expect(5).toBe(5) })\n' > "$REPO/proj/d.test.js"
if out="$(bash "$RUNNER" --root "$REPO/proj" 2>&1)"; then
  bad "范围内未跟踪文件里的 .skip 被漏判"
else
  if grep -q '降标\[测试变松\] proj/d.test.js' <<<"$out"; then
    ok "范围内的未跟踪新文件参与判定"
  else
    bad "未跟踪文件条目不对：$out"
  fi
fi
# 范围之外的未跟踪新文件不判：先把范围内的断言删除恢复回基线，保证只剩范围外的变化
rm -f "$REPO/proj/d.test.js"
printf 'test("a", () => { expect(1).toBe(1) })\ntest("a2", () => { expect(2).toBe(2) })\n' > "$REPO/proj/a.test.js"
printf 'test.skip("f", () => { expect(6).toBe(6) })\n' > "$REPO/other/f.test.js"
if out="$(bash "$RUNNER" --root "$REPO/proj" 2>&1)"; then
  ok "范围之外的未跟踪新文件不判"
else
  bad "范围之外的未跟踪新文件被误判：$out"
fi
# 对照：同一状态改成整仓范围，这处范围外的 .skip 必须被拦
if out="$(cd "$REPO" && bash "$RUNNER" 2>&1)"; then
  bad "整仓范围下漏判了未跟踪测试文件里的 .skip"
else
  if grep -q '降标\[测试变松\] other/f.test.js' <<<"$out"; then
    ok "整仓范围下未跟踪测试文件里的 .skip 被拦"
  else
    bad "整仓范围条目不对：$out"
  fi
fi

echo "PASS test-floor-guard-scope ($pass ok, $fail fail)"
[[ "$fail" -eq 0 ]]
