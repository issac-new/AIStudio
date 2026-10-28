#!/usr/bin/env python3
"""calibrate.py — thin wrapper so the documented `calibrate.py <subcommand>`
CLI surface works without changing `python3 -m eval_calibration`.

Equivalent entry points:
  python3 -m eval_calibration <subcommand> [...]
  python3 scripts/calibrate.py   <subcommand> [...]

Subcommands:
  analyze (default; back-compat with old positional `<events.jsonl>` form):
    Reads a JSONL of decision receipts and prints calibration summary.

  alert (NEW 2026-10-19, path-C observability fusion):
    ECE drift detection over --window vs --baseline.
    Returns rc=0 (no drift), rc=1 ([CALIBRATION_DRIFT]), or rc=2 (crash).

Both entry points share the same underlying code; this file just delegates.
"""
import os
import sys
from pathlib import Path

# Make the package importable when invoked from anywhere.
HERE = Path(__file__).resolve().parent
PKG_ROOT = HERE.parent
sys.path.insert(0, str(PKG_ROOT))

# Re-export the CLI entry point from the package's __main__.
from eval_calibration.__main__ import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())