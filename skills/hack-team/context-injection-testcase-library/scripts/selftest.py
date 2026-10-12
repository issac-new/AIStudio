#!/usr/bin/env python3
"""context-injection-testcase-library 内置自检 — 薄包装, 实现在 run_context_injection_tests.py:selftest_main"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from run_context_injection_tests import selftest_main  # noqa: E402

if __name__ == "__main__":
    sys.exit(selftest_main())
