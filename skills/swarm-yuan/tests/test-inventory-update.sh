#!/usr/bin/env bash
# test-inventory-update.sh — inventory-update.sh 测试（WP-R3-5：局部清单条目更新）
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
ROOT="$(pwd)"
SH="scripts/inventory-update.sh"
TMP="$(mktemp -d /tmp/iutest.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

# 造一个 skill 骨架（含 §4/§6/§9 表格 + precheck.conf）
mkdir -p "$TMP/skill/references" "$TMP/skill/scripts" "$TMP/proj/src"
# WP-R3-5：inventory-update.sh 运行时用 dirname BASH_SOURCE 找同目录 trace-log.sh 落痕——
# 测试须模拟真实部署结构：把 inventory-update.sh + trace-log.sh 都拷到测试 skill 的 scripts/ 下。
cp "$ROOT/scripts/inventory-update.sh" "$TMP/skill/scripts/inventory-update.sh"
cp "$ROOT/assets/trace-log.sh" "$TMP/skill/scripts/trace-log.sh"
chmod +x "$TMP/skill/scripts/inventory-update.sh" "$TMP/skill/scripts/trace-log.sh"
SH="$TMP/skill/scripts/inventory-update.sh"
cat > "$TMP/skill/references/reference-manual.md" <<'RMEOF'
# reference-manual.md

## §4 组件库清单

| 维度 | 路径 | 稳定性 | 来源 | 接口/约束 |
|------|------|--------|------|-----------|
| 主组件 A | `src/a.ts` | 稳定 | 探查 | 导出 a |
| 主组件 B | `src/b.ts` | 稳定 | 探查 | 导出 b |
| 工具函数 | `src/util.ts` | 稳定 | 探查 | 导出 add |

## §6 接口清单

| 维度 | 路径 | 稳定性 | 来源 | 接口/约束 |
|------|------|--------|------|-----------|
| 主接口 | `src/api/main.ts` | 稳定 | 探查 | `GET /api/main` |

## §9 数据勾稽

| 维度 | 路径 | 稳定性 | 来源 | 接口/约束 |
|------|------|--------|------|-----------|
| 示例勾稽 | `src/service/order.ts` | 稳定 | 探查 | 订单金额 = Σ 明细 |
RMEOF
echo "PROJECT_DIR=\"$TMP/proj\"" > "$TMP/skill/scripts/precheck.conf"
RM="$TMP/skill/references/reference-manual.md"

# --- 态 1：replace 单条目，行数不变 ---
before=$(wc -l < "$RM" | tr -d ' ')
out=$(bash "$SH" "$TMP/skill" --section §4 --match "util.ts" --replace '| 工具函数 | `src/util.ts` | 禁止改 | 探查 | 导出 add，重写请走 ADR |' 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态1 replace exit 0" || bad "态1 replace exit=$rc: $out"
after=$(wc -l < "$RM" | tr -d ' ')
[[ "$before" -eq "$after" ]] && ok "态1 replace 行数不变（${before}）" || bad "态1 行数漂移 ${before}→$after"
grep -q '禁止改' "$RM" && ok "态1 replace 生效（含禁止改）" || bad "态1 replace 未生效"

# --- 态 2：delete 单条目，行数 -1 ---
before=$(wc -l < "$RM" | tr -d ' ')
out=$(bash "$SH" "$TMP/skill" --section §4 --match "a.ts" --delete 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态2 delete exit 0" || bad "态2 delete exit=$rc: $out"
after=$(wc -l < "$RM" | tr -d ' ')
[[ "$after" -eq $((before - 1)) ]] && ok "态2 delete 行数 -1（${before}→${after}）" || bad "态2 行数漂移 ${before}→$after"
grep -q 'src/a.ts' "$RM" && bad "态2 delete 未生效" || ok "态2 delete 生效"

# --- 态 3：append 单条目，行数 +1 ---
before=$(wc -l < "$RM" | tr -d ' ')
out=$(bash "$SH" "$TMP/skill" --section §6 --append '| 新接口 | `src/api/new.ts` | 稳定 | 探查 | `GET /api/new` |' 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态3 append exit 0" || bad "态3 append exit=$rc: $out"
after=$(wc -l < "$RM" | tr -d ' ')
[[ "$after" -eq $((before + 1)) ]] && ok "态3 append 行数 +1（${before}→${after}）" || bad "态3 行数漂移 ${before}→$after"
grep -q 'api/new' "$RM" && ok "态3 append 生效" || bad "态3 append 未生效"

# --- 态 4：多义命中报错（不给多行执行）---
before=$(wc -l < "$RM" | tr -d ' ')
out=$(bash "$SH" "$TMP/skill" --section §4 --match "src/" --delete 2>&1); rc=$?
[[ $rc -eq 1 ]] && ok "态4 多义命中 exit 1" || bad "态4 多义命中 exit=${rc}（应 1）: $out"
echo "$out" | grep -q '多义命中' && ok "态4 多义命中提示" || bad "态4 缺多义提示: $out"
after=$(wc -l < "$RM" | tr -d ' ')
[[ "$before" -eq "$after" ]] && ok "态4 多义命中未改文件" || bad "态4 文件被改 ${before}→$after"

# --- 态 5：§ 段隔离（§4 改不影响 §6）---
before6=$(awk '/^## §6/,0' "$RM" | wc -l | tr -d ' ')
bash "$SH" "$TMP/skill" --section §4 --match "b.ts" --delete >/dev/null 2>&1
after6=$(awk '/^## §6/,0' "$RM" | wc -l | tr -d ' ')
[[ "${before6}" -eq "${after6}" ]] && ok "态5 § 段隔离（§6 不变）" || bad "态5 §6 被误改 ${before6}→${after6}"

# --- 态 6：非 §4/§6/§9 段拒绝 ---
out=$(bash "$SH" "$TMP/skill" --section §5 --match "x" --delete 2>&1); rc=$?
[[ $rc -eq 1 ]] && echo "$out" | grep -q '仅支持' && ok "态6 非 §4/§6/§9 拒绝" || bad "态6 未拒绝: exit=$rc $out"

# --- 态 7：无命中报错 ---
out=$(bash "$SH" "$TMP/skill" --section §4 --match "nonexistent" --delete 2>&1); rc=$?
[[ $rc -eq 1 ]] && echo "$out" | grep -q '无命中' && ok "态7 无命中报错" || bad "态7 未报错: exit=$rc $out"

# --- 态 8：新行格式校验（R39-D9：契约对齐模板两列口径——单列拒绝，两列放行）---
out=$(bash "$SH" "$TMP/skill" --section §4 --match "x" --replace "| 单列 |" 2>&1); rc=$?
[[ $rc -eq 1 ]] && echo "$out" | grep -q '至少 2 列' && ok "态8a 单列行拒绝" || bad "态8a 未拒绝: exit=$rc $out"
out=$(bash "$SH" "$TMP/skill" --section §4 --match "util.ts" --replace "| a.ts | 两列行（模板口径） |" 2>&1); rc=$?
[[ $rc -eq 0 ]] && ok "态8b 两列行放行（模板契约）" || bad "态8b 两列行被误拒: exit=$rc $out"

# --- 态 9：decisions.jsonl 落痕（G1 决策治理）---
[[ -f "$TMP/proj/.swarm-yuan/decisions.jsonl" ]] && ok "态9 decisions.jsonl 落盘" || bad "态9 未落盘"
grep -q 'inventory-update' "$TMP/proj/.swarm-yuan/decisions.jsonl" && ok "态9 jsonl 含 inventory-update 决策" || bad "态9 jsonl 缺决策"

[[ $FAIL -eq 0 ]] && { echo "PASS test-inventory-update"; exit 0; } || { echo "FAIL test-inventory-update" >&2; exit 1; }
