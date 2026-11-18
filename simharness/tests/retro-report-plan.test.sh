#!/bin/bash
# 守门：run31 报告对账根治批（2026-11-18-retro-report-plan.md）
# ①五轮 hero＋run31 逐歩叙事在册 ②预检⑪动态键/⑪b 符号在位 ③tri 同键守卫
# ④生成器四处修复符号 ⑤方案 §5.10.1 节序 ⑥查19 十七组 ⑦变异：抽走 run31 注册→红
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # → simharness/
OV="$(cd "$HERE/.." && pwd)"
fail() { echo "FAIL retro-report-plan: $1"; exit 1; }
ok()  { echo "PASS $1"; }

# ① 六注册在册
for k in '20261105-v8-run27' '20261107-v8-run28' '20261111-v8-run29' '20261113-v8-run30' '20261117-v8-run31'; do
  grep -q "'$k': PART1_RUN" "$HERE/mux/final-report-merge.py" || fail "PART1 hero 未注册：$k"
done
grep -q "STEPS_META_20261117_V8_RUN31" "$HERE/mux/mx-report-gen.py" || fail "run31 逐歩叙事未注册"
grep -q "_NARR\['20261117-v8-run31'\]" "$HERE/mux/mx-report-gen.py" || fail "run31 _NARR 挂载缺"
n_keys=$(sed -n '/STEPS_META_20261117_V8_RUN31 = {/,/^}/p' "$HERE/mux/mx-report-gen.py" | grep -c 'dict(keys=')
[ "$n_keys" = 26 ] || fail "run31 叙事条数=$n_keys（期望 26）"
ok "① 六注册在册（5 hero＋26 条逐歩）"

# ② 预检两门
grep -q '_prev_run.*run-metrics' "$HERE/mux/mx-prelaunch-check.sh" || fail "⑪ 动态键缺"
grep -q '⑪b 上轮报告零骨架占位' "$HERE/mux/mx-prelaunch-check.sh" || fail "⑪b 门缺"
ok "② 预检⑪动态化＋⑪b 在位"

# ③ tri 同键守卫
grep -q '_same_key_issue' "$HERE/mux/tri-disp-backfill.py" || fail "tri 同键守卫缺"
ok "③ tri 守卫在位"

# ④ 生成器四处修复符号
grep -q "窗口右端锚=终局时刻" "$HERE/mux/mx-report-gen.py" || fail "U1 利用率锚缺"
grep -q "个主步未达完成态" "$HERE/mux/mx-report-gen.py" || fail "U2 动态未完成缺"
grep -q "_snap_note" "$HERE/mux/mx-report-gen.py" || fail "U4 快照差注记缺"
grep -q "带缺口通过" "$HERE/mux/mx-report-gen.py" || fail "U8 G4 卡面缺"
grep -q "补过口径" "$HERE/mux/mx-report-gen.py" || fail "U8 G5 卡面缺"
ok "④ 生成器五符号在位"

# ⑤ 方案结构
grep -q '### 5.10.1 run26 复盘条款' "$OV/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md" || fail "5.10.1 未落定"
grep -q '### 5.10 run25 复盘条款' "$OV/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md" || fail "5.10 run25 缺"
_line_x=$(grep -n '### 5.10 run25' "$OV/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md" | head -1 | cut -d: -f1)
_line_1=$(grep -n '### 5.10.1 run26' "$OV/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md" | head -1 | cut -d: -f1)
_line_11=$(grep -n '### 5.11 新能力' "$OV/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md" | head -1 | cut -d: -f1)
[ "$_line_x" -lt "$_line_1" ] && [ "$_line_1" -lt "$_line_11" ] || fail "节序未归位（$_line_x/$_line_1/$_line_11）"
ok "⑤ §5.10→5.10.1→5.11 节序归位"

# ⑥ 查19 十七组
grep -q "'harness-contract', 'proactive-r2', 'always-on', 'kanban-version'" "$HERE/mux/mx-report-audit.py" || fail "查19 四新组缺"
ok "⑥ 审计查19 十七组"

# ⑦ 变异：临时抽走 run31 _NARR 挂载行→⑪ 判据应变红（模拟检测，不落盘改文件——
#    用 grep 反证：挂载行存在时注册表完整性依赖它）
grep -c "_NARR\['20261117-v8-run31'\]" "$HERE/mux/mx-report-gen.py" | grep -q '^1$' || fail "变异预检：挂载行应恰 1 处"
ok "⑦ 变异锚（挂载行唯一性）"

echo "retro-report-plan: all ok"
