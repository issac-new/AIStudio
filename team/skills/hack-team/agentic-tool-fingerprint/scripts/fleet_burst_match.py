#!/usr/bin/env python3
"""fleet_burst_match.py — 舰队级爆发速率分类器（AI Agent 蜂群攻击检测，纯检测端，类别 8）。

与 session_timing_match.py（单会话时序）正交：时序指纹回答"这个会话是不是 Agent"，
本分类器回答"这批成功事件是不是机器速度的蜂群战役"——跨主机成功侧速率，与会话归属无关。

输入：JSONL，每行一条**成功侧**事件（部署/建号/持久化，不是扫描请求）：
  {"ts": 1795000000.0, "host": "target-17.example.com", "event_type": "webshell_upload"}
  event_type 建议：webshell_upload / rogue_admin_created / ssh_key_injected / persistence_created
  （宽松处理：缺 event_type 按任意成功事件计；host 必填，缺 host 该行跳过并计 malformed）

规则来源（SOCRadar CyberXero 实测，2026-10-06 一手披露，gap-20261102-005）：
  B1 跨主机爆发（强）  滑窗 W=60s 内 ≥N=5 个**不同主机**各发生 ≥1 条成功事件
     CyberXero 实测密度：单次自动执行 4708 目标 → 429 个 WP 管理后台 → 61 秒内
     32 个 WebShell 落地（≈0.52 落地/秒，跨 30+ 主机）。人类红队单主机落地
     WebShell 需分钟级操作，60s 内 5 主机即超出人力物理极限。
     CSA 2026-10-15 研究笔记防御推论原文："Detection must key on bursts, not slow
     campaigns"——本条即该原则的机械实现。
  B2 单主机豁免（负向）  窗口事件密度达 N 但主机去重 <N（如 12 条事件全落 2 台主机）
     → 可能是单管理员批量操作/单机调试，判 human_like_single_host，不计蜂群。

判定：存在任一 60s 滑窗满足 B1 → swarm-burst（输出最密窗口的主机数/事件数）；
      窗口事件密度达 N 但主机去重 <N（时间密、主机少=单管理员批量操作）→ human_like_single_host；
      其余（时间稀疏的慢速战役 / 主机数不足）→ below-threshold；
      可用事件 <N → insufficient（小样本不判，防误报；同 session_timing_match 的 min_intervals 语义）。
阈值 N/W 可调（--window-s/--min-hosts）：锚定单次公开事件实测，新事件入列后应回测调参。
"""
import argparse
import json
import sys

DEFAULTS = {
    "window_s": 60.0,   # 滑窗宽度（CyberXero 61s 窗口）
    "min_hosts": 5,     # 窗口内不同主机数下限（人类物理极限之上取保守值）
}


def classify(events, window_s=DEFAULTS["window_s"], min_hosts=DEFAULTS["min_hosts"]):
    """events: list[dict]（ts, host 必填）。返回 (verdict, detail)。"""
    rows = []
    malformed = 0
    for e in events:
        ts, host = e.get("ts"), e.get("host")
        if not isinstance(ts, (int, float)) or not host:
            malformed += 1
            continue
        rows.append((float(ts), str(host)))
    if len(rows) < min_hosts:
        return "insufficient", {"usable_events": len(rows), "malformed": malformed}

    rows.sort(key=lambda r: r[0])
    n = len(rows)
    best = None  # (host_count, event_count, win_start)
    j = 0
    for i in range(n):  # 滑窗：对每个左端 i，右端 j 推进到 ts < ts_i + window_s
        while j < n and rows[j][0] < rows[i][0] + window_s:
            j += 1
        window = rows[i:j]
        hosts = {h for _, h in window}
        cand = (len(hosts), len(window), rows[i][0])
        if best is None or cand > best:
            best = cand

    total_hosts = len({h for _, h in rows})
    detail = {
        "usable_events": n,
        "malformed": malformed,
        "total_hosts": total_hosts,
        "best_window_hosts": best[0],
        "best_window_events": best[1],
        "window_s": window_s,
        "min_hosts": min_hosts,
    }
    if best[0] >= min_hosts:
        return "swarm-burst", detail
    if best[1] >= min_hosts:  # 时间密但主机少：单管理员批量操作，非跨主机蜂群
        return "human_like_single_host", detail
    return "below-threshold", detail


def main():
    ap = argparse.ArgumentParser(description="类别 8 舰队级爆发速率分类器（跨主机成功事件）")
    ap.add_argument("--events", required=True, help="成功事件 JSONL（ts/host/event_type）")
    ap.add_argument("--window-s", type=float, default=DEFAULTS["window_s"])
    ap.add_argument("--min-hosts", type=int, default=DEFAULTS["min_hosts"])
    args = ap.parse_args()

    events = []
    with open(args.events) as f:
        for line in f:
            line = line.strip()
            if line:
                events.append(json.loads(line))
    verdict, detail = classify(events, args.window_s, args.min_hosts)
    print(json.dumps({"verdict": verdict, **detail}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
