#!/usr/bin/env python3
"""test_session_timing_match.py — 用 FreeBuf 505037 E01-E09 实测数据回测会话时序分类器。

预期（文章结论）：
  E01 Strix/DVWA    8508 req, 63min, 445ms avg, 1.2% pause, 15 UA   → Agent（match-strong，T3+T1）
  E02M miniag/DVWA  85 req, 2.2min, 1569ms avg, 3.5% pause, 2 UA    → Agent（match-strong，T1；低频不吃 T3——正是 CC 盲区）
  E03 人工/DVWA     27 req, 42.7min, 98.5s avg, 96% pause, 2 UA     → human_like
  E04 Strix/JS      7284 req, 71min, 586ms, 2.0%, 639 UA            → Agent
  E05 miniag/JS     58 req, 0.8min, 889ms, 0%, 2 UA                 → Agent
  E06 人工/JS       11 req, 6.1min, 36.8s, 91%, 2 UA                → human_like
  E07 Strix/WP      17386 req, 66min, 228ms, 0.07%, 3338 UA         → Agent
  E08 miniag/WP     279 req, 5.9min, 1266ms, 3.6%, 2 UA             → Agent
  E09 人工/WP       10 req, 3.4min, 22.6s, 90%, 1 UA                → human_like
"""
import json
import subprocess
import sys
import tempfile
import os

# (id, req, dur_min, avg_ms, pause_ratio, ua_count) —— avg_ms 作 interval_median_ms 代理
E = [
    ("E01_strix_dvwa", 8508, 63.0, 445, 0.012, 15, "agent"),
    ("E02M_miniag_dvwa", 85, 2.2, 1569, 0.035, 2, "agent"),
    ("E03_human_dvwa", 27, 42.7, 98500, 0.96, 2, "human"),
    ("E04_strix_js", 7284, 71.0, 586, 0.02, 639, "agent"),
    ("E05_miniag_js", 58, 0.8, 889, 0.0, 2, "agent"),
    ("E06_human_js", 11, 6.1, 36800, 0.91, 2, "human"),
    ("E07_strix_wp", 17386, 66.0, 228, 0.0007, 3338, "agent"),
    ("E08_miniag_wp", 279, 5.9, 1266, 0.036, 2, "agent"),
    ("E09_human_wp", 10, 3.4, 22600, 0.90, 1, "human"),
]

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "session_timing_match.py")


def main():
    rows = []
    for sid, req, dur, avg, pause, ua, _ in E:
        # 合成 intervals：中位数 = avg（分类器只消费中位数与 >5s 占比，合成足够）
        n = max(10, min(req, 400))
        intervals = [avg] * n
        rows.append({
            "session_id": sid, "intervals_ms": intervals, "ua_count": ua,
            "request_count": req, "duration_min": dur, "pause_gt5s_ratio": pause,
        })
    with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
        tmp = f.name
    out = subprocess.run(
        [sys.executable, SCRIPT, "--sessions", tmp, "--json"],
        capture_output=True, text=True, check=True)
    os.unlink(tmp)
    results = {r["session_id"]: r for r in json.loads(out.stdout)}
    ok = fail = 0
    for sid, *_rest, expect in E:
        r = results[sid]
        verdict = r["verdict"]
        got = "human" if verdict == "human_like" else ("agent" if verdict == "match-strong" else "OTHER:" + verdict)
        mark = "PASS" if got == expect else "FAIL"
        if mark == "PASS":
            ok += 1
        else:
            fail += 1
        print(f"{mark} {sid:18s} expect={expect:6s} got={verdict:14s} hits={r['hits']} feats={r['features']}")
    print(f"\n{ok}/{ok+fail} PASS" + ("" if fail == 0 else f" ({fail} FAIL)"))
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
