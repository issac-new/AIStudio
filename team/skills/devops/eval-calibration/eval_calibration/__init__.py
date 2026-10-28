"""Offline calibration analysis for judged-decision receipts (JSONL).

Consumes per-item records with id/task/target/prediction and an optional
probability distribution, and reports accuracy, valid-record diagnostics,
ECE, Brier, NLL, Wilson 95% intervals, and a 3-bucket routing simulation.
Offline only: reads local files, writes local files, never calls the network.
"""

from .metrics import summarize

__all__ = ["summarize", "main"]
__version__ = "0.1.0"
