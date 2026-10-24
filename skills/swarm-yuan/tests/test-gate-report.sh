#!/usr/bin/env bash
# test-gate-report.sh — gate-report.sh 行为级回归测试（gate-runs.jsonl → Markdown 门禁运行报告）
# 契约：
#   用法 gate-report.sh [jsonl] [输出.md]；jsonl 缺省 ${GATE_RUNS_DIR:-.}/gate-runs.jsonl
#   无 jsonl / 空文件 / 全坏行 → 提示并 exit 0（fail-open，与门禁族姿态一致）
#   报告 7 节（标识/概述/环境/汇总/证据分级/fail 清单/趋势结论）+ 可选 §8 key-nodes 看板
#   门禁行序：ALL_GATES_FULL 固定序在前，未登记门禁追加于后；missing_evidence = FULL 中无记录数
#   输出缺省：GATE_RUNS_DIR 非空 → 该目录 report-<UTC>.md；否则 stdout；写失败回退 stdout
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
SH="scripts/gate-report.sh"
TMP=$(mktemp -d /tmp/grt.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# 夹具：7 门禁 9 条有效记录（pass 4 / fail 3 / warn 1 / skip 1），混入坏行验证跳过
J="$TMP/runs.jsonl"
cat > "$J" <<'EOF'
{"ts":"2026-09-01T00:00:01Z","run":1,"gate":"check_branch","status":"pass","ids":"","duration_s":1}
{"ts":"2026-09-01T00:00:02Z","run":2,"gate":"check_branch","status":"pass","ids":"","duration_s":3}
not-json-garbage
{"ts":"2026-09-01T00:00:03Z","run":3,"gate":"check_test","status":"pass","ids":"","duration_s":1}
{"ts":"2026-09-01T00:00:04Z","run":4,"gate":"check_test","status":"fail","ids":["G1","G2"],"duration_s":1}
{"ts":"2026-09-01T00:00:05Z","run":5,"gate":"check_test","status":"warn","ids":"","duration_s":1}
{"ts":"2026-09-01T00:00:06Z","run":6,"gate":"check_test","status":"skip","ids":"","duration_s":0}

{"ts":"2026-09-01T00:00:07Z","run":7,"gate":"check_custom","status":"pass","ids":"","duration_s":1}
{"ts":"2026-09-01T00:00:08Z","run":8,"gate":"check_sbom","status":"fail","ids":[],"duration_s":1}
{"ts":"2026-09-01T00:00:09Z","run":9,"gate":"check_docs_pack","status":"fail","duration_s":1}
EOF

# --- 态 1-3：fail-open 族（缺文件 / 空文件 / 全坏行）→ 提示 exit 0 ---
out=$(bash "$SH" "$TMP/nonexistent.jsonl" 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF '未找到 gate-runs 证据文件' && ok "态1 缺 jsonl fail-open" || bad "态1 rc=${rc}: ${out}"
: > "$TMP/empty.jsonl"
out=$(bash "$SH" "$TMP/empty.jsonl" 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF '未找到 gate-runs 证据文件' && ok "态2 空文件 fail-open" || bad "态2 rc=${rc}: ${out}"
printf 'garbage\nanother bad\n' > "$TMP/bad.jsonl"
out=$(bash "$SH" "$TMP/bad.jsonl" 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF '无有效门禁记录' && ok "态3 全坏行拒绝聚合" || bad "态3 rc=${rc}: ${out}"

# --- 态 4：正常报告（stdout 模式）骨架与节结构 ---
out=$(bash "$SH" "$J" 2>"$TMP/err"); rc=$?
[[ $rc -eq 0 ]] && ok "态4 正常聚合 exit 0" || bad "态4 rc=${rc}: $(head -3 "$TMP/err")"
echo "$out" | grep -qF '# 门禁运行报告' && ok "态4 报告标题" || bad "态4 标题缺失"
for _sec in '## 1. 报告标识' '## 2. 概述' '## 3. 测试环境' '## 4. 执行结果汇总' '## 5. fail id 清单' '## 6. 趋势摘要' '## 7. 结论'; do
  echo "$out" | grep -qF "${_sec}" && ok "态4 节存在：${_sec}" || bad "态4 节缺失：${_sec}"
done

# --- 态 5：标识与环境 ---
echo "$out" | grep -q '报告编号：`gate-report-' && ok "态5 报告编号" || bad "态5 报告编号缺失"
echo "$out" | grep -qF '生成工具：`scripts/gate-report.sh`' && ok "态5 生成工具署名" || bad "态5 署名缺失"

# --- 态 6：概述统计（坏行被跳过；覆盖 5 门禁；时间范围）---
echo "$out" | grep -qF '总记录 9 条，覆盖门禁 5 个' && ok "态6 记录/门禁计数（坏行跳过）" || bad "态6 计数异常"
echo "$out" | grep -qF '2026-09-01T00:00:01Z ～ 2026-09-01T00:00:09Z' && ok "态6 时间范围" || bad "态6 时间范围异常"

# --- 态 7：状态分布与整体通过率（4/9=44.4%）---
echo "$out" | grep -qF 'pass 4 · fail 3 · warn 1 · skip 1' && ok "态7 状态分布" || bad "态7 分布异常"
echo "$out" | grep -qF '**44.4%**' && ok "态7 整体通过率 44.4%" || bad "态7 通过率异常"

# --- 态 8：§4.1 门禁行（样本/状态计数/末次态/平均耗时）---
echo "$out" | grep -qF '| `check_branch` | 2 | 2 | 0 | 0 | 0 | 100.0% | pass |' && ok "态8 check_branch 行" || bad "态8 branch 行异常"
echo "$out" | grep -qF '| `check_test` | 4 | 1 | 1 | 1 | 1 | 25.0% | skip |' && ok "态8 check_test 行（末次 skip）" || bad "态8 test 行异常"
echo "$out" | grep -qF '| `check_branch` | 2 | 2 | 0 | 0 | 0 | 100.0% | pass | 2026-09-01T00:00:02Z | 2.0 |' \
  && ok "态8 平均耗时 2.0s" || bad "态8 耗时异常"

# --- 态 9：§4.2 证据分级（全部门禁有结果 → Exercised 5 / Present 0；missing 动态取 FULL 序）---
echo "$out" | grep -qF '| Exercised | 5 |' && ok "态9 Exercised=5" || bad "态9 Exercised 异常"
echo "$out" | grep -qF '| Present | 0 |' && ok "态9 Present=0" || bad "态9 Present 异常"
_full_cnt=$(sed -n 's/^ALL_GATES_FULL=(\(.*\))/\1/p' assets/precheck.sh | wc -w | tr -d ' ')
# 已登记且有记录的门禁：branch/test/sbom/docs_pack（check_custom 未登记不入 missing 口径）
_expect_miss=$(( _full_cnt - 4 ))
echo "$out" | grep -qF "| missing_evidence | ${_expect_miss} |" \
  && ok "态9 missing_evidence=${_expect_miss}（FULL ${_full_cnt} 门）" || bad "态9 missing 异常（期望 ${_expect_miss}）"

# --- 态 10：门禁固定序——check_branch（FULL 序首区）先于未登记 check_custom ---
_l1=$(printf '%s\n' "$out" | grep -nF '| `check_branch` |' | head -1 | cut -d: -f1)
_l2=$(printf '%s\n' "$out" | grep -nF '| `check_custom` |' | head -1 | cut -d: -f1)
[[ -n "${_l1}" && -n "${_l2}" && "${_l1}" -lt "${_l2}" ]] && ok "态10 未登记门禁追加于后" || bad "态10 序异常 l1=${_l1} l2=${_l2}"

# --- 态 11：§5 fail id 清单（ids 数组展开、空数组与缺字段 →（无 id））---
echo "$out" | grep -qF '`G1、G2`' && ok "态11 fail id 展开为 G1、G2" || bad "态11 id 展开异常"
_noid=$(printf '%s\n' "$out" | grep -cF '（无 id）')
[[ "${_noid}" -ge 2 ]] && ok "态11 空 ids/缺 ids →（无 id）×2" || bad "态11 无 id 标记 ${_noid} 处（应 ≥2）"

# --- 态 12：§6 趋势序列映射（✓✗⚠·）与窗口通过率 ---
echo "$out" | grep -qF '| `check_test` | ✓✗⚠· | 25.0% |' && ok "态12 趋势序列 ✓✗⚠·" || bad "态12 趋势异常"

# --- 态 13：§7 结论（fail 全列于 §5 的准出提示）---
echo "$out" | grep -qF 'fail 记录 3 条已全部列于 §5' && ok "态13 准出提示" || bad "态13 提示异常"
echo "$out" | grep -qF '曾出现 fail 的门禁 3 个' && ok "态13 曾 fail 门禁计数" || bad "态13 门禁计数异常"

# --- 态 14：指定输出文件 → 落盘 + ✓ 回显 + 内容含 §7 ---
out=$(bash "$SH" "$J" "$TMP/report.md" 2>&1); rc=$?
[[ $rc -eq 0 && -s "$TMP/report.md" ]] && echo "$out" | grep -qF "门禁运行报告已生成：${TMP}/report.md" \
  && ok "态14 指定输出落盘" || bad "态14 落盘异常: ${out}"
grep -qF '## 7. 结论' "$TMP/report.md" && ok "态14 文件内容完整" || bad "态14 文件缺 §7"

# --- 态 15：GATE_RUNS_DIR + 无输出参数 → 该目录自动生成 report-*.md ---
mkdir -p "$TMP/runsdir"
cp "$J" "$TMP/runsdir/gate-runs.jsonl"
out=$(GATE_RUNS_DIR="$TMP/runsdir" bash "$SH" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ls "$TMP/runsdir"/report-*.md >/dev/null 2>&1 \
  && ok "态15 GATE_RUNS_DIR 自动落盘" || bad "态15 自动落盘异常: ${out}"

# --- 态 16：输出路径不可写 → 回退 stdout + ✗ 提示，exit 0 ---
out=$(bash "$SH" "$J" "$TMP/no-such-dir/r.md" 2>&1); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF '报告写入失败' && echo "$out" | grep -qF '## 7. 结论' \
  && ok "态16 写失败回退 stdout" || bad "态16 回退异常 rc=${rc}"

# --- 态 17：同目录 key-nodes.jsonl → §8 看板 ---
cp "$J" "$TMP/kn.jsonl"
printf '%s\n' '{"key_node":"编码","status":"done","ts":"2026-09-01T00:00:01Z","note":"n1"}' > "$TMP/key-nodes.jsonl"
out=$(bash "$SH" "$TMP/kn.jsonl" 2>/dev/null); rc=$?
[[ $rc -eq 0 ]] && echo "$out" | grep -qF '## 8. 关键节点看板' && echo "$out" | grep -qF '| 编码 | done |' \
  && ok "态17 key-nodes 看板" || bad "态17 看板异常"

[[ $FAIL -eq 0 ]] && { echo "PASS test-gate-report"; exit 0; } || { echo "FAIL test-gate-report" >&2; exit 1; }
