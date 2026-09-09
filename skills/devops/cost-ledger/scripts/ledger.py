#!/usr/bin/env python3
"""cost-ledger: unified cost ledger from cc-switch.db.

Aggregates per-call USD (proxy_request_logs) into a 7-day / by-model / by-session
ledger and flags over-budget items. Read-only against the live DB.

Usage:
  python3 ledger.py --since 7d
  python3 ledger.py --since 30d --budget-gate 50
  python3 ledger.py --since 7d --budget-gate 20 --db /path/to/cc-switch.db

The cost columns in cc-switch.db are TEXT, so every aggregate uses
CAST(total_cost_usd AS REAL). created_at is epoch seconds (local time).
"""
import argparse
import os
import sqlite3
import sys
from datetime import datetime


def resolve_db(cli_path):
    if cli_path:
        return os.path.expanduser(cli_path)
    return os.path.expanduser(
        os.environ.get("CC_SWITCH_DB", "~/.cc-switch/cc-switch.db")
    )


def parse_since(token):
    """Accept '7d', '12h', or raw seconds."""
    token = (token or "7d").strip().lower()
    if token.endswith("d"):
        return int(token[:-1]) * 86400
    if token.endswith("h"):
        return int(token[:-1]) * 3600
    return int(token)


def connect(db_path):
    if not os.path.exists(db_path):
        sys.exit(f"ERROR: cc-switch.db not found at {db_path}")
    # immutable=1 => read-only, no locking against the live proxy writer.
    uri = f"file:{db_path}?immutable=1"
    return sqlite3.connect(uri, uri=True)


def fetch_total(conn, start_ts):
    row = conn.execute(
        "SELECT ROUND(SUM(CAST(total_cost_usd AS REAL)), 4) "
        "FROM proxy_request_logs WHERE created_at >= ?",
        (start_ts,),
    ).fetchone()
    return float(row[0] or 0.0)


def fetch_daily(conn, start_ts):
    return conn.execute(
        "SELECT date(CAST(created_at AS INTEGER), 'unixepoch', 'localtime') AS day, "
        "ROUND(SUM(CAST(total_cost_usd AS REAL)), 4) AS cost, "
        "COUNT(*) AS calls "
        "FROM proxy_request_logs WHERE created_at >= ? "
        "GROUP BY day ORDER BY day DESC",
        (start_ts,),
    ).fetchall()


def fetch_by_model(conn, start_ts, top_n):
    return conn.execute(
        "SELECT model, app_type, "
        "ROUND(SUM(CAST(total_cost_usd AS REAL)), 4) AS cost, "
        "COUNT(*) AS calls "
        "FROM proxy_request_logs WHERE created_at >= ? "
        "GROUP BY model, app_type ORDER BY cost DESC LIMIT ?",
        (start_ts, top_n),
    ).fetchall()


def fetch_by_session(conn, start_ts, top_n):
    return conn.execute(
        "SELECT session_id, "
        "ROUND(SUM(CAST(total_cost_usd AS REAL)), 4) AS cost, "
        "COUNT(*) AS calls "
        "FROM proxy_request_logs WHERE created_at >= ? "
        "GROUP BY session_id ORDER BY cost DESC LIMIT ?",
        (start_ts, top_n),
    ).fetchall()


def fmt_cost(value, gate):
    """Mark a cost cell if it exceeds the budget gate."""
    if gate is not None and value > gate:
        return f"{value:.4f} [OVER]"
    return f"{value:.4f}"


def main():
    ap = argparse.ArgumentParser(description="Unified cc-switch cost ledger.")
    ap.add_argument("--since", default="7d", help="Window: '7d' (default), '12h', or seconds.")
    ap.add_argument("--budget-gate", type=float, default=None,
                    help="Per-item USD threshold; rows above it are flagged [OVER].")
    ap.add_argument("--total-budget", type=float, default=None,
                    help="7-day ceiling; if total spend exceeds it, a warning is printed.")
    ap.add_argument("--top", type=int, default=10, help="Rows per model/session table.")
    ap.add_argument("--db", default=None, help="Override cc-switch.db path.")
    args = ap.parse_args()

    db_path = resolve_db(args.db)
    conn = connect(db_path)

    now = int(datetime.now().timestamp())
    window_s = parse_since(args.since)
    start_ts = now - window_s
    start_human = datetime.fromtimestamp(start_ts).strftime("%Y-%m-%d %H:%M")
    end_human = datetime.fromtimestamp(now).strftime("%Y-%m-%d %H:%M")

    total = fetch_total(conn, start_ts)
    daily = fetch_daily(conn, start_ts)
    by_model = fetch_by_model(conn, start_ts, args.top)
    by_session = fetch_by_session(conn, start_ts, args.top)

    conn.close()

    out = []
    out.append(f"# Cost Ledger -- last {args.since}  ({start_human} -> {end_human})")
    out.append("")

    # Budget gate: total vs ceiling
    if args.total_budget is not None:
        if total > args.total_budget:
            out.append(f"> [WARN] 7d total ${total:.4f} exceeds budget "
                       f"${args.total_budget:.2f} by ${total - args.total_budget:.4f}")
        else:
            out.append(f"> [OK] 7d total ${total:.4f} within budget ${args.total_budget:.2f}")
        out.append("")

    # 1. 7-day aggregate (total + daily series)
    out.append("## 1. 7-Day Aggregate")
    out.append(f"**Total: ${total:.4f}** across {sum(r[2] for r in daily):,} calls")
    out.append("")
    out.append("| Day | Cost (USD) | Calls |")
    out.append("|-----|-----------|-------|")
    if daily:
        for day, cost, calls in daily:
            out.append(f"| {day} | {fmt_cost(cost, args.budget_gate)} | {calls:,} |")
    else:
        out.append("| - | 0.0000 | 0 |")
    out.append("")

    # 2. By model
    out.append(f"## Top {len(by_model)} Models (by cost)")
    out.append("| Model | App | Cost (USD) | Calls |")
    out.append("|-------|-----|-----------|-------|")
    if by_model:
        for model, app, cost, calls in by_model:
            out.append(f"| {model} | {app or '-'} | {fmt_cost(cost, args.budget_gate)} | {calls:,} |")
    else:
        out.append("| - | - | 0.0000 | 0 |")
    out.append("")

    # 3. By session
    out.append(f"## Top {len(by_session)} Sessions (by cost)")
    out.append("| Session | Cost (USD) | Calls |")
    out.append("|---------|-----------|-------|")
    if by_session:
        for sess, cost, calls in by_session:
            label = (sess[:16] + "...") if sess and len(sess) > 17 else (sess or "-")
            out.append(f"| {label} | {fmt_cost(cost, args.budget_gate)} | {calls:,} |")
    else:
        out.append("| - | 0.0000 | 0 |")
    out.append("")

    if args.budget_gate is not None:
        # Cost column index differs per table:
        #   daily      => r[1];  by_model => r[2];  by_session => r[1]
        flagged = sum(
            1 for r in daily if r[1] > args.budget_gate
        ) + sum(
            1 for r in by_model if r[2] > args.budget_gate
        ) + sum(
            1 for r in by_session if r[1] > args.budget_gate
        )
        out.append(f"_Budget gate: {flagged} item(s) over ${args.budget_gate:.2f} flagged [OVER]._")
        out.append("")

    print("\n".join(out))


if __name__ == "__main__":
    main()
