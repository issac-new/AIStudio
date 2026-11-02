#!/usr/bin/env bash
# test-spec-template-maet.sh — spec 模板 §19.2/§19.3 MAET 四路径结构守门
# （2026-11-02 方法论吸收批 C，spec 2026-11-02-maet-retrieval-ladder）。
# 模板是 AI 填写契约：结构漂移=契约漂移（路径类型列缺位/四路径行缺一/checklist 项被删）
# 都会让 MAET 完备性静默失效，本测试锁结构。
set -uo pipefail
cd "$(dirname "${0}")/.." || exit 1
TPL="assets/spec-template.md"
FAIL=0
ok()  { echo "  ✓ $1"; }
bad() { echo "  ✗ $1" >&2; FAIL=1; }

[[ -f "$TPL" ]] || { echo "✗ 缺 $TPL" >&2; exit 1; }

# --- 态1：§19.2 表头含「路径类型」列 ---
grep -q '| 用例名 | 路径类型 | 给定（Given） |' "$TPL" \
  && ok "态1 §19.2 表头含路径类型列" || bad "态1 表头缺路径类型列（MAET 标注面缺位）"

# --- 态2：四路径行各至少一行（M/A/E/T） ---
grep -q '^| （主流程） | M ' "$TPL" && ok "态2 M 主流程行" || bad "态2 缺 M 行"
grep -q '^| （替代流程：合法但非典型输入/顺序/分支） | A ' "$TPL" && ok "态2 A 替代流程行" || bad "态2 缺 A 行"
grep -q '^| （异常路径：错误输入/依赖失败/超时） | E ' "$TPL" && ok "态2 E 异常路径行" || bad "态2 缺 E 行"
grep -q '^| （终止路径：取消/中断/超时终止后回收与终态） | T ' "$TPL" && ok "态2 T 终止路径行" || bad "态2 缺 T 行（Termination 缺位=MAET 退化为三路径）"

# --- 态3：§19.2 段头带 MAET 完备声明 ---
grep -q '19.2 用例骨架（编码前先写，TDD/BDD；MAET 四路径完备）' "$TPL" \
  && ok "态3 §19.2 段头 MAET 声明" || bad "态3 段头声明缺位"

# --- 态4：§19.3 checklist 含 MAET 完备项 ---
grep -q '\[ \] MAET 四路径标注完备（每特性至少 M/A/E/T 各 1 条' "$TPL" \
  && ok "态4 §19.3 MAET checklist 项" || bad "态4 checklist 项缺位"

# --- 态5：四路径语义说明行在（防只留表格不留判据；模板用 **T**ermination 加粗，grep 取星号后稳定子串） ---
grep -q 'ermination 终止路径（取消/中断/超时终止后的资源回收与状态落定）' "$TPL" \
  && ok "态5 四路径判据说明" || bad "态5 判据说明缺位"

# --- 态6：知识检索协议档与分发清单一致（D 面：references 档须进 dist-manifest）---
GEN="scripts/generate-skill.sh"
grep -q '"references/knowledge-retrieval-ladder.md|ref|standard"' "$GEN" \
  && ok "态6 ladder 进 dist-manifest" || bad "态6 ladder 未登记分发（目标技能拿不到）"
grep -q '"references/failure-taxonomy.md|ref|standard"' "$GEN" \
  && ok "态6 taxonomy 补账进 dist-manifest" || bad "态6 taxonomy 未登记分发（B 批漏账未清）"

[[ $FAIL -eq 0 ]] && { echo "PASS test-spec-template-maet"; exit 0; } || { echo "FAIL test-spec-template-maet" >&2; exit 1; }
