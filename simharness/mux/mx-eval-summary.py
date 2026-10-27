#!/usr/bin/env python3
"""mx-eval-summary.py — 全流程评测摘要组装器（V8.45；融合批三判定面退役）。

输入：evidence/evals/ 下的 metric-registry.json / eval-run.json / eval-set.json /
      evaluators.json / redteam-run.json / redteam-runs.json / nine-layers.json
输出：eval-summary.json（报告与 EvalOps 卡的唯一读数源）+ stdout 判定行。

退出码：0=PASS，2=GAP（缺口，非阻断），1=FAIL（阻断 G4）。
判据单一事实源（融合批三起）=产品 custom/server/eval/e2e-verdict.ts
（POST /api/hermes/eval/e2e-verdict，V8.45 §5.3 G4-E 判据逐条移植）——本脚本
只组装读数与合并判定件（--verdict-file，governance-client gov_eval_verdict
产物 verdict.json）；判定件缺席=FAIL fail-closed（不本地复算）。
"""
import argparse
import datetime
import json
import os
import sys


def load(d, name):
    p = os.path.join(d, name)
    if not os.path.exists(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def num(v, default=None):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--max-unknown", type=float, default=0.10)
    ap.add_argument("--max-redteam-fp", type=float, default=0.20)
    ap.add_argument("--out", required=True)
    ap.add_argument("--verdict-file", default=None, help="产品判定件 verdict.json（缺省取 env MX_EVAL_VERDICT_JSON）")
    a = ap.parse_args()
    if not a.verdict_file:
        a.verdict_file = os.environ.get("MX_EVAL_VERDICT_JSON")

    registry = load(a.dir, "metric-registry.json") or {}
    run_body = load(a.dir, "eval-run.json") or {}
    set_body = load(a.dir, "eval-set.json") or {}
    evals_body = load(a.dir, "evaluators.json") or {}
    rt_body = load(a.dir, "redteam-run.json") or {}
    rt_list = load(a.dir, "redteam-runs.json") or {}
    nine = load(a.dir, "nine-layers.json") or {}
    # V8.48 新读数面（京东评测体系吸收轮）：行为信号 + 经营语言摘要。
    # 只透传不判据——新读数先观察（与 V8.46 处置链同款「不改判据」纪律）。
    behavior = load(a.dir, "behavior-signals.json") or {}
    biz = load(a.dir, "business-summary.json") or {}
    # 群体协作四维度读数（2026-10-24 吸收轮）：通信拓扑/信用分配/帕累托/社会
    # 动力学。同上只透传不进判据（spec 2026-10-24-swarm-eval-benchmark-absorption.md D2）。
    swarm = load(a.dir, "swarm-collab.json") or {}
    # 跨轮评测榜（2026-10-24 聚合层）：同样只透传不进判据。
    bench = load(a.dir, "swarm-bench.json") or {}

    reg = registry.get("registry") or {}
    cons = reg.get("consumption") or {}
    summary = cons.get("summary") or {}
    coverage = registry.get("coverage") or {}
    run = run_body.get("run") or {}
    ev_set = set_body.get("set") or {}
    agg = run.get("aggregates") or {}
    gate = agg.get("releaseGate") or {}
    triangle = evals_body.get("audit") or {}
    rt = rt_body.get("run") or {}
    if not rt and isinstance(rt_list.get("runs"), list) and rt_list["runs"]:
        rt = rt_list["runs"][0]

    set_hash = run.get("setHash")
    current_hash = ev_set.get("contentHash")
    anchor_drift = bool(set_hash and current_hash and set_hash != current_hash)

    # 读数提取（payload 组装输入——透传面，非判据）
    judge = triangle.get("judge") or {}
    by_source = triangle.get("bySource") or {}
    s1_count = int(by_source.get("s1") or 0) + int(by_source.get("s0+s1") or 0)
    s1_ratio = num((triangle.get("unknown") or {}).get("s1Ratio"), 0.0)
    covered = int(coverage.get("covered") or 0)
    untagged = int(coverage.get("untaggedTasks") or 0)
    deco = int(summary.get("decoration") or 0)
    live = (run.get("liveEvidence") or {}) if run else {}

    # 融合批三：判定取产品判定件（--verdict-file；缺席=FAIL fail-closed）
    vf = getattr(a, "verdict_file", None)
    verdict, fails, gaps, vline = "fail", ["判定件缺席（--verdict-file 未给或不可读）——判定正本在产品 /api/hermes/eval/e2e-verdict"], [], "EVAL-GATE-FAIL 判定件缺席"
    if vf:
        try:
            with open(vf, encoding="utf-8") as f:
                vj = json.load(f)
            verdict = vj.get("verdict") or "fail"
            fails = vj.get("fails") or []
            gaps = vj.get("gaps") or []
            vline = vj.get("line") or f"EVAL-GATE-{verdict.upper()}"
        except (json.JSONDecodeError, OSError) as e:
            fails = [f"判定件不可读（{vf}: {e}）——fail-closed"]

    evals_layer = None
    for layer in ((nine.get("layers") or []) if isinstance(nine, dict) else []):
        if isinstance(layer, dict) and layer.get("key") == "evals":
            evals_layer = layer
            break

    payload = {
        "generatedAt": datetime.datetime.now().isoformat(timespec="seconds"),
        "verdict": verdict,
        "fails": fails,
        "gaps": gaps,
        "registry": {
            "total": summary.get("total"),
            "wired": summary.get("wired"),
            "unwired": summary.get("unwired"),
            "decoration": summary.get("decoration"),
            "decorationKeys": cons.get("decorationKeys") or [],
        },
        "coverage": {
            "covered": coverage.get("covered"),
            "total": coverage.get("total"),
            "untaggedTasks": coverage.get("untaggedTasks"),
            "dimensions": coverage.get("dimensions") or [],
        },
        "set": {
            "id": ev_set.get("id") or run.get("setId"),
            "name": ev_set.get("name"),
            "revision": ev_set.get("revision"),
            "contentHash": current_hash,
        },
        "run": {
            "id": run.get("id"),
            "setHash": set_hash,
            "anchorDrift": anchor_drift,
            "passAt1": agg.get("passAt1"),
            "passAtK": agg.get("passAtK"),
            "unknownRatio": agg.get("unknownRatio"),
            "riskVeto": agg.get("riskVeto"),
            "releaseGate": gate,
            "pyramid": agg.get("pyramid"),
            "actions": agg.get("actions") or [],
            "liveEvidence": live,
            # V8.48：难度/角色分桶与输出稳定性（京东吸收轮；无标注/未开启如实缺席）
            "byDifficulty": agg.get("byDifficulty"),
            "byRole": agg.get("byRole"),
            "outputStability": agg.get("outputStability"),
        },
        # V8.48：行为信号（真实使用遥测供评测消费；零使用/不可用如实呈现）
        "behaviorSignals": behavior.get("signals"),
        # V8.48：经营语言摘要（verdict 三态+事实行；机械合成的决策者三句话）
        "businessSummary": biz.get("summary"),
        # 群体协作四维度读数（2026-10-24 吸收轮；端点缺席如实缺席）
        "swarmCollab": swarm.get("readout"),
        # 跨轮评测榜（2026-10-24 聚合层；端点缺席/不可用如实 null）
        "swarmBench": ({
            "runsScanned": bench.get("runsScanned"),
            "entries": bench.get("entries") or [],
            "frontierSize": (bench.get("pareto") or {}).get("frontierSize"),
            "note": bench.get("note"),
        } if bench.get("available") else None),
        "triangle": {
            "bySource": by_source,
            "conflicts": triangle.get("conflicts"),
            "audit": triangle.get("audit"),
            "unknown": triangle.get("unknown"),
            "judge": judge,
            "human": triangle.get("human"),
            "policy": triangle.get("policy"),
            "riskLevel": triangle.get("riskLevel"),
            "notes": triangle.get("notes") or [],
        },
        "redteam": {
            "id": rt.get("id"),
            "s1Wired": rt.get("s1Wired"),
            "totals": rt.get("totals"),
            "benign": rt.get("benign"),
            "byCategory": rt.get("byCategory") or [],
            "byGeneration": rt.get("byGeneration") or [],
        },
        "nineLayersEvals": evals_layer,
    }
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(vline)
    return 1 if verdict == "fail" else (2 if verdict == "gap" else 0)


if __name__ == "__main__":
    sys.exit(main())
