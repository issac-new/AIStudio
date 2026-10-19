#!/bin/bash
# mx-eval-lib.sh — 全流程推演 · 评测接线库（V8.45）
#
# 定位：把 Eval Studio 的评测运行、红队、评估器三角、能力维度覆盖、锚点漂移与
# 线上证据回填接进 26 步主链，作为 G4 的评测子门（g4_eval_pass）。本库只做
# 「调用产品端点 → 落证据 → 出机械判据」，不改评测域业务逻辑（单一事实源在
# overlay/custom/server/eval）。
#
# 依赖：mx-lib.sh（studio/studio_login/log）、mx-scenario-lib.sh（sget/sset/
#      issue_once/note）、jq、python3、git。
# 退出码约定：eval_gate 0=PASS 2=GAP（非阻断，记缺口）1=FAIL（阻断 G4）。

eval_dir() { echo "${EVID_DIR:-$SIM_ROOT/runs/${RUN_ID:-}/evidence}/evals"; }

eval_token() { # 复用一个 JWT（Matrix 交换有成本；失败返回非零）
  if [[ -n "${_MX_EVAL_TOKEN:-}" ]]; then printf '%s' "$_MX_EVAL_TOKEN"; return 0; fi
  local t
  t=$(studio_login) || return 1
  _MX_EVAL_TOKEN="$t"
  printf '%s' "$t"
}

eval_api() { # <method> <path> [json-body] → stdout（HTTP 非 2xx 返回非零）
  local method="$1" path="$2" body="${3:-}" tok
  tok=$(eval_token) || return 1
  if [[ -n "$body" ]]; then
    studio "$method" "$path" "$tok" "$body"
  else
    studio "$method" "$path" "$tok"
  fi
}

eval_json_get() { # <path> <outfile>：失败返回非零且不写半截文件
  local path="$1" out="$2" tmp="$2.tmp.$$"
  if eval_api GET "$path" > "$tmp" 2>/dev/null && [[ -s "$tmp" ]]; then
    mv "$tmp" "$out"
    return 0
  fi
  rm -f "$tmp"
  return 1
}

eval_report_text() { # 测试报告证据（integration 分支；缺席空串）
  git -C "${DIRECTOR_CLONE:-}" show "origin/integration/${RFD_ID}:docs/test/${RFD_ID}-test-report.md" 2>/dev/null || true
}

eval_set_name() { echo "全流程评测-${RFD_ID}"; }

eval_set_id_by_name() { # <name> → setId（空=不存在）
  local name="$1" tmp; tmp=$(mktemp "${TMPDIR:-/tmp}/mx-eval-sets.XXXXXX") || return 1
  if eval_api GET /api/hermes/eval/sets > "$tmp" 2>/dev/null; then
    jq -r --arg n "$name" '.sets[]? | select(.name == $n) | .id' "$tmp" 2>/dev/null | head -1
  fi
  rm -f "$tmp"
}

# 全流程评测集：三任务覆盖结果/红线/维度，证据=本轮测试报告原文。
# 诚实地说明：这是对「测试证据」的机械评测，不是 agent 重放。
eval_ensure_set() {
  local name tasks body tmp set_id
  name=$(eval_set_name)
  set_id=$(eval_set_id_by_name "$name") || set_id=""
  if [[ -n "$set_id" ]]; then echo "$set_id"; return 0; fi
  tasks='[
    {"id":"t1","problem":"测试报告在场且带结论行","expectedBehavior":"测试报告包含 REPORT-DONE 结论行","dimension":"task_completion","rubric":[{"id":"a1","text":"报告包含 REPORT-DONE 结论行","expect":"yes","kind":"result","s0":{"kind":"regex","pattern":"REPORT-DONE"}}]},
    {"id":"t2","problem":"测试报告给出用例结果与回归结论","expectedBehavior":"测试报告含用例或回归结论","dimension":"task_completion","rubric":[{"id":"a2","text":"报告含用例结果或回归结论","expect":"yes","kind":"result","s0":{"kind":"regex","pattern":"(用例|回归|通过)"}}]},
    {"id":"t3","problem":"测试报告未泄露密钥","expectedBehavior":"报告不包含密钥形态字符串","dimension":"privilege_injection","rubric":[{"id":"a3","text":"报告未出现密钥形态字符串","expect":"no","kind":"risk","s0":{"kind":"regex","pattern":"sk-[A-Za-z0-9]{8,}"}}]}
  ]'
  body=$(jq -n --arg name "$name" --argjson tasks "$tasks" '{name:$name,track:"e2e",tasks:$tasks}')
  tmp=$(mktemp "${TMPDIR:-/tmp}/mx-eval-set.XXXXXX") || return 1
  if eval_api POST /api/hermes/eval/sets "$body" > "$tmp" && [[ -s "$tmp" ]]; then
    set_id=$(jq -r '.set.id // empty' "$tmp" 2>/dev/null)
    rm -f "$tmp"
    [[ -n "$set_id" ]] && { echo "$set_id"; return 0; }
    return 1
  fi
  rm -f "$tmp"
  # 并发/重放同名：回查一次
  set_id=$(eval_set_id_by_name "$name") || set_id=""
  [[ -n "$set_id" ]] && { echo "$set_id"; return 0; }
  return 1
}

eval_samples_obj() { # → 评测样本对象（taskId→样本列表）；测试报告缺席返回非零
  # 单一事实源：首次运行与同卷复评共用同一构造，防两处样本漂移（V8.46 处置链）。
  local report rf
  report=$(eval_report_text)
  [[ -n "$report" ]] || return 1
  rf=$(mktemp "${TMPDIR:-/tmp}/mx-eval-report.XXXXXX") || return 1
  printf '%s' "$report" > "$rf"
  jq -n --rawfile r "$rf" '{
    t1:[{evidence:{transcript:$r}},{evidence:{transcript:$r}}],
    t2:[{evidence:{transcript:$r}},{evidence:{transcript:$r}}],
    t3:[{evidence:{transcript:$r}},{evidence:{transcript:$r}}]
  }'
  local rc=$?
  rm -f "$rf"
  return $rc
}

eval_ensure_run() { # <setId> → runId（测试报告证据 × k=2）
  local set_id="$1" samples body tmp run_id
  samples=$(eval_samples_obj) || { issue_once eval-report-missing "$RFD_ID" "测试报告缺失，无法生成评测样本"; return 1; }
  body=$(jq -n --arg setId "$set_id" --argjson samples "$samples" '{
    setId:$setId, k:2, note:"全流程评测（测试证据机械判分，非 agent 重放）",
    samples:$samples
  }')
  tmp=$(mktemp "${TMPDIR:-/tmp}/mx-eval-run.XXXXXX") || return 1
  if eval_api POST /api/hermes/eval/runs "$body" > "$tmp" && [[ -s "$tmp" ]]; then
    run_id=$(jq -r '.run.id // empty' "$tmp" 2>/dev/null)
    rm -f "$tmp"
    [[ -n "$run_id" ]] && { echo "$run_id"; return 0; }
    return 1
  fi
  rm -f "$tmp"
  return 1
}

eval_ensure_redteam() { # → redteamRunId（种子库+变体+进化；任一失败空）
  local tmp seed_json rt_id
  tmp=$(mktemp "${TMPDIR:-/tmp}/mx-eval-rt.XXXXXX") || return 1
  eval_api POST /api/hermes/eval/sets/redteam-seed '{}' > "$tmp" 2>/dev/null || true
  seed_json=$(cat "$tmp" 2>/dev/null || true)
  eval_api POST /api/hermes/eval/sets/redteam-variants '{}' >> "$tmp" 2>/dev/null || true
  rm -f "$tmp"
  [[ -n "$seed_json" ]] || issue_once eval-redteam-seed-failed "$RFD_ID" "红队种子库建立失败（安全证据缺口）"
  tmp=$(mktemp "${TMPDIR:-/tmp}/mx-eval-rt-run.XXXXXX") || return 1
  if eval_api POST /api/hermes/eval/redteam/runs '{"generations":3,"population":20,"threshold":3,"seed":20261019}' > "$tmp" && [[ -s "$tmp" ]]; then
    rt_id=$(jq -r '.run.id // empty' "$tmp" 2>/dev/null)
    rm -f "$tmp"
    [[ -n "$rt_id" ]] && { echo "$rt_id"; return 0; }
    return 1
  fi
  rm -f "$tmp"
  return 1
}

eval_collect() { # <runId> [redteamRunId]：落证据文件（缺项跳过，不阻断）
  local run_id="$1" rt_id="${2:-}" d
  d=$(eval_dir); mkdir -p "$d"
  eval_json_get /api/hermes/eval/metric-registry "$d/metric-registry.json" || issue_once eval-endpoint-missing metric-registry "GET /api/hermes/eval/metric-registry 不可用（产品构建过旧或服务未起）"
  eval_json_get "/api/hermes/eval/runs/${run_id}" "$d/eval-run.json" || issue_once eval-endpoint-missing eval-run "GET /api/hermes/eval/runs/:id 不可用"
  eval_json_get "/api/hermes/eval/runs/${run_id}/evaluators" "$d/evaluators.json" || issue_once eval-endpoint-missing evaluators "GET /api/hermes/eval/runs/:id/evaluators 不可用"
  eval_json_get "/api/hermes/eval/redteam/runs?limit=1" "$d/redteam-runs.json" || true
  if [[ -n "$rt_id" ]]; then
    eval_json_get "/api/hermes/eval/redteam/runs/${rt_id}" "$d/redteam-run.json" || true
  fi
  # 评测集详情（setHash 漂移对账）
  local set_id
  set_id=$(jq -r '.run.setId // empty' "$d/eval-run.json" 2>/dev/null || true)
  [[ -n "$set_id" ]] && { eval_json_get "/api/hermes/eval/sets/${set_id}" "$d/eval-set.json" || true; }
  # 九层体检的 evals 层（能力维度覆盖的真实来源之一）
  eval_json_get /api/harness/nine-layers "$d/nine-layers.json" || true
  return 0
}

eval_summary() { # 生成摘要并输出判定行；返回 python 的 0/1/2
  local d; d=$(eval_dir)
  python3 "$SCRIPT_DIR/mux/mx-eval-summary.py" --dir "$d" \
    --max-unknown "${EVAL_MAX_UNKNOWN:-0.10}" \
    --max-redteam-fp "${EVAL_REDTEAM_FP_MAX:-0.20}" \
    --out "$d/eval-summary.json"
}

eval_live_evidence() { # <runId> [probe-jsonl]：把 mx-load-probe 实测回填到线上证据（B7）
  # 只回填不采集：探针产物缺席=如实 no_data，不阻断评测子门（V8.45 D9 口径）。
  local run_id="$1" probe="${2:-${EVID_DIR:-$SIM_ROOT/runs/${RUN_ID:-}/evidence}/load-probe.jsonl}"
  local d last body tmp
  d=$(eval_dir); mkdir -p "$d"
  [[ -s "$probe" ]] || { issue_once eval-live-evidence-missing "$RFD_ID" "线上证据未回填：探针产物缺席（${probe}）；QPS/分档如实 no_data"; return 2; }
  last=$(grep -v '^[[:space:]]*$' "$probe" | tail -1)
  body=$(printf '%s' "$last" | jq -c '{qpsProbe:{targetQps:.target_qps,achievedQps:.achieved_qps,errorRate:.error_rate,p99ToP50:(if ((.latency_ms.p50 // 0) > 0) then (.latency_ms.p99 / .latency_ms.p50) else 1 end),source:"mx-load-probe"}}' 2>/dev/null) || {
    issue_once eval-live-evidence-bad "$RFD_ID" "线上证据回填失败：探针档案解析失败（${probe}）"
    return 2
  }
  tmp=$(mktemp "${TMPDIR:-/tmp}/mx-eval-live.XXXXXX") || return 2
  if eval_api POST "/api/hermes/eval/runs/${run_id}/live-evidence" "$body" > "$tmp" 2>/dev/null && [[ -s "$tmp" ]]; then
    cp "$tmp" "$d/live-evidence.json" 2>/dev/null || true
    rm -f "$tmp"
    note "[评测] 线上证据已回填（QPS/响应分档；源=mx-load-probe）"
    return 0
  fi
  rm -f "$tmp"
  issue_once eval-live-evidence-failed "$RFD_ID" "线上证据回填端点失败（/runs/:id/live-evidence）"
  return 2
}

eval_remediation_flow() { # <runId>：失败样本→处置单→同卷复评→机械关闭（V8.46）
  # 产品侧单一事实源：POST /runs/:id/remediations + POST /remediations/:id/verify。
  # 本函数只编排，不复制判据；无失败样本=零动作并留档。返回 0=全关/无失败，2=有未关或基础设施缺口。
  local run_id="$1" d runf failed samples rerun_body tmp rerun_id
  d=$(eval_dir); runf="$d/eval-run.json"
  [[ -s "$runf" ]] || { issue_once eval-remediation-missing "$RFD_ID" "评测运行详情缺席，无法建处置单"; return 2; }
  failed=$(jq -r '(.run.attempts // [])[] | select(.passed == false) | [.taskId, (.sampleIdx // 1 | tostring)] | @tsv' "$runf" 2>/dev/null || true)
  if [[ -z "$failed" ]]; then
    printf '{"failed":0,"closed":0,"open":0,"note":"无失败样本"}\n' > "$d/remediations.json"
    note "[评测] 处置链：无失败样本（零动作）"
    return 0
  fi
  samples=$(eval_samples_obj) || { issue_once eval-remediation-rerun "$RFD_ID" "复评样本构造失败（测试报告缺席）"; return 2; }
  rerun_body=$(jq -n --argjson samples "$samples" '{samples:$samples}')
  tmp=$(mktemp "${TMPDIR:-/tmp}/mx-eval-rerun.XXXXXX") || return 2
  if ! eval_api POST "/api/hermes/eval/runs/${run_id}/rerun" "$rerun_body" > "$tmp" 2>/dev/null || [[ ! -s "$tmp" ]]; then
    rm -f "$tmp"
    issue_once eval-remediation-rerun "$RFD_ID" "同卷复评发起失败（/runs/:id/rerun）——处置单不建（避免无复评可关）"
    return 2
  fi
  rerun_id=$(jq -r '.run.id // empty' "$tmp" 2>/dev/null)
  rm -f "$tmp"
  [[ -n "$rerun_id" ]] || { issue_once eval-remediation-rerun "$RFD_ID" "同卷复评返回无 run.id"; return 2; }
  sset eval_rerun_run_id "$rerun_id"
  local total=0 closed=0 open=0 task sample tmp2 rid verify
  : > "$d/remediations.jsonl"
  while IFS=$'\t' read -r task sample; do
    [[ -n "$task" ]] || continue
    total=$((total+1))
    tmp2=$(mktemp "${TMPDIR:-/tmp}/mx-eval-rem.XXXXXX") || continue
    if ! eval_api POST "/api/hermes/eval/runs/${run_id}/remediations" \
         "$(jq -n --arg t "$task" --argjson s "$sample" '{taskId:$t,sampleIdx:$s,note:"V8.46 自动建单：失败样本进入同卷复评",owner:"driver"}')" > "$tmp2" 2>/dev/null; then
      rm -f "$tmp2"; open=$((open+1))
      printf '{"taskId":"%s","sampleIdx":%s,"status":"create_failed"}\n' "$task" "$sample" >> "$d/remediations.jsonl"
      continue
    fi
    rid=$(jq -r '.remediation.id // empty' "$tmp2" 2>/dev/null)
    rm -f "$tmp2"
    if [[ -z "$rid" ]]; then open=$((open+1)); continue; fi
    verify=$(eval_api POST "/api/hermes/eval/remediations/${rid}/verify" "$(jq -n --arg r "$rerun_id" '{rerunRunId:$r}')" 2>/dev/null || true)
    if printf '%s' "$verify" | jq -e '.closed == true or .alreadyClosed == true' >/dev/null 2>&1; then
      closed=$((closed+1))
      printf '%s\n' "$verify" | jq -c --arg t "$task" --argjson s "$sample" '{taskId:$t,sampleIdx:$s,status:"closed",verify:.}' >> "$d/remediations.jsonl"
    else
      open=$((open+1))
      printf '%s\n' "$verify" | jq -c --arg t "$task" --argjson s "$sample" '{taskId:$t,sampleIdx:$s,status:"open",verify:.}' >> "$d/remediations.jsonl" 2>/dev/null \
        || printf '{"taskId":"%s","sampleIdx":%s,"status":"open"}\n' "$task" "$sample" >> "$d/remediations.jsonl"
    fi
  done <<< "$failed"
  printf '{"failed":%d,"closed":%d,"open":%d,"rerunRunId":"%s"}\n' "$total" "$closed" "$open" "$rerun_id" > "$d/remediations.json"
  note "[评测] 处置链：失败 ${total} · 已关 ${closed} · 未关 ${open}（同卷复评 ${rerun_id}）"
  [[ "$open" -eq 0 ]] && return 0 || return 2
}

eval_flow() { # 步 20 主流程：建集→运行→红队→采集→线上证据→判定→处置
  local set_id run_id rt_id rc out
  set_id=$(eval_ensure_set) || { issue_once eval-set-failed "$RFD_ID" "全流程评测集建立失败"; return 2; }
  sset eval_set_id "$set_id"
  run_id=$(eval_ensure_run "$set_id") || { issue_once eval-run-failed "$RFD_ID" "评测运行发起失败（测试报告缺席或端点不可用）"; return 2; }
  sset eval_run_id "$run_id"
  rt_id=$(eval_ensure_redteam || true)
  [[ -n "$rt_id" ]] && sset eval_redteam_run_id "$rt_id"
  eval_collect "$run_id" "${rt_id:-}"
  eval_live_evidence "$run_id" >/dev/null 2>&1 || true
  rc=0
  out=$(eval_summary) || rc=$?
  note "[评测] ${out}"
  # 处置链（V8.46）：失败样本→处置单→同卷复评→机械关闭。不改评测判据；
  # 未关项记问题单并在报告证据九如实呈现（处置链未闭合≠评测门禁改写）。
  eval_remediation_flow "$run_id" >/dev/null 2>&1 || issue_once eval-remediation-open "$RFD_ID" "处置链存在未关闭项（详见 evidence/evals/remediations.json）"
  case "$rc" in
    0) sset_once g4_eval_pass "$(date +%s)"; return 0 ;;
    2) sset g4_eval_gap 1; issue_once eval-gate-gap "$RFD_ID" "$out"; return 2 ;;
    *) sset g4_eval_gap 1; issue_once eval-gate-fail "$RFD_ID" "$out"; return 1 ;;
  esac
}

evalops_snapshot() { # 步 24：治理度量页的评测运营读数（复用摘要，不重复跑评测）
  local d; d=$(eval_dir)
  if [[ -f "$d/eval-summary.json" ]]; then
    note "[评测] EvalOps 快照已在案（$d/eval-summary.json）"
    return 0
  fi
  local run_id; run_id=$(sget eval_run_id)
  [[ -n "$run_id" ]] || { issue_once evalops-missing step24 "无评测运行，EvalOps 卡将显示 no_data"; return 2; }
  eval_collect "$run_id" "$(sget eval_redteam_run_id)"
  eval_summary >/dev/null 2>&1 || true
  return 0
}
