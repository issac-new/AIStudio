#!/usr/bin/env bash
# gate-report.sh — 一次性「门禁运行报告」Markdown 生成器（P3 度量深化）
# 数据源：precheck.sh 在 conf GATE_RUNS_DIR 非空时落盘的 gate-runs.jsonl
#         （行格式契约 {"ts","run","gate","status","ids","duration_s"}，由 precheck.sh _gate_evidence 产出；run 序号供证据引用——MEA 吸收 2026-08-16）
# 报告结构对齐 GB/T 15532-2008《计算机软件测试规范》测试文档要素（标识/概述/环境/执行结果/结论；
#   2008-04-11 发布、2008-09-01 实施、现行——国家标准全文公开系统
#   https://openstd.samr.gov.cn/bzgk/gb/ 检索 GB/T 15532-2008，2026-07-20 访问）
#   与 references/standards-compliance.md §F 证据列（「失效须可见」：fail id 全量清单留痕）。
# 用法: bash gate-report.sh [gate-runs.jsonl] [输出.md]
#   jsonl 缺省：${GATE_RUNS_DIR:-.}/gate-runs.jsonl
#   输出缺省：GATE_RUNS_DIR 非空 → $GATE_RUNS_DIR/report-<UTC 时间戳>.md；否则 stdout
#   无 jsonl（或空/无有效行）→ 提示并 exit 0（与门禁族「未配置静默跳过」姿态一致）
set -u

JSONL="${1:-}"
OUT="${2:-}"
RUNS_DIR="${GATE_RUNS_DIR:-}"
[[ -z "$JSONL" ]] && JSONL="${RUNS_DIR:-.}/gate-runs.jsonl"

if [[ ! -s "$JSONL" ]]; then
  echo "ℹ 未找到 gate-runs 证据文件（${JSONL}）——请先在 precheck.conf 配置 GATE_RUNS_DIR 并运行门禁"
  exit 0
fi

GEN_TS="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
REPORT_ID="gate-report-$(date -u '+%Y%m%dT%H%M%SZ')"
OS_INFO="$(uname -srm 2>/dev/null || echo 未知)"
BASH_INFO="${BASH_VERSION:-未知}"
GIT_INFO="$(git rev-parse --short HEAD 2>/dev/null || echo 非-git-环境)"

# 门禁固定序动态取自 assets/precheck.sh 的 ALL_GATES_FULL
# （单一事实源；此前硬编码 34 门禁，FULL 实际 48——14 个门禁落"未登记追加"分支，
# 且 missing_evidence 计数打印错变量恒等于 Present）。取不到时降级空序（全部追加于后）。
_PRE="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)/assets/precheck.sh"
FULL_GATES="$(sed -n 's/^ALL_GATES_FULL=(\(.*\))/\1/p' "$_PRE" 2>/dev/null || true)"


if [[ -z "$OUT" && -n "$RUNS_DIR" ]]; then
  OUT="$RUNS_DIR/report-$(date -u '+%Y%m%dT%H%M%SZ').md"
fi

# awk 生成全文（门禁固定序动态取自 precheck.sh ALL_GATES_FULL；未登记门禁追加于后）。
# 趋势摘要固定近 10 次窗口（与 gate-trends.sh 缺省口径一致）。
awk -v jsonl="$JSONL" -v gen_ts="$GEN_TS" -v report_id="$REPORT_ID" \
    -v os_info="$OS_INFO" -v bash_info="$BASH_INFO" -v git_info="$GIT_INFO" \
    -v full_gates="$FULL_GATES" '
  function esc(x){ gsub(/\|/,"\\|",x); return x }
  BEGIN{
    ng=split(full_gates, order, " ")
    for(i=1;i<=ng;i++) ord[order[i]]=i
  }
  {
    line=$0; g=""; s=""; t=""
    if (match(line, /"gate":"[^"]+"/))   g=substr(line, RSTART+8,  RLENGTH-9)
    if (match(line, /"status":"[^"]+"/)) s=substr(line, RSTART+10, RLENGTH-11)
    if (g=="" || s=="") next
    if (match(line, /"ts":"[^"]+"/)) t=substr(line, RSTART+6, RLENGTH-7)
    d=0; if (match(line, /"duration_s":[0-9]+/)) d=substr(line, RSTART+13, RLENGTH-13)+0
    cnt[g]++; seq[g]=seq[g] substr(s,1,1); lastts[g]=t; lastst[g]=s; dursum[g]+=d
    tot++
    s1=substr(s,1,1)
    if (s1=="p") tp++; else if (s1=="f") tf++; else if (s1=="w") tw++; else ts_++
    if (tmin=="" || (t!="" && t<tmin)) tmin=t
    if (t!="" && t>tmax) tmax=t
    if (s=="fail") {
      frows++
      ids="（无 id）"
      if (match(line, /"ids":\[[^]]*\]/)) {
        ids=substr(line, RSTART+7, RLENGTH-8)
        gsub(/"/,"",ids); gsub(/,/,"、",ids)
        if(ids=="") ids="（无 id）"
      }
      flist[frows]=sprintf("| %d | `%s` | `%s` | %s |", frows, esc(g), esc(ids), t)
    }
  }
  END{
    if(tot==0) exit 3
    ngates=0; for(g in cnt) ngates++
    printf "# 门禁运行报告（swarm-yuan precheck gate-runs）\n\n"
    printf "## 1. 报告标识\n\n"
    printf "- 报告编号：`%s`\n- 生成时间(UTC)：%s\n- 数据源：`%s`（gate-runs JSONL 契约 `{\"ts\",\"run\",\"gate\",\"status\",\"ids\",\"duration_s\"}`）\n\n", report_id, gen_ts, jsonl
    printf "## 2. 概述\n\n"
    printf "- 目的：汇总门禁族近次运行结果，使失效可见、趋势可查，支撑准入/准出评审。\n"
    printf "- 范围：%d 门禁（precheck.sh ALL_GATES_FULL 动态取序）；记录时间范围(UTC) %s ～ %s；总记录 %d 条，覆盖门禁 %d 个。\n", ng, tmin, tmax, tot, ngates
    printf "- 引用文档：\n"
    printf "  - GB/T 15532-2008《计算机软件测试规范》（2008-04-11 发布，2008-09-01 实施，现行）——国家标准全文公开系统 https://openstd.samr.gov.cn/bzgk/gb/（2026-07-20 访问）\n"
    printf "  - references/standards-compliance.md §F「门禁姿态与豁免登记」（fail 须可见、豁免留痕 5 字段）\n\n"
    printf "## 3. 测试环境\n\n"
    printf "- 操作系统：`%s`\n- Bash：`%s`\n- 代码版本：`%s`\n- 生成工具：`scripts/gate-report.sh`\n\n", os_info, bash_info, git_info
    printf "## 4. 执行结果汇总\n\n"
    printf "- 状态分布（全量）：pass %d · fail %d · warn %d · skip %d\n", tp, tf, tw, ts_
    printf "- 整体通过率（全量，pass/记录数）：**%.1f%%**\n\n", (tot>0 ? 100.0*tp/tot : 0)
    printf "### 4.1 各门禁状态（全量）\n\n"
    printf "| # | 门禁 | 样本 | pass | fail | warn | skip | 通过率 | 末次状态 | 末次时间(UTC) | 平均耗时(s) |\n"
    printf "|---|---|---|---|---|---|---|---|---|---|---|\n"
    idx=0
    for(i=1;i<=ng;i++){ g=order[i]; if(g in cnt){ idx++; emit_row(g, idx) } }
    for(g in cnt) if(!(g in ord)){ idx++; emit_row(g, idx) }
    printf "### 4.2 证据状态分级（配置≠使用≠有效）\n\n"
    printf "证据态语义（better-harness agent-work-loop）：**Present**（机制存在未路由）/ **Wired**（任务路由可达）/ **Exercised**（被任务使用并留结果）/ **Outcome-supported**（后期可比结果支持）。分数上限：Missing/Unobserved ≤59 · Present ≤74 · Wired ≤84 · Exercised ≤94 · Outcome-supported ≤100。\n\n"
    printf "| 证据态 | 门禁数 | 含义 | 分数上限 |\n|---|---|---|---|\n"
    ep=0; ew=0; ee=0; eo=0; em=0
    for(g in cnt){
      has_pass=0; has_result=0
      if(index(seq[g],"p")>0) has_result=1
      if(index(seq[g],"f")>0 || index(seq[g],"w")>0) has_result=1
      if(has_result){ ee++ } else { ep++ }
    }
    printf "| Exercised | %d | 有 pass/fail/warn 结果留痕（被任务真实使用） | ≤94 |\n", ee
    printf "| Present | %d | 仅 skip（机制存在未被路由触达） | ≤74 |\n", ep
    # missing_evidence 态——"该测没测"显式计数。
    # HarnessEval 语义：缺证据宁可 invalid 不插值——本任务计划要测但未执行的门禁显式标出，
    # 不算 Present（机制存在）也不算 Exercised（用过），是独立的"缺失"态（≤59）。
    # em = 计划应执行（ALL_GATES_FULL）− 有记录门禁数——
    # 此前错印 ep（与 Present 恒等，"该测没测"永远错报）。
    em=0
    for(i=1;i<=ng;i++){ if(!(order[i] in cnt)) em++ }
    printf "| missing_evidence | %d | 应执行但未执行（该测没测，不插值不算分） | ≤59 |\n", em
    printf "\n> 口径注：swarm-yuan 的门禁执行即 Exercised（precheck 跑过即留痕）；Wired/Outcome-supported 需任务级路由与后期对比证据，由 gate-trends 双账本承载。\n\n"
    printf "\n## 5. fail id 清单（失效须可见）\n\n"
    if(frows>0){
      printf("| # | 门禁 | fail id | 时间(UTC) |\n|---|---|---|---|\n")
      for(i=1;i<=frows;i++) printf "%s\n", flist[i]
      printf "\n"
    } else {
      printf "✓ 无 fail 记录。\n\n"
    }
    printf "## 6. 趋势摘要（近 10 次/门禁，旧→新：✓=pass ✗=fail ⚠=warn ·=skip）\n\n"
    printf "| 门禁 | 近 10 次趋势 | 近 10 次通过率 |\n|---|---|---|\n"
    for(i=1;i<=ng;i++){ g=order[i]; if(g in cnt) emit_trend(g) }
    for(g in cnt) if(!(g in ord)) emit_trend(g)
    printf "\n## 7. 结论\n\n"
    fg=0; for(g in cnt){ if(index(seq[g],"f")>0) fg++ }
    printf "- 整体通过率 %.1f%%；曾出现 fail 的门禁 %d 个（明细见 §4.1 / §5）。\n", (tot>0 ? 100.0*tp/tot : 0), fg
    if(tf>0)
      printf "- 准出参考（GB/T 15532「失效须可见」）：fail 记录 %d 条已全部列于 §5，须逐条处理或按 §F.2 登记豁免后方可准出。\n", tf
    else
      printf "- 准出参考（GB/T 15532「失效须可见」）：窗口内无 fail，满足失效可见性要求。\n"
  }
  function emit_row(g, idx,   p,f,w,k,i,c,rate,trend){
    p=0;f=0;w=0;k=0
    for(i=1;i<=cnt[g];i++){ c=substr(seq[g],i,1); if(c=="p")p++; else if(c=="f")f++; else if(c=="w")w++; else k++ }
    rate=(cnt[g]>0 ? 100.0*p/cnt[g] : 0)
    printf "| %d | `%s` | %d | %d | %d | %d | %d | %.1f%% | %s | %s | %.1f |\n", \
      idx, g, cnt[g], p, f, w, k, rate, lastst[g], lastts[g], dursum[g]/cnt[g]
  }
  function emit_trend(g,   total,start,win,m,p,i,c,trend){
    total=cnt[g]; start=(total>10 ? total-10+1 : 1)
    win=substr(seq[g], start); m=length(win); p=0
    for(i=1;i<=m;i++){ c=substr(win,i,1); if(c=="p")p++ }
    trend=win; gsub(/p/,"✓",trend); gsub(/f/,"✗",trend); gsub(/w/,"⚠",trend); gsub(/s/,"·",trend)
    printf "| `%s` | %s | %.1f%% |\n", g, trend, (m>0 ? 100.0*p/m : 0)
  }
' "$JSONL" > /tmp/.gate-report.$$.tmp
_rc=$?
if [[ $_rc -eq 3 ]]; then
  rm -f /tmp/.gate-report.$$.tmp
  echo "ℹ $JSONL 中无有效门禁记录（行格式须符合 precheck.sh gate-runs JSONL 契约）"
  exit 0
fi
[[ $_rc -eq 0 ]] || { rm -f /tmp/.gate-report.$$.tmp; echo "✗ 报告聚合失败（awk 退出 ${_rc}）" >&2; exit 1; }

# key-nodes 看板首个消费者——九节点关键调用各节点最新状态。
# 数据源与 gate-runs 同目录（.swarm-yuan/key-nodes.jsonl）；不存在则跳过（非必选账）。
_kn="$(dirname "$JSONL")/key-nodes.jsonl"
if [[ -f "$_kn" ]]; then
  {
    printf '\n## 8. 关键节点看板（key-nodes.jsonl 各节点最新状态）\n\n'
    printf '| 节点 | 最新状态 | 时间 | 备注 |\n|---|---|---|---|\n'
    awk -F'"' '{kn="";st="";ts="";nt="";for(i=1;i<=NF;i++){if($i=="key_node")kn=$(i+2);if($i=="status")st=$(i+2);if($i=="ts")ts=$(i+2);if($i=="note")nt=$(i+2)};if(kn!="")last[kn]=st"|"ts"|"nt} END{for(k in last){split(last[k],a,"|");printf "| %s | %s | %s | %s |\n",k,a[1],a[2],a[3]}}' "$_kn"
  } >> /tmp/.gate-report.$$.tmp 2>/dev/null || true
fi

if [[ -n "$OUT" ]]; then
  if cp /tmp/.gate-report.$$.tmp "$OUT" 2>/dev/null; then
    rm -f /tmp/.gate-report.$$.tmp
    echo "✓ 门禁运行报告已生成：${OUT}（数据源: ${JSONL}）"
  else
    echo "✗ 报告写入失败：${OUT}——改打印到 stdout" >&2
    cat /tmp/.gate-report.$$.tmp
    rm -f /tmp/.gate-report.$$.tmp
  fi
else
  cat /tmp/.gate-report.$$.tmp
  rm -f /tmp/.gate-report.$$.tmp
fi
exit 0
