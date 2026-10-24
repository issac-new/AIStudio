#!/usr/bin/env bash
# test-r141-compendium-fullcheck.sh — R141：build-compendium 抽检假绿根治锁
# 背景（R140 实录两例假绿）：旧检查只覆盖卷一/四/六、每卷只取正本前 200 非空行、
#   行级「全文任一处命中」即算过——卷二/三/五零覆盖；usage-manual 深位（~404 行）改动
#   后仍报「卷四 新鲜」。根治 = 全卷逐字节比对 + 九卷结构守卫 + --regen 一键重灌
#   （自校验通过才落盘）+ 接入 run-sweep ⑦与 CI。
# 锁矩阵：绿路径 / 深位变异（假绿①）/ 零覆盖卷变异（假绿②）/ 行级改写 / 结构删除
#   fail-closed / regen 自愈 / 收口门接线。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

BC="scripts/build-compendium.sh"

# ① 语法与契约
bash -n "$BC" && ok "①a bash -n 通过" || bad "①a 语法错误"
grep -q -- '--regen' "$BC" && ok "①b --regen 再生成模式在位" || bad "①b 缺 --regen"

# ② 真实绿路径：仓库当前六卷逐字节一致
if "$BC" --check >/tmp/r141-real.log 2>&1; then
  ok "② 真实汇编六卷逐字节一致（绿路径 rc 0）"
else
  bad "② 真实汇编报陈旧：$(tail -3 /tmp/r141-real.log | tr '\n' ' ')"
fi

# ③ 沙箱（最小树，保相对路径布局；每例先还原再变异）
SB="$(mktemp -d /tmp/r141sb.XXXXXX)"
trap 'rm -rf "${SB}"' EXIT
mkdir -p "$SB/swarm-yuan/scripts" "$SB/swarm-yuan/assets" "$SB/swarm-yuan/references" "$SB/docs"
cp "$BC" "$SB/swarm-yuan/scripts/"
sb_restore() {
  cp README.md "$SB/swarm-yuan/" 2>/dev/null || true
  cp assets/facts.conf "$SB/swarm-yuan/assets/"
  cp references/capability-map.md "$SB/swarm-yuan/references/"
  cp ../docs/design-compendium-full.md ../docs/design-evolution.md ../docs/upstream-baseline.md ../docs/usage-manual.md "$SB/docs/"
}
sb_restore

# ③a 深位变异（旧版前 200 非空行窗口外——R140 假绿场景①实态）
sb_restore
printf '\n## 尾部深位新增段（R141 变异）\n' >> "$SB/docs/usage-manual.md"
out=$( (cd "$SB/swarm-yuan" && bash scripts/build-compendium.sh --check) 2>&1 ); rc=$?
if [[ $rc -eq 1 ]] && printf '%s\n' "$out" | grep -q "卷四（usage-manual.md）已变更"; then
  ok "③a usage-manual 尾部深位漂移 → rc 1 点名卷四（旧版假绿场景被封死）"
else
  bad "③a 未按预期点名卷四（rc=${rc}）：$(printf '%s\n' "$out" | tail -2 | tr '\n' ' ')"
fi

# ③b 零覆盖卷变异（旧版卷二完全不在检查面——R140 假绿场景②实态）
sb_restore
printf '\n<!-- R141 变异 -->\n' >> "$SB/docs/design-evolution.md"
out=$( (cd "$SB/swarm-yuan" && bash scripts/build-compendium.sh --check) 2>&1 ); rc=$?
if [[ $rc -eq 1 ]] && printf '%s\n' "$out" | grep -q "卷二（design-evolution.md）已变更"; then
  ok "③b design-evolution 尾部漂移 → rc 1 点名卷二（旧零覆盖卷入检）"
else
  bad "③b 未按预期点名卷二（rc=${rc}）：$(printf '%s\n' "$out" | tail -2 | tr '\n' ' ')"
fi

# ③c 卷五变异（facts.conf）
sb_restore
printf '\n# R141_MUTATION_LINE\n' >> "$SB/swarm-yuan/assets/facts.conf"
out=$( (cd "$SB/swarm-yuan" && bash scripts/build-compendium.sh --check) 2>&1 ); rc=$?
if [[ $rc -eq 1 ]] && printf '%s\n' "$out" | grep -q "卷五（facts.conf）已变更"; then
  ok "③c facts.conf 追加行 → rc 1 点名卷五（旧零覆盖卷入检）"
else
  bad "③c 未按预期点名卷五（rc=${rc}）：$(printf '%s\n' "$out" | tail -2 | tr '\n' ' ')"
fi

# ③d 行级改写（旧版「行在全文任一处命中即过」的判定盲区）
sb_restore
sed -i.bak 's/升级先核验项目状态机/升级先核验项目状态机（R141 行级变异）/' "$SB/docs/usage-manual.md" && rm -f "$SB/docs/usage-manual.md.bak"
out=$( (cd "$SB/swarm-yuan" && bash scripts/build-compendium.sh --check) 2>&1 ); rc=$?
if [[ $rc -eq 1 ]] && printf '%s\n' "$out" | grep -q "卷四"; then
  ok "③d 单行改写 → rc 1 点名卷四（行级命中盲区封死）"
else
  bad "③d 行级改写未检出（rc=${rc}）"
fi

# ③e 结构守卫：删「# 卷五」标题行 → fail-closed
sb_restore
sed -i.bak '/^# 卷五 数字口径单源$/d' "$SB/docs/design-compendium-full.md" && rm -f "$SB/docs/design-compendium-full.md.bak"
out=$( (cd "$SB/swarm-yuan" && bash scripts/build-compendium.sh --check) 2>&1 ); rc=$?
if [[ $rc -eq 1 ]] && printf '%s\n' "$out" | grep -q "卷结构缺失或失序"; then
  ok "③e 卷标题被删 → rc 1 点名卷结构（fail-closed）"
else
  bad "③e 结构缺失未拦截（rc=${rc}）：$(printf '%s\n' "$out" | tail -2 | tr '\n' ' ')"
fi

# ③f --regen 自愈：保留 ③c 变异（facts 追加行），regen 后检查转绿且变异行入册
sb_restore
printf '\n# R141_MUTATION_LINE\n' >> "$SB/swarm-yuan/assets/facts.conf"
out=$( (cd "$SB/swarm-yuan" && bash scripts/build-compendium.sh --regen) 2>&1 ); rc=$?
if [[ $rc -eq 0 ]] && grep -q "R141_MUTATION_LINE" "$SB/docs/design-compendium-full.md"; then
  ok "③f --regen 自愈：重灌后检查 rc 0 且变异行已入册"
else
  bad "③f regen 未自愈（rc=${rc}）：$(printf '%s\n' "$out" | tail -2 | tr '\n' ' ')"
fi

# ③g --regen 事故守卫：卷结构残缺时 regen 拒绝落盘（原件保留）
sb_restore
sed -i.bak '/^# 卷六 吸收清单$/d' "$SB/docs/design-compendium-full.md" && rm -f "$SB/docs/design-compendium-full.md.bak"
cp "$SB/docs/design-compendium-full.md" /tmp/r141-broken.md
out=$( (cd "$SB/swarm-yuan" && bash scripts/build-compendium.sh --regen) 2>&1 ); rc=$?
if [[ $rc -eq 1 ]] && cmp -s /tmp/r141-broken.md "$SB/docs/design-compendium-full.md"; then
  ok "③g 结构残缺时 --regen 拒绝落盘（原件字节保留）"
else
  bad "③g regen 事故守卫失效（rc=${rc}，原件被改:$(cmp -s /tmp/r141-broken.md "$SB/docs/design-compendium-full.md" && echo no || echo yes)）"
fi
rm -f /tmp/r141-broken.md

# ④ 收口门接线
grep -q "build-compendium" tests/run-sweep.sh \
  && ok "④a run-sweep ⑦阶段在位" || bad "④a sweep 未接 build-compendium"
grep -q "build-compendium" ../.github/workflows/ci.yml \
  && ok "④b CI 步在位" || bad "④b CI 未接 build-compendium"

# ===== 收口 =====
if [[ "${FAIL}" -eq 0 ]]; then
  echo "✓ test-r141-compendium-fullcheck 全部断言通过"
else
  echo "✗ test-r141-compendium-fullcheck 存在失败断言" >&2
fi
exit "${FAIL}"
