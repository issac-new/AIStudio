#!/usr/bin/env python3
"""oel_aggregate.py — Ontology Evolution Ledger (OEL) 周聚合器

读取 ~/ .hermes/kanban/oel_candidates.jsonl → 按 drift_type 分组 → 生成 Markdown 周报 →
kanban_comment 投递到 curator 收件箱任务卡（默认 t_ff9bc714）。

零风险：只读取 jsonl + 写 comment，不碰 ontology.md、不改 jsonl 内容（仅追加处理后的
status 字段由 curator 手动或单独脚本更新；本脚本默认只读 + 输出 report）。

设计（来自 t_016ad4d0 验收标准）:
- 读取 jsonl（每行一个 OEL 候选 JSON 对象）
- 生成 Markdown 报告：分组统计 + 每条候选 provenance（task_id/profile/drift_type/evidence/suggested_diff）
- kanban_comment 到 curator 任务卡

退出码: 0 = 成功; 1 = 执行异常; 2 = 用法/环境错误。
"""
import argparse
import json
import os
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone

HOME = os.path.expanduser("~")
DEFAULT_JSONL = os.path.join(HOME, ".hermes", "kanban", "oel_candidates.jsonl")
DEFAULT_INTAKE = "t_ff9bc714"  # OEL-Inbox 收件箱任务卡
DEFAULT_INTAKE_BOARD = "swarm"  # 该卡位于 swarm board（platform 环境下 kanban_comment 需指定 --board）
DRIFT_TYPES = [
    "new_object_type", "missing_property", "naming_conflict",
    "deprecated_reference", "marking_gap", "cq_regression_gap", "other",
]


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def load_candidates(jsonl_path):
    if not os.path.exists(jsonl_path):
        return []
    rows = []
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for ln, raw in enumerate(f, 1):
            raw = raw.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError as e:
                rows.append({"_parse_error": True, "_line": ln, "_err": str(e),
                             "raw": raw[:200]})
                continue
            obj.setdefault("_line", ln)
            obj.setdefault("status", "pending")
            rows.append(obj)
    return rows


def build_report(candidates, week_label):
    total = len(candidates)
    parsable = [c for c in candidates if not c.get("_parse_error")]
    broken = [c for c in candidates if c.get("_parse_error")]
    pending = [c for c in parsable if c.get("status") == "pending"]
    processed = [c for c in parsable if c.get("status") != "pending"]

    by_type = defaultdict(list)
    for c in parsable:
        dt = c.get("drift_type", "other")
        if dt not in DRIFT_TYPES:
            dt = "other"
        by_type[dt].append(c)

    by_profile = defaultdict(int)
    for c in parsable:
        by_profile[c.get("profile", "unknown")] += 1

    lines = []
    lines.append(f"# OEL 周聚合报告 — {now_iso()}")
    lines.append(f"**聚合窗口**: {week_label}  |  **候选总数**: {total}  "
                 f"(可解析 {len(parsable)}, 解析失败 {len(broken)})")
    lines.append(f"**状态分布**: pending={len(pending)}  /  processed={len(processed)}")
    if by_profile:
        lines.append(f"**来源 profile**: " + ", ".join(
            f"{p}×{n}" for p, n in sorted(by_profile.items(), key=lambda x: -x[1])))
    lines.append("")

    # 待处理候选（curator 重点）
    if pending:
        lines.append(f"## 📋 待处理候选（{len(pending)} 条，建议走 Staged Action）")
        for c in pending:
            _id = c.get("row_id") or c.get("task_id")
            lines.append(f"\n### [{c.get('drift_type','other')}] {c.get('profile','?')} "
                         f"(task {c.get('task_id','?')}, line {c.get('_line','?')})")
            lines.append(f"- **timestamp**: {c.get('timestamp','?')}")
            lines.append(f"- **evidence**: {c.get('evidence','')}")
            lines.append(f"- **suggested_diff**:\n```\n{c.get('suggested_diff','')}\n```")
        lines.append("")
    else:
        lines.append("## ✅ 本周无 pending 候选")

    # 按 drift_type 分组统计
    lines.append("## 📊 按 drift_type 分组")
    for dt in DRIFT_TYPES:
        items = by_type.get(dt, [])
        if items:
            lines.append(f"- **{dt}**: {len(items)} 条")
    if not by_type:
        lines.append("- （无）")
    lines.append("")

    # 已处理归档记录
    if processed:
        lines.append(f"## 🗂 已处理（{len(processed)} 条，供追溯）")
        for c in processed:
            lines.append(f"- line {c.get('_line','?')} {c.get('profile','?')} "
                         f"[{c.get('drift_type','?')}] → status={c.get('status')}"
                         + (f"; resolution={c.get('resolution')}" if c.get('resolution') else ""))
        lines.append("")

    # 解析失败行告警
    if broken:
        lines.append(f"## ⚠️ 解析失败行（{len(broken)} 条，需人工修复 jsonl）")
        for c in broken:
            lines.append(f"- line {c.get('_line','?')}: {c.get('_err','')} :: {c.get('raw','')}")
        lines.append("")

    lines.append("---")
    lines.append(f"_OEL 周报由 oel_aggregate.py 自动生成。curator 处理完每条 pending 候选后，"
                 f"请在 jsonl 对应行更新 status (accepted/rejected) + resolution 字段避免重复处置。_")
    return "\n".join(lines)


def board_db_path(slug):
    """按 ~/<.hermes>/kanban/boards/<slug>/kanban.db 解析 board 的 sqlite 路径。
    跨 board 写 comment 必须显式指定 HERMES_KANBAN_DB 环境变量，否则 hermes CLI 默认
    用 `current` 软链指向的 board（本任务运行于 platform board，OEL-Inbox 卡在 swarm board）。"""
    return os.path.join(HOME, ".hermes", "kanban", "boards", slug, "kanban.db")


def post_comment(task_id, body, board=None):
    """调用 hermes kanban comment 投递报告。
    关键修复（P8 闭环可达性）：OEL-Inbox 卡 t_ff9bc714 位于 swarm board，
    运行环境是 platform board —— 必须显式把 HERMES_KANBAN_DB 指向目标 board 的 sqlite，
    否则 hermes kanban comment 报 'unknown task'。同时传 --board 保持一致。
    """
    env = dict(os.environ)
    # 用 curator 身份投递
    env.setdefault("HERMES_PROFILE", "platform-ontology-curator")
    board = board or DEFAULT_INTAKE_BOARD
    env["HERMES_KANBAN_DB"] = board_db_path(board)
    cmd = ["hermes", "kanban", "--board", board, "comment", task_id, body]
    proc = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if proc.returncode != 0:
        sys.stderr.write(f"kanban comment 失败 (rc={proc.returncode}): {proc.stderr}\n")
        raise RuntimeError(f"kanban comment rc={proc.returncode}: {proc.stderr}")
    return proc.stdout.strip()


def mark_processed(jsonl_path, processed_entries):
    """把处理完的候选行标记 status=processed + processed_at。

    processed_entries: list[(line_no, status, resolution)]，line_no 是文件物理行号（1-based）。
    内部先完整读入所有行，按行号改写对应行，原子写入（写临时文件再 rename）。
    只改 status/resolution/processed_at 字段，不触碰其它内容。
    """
    import tempfile
    if not processed_entries or not os.path.exists(jsonl_path):
        return 0
    by_line = {ln: (st, res) for ln, st, res in processed_entries if ln}
    if not by_line:
        return 0
    with open(jsonl_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    now_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    changed = 0
    new_lines = []
    for i, raw in enumerate(lines, 1):
        stripped = raw.strip()
        if not stripped:
            new_lines.append(raw)
            continue
        if i in by_line:
            try:
                obj = json.loads(stripped)
            except json.JSONDecodeError:
                new_lines.append(raw)
                continue
            st, res = by_line[i]
            obj["status"] = st
            # processed_at 只在首次标记时写入（保留已有 processed_at）
            if "processed_at" not in obj or not obj.get("processed_at"):
                obj["processed_at"] = now_ts
            if res:
                obj["resolution"] = res
            new_lines.append(json.dumps(obj, ensure_ascii=False) + "\n")
            changed += 1
        else:
            new_lines.append(raw)
    if changed:
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(jsonl_path), prefix=".oel_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, jsonl_path)
        except Exception:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise
    return changed


def main():
    ap = argparse.ArgumentParser(description="OEL 周聚合 → kanban_comment 到 curator 收件箱")
    ap.add_argument("--jsonl", default=DEFAULT_JSONL, help=f"候选 jsonl（默认 {DEFAULT_JSONL}）")
    ap.add_argument("--intake-task", default=DEFAULT_INTAKE,
                    help=f"curator 收件箱任务卡 id（默认 {DEFAULT_INTAKE}）")
    ap.add_argument("--intake-board", default=DEFAULT_INTAKE_BOARD,
                    help=f"intake 任务卡所在 board（默认 {DEFAULT_INTAKE_BOARD}）")
    ap.add_argument("--week-label", default="滚动累计",
                    help="聚合窗口标签，写入报告抬头")
    ap.add_argument("--no-post", action="store_true",
                    help="只打印报告到 stdout，不调 kanban comment（dry-run 本地预览）")
    ap.add_argument("--print-only", action="store_true", help="同 --no-post（别名）")
    ap.add_argument("--mark-processed", action="store_true",
                    help="投递报告后，把 pending 候选行标记 status=processed + processed_at")
    args = ap.parse_args()

    if not os.path.exists(args.jsonl):
        print(f"WARN: {args.jsonl} 不存在，无可聚合候选；仍生成空报。", file=sys.stderr)

    try:
        candidates = load_candidates(args.jsonl)
        report = build_report(candidates, args.week_label)
    except Exception as e:
        print(f"ERROR: 聚合异常: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)

    if args.no_post or args.print_only:
        print(report)
        sys.exit(0)

    try:
        out = post_comment(args.intake_task, report, board=args.intake_board)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"OK: OEL 周报已投递到任务 {args.intake_task} (board={args.intake_board})")
    if out:
        print(f"  kanban comment: {out[:120]}")

    # P8: 投递成功后标记处理（默认仅改 pending→processed，保留 resolution=None 供人工补）
    if args.mark_processed:
        pending_lines = [c.get("_line") for c in candidates
                         if not c.get("_parse_error") and c.get("status") == "pending"]
        try:
            n = mark_processed(args.jsonl,
                               [(ln, "processed", None) for ln in pending_lines])
            print(f"OK: {n} 条 pending 候选已标记 processed")
        except Exception as e:
            print(f"WARN: 标记 processed 失败（报告已投递）: {type(e).__name__}: {e}",
                  file=sys.stderr)


if __name__ == "__main__":
    main()
