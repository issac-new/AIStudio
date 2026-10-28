"""CLI: eval-calibration.

Two equivalent entry points:
  - python3 -m eval_calibration <events.jsonl> [--kind jev] [--output out.json]
  - python3 scripts/calibrate.py <events.jsonl> [--kind jev] [--output out.json]

Subcommands:
  default:    analyze a JSONL of decision receipts
  alert:      ECE drift detection over --window vs --baseline (path-C, 2026-10-19)

Reads one JSON object per line (a decision receipt). Each record needs at
least id/task/target/prediction; a probability distribution over labels
enables calibration metrics. Records carrying an "error" key count as
invalid attempts (wrong for accuracy, routed to human_candidate).
Offline only: no network, no model calls.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from .metrics import summarize

PROG = "eval_calibration"


# ---------------------------------------------------------------------------
# time-window helpers
# ---------------------------------------------------------------------------

def _parse_window(token, default_unit="d"):
    """Accept '7d', '12h', or raw seconds. Returns seconds (int)."""
    token = (token or "").strip().lower()
    if not token:
        token = default_unit
    if token.endswith("d"):
        return int(token[:-1]) * 86400
    if token.endswith("h"):
        return int(token[:-1]) * 3600
    return int(token)


def _parse_ts(value):
    """Parse an ISO-8601 timestamp string (with or without tz) to epoch seconds.
    Returns None if not parseable."""
    if not isinstance(value, str) or not value.strip():
        return None
    s = value.strip()
    try:
        # Python 3.11+ fromisoformat handles most ISO formats incl. tz offsets.
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _record_ts(record):
    """Best-effort timestamp extraction from a receipt.
    Looks at `created_at` then `started_at`; returns None if neither usable."""
    for key in ("created_at", "started_at"):
        ts = _parse_ts(record.get(key))
        if ts is not None:
            return ts
    return None


def filter_by_window(records, start_ts, end_ts):
    """Records whose timestamp falls in [start_ts, end_ts]. Records without
    a usable timestamp are dropped (counted in 'dropped_no_ts')."""
    kept, dropped = [], 0
    for r in records:
        ts = _record_ts(r)
        if ts is None:
            dropped += 1
            continue
        if start_ts <= ts < end_ts:
            kept.append(r)
    return kept, dropped


# ---------------------------------------------------------------------------
# shared I/O
# ---------------------------------------------------------------------------

def load_records(path):
    records = []
    try:
        with open(path, encoding="utf-8") as handle:
            for lineno, line in enumerate(handle, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError as error:
                    print(f"{PROG}: {path}:{lineno}: invalid JSON: {error}",
                          file=sys.stderr)
                    sys.exit(2)
    except OSError as error:
        print(f"{PROG}: cannot read {path}: {error}", file=sys.stderr)
        sys.exit(2)
    if not records:
        print(f"{PROG}: {path}: no records found", file=sys.stderr)
        sys.exit(2)
    return records


def pick(records, kind):
    if kind == "all":
        return records
    selected = [r for r in records if isinstance(r, dict) and r.get("kind") == kind]
    if not selected:
        print(f"{PROG}: no records with kind={kind!r} in input", file=sys.stderr)
        sys.exit(2)
    return selected


# ---------------------------------------------------------------------------
# command: default (analyze)  — back-compat
# ---------------------------------------------------------------------------

def cmd_analyze(args):
    records = pick(load_records(args.events), args.kind)
    result = summarize(records)
    overall = result["overall"]

    def fmt(value, digits=4):
        return "null" if value is None else f"{value:.{digits}f}"

    print(f"records: {overall['attempted']}  valid: {overall['valid']}  "
          f"invalid: {overall['invalid']}")
    print(f"accuracy: {fmt(overall['accuracy'])} "
          f"(valid-only: {fmt(overall['accuracy_valid'])})  "
          f"correct: {overall['correct']}")
    print(f"brier: {fmt(overall['brier'])}  nll: {fmt(overall['nll'])}")
    print(f"ECE(top_probability): {fmt(overall['top_probability_calibration']['ece'])}  "
          f"ECE(confidence): {fmt(overall['confidence_shape_diagnostic']['ece'])}")
    for name, route in overall["routes"]["top_probability"].items():
        print(f"route {name}: n={route['n']} coverage={fmt(route['coverage'], 3)} "
              f"accuracy={fmt(route['accuracy'])} risk={fmt(route['risk'])}")

    if args.output is not None:
        args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False,
                                          allow_nan=False) + "\n", encoding="utf-8")
        print(f"wrote {args.output}")
    return 0


# ---------------------------------------------------------------------------
# command: alert  (NEW 2026-10-19, path-C)
# ---------------------------------------------------------------------------

def _ece_of(records):
    """Run summarize on records; return overall top_probability ECE (float or None)."""
    if not records:
        return None, 0
    result = summarize(records)
    return result["overall"]["top_probability_calibration"]["ece"], result["overall"]["valid"]


def cmd_alert(args):
    """Compare ECE over --window vs --baseline. Drift = |ECE_w - ECE_b|.
    Threshold breach (drift >= --drift) -> rc=1 + [CALIBRATION_DRIFT]."""
    records = load_records(args.events)
    if args.kind != "all":
        records = [r for r in records
                   if isinstance(r, dict) and r.get("kind") == args.kind]
        if not records:
            print(f"{PROG}: no records with kind={args.kind!r}", file=sys.stderr)
            sys.exit(2)

    window_s = _parse_window(args.window)
    baseline_s = _parse_window(args.baseline)

    # Use the most-recent timestamp in the data as the reference 'now' (UTC).
    # Records without timestamps are filtered out below.
    parsed_ts = [_record_ts(r) for r in records]
    ts_values = [t for t in parsed_ts if t is not None]
    if not ts_values:
        print(f"{PROG}: no records have a usable created_at/started_at",
              file=sys.stderr)
        sys.exit(2)

    now_ts = max(ts_values)
    window_end = now_ts
    window_start = now_ts - window_s
    baseline_end = window_start
    baseline_start = baseline_end - baseline_s

    if baseline_s < window_s:
        print(
            f"{PROG}: --baseline ({args.baseline}) shorter than --window ({args.window}); "
            f"need >= {window_s}s of baseline.",
            file=sys.stderr,
        )
        sys.exit(2)

    window_set, dropped_w = filter_by_window(records, window_start, window_end)
    baseline_set, dropped_b = filter_by_window(records, baseline_start, baseline_end)

    drift_value = args.drift
    ece_w, valid_w = _ece_of(window_set)
    ece_b, valid_b = _ece_of(baseline_set)

    out = []
    out.append(f"# Calibration Drift Alert -- {args.window} vs {args.baseline}")
    out.append("")
    out.append(f"_now={datetime.fromtimestamp(now_ts, tz=timezone.utc).isoformat()}_")
    out.append("")
    out.append("| Metric | Value |")
    out.append("|--------|-------|")
    out.append(f"| window records (kept / dropped_no_ts) | {len(window_set)} / {dropped_w} |")
    out.append(f"| baseline records (kept / dropped_no_ts) | {len(baseline_set)} / {dropped_b} |")
    out.append(f"| window ECE ({args.window}) | {ece_w if ece_w is not None else 'null'} |")
    out.append(f"| baseline ECE ({args.baseline}) | {ece_b if ece_b is not None else 'null'} |")
    ece_w_str = f"{ece_w:.4f}" if ece_w is not None else "null"
    ece_b_str = f"{ece_b:.4f}" if ece_b is not None else "null"
    drift = (abs(ece_w - ece_b)
             if (ece_w is not None and ece_b is not None) else None)
    drift_str = f"{drift:.4f}" if drift is not None else "null"
    out.append(f"| drift | {drift_str} |")
    out.append(f"| threshold (drift >=) | {drift_value:.4f} |")
    out.append("")

    # Decision: only flag drift if BOTH ECEs are computable; otherwise emit
    # an [INSUFFICIENT_DATA] note and rc=0 (not an alarm — caller decides).
    if ece_w is None or ece_b is None:
        out.append("> [INSUFFICIENT_DATA] one or both windows have 0 valid records; cannot evaluate drift.")
        out.append("> rc=0 (no alert).")
        print("\n".join(out))
        return 0

    if drift >= drift_value:
        out.append(
            f"> [CALIBRATION_DRIFT] drift {drift_str} >= threshold "
            f"{drift_value:.4f} (window ECE {ece_w_str}, baseline ECE {ece_b_str})"
        )
        out.append("> rc=1 (alert).")
        print("\n".join(out))
        return 1

    out.append(
        f"> [OK] drift {drift_str} < threshold {drift_value:.4f} "
        f"(window ECE {ece_w_str}, baseline ECE {ece_b_str})"
    )
    out.append("> rc=0 (no alert).")
    print("\n".join(out))
    return 0


# ---------------------------------------------------------------------------
# CLI dispatch
# ---------------------------------------------------------------------------

def build_parser():
    parser = argparse.ArgumentParser(
        prog=PROG, description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command")

    # default (back-compat: analyze)
    p_an = subparsers.add_parser(
        "analyze",
        help="Analyze a JSONL of decision receipts (default behavior).",
        description=(
            "Reads one JSON object per line. Each record needs at least "
            "id/task/target/prediction; a probability distribution enables "
            "calibration metrics."
        ),
    )
    p_an.add_argument("events", type=Path, help="JSONL file of decision receipts")
    p_an.add_argument("--kind", default="all",
                      help="filter by record 'kind' field (e.g. jev, base); default all")
    p_an.add_argument("--output", type=Path, default=None,
                      help="write full summary JSON here (default: stdout only)")

    # alert (NEW 2026-10-19)
    p_al = subparsers.add_parser(
        "alert",
        help="ECE drift detector: --window vs --baseline (path-C observability).",
        description=(
            "Compare top_probability ECE over --window vs --baseline. "
            "drift = |ECE_w - ECE_b|. drift >= --drift -> rc=1 + "
            "[CALIBRATION_DRIFT]. Stdlib only."
        ),
    )
    p_al.add_argument("--events", type=Path, default=Path("events.jsonl"),
                      help="JSONL file of decision receipts (default: ./events.jsonl)")
    p_al.add_argument("--kind", default="all",
                      help="filter by record 'kind' field (default: all)")
    p_al.add_argument("--drift", type=float, default=0.1,
                      help="drift threshold; default 0.1")
    p_al.add_argument("--window", default="7d",
                      help="current-window length to evaluate: '7d' (default), '12h', seconds")
    p_al.add_argument("--baseline", default="30d",
                      help="baseline length: '30d' (default). Must be >= window.")

    return parser, {"analyze": p_an, "alert": p_al}


def main(argv=None):
    parser, sub_map = build_parser()

    # Back-compat: if the first token is not a registered subcommand and looks
    # like a path (positional `events`), treat as legacy `analyze events ...`.
    tokens = argv if argv is not None else sys.argv[1:]
    if tokens and tokens[0] not in ("analyze", "alert", "-h", "--help"):
        argv = ["analyze"] + list(tokens)

    args = parser.parse_args(argv)

    if args.command == "alert":
        return cmd_alert(args)
    if args.command == "analyze":
        return cmd_analyze(args)
    # No subcommand + nothing useful -> show help
    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())