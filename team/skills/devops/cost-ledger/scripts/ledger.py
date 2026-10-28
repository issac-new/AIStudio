#!/usr/bin/env python3
"""cost-ledger: unified cost ledger from cc-switch.db.

Aggregates per-call USD (proxy_request_logs) into a 7-day / by-model / by-session
ledger and flags over-budget items. Read-only against the live DB.

Usage:
  # default: 7-day aggregate (back-compat with the original CLI)
  python3 ledger.py --since 7d
  python3 ledger.py --since 30d --budget-gate 50
  python3 ledger.py --since 7d --budget-gate 20 --db /path/to/cc-switch.db

  # NEW subcommands (2026-10-19, path-C of observability fusion):
  python3 ledger.py alert --threshold 2x_median --window 1d --baseline 7d
  python3 ledger.py forecast --horizon 30d --budget 1000

Exit codes (whole script):
  0 = normal / within budget / no spike / forecast OK
  1 = threshold breach (spike detected, or calibration drift >= threshold)
  2 = script crashed (DB missing, IO error, bad arg)

The cost columns in cc-switch.db are TEXT, so every aggregate uses
CAST(total_cost_usd AS REAL). created_at is epoch seconds (local time).
"""
import argparse
import os
import sqlite3
import sys
from datetime import datetime


# ---------------------------------------------------------------------------
# shared helpers
# ---------------------------------------------------------------------------

def resolve_db(cli_path):
    if cli_path:
        return os.path.expanduser(cli_path)
    return os.path.expanduser(
        os.environ.get("CC_SWITCH_DB", "~/.cc-switch/cc-switch.db")
    )


def parse_window(token):
    """Accept '7d', '12h', or raw seconds."""
    token = (token or "7d").strip().lower()
    if token.endswith("d"):
        return int(token[:-1]) * 86400
    if token.endswith("h"):
        return int(token[:-1]) * 3600
    return int(token)


def connect(db_path):
    if not os.path.exists(db_path):
        # Frozen exit-code contract (task body): script crash = 2.
        print(f"ERROR: cc-switch.db not found at {db_path}", file=sys.stderr)
        sys.exit(2)
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


# ---------------------------------------------------------------------------
# command: ledger (default --since / --budget-gate / etc)
# ---------------------------------------------------------------------------

def cmd_ledger(args):
    db_path = resolve_db(args.db)
    conn = connect(db_path)

    now = int(datetime.now().timestamp())
    window_s = parse_window(args.since)
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


# ---------------------------------------------------------------------------
# command: alert  (cost-spike detector, new 2026-10-19)
# ---------------------------------------------------------------------------

def _parse_threshold_multiplier(token):
    """Accept '2x_median', '2x', '1.5x', bare '2.0' etc. Returns float multiplier."""
    token = (token or "").strip().lower()
    if not token:
        return 2.0
    if token.endswith("x_median"):
        body = token[: -len("x_median")]
    elif token.endswith("x"):
        body = token[:-1]
    else:
        body = token
    try:
        mult = float(body)
    except ValueError:
        print(f"ERROR: cannot parse threshold {token!r} "
              f"(expected e.g. '2x_median', '1.5x', or '2.0')", file=sys.stderr)
        sys.exit(2)
    if mult <= 0:
        print(f"ERROR: threshold multiplier must be > 0, got {mult}", file=sys.stderr)
        sys.exit(2)
    return mult


def _median(values):
    """Median of a non-empty numeric sequence. Pure stdlib."""
    n = len(values)
    if not n:
        return 0.0
    s = sorted(values)
    mid = n // 2
    if n % 2:
        return float(s[mid])
    return (s[mid - 1] + s[mid]) / 2.0


def _window_total(conn, start_ts, end_ts):
    """Total cost over [start_ts, end_ts); clamp if end_ts in future."""
    row = conn.execute(
        "SELECT ROUND(SUM(CAST(total_cost_usd AS REAL)), 4) "
        "FROM proxy_request_logs WHERE created_at >= ? AND created_at < ?",
        (start_ts, end_ts),
    ).fetchone()
    return float(row[0] or 0.0)


def _window_length_s(token):
    return parse_window(token)


def cmd_alert(args):
    """Compare --window spend vs median spend over N equal-length --baseline
    windows. Spike if window > median * threshold.

    Threshold is RELATIVE (e.g. 2x_median), per observability §04 「告警阈值
    应基于系统自己的基线漂移」 — never absolute USD (would be the
    '把阈值搞成绝对值' anti-pattern the body explicitly forbids).
    """
    db_path = resolve_db(args.db)
    conn = connect(db_path)

    mult = _parse_threshold_multiplier(args.threshold)
    window_s = _window_length_s(args.window)
    baseline_s = _window_length_s(args.baseline)

    now = int(datetime.now().timestamp())
    window_start = now - window_s
    window_end = now

    # slice baseline into N equal-length windows ending at window_start.
    # If baseline_s is 7d and window_s is 1d -> 7 buckets.
    if baseline_s < window_s:
        print(
            f"ERROR: --baseline ({args.baseline}) shorter than --window "
            f"({args.window}); need >= {window_s}s of baseline.",
            file=sys.stderr,
        )
        sys.exit(2)
    n_buckets = max(1, baseline_s // window_s)
    bucket_totals = []
    for i in range(int(n_buckets)):
        # bucket i: [window_start - (i+1)*window_s, window_start - i*window_s)
        # i=0 = most recent bucket just before window_start
        b_end = window_start - i * window_s
        b_start = b_end - window_s
        bucket_totals.append(_window_total(conn, b_start, b_end))

    bucket_totals.reverse()  # chronological order: oldest first, newest last
    median = _median(bucket_totals)
    current = _window_total(conn, window_start, window_end)
    spike_at = median * mult
    is_spike = median > 0 and current > spike_at

    conn.close()

    out = []
    out.append(f"# Cost Alert -- {args.window} vs median({args.baseline})")
    out.append("")
    out.append(
        f"_now={datetime.fromtimestamp(now).strftime('%Y-%m-%d %H:%M')} "
        f"window_start={datetime.fromtimestamp(window_start).strftime('%Y-%m-%d %H:%M')}_"
    )
    out.append("")
    out.append("| Metric | Value (USD) |")
    out.append("|--------|-------------|")
    out.append(f"| current window ({args.window}) | {current:.4f} |")
    out.append(f"| median of {len(bucket_totals)} baseline buckets ({args.baseline} = {args.window}*{len(bucket_totals)}) | {median:.4f} |")
    out.append(f"| threshold ({args.threshold} = x{mult:g}) | {spike_at:.4f} |")
    out.append(f"| bucket series (oldest -> newest) | {[round(v, 4) for v in bucket_totals]} |")
    out.append("")

    if median <= 0:
        out.append("> [NOTE] baseline median is 0 (no historical spend); cannot evaluate spike.")
        out.append("> rc=0 (no spike evidence).")
        print("\n".join(out))
        return 0

    if is_spike:
        out.append(
            f"> [SPIKE] current ${current:.4f} > {mult:g}x median ${spike_at:.4f} "
            f"(ratio {current / median:.2f}x)"
        )
        out.append("> rc=1 (alert).")
        print("\n".join(out))
        return 1

    out.append(
        f"> [OK] current ${current:.4f} within {mult:g}x median ${spike_at:.4f} "
        f"(ratio {current / median:.2f}x)"
    )
    out.append("> rc=0 (no alert).")
    print("\n".join(out))
    return 0


# ---------------------------------------------------------------------------
# command: forecast  (linear-regression next-N-day projection, new 2026-10-19)
# ---------------------------------------------------------------------------

def _daily_series(conn, start_ts, end_ts):
    """List of (day_index, cost) where day_index is 0 for oldest day, 1, 2..."""
    rows = conn.execute(
        "SELECT date(CAST(created_at AS INTEGER), 'unixepoch', 'localtime') AS day, "
        "ROUND(SUM(CAST(total_cost_usd AS REAL)), 4) AS cost "
        "FROM proxy_request_logs "
        "WHERE created_at >= ? AND created_at < ? "
        "GROUP BY day ORDER BY day ASC",
        (start_ts, end_ts),
    ).fetchall()
    return [(i, float(row[1])) for i, row in enumerate(rows)]


def _linear_regression(points):
    """Pure-stdlib simple linear regression on (x, y) pairs.

    Returns (slope, intercept). No claim of ARIMA / PROPHET; body forbids it.
    """
    n = len(points)
    if n < 2:
        return (0.0, points[0][1] if points else 0.0)
    sum_x = sum(p[0] for p in points)
    sum_y = sum(p[1] for p in points)
    sum_xy = sum(p[0] * p[1] for p in points)
    sum_xx = sum(p[0] * p[0] for p in points)
    denom = n * sum_xx - sum_x * sum_x
    if denom == 0:
        return (0.0, sum_y / n)
    slope = (n * sum_xy - sum_x * sum_y) / denom
    intercept = (sum_y - slope * sum_x) / n
    return (slope, intercept)


def _residual_std(points, slope, intercept):
    """Standard deviation of residuals (y - (slope*x + intercept))."""
    n = len(points)
    if n < 2:
        return 0.0
    sq = sum((y - (slope * x + intercept)) ** 2 for x, y in points)
    # ddof=1 sample variance -> unbiased estimator
    return (sq / (n - 1)) ** 0.5


def cmd_forecast(args):
    """Project next --horizon days via simple linear regression on the
    last --baseline window's daily series. Honest stdlib, NOT ARIMA/PROPHET.

    Output: projection + 95% interval (Wilson-style: ±1.96*sigma).

    Does NOT trigger any alarm. The orchestrator/cron layer decides
    what to do with the projection. This is a read-and-print command.
    """
    db_path = resolve_db(args.db)
    conn = connect(db_path)

    horizon_s = _window_length_s(args.horizon)
    baseline_s = _window_length_s(args.baseline)
    horizon_days = horizon_s // 86400
    baseline_days = max(1, baseline_s // 86400)

    now = int(datetime.now().timestamp())
    end_ts = now
    start_ts = now - baseline_s

    series = _daily_series(conn, start_ts, end_ts)
    conn.close()

    if len(series) < 2:
        print(
            f"ERROR: need >= 2 days of daily data for linear regression, "
            f"got {len(series)} (baseline={args.baseline}).",
            file=sys.stderr,
        )
        sys.exit(2)

    slope, intercept = _linear_regression(series)
    sigma = _residual_std(series, slope, intercept)

    last_x = series[-1][0]
    projection_days = []
    cumulative = 0.0
    for d in range(1, horizon_days + 1):
        x = last_x + d
        point = slope * x + intercept
        half_width = 1.96 * sigma
        projection_days.append((d, point, point - half_width, point + half_width))
        cumulative += point

    out = []
    out.append(f"# Cost Forecast -- next {args.horizon} from last {args.baseline} daily series")
    out.append("")
    out.append(
        f"_method=simple linear regression (slope={slope:.4f}, intercept={intercept:.4f}); "
        f"NOT ARIMA/PROPHET, stdlib only per observability §04._"
    )
    out.append("")
    out.append(f"| Metric | Value (USD) |")
    out.append(f"|--------|-------------|")
    out.append(f"| daily slope (USD/day) | {slope:+.4f} |")
    out.append(f"| residual std sigma | {sigma:.4f} |")
    out.append(f"| {args.horizon} total projection (sum of daily points) | {cumulative:.4f} |")
    if args.budget is not None:
        over = cumulative - args.budget
        out.append(
            f"| budget reference | {args.budget:.4f} "
            f"({'[OVER] by ' + format(over, '.4f') if over > 0 else 'within budget'}) |"
        )
    out.append("")

    out.append(f"| Day | Point projection | 95% lower | 95% upper |")
    out.append(f"|-----|------------------|-----------|-----------|")
    for d, point, lo, hi in projection_days:
        out.append(f"| +{d}d | {point:.4f} | {lo:.4f} | {hi:.4f} |")
    out.append("")

    out.append("> NOT an alert — projection only. Routing decision belongs to orchestrator/cron.")

    print("\n".join(out))
    return 0


# ---------------------------------------------------------------------------
# CLI dispatch
# ---------------------------------------------------------------------------

def build_parser():
    # Top-level parser carries the legacy flags directly so old call sites
    # (`ledger.py --since 7d`, `ledger.py --budget-gate 50`) keep working
    # without a subcommand keyword. When a subcommand is supplied, those
    # flags conflict with it and argparse picks the subcommand path.
    parser = argparse.ArgumentParser(
        description="Unified cc-switch cost ledger (with alert + forecast).",
    )
    parser.add_argument("--since", default=None,
                        help="[legacy] Window: '7d' (default), '12h', or seconds. "
                             "Used when no subcommand is given.")
    parser.add_argument("--budget-gate", type=float, default=None,
                        help="[legacy] Per-item USD threshold for [OVER] flag.")
    parser.add_argument("--total-budget", type=float, default=None,
                        help="[legacy] Window ceiling; warn if total exceeds it.")
    parser.add_argument("--top", type=int, default=None,
                        help="[legacy] Rows per model/session table.")
    parser.add_argument("--db", default=None,
                        help="Override cc-switch.db path (legacy + all subcommands).")

    subparsers = parser.add_subparsers(dest="command")

    # 'ledger' subcommand (new — but routes to same code path as legacy flags).
    p_ledger = subparsers.add_parser(
        "ledger",
        help="Aggregate cost over --since window (back-compat CLI).",
        description=(
            "Aggregate cc-switch cost over --since window with optional "
            "budget-gate / total-budget flags. Same behavior as legacy "
            "`ledger.py --since 7d`."
        ),
    )
    p_ledger.add_argument("--since", default="7d", help="Window: '7d' (default), '12h', or seconds.")
    p_ledger.add_argument("--budget-gate", type=float, default=None)
    p_ledger.add_argument("--total-budget", type=float, default=None)
    p_ledger.add_argument("--top", type=int, default=10)
    p_ledger.add_argument("--db", default=None)

    # 'alert' subcommand (NEW 2026-10-19)
    p_alert = subparsers.add_parser(
        "alert",
        help="Cost-spike alert: --window spend vs --baseline median * --threshold.",
        description=(
            "Compare current --window spend against median spend across "
            "equal-length buckets over the --baseline period. Spike if "
            "current > threshold x median. Threshold is RELATIVE "
            "(e.g. 2x_median), never an absolute USD value "
            "(observability §04 anti-pattern)."
        ),
    )
    p_alert.add_argument("--threshold", default="2x_median",
                         help="Relative multiplier; '2x_median' (default), '1.5x', '3x', or bare number.")
    p_alert.add_argument("--window", default="1d",
                         help="Current-window length to evaluate: '1d' (default), '12h', seconds.")
    p_alert.add_argument("--baseline", default="7d",
                         help="Total baseline length to slice into buckets: '7d' (default).")
    p_alert.add_argument("--db", default=None)

    # 'forecast' subcommand (NEW 2026-10-19)
    p_fc = subparsers.add_parser(
        "forecast",
        help="Linear-regression projection of next --horizon cost from --baseline daily series.",
        description=(
            "Simple stdlib linear regression on daily series; prints "
            "projection + 95% interval (Wilson-style ±1.96*sigma). "
            "Not ARIMA/PROPHET (observability §04)."
        ),
    )
    p_fc.add_argument("--horizon", default="30d",
                      help="Forecast horizon: '30d' (default), '7d', etc.")
    p_fc.add_argument("--baseline", default="30d",
                      help="Daily-series window to fit: '30d' (default). Need >= 2 days.")
    p_fc.add_argument("--budget", type=float, default=None,
                      help="Optional USD budget reference; prints [OVER]/within marker, no alarm.")
    p_fc.add_argument("--db", default=None)

    return parser, {"ledger": p_ledger, "alert": p_alert, "forecast": p_fc}


def _coerce_legacy_args(args):
    """If the user passed any legacy-style flat flag, return a Namespace
    shaped for cmd_ledger. Otherwise return None (subcommand was used,
    or nothing was passed and the caller decides).
    """
    legacy = argparse.Namespace(
        since=args.since if args.since is not None else "7d",
        budget_gate=args.budget_gate,
        total_budget=args.total_budget,
        top=args.top if args.top is not None else 10,
        db=args.db,
    )
    return legacy


def main(argv=None):
    parser, sub_map = build_parser()
    args = parser.parse_args(argv)

    # Subcommand path: route to handler.
    if args.command is not None:
        handlers = {
            "ledger": cmd_ledger,
            "alert": cmd_alert,
            "forecast": cmd_forecast,
        }
        rc = handlers[args.command](args)
        return rc if isinstance(rc, int) else 0

    # No subcommand: legacy flat-CLI back-compat.
    legacy_ns = _coerce_legacy_args(args)
    return cmd_ledger(legacy_ns) or 0


if __name__ == "__main__":
    sys.exit(main())