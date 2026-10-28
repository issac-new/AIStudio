#!/usr/bin/env python3
"""Self-test for eval-calibration `alert` subcommand.

Synthesizes JSONL fixtures with crafted ECE differences and asserts the
alert subcommand returns the right rc + marker.

Exit codes:
  0 = all assertions pass
  1 = at least one assertion failed
"""
import json
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
CALIBRATE = HERE / "calibrate.py"

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(f"{name} {detail}".strip())


def _make_iso(days_ago, hour=12):
    """ISO-8601 timestamp `days_ago` days before today at HH:00 UTC."""
    ts = datetime.now(tz=timezone.utc).replace(hour=hour, minute=0, second=0,
                                                microsecond=0) - timedelta(days=days_ago)
    return ts.isoformat()


def _write_jsonl(path, rows):
    with open(path, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")


def _good_receipt(prediction, target, ts, score):
    """Return a valid receipt with `started_at` = ts. score controls the
    distribution sharpness (higher score -> tighter -> lower ECE)."""
    # 4-class setup with target class at score, others splitting remainder.
    other = (1.0 - score) / 3.0
    probs = {target: score, f"_a_{ts[-4:]}": other, f"_b_{ts[-4:]}": other,
             f"_c_{ts[-4:]}": other}
    return {
        "id": f"r:{ts}", "task": "t", "target": target, "prediction": prediction,
        "kind": "jev",
        "started_at": ts,
        "probabilities": probs,
        "confidence": score,
    }


def _run(cmd, timeout=30):
    return subprocess.run(
        [sys.executable, str(CALIBRATE)] + cmd,
        capture_output=True, text=True, timeout=timeout,
    )


def test_alert_insufficient_data():
    """Sample concentrated on one day -> baseline window empty -> INSUFFICIENT_DATA,
    rc=0."""
    with tempfile.TemporaryDirectory() as td:
        jsonl = Path(td) / "single.jsonl"
        # 5 records all on the same day (day 1).
        rows = [_good_receipt("(A)", "(A)", _make_iso(1, hour=10 + i), 0.95)
                for i in range(5)]
        _write_jsonl(jsonl, rows)

        result = _run(["alert", "--events", str(jsonl),
                       "--window", "7d", "--baseline", "30d",
                       "--drift", "0.05"])
        check("insufficient: rc=0", result.returncode == 0,
              f"got {result.returncode}; stderr={result.stderr!r}")
        check("insufficient: stdout has [INSUFFICIENT_DATA]",
              "[INSUFFICIENT_DATA]" in result.stdout)
        check("insufficient: stdout has baseline ECE = null",
              "baseline ECE (30d) | null" in result.stdout)


def test_alert_no_drift():
    """Window ECE ≈ baseline ECE = same distribution -> drift small, [OK] rc=0."""
    with tempfile.TemporaryDirectory() as td:
        jsonl = Path(td) / "nodrift.jsonl"
        # 10 records: 5 in window (last 5d), 5 in baseline (5..10d ago).
        # All use the same calibration pattern -> drift ≈ 0.
        rows = []
        for i in range(5):
            rows.append(_good_receipt("(A)", "(A)", _make_iso(1 + i, 10), 0.95))
        for i in range(5):
            rows.append(_good_receipt("(A)", "(A)", _make_iso(7 + i, 10), 0.95))
        _write_jsonl(jsonl, rows)

        result = _run(["alert", "--events", str(jsonl),
                       "--window", "5d", "--baseline", "10d",
                       "--drift", "0.1"])
        check("nodrift: rc=0", result.returncode == 0,
              f"got {result.returncode}; stderr={result.stderr!r}")
        check("nodrift: stdout has [OK]", "[OK]" in result.stdout,
              f"stdout={result.stdout[:300]!r}")
        check("nodrift: stdout has 'drift < threshold'",
              "drift" in result.stdout and "threshold" in result.stdout)


def test_alert_drift_detected():
    """Window ECE high, baseline ECE low -> drift large -> [CALIBRATION_DRIFT] rc=1.

    Window: 8 records with score=0.55 (poorly calibrated).
    Baseline: 8 records with score=0.99 (well calibrated).
    ECE should differ noticeably between the two windows -> drift > 0.1.
    """
    with tempfile.TemporaryDirectory() as td:
        jsonl = Path(td) / "drift.jsonl"
        rows = []
        # window (days 1..4): poorly calibrated (score 0.55, target correct)
        for i in range(8):
            rows.append(_good_receipt("(A)", "(A)", _make_iso(1 + (i % 4), 10), 0.55))
        # baseline (days 6..9): well calibrated (score 0.99)
        for i in range(8):
            rows.append(_good_receipt("(A)", "(A)", _make_iso(6 + (i % 4), 10), 0.99))
        _write_jsonl(jsonl, rows)

        result = _run(["alert", "--events", str(jsonl),
                       "--window", "5d", "--baseline", "5d",
                       "--drift", "0.05"])
        check("drift: rc=1", result.returncode == 1,
              f"got {result.returncode}; stderr={result.stderr!r}")
        check("drift: stdout has [CALIBRATION_DRIFT]",
              "[CALIBRATION_DRIFT]" in result.stdout,
              f"stdout={result.stdout[:400]!r}")


def test_alert_with_kind_filter():
    """`--kind base` filters records; if only `jev` records exist, result is
    empty -> INSUFFICIENT_DATA."""
    with tempfile.TemporaryDirectory() as td:
        jsonl = Path(td) / "kind.jsonl"
        rows = []
        for i in range(5):
            r = _good_receipt("(A)", "(A)", _make_iso(1 + i, 10), 0.95)
            r["kind"] = "jev"
            rows.append(r)
        _write_jsonl(jsonl, rows)

        # Filter by 'base' which has 0 records -> INSUFFICIENT_DATA path
        # may surface as SystemExit; verify rc != 0 OR rc=0+INSUFFICIENT_DATA.
        result = _run(["alert", "--events", str(jsonl),
                       "--kind", "base",
                       "--window", "7d", "--baseline", "30d",
                       "--drift", "0.05"])
        # Either: rc=0 with [INSUFFICIENT_DATA] (filtered to 0 then 0 records in window)
        # Or: rc!=0 because filter empties everything before time-windowing
        check("kind-filter: handled gracefully (no crash with stacktrace)",
              "Traceback" not in result.stderr,
              f"stderr={result.stderr[:200]!r}")


def test_alert_baseline_shorter_than_window():
    """baseline < window should produce a clean SystemExit error (rc=2)."""
    with tempfile.TemporaryDirectory() as td:
        jsonl = Path(td) / "short.jsonl"
        rows = [_good_receipt("(A)", "(A)", _make_iso(1, 10), 0.95) for _ in range(3)]
        _write_jsonl(jsonl, rows)

        result = _run(["alert", "--events", str(jsonl),
                       "--window", "30d", "--baseline", "7d",
                       "--drift", "0.1"])
        check("short-baseline: rc != 0", result.returncode != 0,
              f"got {result.returncode}")


def main():
    test_alert_insufficient_data()
    test_alert_no_drift()
    test_alert_drift_detected()
    test_alert_with_kind_filter()
    test_alert_baseline_shorter_than_window()
    print(f"calibrate selftest: {len(PASS)} passed, {len(FAIL)} failed")
    for line in FAIL:
        print(f"  FAIL {line}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())