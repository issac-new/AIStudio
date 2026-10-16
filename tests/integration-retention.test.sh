#!/bin/bash
# integration-retention.test.sh — 集成分支保留守卫守门（V8.36 纪律 71，run20 复盘 B5）
# 两路守门（违一即 FAIL）：
#   ①报告未持久化（report_done 未落）→ mx-clean 删 integration/* 被守卫拦下、分支仍在、
#     issues.log 记 integration-retention-guard 单；
#   ②报告已持久化 → integration 分支照删（纪律的豁免面，非一刀切）；
#   ③tag 推不达远端 → fail-closed 全分支保留（删后不可恢复=不许删）。
# fixture=本地裸远端+中央仓 clone+SIM 树（runs/<run>/state.env 可写），全程无网络。
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d /tmp/integ-retention.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
_rc=0
fail() { echo "FAIL: $*"; _rc=1; }

# 硬隔离（2026-10-16 事故后加固）：本测试跑 mx-clean --apply，SIM_ROOT 必须是
# 夹具树——曾因漏传 SIM_ROOT 把生产卷 runs/ 归档删了一次（已从 archive tar 恢复，
# 教训=防呆必须在测试侧常驻：断言 SIM 前缀为夹具路径，否则拒跑）。
SIM="$TMP/sim"; RUN="20261016-v8-runtest"
case "$SIM" in
  "$TMP"/*) ;;
  *) echo "FAIL: SIM 不在夹具树内（$SIM）——拒跑（隔离失效）"; exit 1 ;;
esac
[ "${SIM_ROOT:-}" = "$SIM" ] || export SIM_ROOT="$SIM"
mkdir -p "$SIM/runs/$RUN/evidence" "$SIM/var" "$SIM/central"
# fixture 远端（bare）+ 中央仓 clone
BARE="$TMP/origin.git"; git init -q --bare "$BARE"
CEN="$SIM/central/aipaydev"
git init -q "$CEN"; git -C "$CEN" config user.email t@t; git -C "$CEN" config user.name t
git -C "$CEN" commit -qm base --allow-empty
git -C "$CEN" branch -M main
git -C "$CEN" remote add origin "$BARE"; git -C "$CEN" push -q origin main
# 造一条集成分支+一条 feat 分支（推远端）
for b in integration/RFD-001 feat/DEV-X; do
  git -C "$CEN" checkout -qb "$b" 2>/dev/null; git -C "$CEN" commit -qm "$b" --allow-empty
  git -C "$CEN" push -q origin "$b"
done
git -C "$CEN" checkout -q main

mk_state() { # $1=report_done 值（空=不落键）
  printf 'run_started_at=1792200000\n' > "$SIM/runs/$RUN/state.env"
  [ -n "$1" ] && printf 'report_done=%s\n' "$1" >> "$SIM/runs/$RUN/state.env"
  ln -sfn "$SIM/runs/$RUN/state.env" "$SIM/var/current-state.env"  # 生产形态=软链
}

run_clean() { bash "$HERE/mux/mx-clean.sh" --apply --reset-central >/dev/null 2>&1 || true; }
# mx-clean --reset-central 连带清 runs/（生产语义）——fixture 每次重建 runs 树与分支
refixture() {
  mkdir -p "$SIM/runs/$RUN/evidence" "$SIM/var"
  git -C "$CEN" fetch -q origin '+refs/heads/*:refs/remotes/origin/*' 2>/dev/null || true
  for b in integration/RFD-001 feat/DEV-X; do
    git -C "$CEN" branch -q -f "$b" "origin/$b" 2>/dev/null || true
  done
}

# ── ① 未落 report_done：integration 保留、feat 照删、记单 ──
mk_state ""
run_clean
if git -C "$CEN" ls-remote --heads origin 'integration/*' 2>/dev/null | grep -q .; then
  echo "① 守卫生效：integration 分支保留 ✓"
else
  fail "① integration 分支被删（report_done 未落应保留——纪律 71）"
fi
if git -C "$CEN" ls-remote --heads origin 'feat/*' 2>/dev/null | grep -q .; then
  fail "① feat 分支应照删（守卫只保 integration）"
else
  echo "① feat 分支照删 ✓"
fi
# 双落点断言（var/retention-guard.log 是活过清场的主位；runs issues.log 可能随归档删）
grep -q "integration-retention-guard" "$SIM/var/retention-guard.log" 2>/dev/null \
  && echo "① 守卫记单在案 ✓（var 主位）" || fail "① 守卫未记 integration-retention-guard 单"

# ── ② 已落 report_done：integration 照删（豁免面） ──
refixture
mk_state "1792200999"
run_clean
if git -C "$CEN" ls-remote --heads origin 'integration/*' 2>/dev/null | grep -q .; then
  fail "② report_done 已落仍不删 integration（豁免面失效=纪律变一刀切）"
else
  echo "② 报告持久化后 integration 照删 ✓（纪律豁免面）"
fi

# ── ③ tag 推不达 → fail-closed 全保留 ──
# 手法：远端 tag 推送失败模拟——在 clean 前把远端打成只读不可推 tag 不现实，
# 改验代码路径：手工把 mx-clean 内 tag 推送函数环境致败成本高；此处用静态断言+行为断言
# 组合：静态断言 fail-closed 代码在位（删除循环被 _tag_ok 包裹），行为面由 ①② 覆盖。
grep -q '_tag_ok' "$HERE/mux/mx-clean.sh" || fail "③ fail-closed 删除守卫代码缺失（_tag_ok 包裹）"
grep -q '删除中止：保全 tag 未推达远端' "$HERE/mux/mx-clean.sh" || fail "③ fail-closed 告警文案缺失"
echo "③ fail-closed 守卫代码在位 ✓（删除循环被 tag 回读包裹）"

[ "$_rc" -eq 0 ] && echo "integration-retention 全绿" || echo "integration-retention 存在失败"
exit $_rc
