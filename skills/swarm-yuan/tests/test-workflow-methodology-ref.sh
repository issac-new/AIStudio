#!/usr/bin/env bash
# test-workflow-methodology-ref.sh — R52 节点级「方法论引用」机器校验变异锁
#
# 弱覆盖背景：R51 分派表闭合任务→档反向索引，但 workflow.md 节点段是否逐节点实载
# 方法论引用此前无断言（R51 自曝弱覆盖，R52 消除）。本测试锁 verify-completeness 双要素契约：
#   正向：3 节点各含 调用追踪+方法论引用 → 通过（rc=0）
#   负向①：剥掉节点②的方法论引用 → rc=1 且报「缺方法论引用」（新契约变异锁）
#   负向②：剥掉节点③的调用追踪 → rc=1 且报「缺追踪要素」（既有契约防回潮）
#
# 用法: bash tests/test-workflow-methodology-ref.sh
set -u
cd "$(dirname "${0}")/.." || exit 1
GS="scripts/generate-skill.sh"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/swarm-wfref.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }

mk_skill() { # $1=skill-dir：SKILL.md（status: active，走非 draft 裁决）+ 3 节点全要素 workflow.md
  local d="$1"
  mkdir -p "$d/references"
  printf '# test skill\n\nstatus: active\n' > "$d/SKILL.md"
  cat > "$d/references/workflow.md" <<'WF'
# workflow.md

## 节点①：需求理解

**⑩ 方法论引用：** `references/decision-governance.md`（用户决策留痕）

**调用追踪：**
- 公告：`→ [节点①] 调用 <工具> · <目的>`

---

## 节点②：探查

**⑩ 方法论引用：** `references/knowledge-lifecycle-methodology.md`（读法六步）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "探查"`

---

## 节点③：设计 spec

**⑩ 方法论引用：** `references/cost-estimation-methodology.md`（§25 估算）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "设计 spec"`
WF
}

# --- 正向：全要素 → 通过 ---
mk_skill "$TMP/pos"
out=$(bash "$GS" --verify-completeness "$TMP/pos" 2>&1); rc=$?
if [[ $rc -eq 0 ]] && ! printf '%s' "$out" | grep -Eq '缺方法论引用|缺追踪要素'; then
  ok "正向：3 节点全要素通过 verify-completeness"
else
  bad "正向应通过，rc=${rc}；输出：${out}"
fi

# --- 负向①：剥掉节点②的方法论引用行 → 拦截 ---
mk_skill "$TMP/neg1"
awk 'BEGIN{del=0} /^## 节点②/{del=1} /^## 节点③/{del=0} !(del && /方法论引用/)' \
  "$TMP/neg1/references/workflow.md" > "$TMP/neg1/references/workflow.md.t" \
  && mv "$TMP/neg1/references/workflow.md.t" "$TMP/neg1/references/workflow.md"
out=$(bash "$GS" --verify-completeness "$TMP/neg1" 2>&1); rc=$?
if [[ $rc -eq 1 ]] && printf '%s' "$out" | grep -q '缺方法论引用'; then
  ok "负向①：节点②缺方法论引用被拦截（rc=1，报 file:line）"
else
  bad "负向①应拦截，rc=${rc}；输出：${out}"
fi

# --- 负向②：剥掉节点③的调用追踪行（节点③为末节点，del 至文末）→ 拦截 ---
mk_skill "$TMP/neg2"
awk 'BEGIN{del=0} /^## 节点③/{del=1} !(del && (/调用追踪/ || /trace-log/))' \
  "$TMP/neg2/references/workflow.md" > "$TMP/neg2/references/workflow.md.t" \
  && mv "$TMP/neg2/references/workflow.md.t" "$TMP/neg2/references/workflow.md"
out=$(bash "$GS" --verify-completeness "$TMP/neg2" 2>&1); rc=$?
if [[ $rc -eq 1 ]] && printf '%s' "$out" | grep -q '缺追踪要素'; then
  ok "负向②：节点③缺调用追踪被拦截（rc=1，既有契约防回潮）"
else
  bad "负向②应拦截，rc=${rc}；输出：${out}"
fi

echo "PASS test-workflow-methodology-ref (${pass} ok, ${fail} fail)"
[[ $fail -eq 0 ]]
