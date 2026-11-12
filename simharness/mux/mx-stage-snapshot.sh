#!/bin/bash
# mx-stage-snapshot.sh — 推演阶段快照与恢复（2026-11-12 设计复盘 P2-13 第一段）
#
# 为什么有它：run 单轮 8-27 小时，事故重跑成本极高（run29 审计环烧 4.18h、监督器
# 84 次重启）。断点续跑的幂等键全在 state.env，但事故现场常伴随 evidence 损毁/键
# 回退——只有 state.env 不够回到干净断点。本脚本在每道闸（G1-G6 与 uat/report）
# 过键后把「state.env + 关键 evidence + 治理快照 + 看板摘要」打成一份 tar.gz，
# 恢复 = 完整性校验通过后解包覆盖，驱动重跑按既有 done 键幂等跳步、只重跑该闸
# 之后的阶段。
#
# 自包含约束：不 source mx-lib.sh（其 source 期有建目录/写软链/改 PATH 副作用，
# restore 场景必须零副作用）——run_dir 由参数显式给出。
#
# 用法：
#   bash mux/mx-stage-snapshot.sh save    <run_dir> <gate> [--force]
#   bash mux/mx-stage-snapshot.sh restore <run_dir> <gate>
#   bash mux/mx-stage-snapshot.sh list    <run_dir>
# gate ∈ g1 g2 g3 g4 g5 g6 uat report（映射表见 _mxs_gate_meta）。
# 看板摘要的 SIM_ROOT 推导：MX_SIM_ROOT env ＞ run_dir/../../（runs/<id> 布局）；
# 推导不出时看板摘要缺席（fail-soft，manifest 如实记 null）。
set -uo pipefail

# ── 闸映射表（单一事实源；键名与 aipay-scenario.sh 落键处一致）──────────
# gate_keys: 快照前置校验的 state.env 键（任一在案即闸已过）；next_step: 恢复后
# 驱动续跑起点（此前步骤由 state 键幂等跳过，与既有断点续跑同机制）。
_mxs_gate_meta() { # <gate> → "gate_keys(逗号)|next_step"
  case "$1" in
    g1)     echo "g1_frozen|dispatch" ;;
    g2)     echo "g2_arch_pass|close" ;;
    g3)     echo "g3_code_pass|testpass" ;;
    g4)     echo "g4_pass|ready" ;;
    g5)     echo "g5_ready|release" ;;
    g6)     echo "release_done|uat" ;;
    uat)    echo "uat_done,uat_conditional|retro" ;;
    report) echo "report_done|(终态——全流程已收口)" ;;
    *)      return 1 ;;
  esac
}

_mxs_sha256() { # <file> → sha256 hex（shasum 优先，Linux 回落 sha256sum）
  { shasum -a 256 "$1" 2>/dev/null || sha256sum "$1" 2>/dev/null; } | cut -d' ' -f1
}

_mxs_die() { echo "[stage-snapshot] FAIL: $*" >&2; exit 1; }
# 闸键未落=快照点未到达（合法状态非故障）：专用退出码 3 供挂钩方静默跳过（G4 GAP 轮
# testpass_done 照落但 g4_pass 未置即此形——记 ISSUE 是噪声）
_mxs_skip_gate() { echo "[stage-snapshot] skip：闸键未落（$*）——未过闸不打快照"; exit 3; }

# state.env 读键（与 mx-scenario-lib.sh sget 同口径：行首锚定、cut 保值内 =）
_mxs_sget() { grep -s "^$1=" "$2" 2>/dev/null | head -1 | cut -d= -f2-; }

# 看板摘要：每 db 一行 {path,sha256,bytes,tasks}——只读摘要不打包 db 本体
# （活体库打包回写有撞库风险，恢复面以 state.env+evidence 为界；摘要供恢复后对账）。
_mxs_boards_summary() { # <sim_root> → stdout JSON 数组（无 db 时 []，fail-soft）
  local root="$1" db rel sum sz n
  [[ -d "$root/hermes/kanban/boards" ]] || { echo "[]"; return 0; }
  python3 - "$root" <<'PY'
import hashlib, json, os, sqlite3, sys
root = sys.argv[1]
boards = root + "/hermes/kanban/boards"
rows = []
for dirpath, _dirs, files in os.walk(boards):
    if "kanban.db" not in files:
        continue
    p = os.path.join(dirpath, "kanban.db")
    row = {"path": os.path.relpath(p, root)}
    try:
        row["sha256"] = hashlib.sha256(open(p, "rb").read()).hexdigest()
        row["bytes"] = os.path.getsize(p)
    except OSError:
        continue  # 读不了的库如实缺席，不造数
    tasks = None
    try:
        con = sqlite3.connect("file:" + p + "?mode=ro", uri=True)
        try:
            tasks = con.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        finally:
            con.close()
    except sqlite3.Error:
        pass  # 查询失败=任务数 null（库结构异变/锁占用），哈希仍有效
    row["tasks"] = tasks
    rows.append(row)
print(json.dumps(rows, ensure_ascii=False))
PY
}

# ── save ─────────────────────────────────────────────────────────────
_mxs_save() { # <run_dir> <gate> <force>
  local run_dir="$1" gate="$2" force="$3"
  local meta keys next_step
  meta="$(_mxs_gate_meta "$gate")" || _mxs_die "未知 gate: ${gate}（合法：g1 g2 g3 g4 g5 g6 uat report）"
  keys="${meta%%|*}"; next_step="${meta#*|}"
  [[ -f "$run_dir/state.env" ]] || _mxs_die "run_dir 无 state.env：${run_dir}"

  # 闸前置校验：闸键未落即 save = 快照点语义错误（fail loud，防「未过闸的假快照」）
  local k hit=""
  IFS=',' read -ra _ks <<< "$keys"
  for k in "${_ks[@]}"; do
    [[ -n "$(_mxs_sget "$k" "$run_dir/state.env")" ]] && hit="$k"
  done
  [[ -n "$hit" ]] || _mxs_skip_gate "${keys} 任一须在 state.env 在案（gate=${gate}）"

  local snap="$run_dir/snapshots/${gate}.tar.gz"
  if [[ -s "$snap" && "$force" != "1" ]]; then
    echo "[stage-snapshot] skip：${snap} 已在（幂等；覆盖须 --force）"
    return 0
  fi

  # staging：manifest + boards 摘要 + state.env + evidence 关键件（存在才收）
  local stage tmp_tar
  stage="$(mktemp -d "${TMPDIR:-/tmp}/mx-stage-snap.XXXXXX")" || _mxs_die "mktemp 失败"
  tmp_tar="${snap}.tmp.$$"
  mkdir -p "$run_dir/snapshots" "$stage/evidence"
  cp -p "$run_dir/state.env" "$stage/state.env"

  local rel f rels=()
  for rel in issues.log scenario.log approved.events pending-backfill.tsv \
             compensation-ledger.tsv governance-metrics.json; do
    [[ -f "$run_dir/evidence/$rel" ]] && cp -p "$run_dir/evidence/$rel" "$stage/evidence/$rel" && rels+=("evidence/$rel")
  done
  # evidence 下其余 *.json/*.jsonl（r18 帧清单/评测摘要/闭环快照等，glob 全收）
  while IFS= read -r f; do
    rel="evidence/$(basename "$f")"
    [[ " ${rels[*]-} " == *" $rel "* ]] && continue
    cp -p "$f" "$stage/$rel" && rels+=("$rel")
  done < <(find "$run_dir/evidence" -maxdepth 1 -type f \( -name '*.json' -o -name '*.jsonl' \) 2>/dev/null | sort)

  # SIM_ROOT 推导：显式 env ＞ runs/<id> 布局反推；推不出=看板摘要缺席
  local sim_root="${MX_SIM_ROOT:-}"
  if [[ -z "$sim_root" ]]; then
    local parent_dir; parent_dir="$(dirname "$run_dir")"
    [[ "$(basename "$parent_dir")" == "runs" ]] && sim_root="$(dirname "$parent_dir")"
  fi
  local boards_json="null"
  if [[ -n "$sim_root" && -d "$sim_root" ]]; then
    _mxs_boards_summary "$sim_root" > "$stage/boards-summary.json" \
      && boards_json="@boards-summary.json" \
      || { echo "[stage-snapshot] 看板摘要采集失败（缺席如实记 null）" >&2; boards_json="null"; rm -f "$stage/boards-summary.json"; }
  fi

  # manifest：文件清单+sha256（restore 完整性校验的唯一依据）
  local run_id harness_commit
  run_id="$(basename "$run_dir")"
  harness_commit="$(git -C "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  python3 - "$stage" "$gate" "$run_id" "$keys" "$hit" "$next_step" "$harness_commit" "$sim_root" <<'PY' || { rm -rf "$stage"; _mxs_die "manifest 生成失败"; }
import hashlib, json, os, sys
stage, gate, run_id, keys, hit_key, next_step, commit, sim_root = sys.argv[1:9]
files = []
for root in ("", "evidence/"):
    d = os.path.join(stage, root)
    if not os.path.isdir(d):
        continue
    for name in sorted(os.listdir(d)):
        p = os.path.join(d, name)
        if not os.path.isfile(p):
            continue
        rel = root + name
        files.append({
            "path": rel,
            "sha256": hashlib.sha256(open(p, "rb").read()).hexdigest(),
            "bytes": os.path.getsize(p),
        })
manifest = {
    "schema": "mx-stage-snapshot/1",
    "gate": gate,
    "runId": run_id,
    "gateKeys": [k for k in keys.split(",")],
    "gateKeyHit": hit_key,
    "gateValue": "",
    "nextStep": next_step,
    "harnessCommit": commit,
    "simRoot": sim_root or None,
    "boardsSummary": "boards-summary.json" if os.path.isfile(os.path.join(stage, "boards-summary.json")) else None,
    "createdTs": int(__import__("time").time()),
    "files": files,
}
# 闸键值留档（恢复后核对断点值）
for line in open(os.path.join(stage, "state.env"), encoding="utf-8", errors="replace"):
    if line.startswith(hit_key + "="):
        manifest["gateValue"] = line.rstrip("\n").split("=", 1)[1]
        break
json.dump(manifest, open(os.path.join(stage, "manifest.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
PY

  local members=("manifest.json" "state.env")
  [[ -f "$stage/boards-summary.json" ]] && members+=("boards-summary.json")
  members+=("${rels[@]+"${rels[@]}"}")
  tar -czf "$tmp_tar" -C "$stage" "${members[@]}" \
    || { rm -rf "$stage" "$tmp_tar"; _mxs_die "tar 打包失败（gate=${gate}）"; }
  mv -f "$tmp_tar" "$snap" || { rm -rf "$stage" "$tmp_tar"; _mxs_die "原子落位失败：$snap"; }
  rm -rf "$stage"
  echo "[stage-snapshot] save ok：${snap}（${#rels[@]} 项 evidence ＋state.env＋boards 摘要；next_step=${next_step}）"
}

# ── restore ──────────────────────────────────────────────────────────
_mxs_restore() { # <run_dir> <gate>
  local run_dir="$1" gate="$2"
  local meta keys next_step
  meta="$(_mxs_gate_meta "$gate")" || _mxs_die "未知 gate: ${gate}"
  keys="${meta%%|*}"; next_step="${meta#*|}"
  local snap="$run_dir/snapshots/${gate}.tar.gz"
  [[ -s "$snap" ]] || _mxs_die "快照缺席：${snap}（先看 list 有哪些闸点）"

  local work
  work="$(mktemp -d "${TMPDIR:-/tmp}/mx-stage-restore.XXXXXX")" || _mxs_die "mktemp 失败"
  tar -xzf "$snap" -C "$work" || { rm -rf "$work"; _mxs_die "解包失败（快照可能损坏）：$snap"; }

  # 完整性校验：manifest 逐文件 sha256（拦篡改/半包），校验失败绝不写现场
  local verdict
  verdict="$(python3 - "$work" <<'PY'
import hashlib, json, os, sys
work = sys.argv[1]
try:
    m = json.load(open(os.path.join(work, "manifest.json"), encoding="utf-8"))
except Exception as e:
    print(json.dumps({"ok": False, "fatal": f"manifest 不可解析: {e}"})); raise SystemExit(0)
bad = []
for f in m.get("files") or []:
    p = os.path.join(work, f["path"])
    if not os.path.isfile(p):
        bad.append(f["path"] + " 缺席"); continue
    h = hashlib.sha256(open(p, "rb").read()).hexdigest()
    if h != f.get("sha256"):
        bad.append(f["path"] + " 哈希不符（篡改/半包）")
state_ok = any(f["path"] == "state.env" for f in m.get("files") or [])
if not state_ok:
    bad.append("state.env 不在快照清单")
print(json.dumps({"ok": not bad and state_ok, "bad": bad, "manifest": m if not bad else None}, ensure_ascii=False))
PY
)" || { rm -rf "$work"; _mxs_die "完整性校验执行失败"; }
  local ok mismatches
  ok="$(printf '%s' "$verdict" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok"))')"
  mismatches="$(printf '%s' "$verdict" | python3 -c 'import json,sys; print("\n".join(json.load(sys.stdin).get("bad") or []))')"
  if [[ "$ok" != "True" ]]; then
    rm -rf "$work"
    _mxs_die "完整性校验未过（不写现场）：${mismatches:-manifest 异常}"
  fi

  # 恢复：按 manifest 清单覆盖（先 .tmp 再 mv，与 sset 原子写同习惯）；
  # 清单外的既有文件一律保留（evidence 是 append-only 审计面，禁删）。
  local rel n=0
  while IFS= read -r rel; do
    [[ -d "$(dirname "$run_dir/$rel")" ]] || mkdir -p "$(dirname "$run_dir/$rel")"
    cp -p "$work/$rel" "$run_dir/$rel.mx-restore.tmp" \
      && mv -f "$run_dir/$rel.mx-restore.tmp" "$run_dir/$rel" \
      || { rm -rf "$work" "$run_dir/$rel.mx-restore.tmp"; _mxs_die "恢复写入失败：$rel"; }
    n=$((n+1))
  done < <(printf '%s' "$verdict" | python3 -c '
import json,sys
m=json.load(sys.stdin).get("manifest") or {}
print("\n".join(f["path"] for f in m.get("files") or []))')
  rm -rf "$work"

  local gate_key_hit gate_val
  gate_key_hit="$(printf '%s' "$verdict" | python3 -c 'import json,sys; print(json.load(sys.stdin)["manifest"]["gateKeyHit"])')"
  gate_val="$(_mxs_sget "$gate_key_hit" "$run_dir/state.env")"
  [[ -n "$gate_val" ]] || _mxs_die "恢复后 state.env 缺闸键 ${gate_key_hit}——恢复结果异常，勿续跑"
  echo "[stage-snapshot] restore ok：${n} 个文件已恢复到 ${run_dir}（闸 ${gate}：${gate_key_hit}=${gate_val}）"
  echo "[stage-snapshot] 下一步：${next_step}——直接重跑驱动即可（此前步骤由 state 键幂等跳过；清单外既有 evidence 文件保留未动）"
}

# ── list ─────────────────────────────────────────────────────────────
_mxs_list() { # <run_dir>
  local snap_dir="$1/snapshots" f
  [[ -d "$snap_dir" ]] || { echo "[stage-snapshot] 无 snapshots/ 目录（尚未打过阶段快照）"; return 0; }
  local found=0
  for f in "$snap_dir"/*.tar.gz; do
    [[ -s "$f" ]] || continue
    found=1
    python3 - "$f" <<'PY'
import json, sys, tarfile
snap = sys.argv[1]
with tarfile.open(snap, "r:gz") as tf:
    m = json.load(tf.extractfile("manifest.json"))
print(f"{m['gate']:>6}  created={m['createdTs']}  files={len(m['files'])}  gate={m['gateKeyHit']}={m['gateValue'][:12]}  next={m['nextStep']}  ({snap})")
PY
  done
  (( found == 1 )) || echo "[stage-snapshot] snapshots/ 内无快照"
}

# CLI 入口（source 复用时不执行——mx-scenario-lib.sh 的 mx_stage_snapshot_maybe 挂钩走子进程调用）
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  case "${1:-}" in
    save)    [[ $# -ge 3 ]] || _mxs_die "用法: $0 save <run_dir> <gate> [--force]"
             _mxs_save "$2" "$3" "$([[ "${4:-}" == "--force" ]] && echo 1 || echo 0)" ;;
    restore) [[ $# -ge 3 ]] || _mxs_die "用法: $0 restore <run_dir> <gate>"
             _mxs_restore "$2" "$3" ;;
    list)    [[ $# -ge 2 ]] || _mxs_die "用法: $0 list <run_dir>"
             _mxs_list "$2" ;;
    *)       _mxs_die "用法: $0 save|restore|list <run_dir> [<gate> [--force]]" ;;
  esac
fi
