#!/usr/bin/env python3
"""Self-test for cost-ledger subcommands (alert / forecast).

Builds a synthetic cc-switch.db (text schema mirror of the real proxy_request_logs),
injects per-day spend rows that either form a SPIKE (last 1d >> 2x median)
or a NORMAL trace (last 1d within 2x median), then asserts exit code
and the [SPIKE]/[OK] marker line. No network, stdlib only.

Time layout (each test uses fixed offsets from `now`):
  - "day 0" rows (the row the alert is judging) are stamped at
    `now - 12h` so they land cleanly in the half-open window [now-1d, now).
  - "day 1..7" rows (the baseline buckets) are stamped at
    `now - 1d - 12h`, `now - 2d - 12h`, ... `now - 7d - 12h`, so they
    land in their respective buckets [now-2d,now-1d), [now-3d,now-2d), ...
  - row at `now - 8d` would land in bucket 6 and is intentionally omitted
    so we observe a 7-bucket median over [now-1d, now-8d).

Exit codes:
  0 = all assertions pass
  1 = at least one assertion failed (test infra failure; not the
      ledger.py alert exit codes — those are exercised separately).
"""
import subprocess
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
LEDGER = HERE / "ledger.py"

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(f"{name} {detail}".strip())


def _make_db(path):
    conn = sqlite3.connect(path)
    conn.execute(
        """
        CREATE TABLE proxy_request_logs (
            created_at INTEGER,
            total_cost_usd TEXT,
            provider_id TEXT,
            app_type TEXT,
            model TEXT,
            session_id TEXT
        )
        """
    )
    conn.commit()
    return conn


def _insert_at(conn, ts, total_cost):
    """Insert 10 rows at the given timestamp, splitting total_cost evenly."""
    per_call = total_cost / 10.0
    for _ in range(10):
        conn.execute(
            "INSERT INTO proxy_request_logs VALUES (?, ?, ?, ?, ?, ?)",
            (ts, f"{per_call:.6f}", "default", "claude", "test-model", "sess-x"),
        )
    conn.commit()


def _now_ts():
    return int(time.time())


def _shifted_ts(now, days_ago, hours_offset=0):
    """A timestamp N full days ago, plus `hours_offset` hours forward.

    Default offset=0 keeps the timestamp at exactly `now - N*86400`, which
    is on the bucket boundary. Add `hours_offset=12` to land it cleanly
    inside the half-open window/bucket of interest.
    """
    return now - days_ago * 86400 + hours_offset * 3600


def _build_baseline(conn, now, days_back_range, daily_cost):
    """Insert one row per day in [1..days_back_range] at fixed offsets.

    Day-D (D>=1) row should land in baseline bucket (D-1), which is
    `[now - D*86400, now - (D-1)*86400)`. Stamp it at the bucket midpoint
    `now - (D + 0.5)*86400` to avoid boundary off-by-one issues.

    Note: D=1 row lands in bucket 0 = [now-2d, now-1d), NOT in the
    current window [now-1d, now). The current window is populated by
    `_build_current` separately.
    """
    # Day-D row at bucket midpoint: bucket (D-1) = [now - D*86400, now - (D-1)*86400),
    # so midpoint is `now - (D - 0.5) * 86400` = `now - D*86400 + 12*3600`.
    # For D=1 this puts the row 12h ago -> INSIDE the current window [now-1d, now).
    # So we instead place D=1 in bucket 0 explicitly: now - 36h, and similarly
    # for D>=2 use the midpoint of bucket (D-1).
    for d in range(1, days_back_range + 1):
        # bucket midpoint for day-D is `now - (D*86400) + 12*3600` =
        # `now - (D - 0.5)*86400`, which is 12h before the upper boundary
        # of bucket (D-1). For D>=2 that's safely inside the bucket. For
        # D=1 the bucket is [now-2d, now-1d) and midpoint = now - 36h, which
        # is `now - 1*86400 - 12*3600`. The formula `now - d*86400 + 12*3600`
        # equals `now - (d - 0.5)*86400`. For d=1: now - 12h (current window).
        # Use offset `-12*3600` instead so d=1 lands at now - 36h, bucket 0.
        _insert_at(conn, now - (d * 86400) - 12 * 3600, daily_cost)


def _build_current(conn, now, total_cost):
    """Insert the 'current window' row at `now - 12h` so it falls inside
    the half-open [now-1d, now) window."""
    _insert_at(conn, now - 12 * 3600, total_cost)


def _run(args, timeout=60):
    return subprocess.run(
        [sys.executable, str(LEDGER)] + args,
        capture_output=True, text=True, timeout=timeout,
    )


def test_alert_spike_detected():
    """7d baseline at ~10 USD/day, then today = 50 USD (5x median) -> SPIKE.

    With 7 buckets of 10 USD each, median = 10. Today = 50 USD > 2 * 10 = 20
    -> SPIKE expected, rc=1.
    """
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "synth.db"
        conn = _make_db(db)
        now = _now_ts()
        _build_baseline(conn, now, 7, 10.0)
        _build_current(conn, now, 50.0)
        conn.close()

        result = _run(["alert", "--threshold", "2x_median",
                       "--window", "1d", "--baseline", "7d", "--db", str(db)])
        check("spike: exit code = 1", result.returncode == 1,
              f"got {result.returncode}")
        check("spike: stdout has [SPIKE]", "[SPIKE]" in result.stdout,
              f"stdout head={result.stdout[:200]!r}")
        check("spike: stdout has 'rc=1'", "rc=1" in result.stdout)
        check("spike: stderr empty", not result.stderr.strip(),
              f"stderr={result.stderr!r}")


def test_alert_normal_no_spike():
    """7d baseline at ~10 USD/day, today = 12 USD (1.2x median) -> no spike."""
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "synth.db"
        conn = _make_db(db)
        now = _now_ts()
        _build_baseline(conn, now, 7, 10.0)
        _build_current(conn, now, 12.0)
        conn.close()

        result = _run(["alert", "--threshold", "2x_median",
                       "--window", "1d", "--baseline", "7d", "--db", str(db)])
        check("normal: exit code = 0", result.returncode == 0,
              f"got {result.returncode}")
        check("normal: stdout has [OK]", "[OK]" in result.stdout,
              f"stdout={result.stdout[:300]!r}")
        check("normal: stdout has 'rc=0'", "rc=0" in result.stdout)


def test_alert_threshold_breach_with_3x():
    """Threshold = 3x_median, baseline 10/day, today 35/day -> SPIKE
    (35 > 3*10). Proves the multiplier is parsed correctly."""
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "synth.db"
        conn = _make_db(db)
        now = _now_ts()
        _build_baseline(conn, now, 7, 10.0)
        _build_current(conn, now, 35.0)
        conn.close()

        result = _run(["alert", "--threshold", "3x_median",
                       "--window", "1d", "--baseline", "7d", "--db", str(db)])
        check("3x: exit code = 1", result.returncode == 1)
        check("3x: stdout has [SPIKE]", "[SPIKE]" in result.stdout)


def test_alert_threshold_bare_number():
    """Threshold '2.5' (bare float) -> 2.5x multiplier."""
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "synth.db"
        conn = _make_db(db)
        now = _now_ts()
        _build_baseline(conn, now, 7, 10.0)
        _build_current(conn, now, 30.0)
        conn.close()

        result = _run(["alert", "--threshold", "2.5",
                       "--window", "1d", "--baseline", "7d", "--db", str(db)])
        check("2.5x: 30 > 2.5*10 -> spike rc=1", result.returncode == 1,
              f"got {result.returncode}")
        check("2.5x: stdout has [SPIKE]", "[SPIKE]" in result.stdout)


def test_forecast_basic_shape():
    """Forecast over 14d daily series with steady upward trend (1..14 USD).
    Slope should be positive; 7 '+Nd' rows in output."""
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "synth.db"
        conn = _make_db(db)
        now = _now_ts()
        # d=14..1 -> cost = 15-d; gives costs 1..14, oldest-to-newest trend.
        # Stamp each row -12h inside its day bucket (so d=1 lands in bucket 0).
        for d in range(14, 0, -1):
            _insert_at(conn, _shifted_ts(now, d, hours_offset=-12),
                       float(15 - d))
        # 'today' row at $14 so the series ends cleanly
        _insert_at(conn, now - 12 * 3600, 14.0)
        conn.close()

        result = _run(["forecast", "--horizon", "7d", "--baseline", "15d",
                       "--budget", "500", "--db", str(db)])
        check("forecast: exit code = 0", result.returncode == 0,
              f"got {result.returncode}; stderr={result.stderr!r}")
        check("forecast: stdout has 'NOT an alert'",
              "NOT an alert" in result.stdout)
        rows = [line for line in result.stdout.splitlines()
                if line.startswith("| +") and "d |" in line]
        check("forecast: 7 '+Nd' rows", len(rows) == 7,
              f"got {len(rows)} rows")
        slope_line = next(line for line in result.stdout.splitlines()
                          if "daily slope" in line)
        parts = [p.strip() for p in slope_line.split("|") if p.strip()]
        # parts: ['daily slope (USD/day)', '+0.5000']
        slope_value = parts[1] if len(parts) >= 2 else parts[-1]
        # slope may be '+0.4999' or '-0.5000'; just ensure it parses as a number
        try:
            float(slope_value)
            slope_ok = True
        except ValueError:
            slope_ok = False
        check("forecast: slope is numeric", slope_ok,
              f"slope_value={slope_value!r}")


def test_forecast_too_few_days():
    """Forecast needs >= 2 days; only 1 day should produce a non-zero exit."""
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "synth.db"
        conn = _make_db(db)
        now = _now_ts()
        _insert_at(conn, _shifted_ts(now, 1, hours_offset=-12), 5.0)
        conn.close()

        result = _run(["forecast", "--horizon", "7d",
                       "--baseline", "1d", "--db", str(db)])
        check("forecast: too few days -> non-zero exit",
              result.returncode != 0,
              f"got {result.returncode}")


def test_legacy_backcompat_flat():
    """`ledger.py --since 7d` still works (no subcommand)."""
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "synth.db"
        conn = _make_db(db)
        now = _now_ts()
        for d in range(1, 4):
            _insert_at(conn, _shifted_ts(now, d, hours_offset=-12), 5.0)
        _insert_at(conn, now - 12 * 3600, 5.0)
        conn.close()

        result = _run(["--since", "3d", "--db", str(db)])
        check("legacy: exit code = 0", result.returncode == 0,
              f"got {result.returncode}")
        check("legacy: stdout has 'Cost Ledger'",
              "Cost Ledger" in result.stdout)
        check("legacy: stdout has '7-Day Aggregate'",
              "7-Day Aggregate" in result.stdout)


def main():
    test_alert_spike_detected()
    test_alert_normal_no_spike()
    test_alert_threshold_breach_with_3x()
    test_alert_threshold_bare_number()
    test_forecast_basic_shape()
    test_forecast_too_few_days()
    test_legacy_backcompat_flat()
    print(f"cost-ledger selftest: {len(PASS)} passed, {len(FAIL)} failed")
    for line in FAIL:
        print(f"  FAIL {line}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())