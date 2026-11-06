#!/bin/bash
# mx-workunit-lib.sh — 执行单元责任台账推演接线（2026-11-06 第一增量）
#
# 为什么单独成库：署名记录与六问快照是 G1/G2/G5/报告四处共用的动作，
# 内联在场景脚本会四处漂移（run25 窄修循环同型教训）。本库三个函数：
#   workunit_ensure_unit  — 确保单元在身份册（幂等，缺=registered 草案）
#   workunit_record       — 人署名记录（human-entry；失败只记问题单不中止）
#   workunit_six_snapshot — 六问快照落 run 目录（缺失=「未采集」，不伪造）
#
# 纪律（spec 2026-11-06-workunit-responsibility-ledger §10）：
#   - 全部 fail-soft：身份册/端点缺席记问题单继续跑，不让台账件拖垮主链
#   - 不建评分、不做排序；unknown 不是通过
# 依赖：mx-lib.sh 的 studio/studio_login、mx-scenario-lib.sh 的 note、issues.log 写入约定
# （调用方 source 后再 source 本库）。issue 记法与场景脚本同款：ISSUE|<type>|<subject>|<desc>。

_wu_issue() { # <type> <subject> <desc> → issues.log（EVID_DIR 缺席时只 note）
  if [ -n "${EVID_DIR:-}" ]; then
    echo "ISSUE|$1|$2|$3" >> "$EVID_DIR/issues.log"
  else
    note "[workunit] ISSUE|$1|$2|$3"
  fi
}

# workunit_ensure_unit <unit-name> [jwt] — 无则建草案（kind=agent owner=unassigned）
workunit_ensure_unit() {
  local name="$1" jwt="${2:-}" tok list
  [ -n "$jwt" ] || { jwt=$(studio_login 2>/dev/null) || true; }
  [ -n "$jwt" ] || { note "[workunit] studio 登录失败——跳过单元保障（fail-soft）"; return 0; }
  list=$(studio GET /api/governance/agent-identity "$jwt" 2>/dev/null) || list=''
  if printf '%s' "$list" | jq -e --arg n "$name" '.identities[]? | select(.name==$n)' >/dev/null 2>&1; then
    printf '%s' "$list" | jq -r --arg n "$name" '.identities[]? | select(.name==$n) | .id' | head -1
    return 0
  fi
  local body id
  body=$(jq -n --arg n "$name" '{name:$n,kind:"agent",owner:"unassigned",toolAllowlist:[]}')
  id=$(studio POST /api/governance/agent-identity/register "$jwt" "$body" 2>/dev/null \
    | jq -r '.identity.id // empty' 2>/dev/null) || id=''
  if [ -z "$id" ]; then
    _wu_issue "workunit-ensure-failed" "workunit" "单元 $name 保障失败（注册端点不可用或校验拒绝）——台账缺口，详见治理页签"
    echo ''
    return 0
  fi
  printf '%s' "$id"
}

# workunit_record <unit-id> <kind> <subject-ref> <rationale> <signed-by-person-id> [jwt]
# kind ∈ acceptance|rejection|override|escalation|pause|capability；rationale ≥20 字（写依据）。
workunit_record() {
  local uid="$1" kind="$2" subject="$3" why="$4" signer="$5" jwt="${6:-}" body
  [ -n "$uid" ] || { note "[workunit] 无 unit id——署名记录跳过（fail-soft）"; return 0; }
  [ -n "$jwt" ] || { jwt=$(studio_login 2>/dev/null) || true; }
  [ -n "$jwt" ] || { note "[workunit] studio 登录失败——署名记录跳过（fail-soft）"; return 0; }
  body=$(jq -n --arg k "$kind" --arg s "$subject" --arg r "$why" --arg b "$signer" \
    '{kind:$k,subjectRef:$s,rationale:$r,signedBy:$b,evidenceRefs:[]}')
  local out
  out=$(studio POST "/api/governance/agent-identity/$uid/judgments" "$jwt" "$body" 2>/dev/null) || out=''
  if printf '%s' "$out" | jq -e '.ok == true' >/dev/null 2>&1; then
    note "[workunit] 署名记录已落：$kind · $subject（signedBy=$signer）"
  else
    # 校验拒绝（如理由<20字/署名非在岗）是配置缺陷，记问题单不中止
    _wu_issue "workunit-record-rejected" "workunit" "署名记录被拒：kind=$kind subject=$subject signer=$signer 原因=$(printf '%s' "$out" | jq -r '.problems // ["HTTP 不可达"] | join("；")' 2>/dev/null)"
  fi
}

# workunit_six_snapshot <output-json-path> [jwt] — 六问快照；端点缺席落「未采集」占位
workunit_six_snapshot() {
  local out="$1" jwt="${2:-}" resp
  mkdir -p "$(dirname "$out")"
  if [ -n "$jwt" ] || { jwt=$(studio_login 2>/dev/null) || true; }; then :; fi
  resp=$(studio GET /api/autonomygov/six-questions "$jwt" 2>/dev/null) || resp=''
  if printf '%s' "$resp" | jq -e '.answers' >/dev/null 2>&1; then
    printf '%s' "$resp" | jq '{capturedAt: (now | floor), answers: .answers}' > "$out"
    note "[workunit] 六问快照已落：$out"
  else
    # 未采集占位：报告侧如实渲染「未采集」，审计按缺失 FAIL（不许空渲染）
    jq -n '{capturedAt: (now | floor), collected: false, note: "六问端点不可达或未启用——未采集"}' > "$out"
    note "[workunit] 六问快照未采集（端点缺席）——$out 落占位"
  fi
}
