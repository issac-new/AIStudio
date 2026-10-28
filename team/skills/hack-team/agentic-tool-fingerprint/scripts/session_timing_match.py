#!/usr/bin/env python3
"""session_timing_match.py — 会话级行为时序指纹分类器（AI 攻击 Agent 检测，纯检测端）。

输入：JSONL，每行一个会话聚合（与 fp_match.py 的逐事件输入互补——时序指纹只在会话级可聚合）：
  {"session_id": "...", "intervals_ms": [445, 380, ...], "ua_count": 15,
   "request_count": 8508, "duration_min": 63.0, "pause_gt5s_ratio": 0.012}

字段宽容：缺 intervals_ms 时可用 request_count/duration_min 推速率；全缺则该会话判 insufficient。

规则来源（FreeBuf 505037 E01-E09 双 VPS 实测，3.6 万次请求全量抓包）：
  T1 时序窄带（强）  间隔中位数 ∈ [200,1600]ms 且 >5s 停顿占比 <10%
     Strix 228-586ms（中位 0.02s）、miniag 889-1569ms；人类 90-96% 停顿 >5s。
     物理机制：间隔被 LLM 推理延迟+工具执行节奏钳死在窄带——慢速不产生收益，
     没有框架会为"像人"浪费推理 token。物理下限即指纹，UA 可换、时序难伪装。
  T2 UA 轮换过度（强）单会话 UA 种类 >20
     E07 单会话 3338 种 UA（含语法不成立的拼合体）；真实用户 1-2 种。
     轮换过度本身就是指纹。
  T3 体量异常（弱）  请求 >1000 或速率 >60 req/min
     E01 8508/63min、E07 17386/66min。CC 阈值困境的另一面：低频直驱 Agent
     （miniag 85 请求 1.5s 间隔）不触发本条——所以是弱信号，只作交叉。
  H  人类豁免（负向）>5s 停顿占比 >85% 且请求 <100
     人工基线 E03/E06/E09 特征，优先于 T1 输出 human_like，不计为 Agent。

判定：T1 或 T2 任一命中 → match-strong；仅 T3 → below-threshold；H → human_like。
"""
import argparse
import json
import math
import sys

THRESHOLDS = {
    "t1_median_ms": (200, 1600),   # Agent 间隔窄带（含 Strix 与直驱两档）
    "t1_pause_ratio_max": 0.10,    # >5s 停顿占比上限（Agent 实测 0.07%-3.6%）
    "t2_ua_count": 20,             # 单会话 UA 种类上限（真实用户 1-2，E07=3338）
    "t3_request_count": 1000,      # 会话请求量（E01=8508, E07=17386）
    "t3_rate_per_min": 60.0,       # 速率（Strix 峰值 135/min）
    "h_pause_ratio_min": 0.85,     # 人类停顿占比下限（实测 90%-96%）
    "h_request_max": 100,          # 人类会话请求上限（实测 10-27）
    "min_intervals": 8,            # 样本不足时 T1 不判（防小样本误报）
}


def median(xs):
    s = sorted(xs)
    n = len(s)
    if n == 0:
        return None
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def classify_session(sess):
    sid = sess.get("session_id", "")
    intervals = sess.get("intervals_ms") or []
    ua_count = sess.get("ua_count")
    req_count = sess.get("request_count")
    dur_min = sess.get("duration_min")
    pause_ratio = sess.get("pause_gt5s_ratio")

    feats = {}
    med = median(intervals) if len(intervals) >= THRESHOLDS["min_intervals"] else None
    feats["interval_median_ms"] = med
    feats["ua_count"] = ua_count
    feats["request_count"] = req_count
    if pause_ratio is None and intervals:
        pause_ratio = sum(1 for x in intervals if x > 5000) / len(intervals)
    feats["pause_gt5s_ratio"] = round(pause_ratio, 4) if pause_ratio is not None else None
    if req_count and dur_min:
        feats["rate_per_min"] = round(req_count / dur_min, 1)

    # H 人类豁免（优先判定，避免把人工渗透判成 Agent）
    if (pause_ratio is not None and pause_ratio > THRESHOLDS["h_pause_ratio_min"]
            and (req_count or 0) < THRESHOLDS["h_request_max"]):
        return {"session_id": sid, "verdict": "human_like", "hits": [], "features": feats}

    hits = []
    # T1 时序窄带（强）
    if med is not None:
        lo, hi = THRESHOLDS["t1_median_ms"]
        if lo <= med <= hi and (pause_ratio or 0) < THRESHOLDS["t1_pause_ratio_max"]:
            hits.append("t1_timing_band")
    # T2 UA 轮换过度（强）
    if ua_count is not None and ua_count > THRESHOLDS["t2_ua_count"]:
        hits.append("t2_ua_churn")
    # T3 体量（弱）
    t3 = []
    if req_count and req_count > THRESHOLDS["t3_request_count"]:
        t3.append("volume")
    if feats.get("rate_per_min", 0) > THRESHOLDS["t3_rate_per_min"]:
        t3.append("rate")

    if "t1_timing_band" in hits or "t2_ua_churn" in hits:
        verdict, out_hits = "match-strong", [h for h in hits if h.startswith("t")]
    elif t3:
        verdict, out_hits = "below-threshold", ["t3_" + x for x in t3]
    elif med is None and ua_count is None:
        verdict, out_hits = "insufficient", []
    else:
        verdict, out_hits = "clean", []

    return {"session_id": sid, "verdict": verdict, "hits": out_hits, "features": feats}


def main():
    ap = argparse.ArgumentParser(description="AI 攻击 Agent 会话级时序指纹分类器（检测端）")
    ap.add_argument("--sessions", type=argparse.FileType("r"), required=True,
                    help="JSONL，每行一个会话聚合")
    ap.add_argument("--json", action="store_true", help="整体输出 JSON（默认逐行）")
    a = ap.parse_args()
    results = []
    for line in a.sessions:
        line = line.strip()
        if not line:
            continue
        results.append(classify_session(json.loads(line)))
    if a.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
    else:
        for r in results:
            print(json.dumps(r, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
