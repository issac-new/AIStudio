#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rca_timeline.py — 集群统一时间轴聚合器（RCA 快速对账）

把四类事件源聚合成一条按时间排序的叠加时间轴，一条命令还原
「故障时刻 x 当时变更 x 当时指标异常」：

  1. CHANGE   git commits            （共享 workspace repo）
  2. EVENT    kanban task_events     （claimed/spawned/crashed/heartbeat...）
  3. FAILURE  kanban task_runs       （crashed/timed_out/failed，含错误原文）
  4. ERROR    proxy_request_logs     （status>=400 按 分钟+模型 聚类，带错误样本）
  5. LAT_SPIKE proxy 延迟 5 分钟桶 p95 超基线 2 倍

设计要点：
  - 只读：kanban.db mode=ro；cc-switch.db immutable=1（绕开 live 写锁）；
    git 只跑 log（无写操作）。
  - 可降级：单源失败（文件缺失/锁死/无 git）→ 打印 [source unavailable] 继续其余源。
  - 关联提示：对每条 FAILURE/ERROR 聚类，自动列出其前后 CORR_WINDOW 内的
    CHANGE 事件（变更-故障关联候选，±15 分钟默认）。
  - 输出：终端表格（默认）或 --json（机器消费）。

用法：
  # 以事件时刻为锚，看前后 20 分钟
  rca_timeline.py --anchor "2026-10-07 15:21:38" --window 20m
  # 直接给区间
  rca_timeline.py --from "2026-10-07 15:00" --to "2026-10-07 16:00"
  # 机器消费
  rca_timeline.py --anchor "..." --window 1h --json

退出码：0 正常；2 参数/解析错误。
"""

import argparse
import json
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timedelta

DEFAULT_REPO = "/Volumes/YOURVOLUME/lab/hermes-docker-sandbox/workspace"


def default_kanban_dbs():
    """root 库 + 全部 board 库（多 board 架构，各库独立存事件）"""
    import glob
    dbs = [os.path.expanduser("~/.hermes/kanban.db")]
    dbs += sorted(glob.glob(os.path.expanduser("~/.hermes/kanban/boards/*/kanban.db")))
    return [d for d in dbs if os.path.exists(d)]


def default_cron_dbs():
    import glob
    dbs = [os.path.expanduser("~/.hermes/cron/executions.db")]
    dbs += sorted(glob.glob(os.path.expanduser("~/.hermes/profiles/*/cron/executions.db")))
    return [d for d in dbs if os.path.exists(d)]
DEFAULT_PROXY_DB = os.path.expanduser("~/.cc-switch/cc-switch.db")
NOISE_KINDS = {"heartbeat"}          # task_events 里无 RCA 价值的常规心跳
DEFAULT_DROP_KINDS = {"spawned"}     # 与 claimed 同秒同义，默认折叠（--kinds 可显式要回）
FAILURE_RUN_STATUSES = ("crashed", "timed_out", "failed")
CORR_WINDOW = timedelta(minutes=15)  # 变更-故障关联窗口


def parse_dt(s):
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S",
                "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            continue
    raise ValueError(f"无法解析时间: {s!r}（支持 YYYY-MM-DD [HH:MM[:SS]]）")


def parse_window(s):
    s = s.strip().lower()
    if s.endswith("m"):
        return timedelta(minutes=float(s[:-1]))
    if s.endswith("h"):
        return timedelta(hours=float(s[:-1]))
    if s.endswith("d"):
        return timedelta(days=float(s[:-1]))
    return timedelta(minutes=float(s))


def ro_connect(path, immutable=False):
    """只读连接；immutable 绕开 live 写锁（文件快照语义）。"""
    flag = "immutable=1" if immutable else "mode=ro"
    return sqlite3.connect(f"file:{path}?{flag}", uri=True)


def iso(ts_epoch):
    return datetime.fromtimestamp(ts_epoch).strftime("%m-%d %H:%M:%S")


# ---------------------------------------------------------------- sources

def src_git(t0, t1, repo, out):
    """git commits in window → CHANGE"""
    since = t0.strftime("%Y-%m-%d %H:%M:%S")
    until = t1.strftime("%Y-%m-%d %H:%M:%S")
    proc = subprocess.run(
        ["git", "-C", repo, "log", f"--since={since}", f"--until={until}",
         "--pretty=%H%x1f%aI%x1f%s"],
        capture_output=True, text=True, timeout=30)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip()[:120])
    for line in proc.stdout.splitlines():
        parts = line.split("\x1f")
        if len(parts) != 3:
            continue
        sha, when, subject = parts
        ts = datetime.fromisoformat(when).astimezone().replace(tzinfo=None)
        out.append({"ts": ts, "kind": "CHANGE", "source": "git",
                    "detail": f"{sha[:8]} {subject[:100]}"})


def src_kanban_events(t0, t1, dbs, out, kinds=None):
    """task_events（过滤心跳；多 board 库遍历+去重）→ EVENT"""
    seen = set()
    for db in dbs:
        con = ro_connect(db)
        try:
            rows = con.execute(
                "SELECT e.created_at, e.kind, e.task_id, t.title "
                "FROM task_events e LEFT JOIN tasks t ON t.id = e.task_id "
                "WHERE e.created_at >= ? AND e.created_at < ? "
                "ORDER BY e.created_at",
                (int(t0.timestamp()), int(t1.timestamp()))).fetchall()
        except sqlite3.OperationalError as e:
            if "no such table" in str(e):
                continue  # 空库/归档库缺表 → 跳过
            raise
        finally:
            con.close()
        for ts, kind, task_id, title in rows:
            if kind in NOISE_KINDS:
                continue
            if kinds is not None:
                if kind not in kinds:
                    continue
            elif kind in DEFAULT_DROP_KINDS:
                continue
            key = (ts, kind, task_id)
            if key in seen:
                continue
            seen.add(key)
            board = os.path.basename(os.path.dirname(os.path.dirname(db)))
            tag = f"[{task_id}]" if task_id else ""
            detail = f"{kind} {tag} {(title or '')[:60]}".strip()
            out.append({"ts": datetime.fromtimestamp(ts), "kind": "EVENT",
                        "source": f"kanban.{board}", "detail": detail})


def src_kanban_failures(t0, t1, dbs, out):
    """task_runs 非 0 失败态 → FAILURE（含错误摘录；多库遍历+去重）"""
    seen = set()
    for db in dbs:
        con = ro_connect(db)
        try:
            rows = con.execute(
                "SELECT started_at, ended_at, status, outcome, task_id, "
                "substr(COALESCE(error,''),1,90) "
                "FROM task_runs "
                "WHERE status IN ('crashed','timed_out','failed') "
                "AND started_at >= ? AND started_at < ? ORDER BY started_at",
                (int(t0.timestamp()), int(t1.timestamp()))).fetchall()
        except sqlite3.OperationalError as e:
            if "no such table" in str(e):
                continue
            raise
        finally:
            con.close()
        for started, ended, status, outcome, task_id, excerpt in rows:
            key = (started, status, task_id, excerpt)
            if key in seen:
                continue
            seen.add(key)
            mark = f" outcome={outcome}" if outcome else ""
            detail = f"run {task_id} {status}{mark} | {(excerpt or '').strip()[:90]}"
            out.append({"ts": datetime.fromtimestamp(started), "kind": "FAILURE",
                        "source": "kanban.runs", "detail": detail})


def src_cron(t0, t1, dbs, out):
    """cron executions 失败/未知 → FAILURE(cron)；空库/缺表静默降级"""
    seen = set()
    for db in dbs:
        con = ro_connect(db)
        try:
            rows = con.execute(
                "SELECT started_at, finished_at, status, job_id, "
                "substr(COALESCE(error,''),1,80) "
                "FROM executions WHERE status IN ('failed','unknown') "
                "AND claimed_at >= ? AND claimed_at < ? ORDER BY claimed_at",
                (t0.isoformat(), t1.isoformat())).fetchall()
        except sqlite3.OperationalError as e:
            if "no such table" in str(e):
                continue
            raise
        finally:
            con.close()
        for started, finished, status, job_id, err in rows:
            key = (started, status, job_id, err)
            if key in seen:
                continue
            seen.add(key)
            ts = (datetime.fromisoformat(finished or started).astimezone().replace(tzinfo=None)
                  if (finished or started) else t0)
            out.append({"ts": ts, "kind": "FAILURE", "source": "cron",
                        "detail": f"job {job_id} {status} | {(err or '').strip()[:80]}"})


def src_proxy_errors(t0, t1, db, out):
    """proxy status>=400 按分钟+模型聚类 → ERROR"""
    con = ro_connect(db, immutable=True)
    try:
        rows = con.execute(
            "SELECT (created_at/60)*60 AS bucket, model, status_code, "
            "COUNT(*) AS n, "
            "MIN(substr(COALESCE(error_message,'上游无错误体'),1,70)) "
            "FROM proxy_request_logs "
            "WHERE created_at >= ? AND created_at < ? AND status_code >= 400 "
            "GROUP BY bucket, model, status_code ORDER BY bucket",
            (int(t0.timestamp()), int(t1.timestamp()))).fetchall()
    finally:
        con.close()
    for bucket, model, code, n, sample in rows:
        out.append({"ts": datetime.fromtimestamp(bucket), "kind": "ERROR",
                    "source": "proxy",
                    "detail": f"HTTP {code} {model} x{n} | {(sample or '').strip()[:70]}"})


def src_proxy_latency(t0, t1, db, out, base=None):
    """proxy 延迟 5 分钟桶 p95；桶 p95 > 2x 全窗口中位 p95 → LAT_SPIKE"""
    con = ro_connect(db, immutable=True)
    try:
        rows = con.execute(
            "SELECT (created_at/300)*300 AS bucket, latency_ms "
            "FROM proxy_request_logs "
            "WHERE created_at >= ? AND created_at < ? AND status_code < 400 "
            "AND latency_ms > 0",
            (int(t0.timestamp()), int(t1.timestamp()))).fetchall()
    finally:
        con.close()
    if not rows:
        return
    buckets = {}
    for bucket, ms in rows:
        buckets.setdefault(bucket, []).append(ms)
    p95s = {}
    for bucket, mss in buckets.items():
        mss = sorted(mss)
        p95s[bucket] = mss[min(len(mss) - 1, int(len(mss) * 0.95))]
    med = sorted(p95s.values())[len(p95s) // 2] if p95s else 0
    for bucket, p95 in sorted(p95s.items()):
        if med > 0 and p95 > 2 * med:
            out.append({"ts": datetime.fromtimestamp(bucket), "kind": "LAT_SPIKE",
                        "source": "proxy",
                        "detail": f"5min p95={p95}ms vs 中位p95={med}ms (>2x, "
                                  f"n={len(buckets[bucket])})"})


# ---------------------------------------------------------------- correlate & render

def correlate(events):
    """按 CHANGE 聚合 ±CORR_WINDOW 内的 FAILURE/ERROR，前后向分开（方向决定因果候选）"""
    changes = [e for e in events if e["kind"] == "CHANGE"]
    agg = []
    for c in changes:
        after = [e for e in events
                 if e["kind"] in ("FAILURE", "ERROR")
                 and timedelta(0) <= (e["ts"] - c["ts"]) <= CORR_WINDOW]
        before = [e for e in events
                  if e["kind"] in ("FAILURE", "ERROR")
                  and timedelta(0) <= (c["ts"] - e["ts"]) <= CORR_WINDOW]
        if after or before:
            agg.append({"change": c, "after": after, "before": before})
    return agg


def _uniq_fail_tasks(evs, limit=8):
    """从 FAILURE detail 里提任务 id 去重展示"""
    import re
    ids = []
    for e in evs:
        m = re.match(r"run (\S+)", e["detail"])
        if m:
            ids.append(m.group(1))
    uniq = list(dict.fromkeys(ids))
    if len(uniq) > limit:
        return f"{len(uniq)} 卡: {', '.join(uniq[:limit])} …"
    return ", ".join(uniq) if uniq else f"{len(evs)} 条"


def collapse_repeats(events, gap=90):
    """同 (kind, detail) 且间隔 <=gap 秒的 EVENT 折叠为一行 xN（键索引，交错序列也能收）"""
    collapsed = []
    idx = {}
    for e in sorted(events, key=lambda x: x["ts"]):
        if e["kind"] != "EVENT":
            d = dict(e)
            d.setdefault("_n", 1)
            collapsed.append(d)
            continue
        key = (e["kind"], e["detail"])
        last = idx.get(key)
        if last is not None and (e["ts"] - last["ts"]).total_seconds() <= gap:
            last["_n"] += 1
            last["ts_end"] = e["ts"]
        else:
            d = dict(e)
            d["_n"] = 1
            d["ts_end"] = e["ts"]
            idx[key] = d
            collapsed.append(d)
    return sorted(collapsed, key=lambda x: x["ts"])


def render_table(events, t0, t1, unavailable):
    lines = []
    lines.append(f"统一时间轴 {t0:%Y-%m-%d %H:%M} ~ {t1:%H:%M}（本地时间）")
    lines.append("=" * 100)
    if unavailable:
        for u in unavailable:
            lines.append(f"[source unavailable] {u}")
    if not events:
        lines.append("（窗口内五源均无事件）")
        return lines
    for e in collapse_repeats(events):
        suffix = f"  (x{e['_n']})" if e.get("_n", 1) > 1 else ""
        lines.append(f"{e['ts']:%m-%d %H:%M:%S} | {e['kind']:<9} | "
                     f"{e['source']:<14} | {e['detail']}{suffix}")
    aggs = correlate(events)
    if aggs:
        lines.append("")
        lines.append(f"变更-故障关联候选（变更±{int(CORR_WINDOW.total_seconds()//60)} 分钟；"
                     f"方向=相对变更时刻）:")
        for a in aggs:
            c = a["change"]
            if a["after"]:
                lines.append(f"  ↳ {c['ts']:%m-%d %H:%M} 变更「{c['detail'][:60]}」")
                lines.append(f"      之后 {len(a['after'])} 起故障/错误: "
                             f"{_uniq_fail_tasks(a['after'])}  ← 变更疑似为因")
            if a["before"]:
                lines.append(f"  ↳ {c['ts']:%m-%d %H:%M} 变更「{c['detail'][:60]}」")
                lines.append(f"      之前 {len(a['before'])} 起故障/错误: "
                             f"{_uniq_fail_tasks(a['before'])}  ← 变更疑似为修复/重派")
    return lines


def main(argv=None):
    ap = argparse.ArgumentParser(description="集群统一时间轴聚合器（RCA 对账）")
    ap.add_argument("--anchor", help="事件锚点时刻（取其前后各 window/2）")
    ap.add_argument("--from", dest="t_from", help="起始时刻 YYYY-MM-DD [HH:MM[:SS]]")
    ap.add_argument("--to", dest="t_to", help="结束时刻")
    ap.add_argument("--window", default="30m", help="锚点模式总窗宽（如 20m/1h/2h），默认 30m")
    ap.add_argument("--repo", default=DEFAULT_REPO, help="git 仓库路径")
    ap.add_argument("--kanban-db", action="append", dest="kanban_dbs",
                    help="kanban 库路径（可多次，默认自动发现 root+全部 board 库）")
    ap.add_argument("--cron-db", action="append", dest="cron_dbs",
                    help="cron executions 库（可多次，默认自动发现）")
    ap.add_argument("--proxy-db", default=DEFAULT_PROXY_DB)
    ap.add_argument("--json", action="store_true", help="JSON 输出")
    ap.add_argument("--kinds", help="只显示这些 task_events kind（逗号分隔，"
                    "如 claimed,crashed；默认除心跳与 spawned 全显）")
    ap.add_argument("--selftest", action="store_true", help="内置自检（fixture 库，不碰真实数据）")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()

    try:
        win = parse_window(args.window)
        if args.anchor:
            anchor = parse_dt(args.anchor)
            t0, t1 = anchor - win / 2, anchor + win / 2
        elif args.t_from and args.t_to:
            t0, t1 = parse_dt(args.t_from), parse_dt(args.t_to)
            if t1 <= t0:
                print("错误: --to 必须晚于 --from", file=sys.stderr)
                return 2
        else:
            t1 = datetime.now()
            t0 = t1 - win
    except ValueError as e:
        print(f"错误: {e}", file=sys.stderr)
        return 2

    events, unavailable = [], []
    kanban_dbs = args.kanban_dbs or default_kanban_dbs()
    cron_dbs = args.cron_dbs or default_cron_dbs()
    if args.kinds:
        ev_kinds = {k.strip() for k in args.kinds.split(",") if k.strip()}
    else:
        ev_kinds = None  # 用默认折叠
    sources = [
        ("git", lambda: src_git(t0, t1, args.repo, events)),
        ("kanban.events", lambda: src_kanban_events(t0, t1, kanban_dbs, events,
                                                     kinds=ev_kinds)),
        ("kanban.runs", lambda: src_kanban_failures(t0, t1, kanban_dbs, events)),
        ("cron", lambda: src_cron(t0, t1, cron_dbs, events)),
        ("proxy.errors", lambda: src_proxy_errors(t0, t1, args.proxy_db, events)),
        ("proxy.latency", lambda: src_proxy_latency(t0, t1, args.proxy_db, events)),
    ]
    for name, fn in sources:
        try:
            fn()
        except Exception as e:  # 可降级：单源失败不拖垮整体
            unavailable.append(f"{name}: {type(e).__name__}: {e}")

    if args.json:
        print(json.dumps({
            "window": {"from": t0.isoformat(), "to": t1.isoformat()},
            "unavailable": unavailable,
            "correlations": [
                {"change_ts": a["change"]["ts"].isoformat(),
                 "change": a["change"]["detail"],
                 "failures_after_change": [
                     {"ts": e["ts"].isoformat(), "detail": e["detail"]}
                     for e in a["after"]],
                 "failures_before_change": [
                     {"ts": e["ts"].isoformat(), "detail": e["detail"]}
                     for e in a["before"]]}
                for a in correlate(events)],
            "events": [{"ts": e["ts"].isoformat(), "kind": e["kind"],
                        "source": e["source"], "detail": e["detail"]}
                       for e in sorted(events, key=lambda x: x["ts"])],
        }, ensure_ascii=False, indent=2))
    else:
        print("\n".join(render_table(events, t0, t1, unavailable)))
    return 0


# ---------------------------------------------------------------- selftest

def selftest():
    """fixture 注入合成事件，验证：窗口过滤/排序/关联命中/JSON 可解析/降级路径"""
    import tempfile
    failures = []

    def check(name, cond):
        print(f"  [{'ok' if cond else 'FAIL'}] {name}")
        if not cond:
            failures.append(name)

    with tempfile.TemporaryDirectory() as td:
        kdb = os.path.join(td, "kanban.db")
        con = sqlite3.connect(kdb)
        con.execute("CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT)")
        con.execute("INSERT INTO tasks VALUES('t_x','worker crashed demo')")
        con.execute("CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    "task_id TEXT, run_id INTEGER, kind TEXT, payload TEXT, created_at INTEGER)")
        con.execute("CREATE TABLE task_runs (id INTEGER PRIMARY KEY AUTOINCREMENT,"
                    "task_id TEXT, profile TEXT, step_key TEXT, status TEXT, claim_lock TEXT,"
                    "claim_expires INTEGER, worker_pid INTEGER, max_runtime_seconds INTEGER,"
                    "last_heartbeat_at INTEGER, started_at INTEGER NOT NULL, ended_at INTEGER,"
                    "outcome TEXT, summary TEXT, metadata TEXT, error TEXT)")
        base = int(datetime(2026, 10, 7, 15, 21, 38).timestamp())
        con.execute("INSERT INTO task_events(task_id,kind,created_at) VALUES('t_x','heartbeat',?)", (base - 600,))
        con.execute("INSERT INTO task_events(task_id,kind,created_at) VALUES('t_x','claimed',?)", (base,))
        con.execute("INSERT INTO task_runs(task_id,status,started_at,error) "
                    "VALUES('t_x','crashed',?,?)", (base + 60, "ModuleNotFoundError: hermes_cli"))
        con.commit()
        con.close()

        pdb = os.path.join(td, "proxy.db")
        con = sqlite3.connect(pdb)
        con.execute("CREATE TABLE proxy_request_logs (request_id TEXT PRIMARY KEY, model TEXT,"
                    "latency_ms INTEGER, status_code INTEGER, error_message TEXT, created_at INTEGER)")
        for i in range(30):  # 正常桶
            con.execute("INSERT INTO proxy_request_logs VALUES(?,?,?,?,?,?)",
                        (f"r{i}", "m", 1000, 200, None, base - 300 + i * 10))
        for i in range(30):  # 第二个正常桶（保证中位基线不受尖峰桶污染）
            con.execute("INSERT INTO proxy_request_logs VALUES(?,?,?,?,?,?)",
                        (f"q{i}", "m", 1200, 200, None, base - 450 + i * 10))
        for i in range(30):  # 尖峰桶
            con.execute("INSERT INTO proxy_request_logs VALUES(?,?,?,?,?,?)",
                        (f"s{i}", "m", 60000, 200, None, base + 300 + i * 10))
        con.execute("INSERT INTO proxy_request_logs VALUES('e1','m',100,500,'upstream 500',?)", (base + 120,))
        con.commit()
        con.close()

        t0 = datetime(2026, 10, 7, 15, 11, 38)
        t1 = t0 + timedelta(minutes=30)
        events, unavail = [], []
        src_kanban_events(t0, t1, [kdb], events)
        src_kanban_failures(t0, t1, [kdb], events)
        src_proxy_errors(t0, t1, pdb, events)
        src_proxy_latency(t0, t1, pdb, events)
        try:
            src_git(t0, t1, td, events)  # 无 git 目录 → 应抛错进入降级
        except Exception as e:
            unavail.append(f"git: {type(e).__name__}: {e}")

        kinds = sorted(e["kind"] for e in events)
        check("事件聚合数=5（心跳已滤除；尖峰跨2桶各报1条）", len(events) == 5)
        check("FAILURE 来源 kanban.runs", "FAILURE" in kinds)
        check("ERROR 聚类来自 proxy", "ERROR" in kinds)
        check("LAT_SPIKE 检出且计数=2（两桶各自可见）",
              sum(1 for e in events if e["kind"] == "LAT_SPIKE") == 2)
        check("时间排序", [e["ts"] for e in sorted(events, key=lambda x: x['ts'])] ==
              sorted([e["ts"] for e in events]))
        table = "\n".join(render_table(events, t0, t1, unavail))
        check("无 CHANGE 时不出关联提示", "变更-故障关联候选" not in table)
        events.append({"ts": t0 + timedelta(minutes=5), "kind": "CHANGE",
                       "source": "git", "detail": "abc12345 fix: demo commit"})
        table2 = "\n".join(render_table(events, t0, t1, unavail))
        # 时间轴：FAILURE=15:11:38、ERROR=15:13:38(FAILURE+120s)、CHANGE=15:16
        # → CHANGE 在 FAILURE/ERROR 之后 → 属「变更后故障」= 变更疑似为因
        check("CHANGE 注入后关联提示出现且方向=变更之后（疑似为因）",
              "变更-故障关联候选" in table2 and "abc12345" in table2
              and "变更疑似为因" in table2)
        check("无前向误导（本场景无变更前故障）",
              "变更疑似为修复/重派" not in table2)

        # JSON 模式 + 降级路径（不存在的库）
        import io, contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = main(["--from", "2026-10-07 15:11:38", "--to", "2026-10-07 15:41:38",
                       "--kanban-db", kdb, "--proxy-db", pdb,
                       "--cron-db", os.path.join(td, "nope.db"), "--json"])
        payload = json.loads(buf.getvalue())
        check("JSON 模式退出码 0", rc == 0)
        check("JSON 含 events/correlations/unavailable",
              all(k in payload for k in ("events", "correlations", "unavailable")))
        check("显式 cron 库缺失进入降级",
              any(u.startswith("cron:") for u in payload["unavailable"]))
        check("降级后其余源仍有事件", len(payload["events"]) >= 4)

    print(f"\nselftest: {'ALL PASS' if not failures else f'{len(failures)} FAILED: {failures}'}")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
