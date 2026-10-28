"""Offline classification/calibration summaries. Candidate routes execute nothing.

Derived from jev-skill evals/calibration_metrics.py (MIT, Copyright (c) 2026 wuyoscar)
https://github.com/wuyoscar/jev-skill at revision 9ee07bd481feebf959a6b59d61ea57bdcf30964d
Adapted for Hermes ops-eval: standalone module, no package-relative imports,
records loaded from JSONL receipts instead of in-memory campaign events.
"""

import math


def _score(value):
    return (isinstance(value, (int, float)) and not isinstance(value, bool)
            and math.isfinite(value) and 0 <= value <= 1)


def _validated(record):
    if not isinstance(record, dict) or "error" in record:
        return None
    if any(not isinstance(record.get(key), str) or not record[key].strip()
           for key in ("id", "task", "target", "prediction")):
        return None
    probabilities = record.get("probabilities")
    if not isinstance(probabilities, dict) or not probabilities:
        return None
    if any(not isinstance(label, str) or not label.strip() or not _score(value)
           for label, value in probabilities.items()):
        return None
    target, prediction = record["target"], record["prediction"]
    if target not in probabilities or prediction not in probabilities:
        return None
    total = math.fsum(probabilities.values())
    tolerance = min(0.05, 0.0051 * len(probabilities))
    if total <= 0 or not math.isclose(total, 1, rel_tol=0, abs_tol=tolerance):
        return None
    if probabilities[prediction] != max(probabilities.values()):
        return None
    confidence = record.get("confidence")
    if confidence is not None and not _score(confidence):
        return None
    normalized = {label: value / total for label, value in probabilities.items()}
    gold = normalized[target]
    return {
        "correct": prediction == target, "top_probability": normalized[prediction],
        "confidence": confidence,
        "brier": math.fsum((value - int(label == target)) ** 2 for label, value in normalized.items()),
        "nll": -math.log(max(gold, 1e-12)), "zero_gold": gold == 0,
        "rounded_sum": not math.isclose(total, 1, rel_tol=0, abs_tol=1e-12),
    }


def _wilson(correct, n):
    if not n:
        return None
    z = 1.959963984540054
    p = correct / n
    denominator = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denominator
    half_width = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denominator
    return {"lower": 0.0 if not correct else max(0.0, center - half_width),
            "upper": 1.0 if correct == n else min(1.0, center + half_width)}


def _calibration(valid, score_key):
    bins = [[] for _ in range(10)]
    for row in valid:
        score = row[score_key]
        if score is not None:
            bins[min(int(score * 10), 9)].append((score, row["correct"]))
    n = sum(len(bucket) for bucket in bins)
    summaries = []
    weighted_error = 0.0
    for index, bucket in enumerate(bins):
        count = len(bucket)
        mean_score = math.fsum(score for score, _ in bucket) / count if count else None
        accuracy = sum(correct for _, correct in bucket) / count if count else None
        if count:
            weighted_error += count * abs(mean_score - accuracy)
        summaries.append({"lower": index / 10, "upper": (index + 1) / 10,
            "upper_inclusive": index == 9, "n": count,
            "mean_score": mean_score, "accuracy": accuracy})
    return {"n": n, "ece": weighted_error / n if n else None, "bins": summaries}


def _routes(rows, score_key):
    buckets = {name: [] for name in
               ("auto_candidate", "stronger_model_candidate", "human_candidate")}
    for row in rows:
        score = row[score_key] if row is not None else None
        name = ("auto_candidate" if score is not None and score >= 0.9 else
                "stronger_model_candidate" if score is not None and score >= 0.7 else
                "human_candidate")
        buckets[name].append((score, bool(row and row["correct"])))
    result = {}
    for name, bucket in buckets.items():
        n, correct = len(bucket), sum(correct for _, correct in bucket)
        scores = [score for score, _ in bucket if score is not None]
        accuracy = correct / n if n else None
        result[name] = {"n": n, "coverage": n / len(rows) if rows else None,
            "correct": correct, "accuracy": accuracy, "wilson95": _wilson(correct, n),
            "risk": 1 - accuracy if n else None,
            "mean_score": math.fsum(scores) / len(scores) if scores else None,
            "score_n": len(scores)}
    return result


def _summarize_group(rows):
    attempted = len(rows)
    valid = [row for row in rows if row is not None]
    correct = sum(row["correct"] for row in valid)
    return {
        "attempted": attempted, "valid": len(valid), "invalid": attempted - len(valid),
        "correct": correct, "accuracy": correct / attempted if attempted else None,
        "accuracy_valid": correct / len(valid) if valid else None,
        "brier": math.fsum(row["brier"] for row in valid) / len(valid) if valid else None,
        "nll": math.fsum(row["nll"] for row in valid) / len(valid) if valid else None,
        "zero_gold_count": sum(row["zero_gold"] for row in valid),
        "rounded_sum_count": sum(row["rounded_sum"] for row in valid),
        "top_probability_calibration": _calibration(valid, "top_probability"),
        "confidence_shape_diagnostic": _calibration(valid, "confidence"),
        "routes": {key: _routes(rows, key) for key in ("top_probability", "confidence")},
    }


def summarize(records):
    """Include every record in attempted accuracy; invalid predictions count wrong."""
    rows, by_task = [], {}
    for record in records:
        task = record.get("task") if isinstance(record, dict) else None
        if not isinstance(task, str) or not task.strip():
            task = "__invalid_task__"
        row = _validated(record)
        rows.append(row)
        by_task.setdefault(task, []).append(row)
    return {
        "metadata": {
            "normalization": "Accept finite [0,1] vectors with positive sum within min(0.05, 0.0051 * classes) of 1; divide every accepted vector by its sum before scoring and top-probability routing.",
            "prediction": "Must be a maximum-probability class; ties are allowed.",
            "brier": "Mean over valid records of SUM over classes (normalized probability - one-hot target)^2.",
            "nll": "Mean natural-log loss over valid records; gold probability clamped to 1e-12; exact zeros counted separately.",
            "ece": "10 equal-width bins [lower, upper), last bin includes 1; sample-weighted absolute mean-score minus accuracy.",
            "confidence": "Distribution-shape statistic diagnostic, NOT a claimed probability of correctness. Null confidence is excluded from its ECE and mean score and routes to human_candidate.",
            "denominators": "Accuracy and route coverage use all attempts. Invalid records count wrong and route to human_candidate. Brier/NLL/ECE use valid available scores only. Empty denominators return null.",
            "risk": "1 - bucket accuracy, including invalid attempts as wrong in human_candidate.",
            "interval": "Two-sided Wilson 95% interval for bucket accuracy (z=1.959963984540054); descriptive, not adjusted for dependence or multiple comparisons.",
            "route_thresholds": {"auto_candidate": 0.9, "stronger_model_candidate": 0.7},
            "routing": "Both score types use >=0.9 auto_candidate, >=0.7 stronger_model_candidate, otherwise human_candidate. These are offline candidate labels; no actions are executed.",
        },
        "overall": _summarize_group(rows),
        "by_task": {task: _summarize_group(task_rows) for task, task_rows in sorted(by_task.items())},
    }
