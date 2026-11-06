#!/bin/bash
# mx-gate-timing.sh — 闸门耗时台账（2026-11-02 机制治理批·ETA 口径）
# 2026-11-06 迁移到 AI-Friendly CLI 契约（spec 2026-11-06-ai-friendly-cli-contract.md）：
#   --format json|human 显式选择（默认 human；--json 保留为兼容别名）；参数顺序不再敏感；
#   失败走结构化信封（category/reason/remediation）；json 模式 stdout 只出结果信封。
#
# 解决什么：ETA 反复失真，因为「质量环正常慢」和「故障拖」混在一个总时长里报。
# 本脚本从已有证据（state.env + evidence/scenario.log）算每道闸的：首次触及、
# 最后一次动作、跨度、打回轮次、是否已过——让报告与预估能分列
#   「闸内有效工作」vs「闸等待/返工」。
#
# 用法：bash mux/mx-gate-timing.sh <RUN_ID> [--format json|human] [--inspect-config]
# 输出：
#   human（默认）TSV 到 stdout，同时写 runs/<RUN>/evidence/gate-timing.tsv
#   json        结果信封到 stdout（summary+artifacts+data），stderr 留诊断
# 退出码（契约）：0=成功；2=环境（缺 state.env/scenario.log/写盘失败）；3=用法。
#
# 判据口径（与 scenario.log 既有标记同源，不引入新事实）：
#   打回轮次 = 该闸出现 (FAIL|熔断|打回|退回|✗) 的日志行数
#   已过     = state.env 有该闸的 pass 键（g1_frozen / g2_arch_pass / …）或最后一条 ✓ 在后
# 限制（如实声明）：scenario.log 时间戳只有时分秒，跨零点按「时间回退即进一天」处理。
set -u
LC_ALL=C
HERE="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$HERE/mux/mx-contract.sh"

RUN=""
INSPECT=0
_skip_next=0
for _arg in "$@"; do
  if (( _skip_next == 1 )); then _skip_next=0; continue; fi
  case "$_arg" in
    --format|--events) _skip_next=1 ;;
    --format=*|--events=*) : ;;
    --inspect-config) INSPECT=1 ;;
    --help|-h) printf '用法: mx-gate-timing.sh <RUN_ID> [--format json|human] [--inspect-config]\n'; exit 0 ;;
    --*) : ;;
    *) [[ -z "$RUN" ]] && RUN="$_arg" ;;
  esac
done

mx_cli_scan "$@" || mx_fail_json usage "参数组合非法（--events 与 --format json 互斥；--format 只接受 human|json）" \
  "mx-gate-timing.sh <RUN_ID> [--format json|human]"

if [[ -n "${AIPAY_SIM_ROOT:-}" ]]; then
  SIM="$AIPAY_SIM_ROOT"; SIM_SOURCE="env:AIPAY_SIM_ROOT"
else
  SIM="/Users/cuishi/lab/ncwk-sim-mux"; SIM_SOURCE="default"
fi
STATE="$SIM/runs/$RUN/state.env"
LOG="$SIM/runs/$RUN/evidence/scenario.log"
OUT="$SIM/runs/$RUN/evidence/gate-timing.tsv"

if (( INSPECT == 1 )); then
  mx_emit_result ok \
    "{\"run\":\"$(mx_json_escape "$RUN")\",\"simRoot\":\"$(mx_json_escape "$SIM")\",\"format\":\"$MX_FORMAT\"}" \
    "{\"state\":\"$(mx_json_escape "$STATE")\",\"log\":\"$(mx_json_escape "$LOG")\",\"out\":\"$(mx_json_escape "$OUT")\"}"
  printf '来源: run=positional simRoot=%s format=--format/default\n' "$SIM_SOURCE" >&2
  exit 0
fi

[[ -n "$RUN" ]] || mx_fail_json usage "缺 RUN_ID" "mx-gate-timing.sh <RUN_ID> [--format json|human]"
[[ -f "$STATE" ]] || mx_fail_json environment "缺 state.env：$STATE" "确认 RUN_ID 与 AIPAY_SIM_ROOT 后重跑"
[[ -f "$LOG" ]] || mx_fail_json environment "缺 scenario.log：$LOG" "确认该 RUN 的 evidence 目录已生成后重跑"

RAW=$(python3 -I - "$STATE" "$LOG" "$OUT" "$MX_FORMAT" <<'PY'
import re, sys, json, pathlib

state_p, log_p, out_p, fmt = sys.argv[1:5]
state = {}
for line in pathlib.Path(state_p).read_text(encoding='utf-8', errors='replace').splitlines():
    if '=' in line:
        k, _, v = line.partition('=')
        state[k.strip()] = v.strip()

lines = pathlib.Path(log_p).read_text(encoding='utf-8', errors='replace').splitlines()

# 闸 → 起始键（判定「已过」用）：与场景脚本落键同源
GATE_KEYS = {
    "G1": ("g1_frozen",),
    "G2": ("g2_arch_pass", "arch_pass"),
    "G3": ("g3_closed", "close_done"),
    "G4": ("g4_impl_pass", "devimpl_done"),
    "G5": ("g5_ready_pass", "ready_done"),
    "G6": ("g6_release_pass", "release_done"),
}
BAD = re.compile(r'FAIL|熔断|打回|退回|✗')
GOOD = re.compile(r'✓|通过|PASS')

rows = []
for gate, keys in GATE_KEYS.items():
    hit = [l for l in lines if re.search(rf'\b{gate}\b', l)]
    if not hit:
        continue
    stamps = []
    day_off, prev = 0, None
    for l in hit:
        m = re.search(r'\[mux\s+(\d{2}):(\d{2}):(\d{2})\]', l)
        if not m:
            continue
        t = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        if prev is not None and t < prev - 3600:   # 跨零点
            day_off += 86400
        prev = t
        stamps.append(t + day_off)
    fails = sum(1 for l in hit if BAD.search(l))
    goods = sum(1 for l in hit if GOOD.search(l))
    passed = any(state.get(k) for k in keys)
    span = (stamps[-1] - stamps[0]) if len(stamps) >= 2 else 0
    rows.append({
        "gate": gate,
        "first": (stamps[0] if stamps else None),
        "last": (stamps[-1] if stamps else None),
        "span_sec": span,
        "rounds": fails,
        "pass_marks": goods,
        "passed": passed,
        "outcome": "pass" if passed else ("rounds>0" if fails else "pending"),
    })

hdr = "gate\tfirst_s\tlast_s\tspan_sec\trounds\tpass_marks\tpassed\toutcome"
body = [hdr]
for r in rows:
    body.append("\t".join(str(r[k]) for k in ("gate","first","last","span_sec","rounds","pass_marks","passed","outcome")))
text = "\n".join(body) + "\n"
pathlib.Path(out_p).write_text("# 闸门耗时台账（mx-gate-timing.sh 生成；秒序为当日相对秒，仅用于跨度）\n" + text, encoding='utf-8')

if fmt == "json":
    print(json.dumps({"run": pathlib.Path(state_p).parent.name, "gates": rows}, ensure_ascii=False))
else:
    print(text, end="")
PY
) || mx_fail_json environment "台账计算或写盘失败（state=$STATE out=$OUT）" "检查 evidence 目录可写与 state.env 格式后重跑"

if [[ "$MX_FORMAT" == "json" ]]; then
  SUMMARY=$(printf '%s' "$RAW" | jq -c '{run:.run,gates:(.gates|length),passed:([.gates[]|select(.passed)]|length)}' 2>/dev/null) \
    || mx_fail_json internal "台账 JSON 解析失败（jq）" "检查 mx-gate-timing.sh 输出是否完整"
  mx_emit_result ok "$SUMMARY" "{\"tsv\":\"$(mx_json_escape "$OUT")\"}" "$RAW"
else
  printf '%s' "$RAW"
fi
