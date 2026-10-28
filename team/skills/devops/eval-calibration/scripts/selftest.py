#!/usr/bin/env python3
"""Self-test for eval-calibration: fixture math, denominators, route mapping.

Runs offline against a synthetic fixture plus the shipped sample excerpt.
Exit 0 = all assertions pass. No network, no model calls.
"""

import json
import math
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from eval_calibration.metrics import summarize

HERE = Path(__file__).resolve().parent.parent
SAMPLE = HERE / "assets" / "sample-events.jsonl"

PASS, FAIL = [], []


def check(name, condition, detail=""):
    (PASS if condition else FAIL).append(f"{name} {detail}".strip())


def synth():
    """Four labelled items with hand-computable expected values."""
    return [
        # item 1: correct, p=0.9 exactly at auto boundary, brier=(0.1^2+0.9^2)=0.82
        {"id": "a:1", "task": "t", "target": "A", "prediction": "A",
         "probabilities": {"A": 0.9, "B": 0.1}},
        # item 2: correct, p=0.75 -> stronger_model bucket, brier=(0.75^2+0.25^2)=0.625
        {"id": "a:2", "task": "t", "target": "B", "prediction": "B",
         "probabilities": {"A": 0.25, "B": 0.75}},
        # item 3: wrong, p=0.8, brier=(0.8^2+0.2^2)=0.68, nll=-log(0.2)
        {"id": "a:3", "task": "t", "target": "A", "prediction": "B",
         "probabilities": {"A": 0.2, "B": 0.8}},
        # item 4: error record -> invalid, counts wrong, routes to human
        {"id": "a:4", "task": "t", "target": "A", "prediction": "A",
         "error": {"type": "OSError", "message": "no retry"}},
    ]


def test_synthetic():
    result = summarize(synth())
    overall = result["overall"]
    check("attempted=4", overall["attempted"] == 4, str(overall["attempted"]))
    check("valid=3", overall["valid"] == 3, str(overall["valid"]))
    check("invalid=1", overall["invalid"] == 1)
    check("correct=2", overall["correct"] == 2, str(overall["correct"]))
    check("accuracy=0.5", abs(overall["accuracy"] - 0.5) < 1e-12, str(overall["accuracy"]))
    check("accuracy_valid=2/3", abs(overall["accuracy_valid"] - 2 / 3) < 1e-12)
    expected_brier = (0.02 + 0.125 + 1.28) / 3          # (p-1)^2+(1-p)^2 per item
    check("brier", abs(overall["brier"] - expected_brier) < 1e-9,
          f"{overall['brier']} vs {expected_brier}")
    # nll = -log(gold prob): items 1,2,3 gold = 0.9, 0.75, 0.2
    expected_nll = (-math.log(0.9) + -math.log(0.75) + -math.log(0.2)) / 3
    check("nll", abs(overall["nll"] - expected_nll) < 1e-9, str(overall["nll"]))
    check("zero_gold=0", overall["zero_gold_count"] == 0)

    routes = overall["routes"]["top_probability"]
    check("auto n=1", routes["auto_candidate"]["n"] == 1)
    check("stronger n=2", routes["stronger_model_candidate"]["n"] == 2)
    check("human n=1 (invalid)", routes["human_candidate"]["n"] == 1)
    check("human risk=1.0", routes["human_candidate"]["risk"] == 1.0)
    check("coverage sums to 1",
          abs(sum(routes[b]["coverage"] for b in routes) - 1.0) < 1e-12)
    # bins are keyed on the model's own score (top_probability), not the gold:
    # item 1 scores 0.9 -> bin 9, item 2 scores 0.75 -> bin 7, item 3 scores 0.8 -> bin 8
    bins = overall["top_probability_calibration"]["bins"]
    check("score 0.9 in last bin", bins[9]["n"] == 1, str(bins[9]["n"]))
    check("score 0.75 in bin 7", bins[7]["n"] == 1)
    check("score 0.8 in bin 8", bins[8]["n"] == 1)
    # ECE is sample-weighted |mean_score - accuracy| over the three populated bins
    expected_ece = (1 * abs(0.9 - 1) + 1 * abs(0.75 - 1) + 1 * abs(0.8 - 0)) / 3
    check("ece", abs(overall["top_probability_calibration"]["ece"] - expected_ece) < 1e-9,
          f"{overall['top_probability_calibration']['ece']} vs {expected_ece}")


def test_rejects():
    bad = [
        {"id": "x:1", "task": "t", "target": "A", "prediction": "B",
         "probabilities": {"A": 0.6, "B": 0.5}},           # sum 1.1 -> invalid
        {"id": "x:2", "task": "t", "target": "A", "prediction": "B",
         "probabilities": {"A": 0.4, "B": 0.6}},           # valid but WRONG answer
        {"id": "x:3", "task": "t", "target": "C", "prediction": "A",
         "probabilities": {"A": 0.5, "B": 0.5}},           # target outside labels -> invalid
        {"id": "x:4", "task": "t", "target": "A", "prediction": "A"},  # no distribution -> invalid
    ]
    overall = summarize(bad)["overall"]
    check("3 of 4 rejected as invalid", overall["valid"] == 1 and overall["invalid"] == 3,
          f"valid={overall['valid']} invalid={overall['invalid']}")
    check("accuracy 0.0 (sole valid record is wrong)",
          overall["accuracy"] == 0.0, str(overall["accuracy"]))
    routes = overall["routes"]["top_probability"]
    # 3 invalid records plus the valid wrong answer (score 0.6 < 0.7) all land in
    # human_candidate; nothing reaches auto or stronger_model.
    check("4 records route to human (3 invalid + 1 low-score valid)",
          routes["human_candidate"]["n"] == 4,
          f"human n={routes['human_candidate']['n']}")
    check("no record in auto/stronger buckets",
          routes["auto_candidate"]["n"] == 0
          and routes["stronger_model_candidate"]["n"] == 0)


def test_sample_fixture():
    if not SAMPLE.exists():
        check("sample fixture present", False, str(SAMPLE))
        return
    records = [json.loads(line) for line in
               SAMPLE.read_text(encoding="utf-8").splitlines() if line.strip()]
    overall = summarize(records)["overall"]
    check("sample loads", overall["attempted"] == len(records),
          f"{overall['attempted']} vs {len(records)}")
    check("sample has valid rows", overall["valid"] > 0, str(overall["valid"]))
    check("sample has invalid rows", overall["invalid"] > 0, str(overall["invalid"]))


def main():
    with tempfile.TemporaryDirectory():
        test_synthetic()
        test_rejects()
        test_sample_fixture()
    print(f"eval-calibration selftest: {len(PASS)} passed, {len(FAIL)} failed")
    for line in FAIL:
        print(f"  FAIL {line}")
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
