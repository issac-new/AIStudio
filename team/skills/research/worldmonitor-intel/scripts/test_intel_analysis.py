#!/usr/bin/env python3
"""worldmonitor-intel CLI 端到端验证测试。

用法: python3 test_intel_analysis.py
覆盖: spike / cluster / geo / focal / escalate 五个子命令 + py_compile。
退出码: 0 = 全部通过; 1 = 有失败。
"""
import json
import os
import subprocess
import sys
import tempfile
import time

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "intel-analysis.py")


def run_cli(*args):
    return subprocess.run([sys.executable, SCRIPT, *args],
                          capture_output=True, text=True, timeout=30)


def load_json(text):
    return json.loads(text)


def test_spike():
    now = int(time.time() * 1000)
    stories = []
    for i in range(3):  # baseline
        stories.append({"title": f"Old report on Taiwan strait {i}",
                        "source": f"old-{i}",
                        "timestamp_ms": now - (i + 1) * 24 * 3600 * 1000})
    for i in range(9):  # rolling spike
        stories.append({"title": f"BREAKING Taiwan strait tension {i}",
                        "source": f"src-{i % 3}",
                        "timestamp_ms": now - i * 10 * 60 * 1000})
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(stories, f)
        path = f.name
    try:
        r = run_cli("spike", "Taiwan strait", "--stories", path)
        assert r.returncode == 0, r.stderr
        d = load_json(r.stdout)
        assert d["spike"] is True and d["count"] == 9 and d["sources"] == 3, d
        return "spike PASS (count=9, sources=3, multiplier=%.1f)" % d["multiplier"]
    finally:
        os.unlink(path)


def test_cluster():
    items = [
        {"title": "Taiwan Strait Tension Rises After Military Exercise", "source": "Reuters"},
        {"title": "Taiwan Strait Tension Rises After Military Exercise Begins", "source": "AP"},
        {"title": "Apple releases new iPhone 17 with AI features", "source": "TechCrunch"},
        {"title": "Apple iPhone 17 launch event recap", "source": "The Verge"},
    ]
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(items, f)
        path = f.name
    try:
        r = run_cli("cluster", "--stories", path)
        assert r.returncode == 0, r.stderr
        d = load_json(r.stdout)
        assert any(c["size"] >= 2 for c in d), d
        merged = next(c for c in d if c["size"] >= 2)
        assert set(merged["sources"]) == {"Reuters", "AP"}, merged
        return "cluster PASS (4 items -> %d clusters, merged sources=%s)" % (
            len(d), merged["sources"])
    finally:
        os.unlink(path)


def test_geo():
    now = int(time.time() * 1000)
    events = [
        {"lat": 24.5, "lon": 121.5, "type": "protest", "timestamp_ms": now - 3600 * 1000},
        {"lat": 24.7, "lon": 121.8, "type": "military_flight", "timestamp_ms": now - 2 * 3600 * 1000},
        {"lat": 24.3, "lon": 121.2, "type": "earthquake", "timestamp_ms": now - 3 * 3600 * 1000},
        {"lat": 24.6, "lon": 121.6, "type": "military_vessel", "timestamp_ms": now - 4 * 3600 * 1000},
        {"lat": -33.8, "lon": 151.2, "type": "protest", "timestamp_ms": now - 5 * 3600 * 1000},
    ]
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(events, f)
        path = f.name
    try:
        r = run_cli("geo", "--events", path)
        assert r.returncode == 0, r.stderr
        d = load_json(r.stdout)
        assert len(d) == 1 and d[0]["domain_count"] == 4, d
        return "geo PASS (1 alert, domains=%s)" % d[0]["domains"]
    finally:
        os.unlink(path)


def test_focal():
    mentions = {
        "ACME Corp": {"news": 12, "patent": 3, "hiring": 5, "supply_chain": 2, "financial": 4, "social": 1},
        "Old Corp": {"news": 8, "patent": 1},
    }
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(mentions, f)
        path = f.name
    try:
        r = run_cli("focal", "--mentions", path)
        assert r.returncode == 0, r.stderr
        d = load_json(r.stdout)
        assert d[0]["entity"] == "ACME Corp" and d[0]["urgency"] == "critical", d
        return "focal PASS (top=%s, urgency=%s, streams=%d)" % (
            d[0]["entity"], d[0]["urgency"], d[0]["stream_count"])
    finally:
        os.unlink(path)


def test_escalate():
    r = run_cli("escalate", "--news", "80", "--cii", "45", "--geo", "60", "--military", "30")
    assert r.returncode == 0, r.stderr
    d = load_json(r.stdout)
    assert d["scale"] == 5 and abs(d["dynamic_score"] - 58.8) < 0.1, d
    return "escalate PASS (scale=5/5, dynamic=%.1f)" % d["dynamic_score"]


def test_syntax():
    r = subprocess.run([sys.executable, "-m", "py_compile", SCRIPT],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return "py_compile PASS"


def main():
    tests = [test_spike, test_cluster, test_geo, test_focal, test_escalate, test_syntax]
    failures = 0
    for t in tests:
        try:
            print(f"  ✅ {t()}")
        except AssertionError as e:
            failures += 1
            print(f"  ❌ {t.__name__} FAILED: {e}")
    print(f"\n{'ALL PASSED' if failures == 0 else f'{failures} FAILED'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
