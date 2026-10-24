#!/usr/bin/env python3
"""bola_analyze.py — 会话级 BOLA/IDOR 特征分析（录制流量 → 判定 + SIEM 伪查询）

输入 JSONL 字段：session, ua, ip, path, obj_id, user_id, ts
纯分析：只读录制流量，不产生任何请求。
"""
import argparse, json, sys
from collections import defaultdict

STEPS = {1, 2, 5, 10}

def seq_runs(obj_ids):
    """等差枚举段计数：长度>=5、step in {1,2,5,10}，按访问顺序（非排序）切分"""
    raw = [int(o) for o in obj_ids if str(o).lstrip("-").isdigit()]
    order = []
    seen = set()
    for o in raw:
        if o not in seen:
            seen.add(o)
            order.append(o)
    runs = 0
    i = 0
    while i + 4 < len(order):
        step = order[i + 1] - order[i]
        if step in STEPS:
            j = i
            while j + 1 < len(order) and order[j + 1] - order[j] == step:
                j += 1
            if j - i + 1 >= 5:
                runs += 1
                i = j + 1
                continue
        i += 1
    return runs

def analyze(traffic, min_objects, min_seq, min_dup_users):
    sessions = defaultdict(lambda: {"objs": set(), "users": set(), "rows": 0})
    obj_users = defaultdict(set)
    for line in traffic:
        line = line.strip()
        if not line:
            continue
        r = json.loads(line)
        key = (r["session"], r.get("ua", ""), r.get("ip", ""))
        sessions[key]["objs"].add(r["obj_id"])
        sessions[key]["users"].add(r.get("user_id", ""))
        sessions[key]["rows"] += 1
        obj_users[r["obj_id"]].add(r.get("user_id", ""))
    results = []
    for key, s in sessions.items():
        dedup = len(s["objs"])
        seq = seq_runs(s["objs"])
        cross = sum(1 for u in obj_users.values() if len(u) >= min_dup_users)
        verdict = "clean"
        if dedup >= min_objects and seq >= min_seq:
            verdict = "bola-confirmed" if cross > 0 else "bola-suspect"
        elif dedup >= min_objects or seq >= min_seq:
            verdict = "watch"
        results.append({"session": key[0], "ip": key[2], "raw_rows": s["rows"],
                        "dedup_obj_count": dedup, "sequential_runs": seq,
                        "cross_user_objects": cross, "verdict": verdict})
    return results

def emit_siem(min_objects, min_seq):
    return f"""-- SIEM 伪查询基线（按方言改写；参数固化为 engagement 基线）
-- 会话键 = (session_cookie, user_agent, src_ip)
WITH sess AS (
  SELECT session_cookie, user_agent, src_ip,
         COUNT(DISTINCT object_id) AS dedup_obj,
         <sequential_run_udf>(object_id) AS seq_runs
  FROM http_logs GROUP BY 1,2,3
)
SELECT * FROM sess
WHERE dedup_obj >= {min_objects} AND seq_runs >= {min_seq};"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--traffic", type=argparse.FileType("r"))
    ap.add_argument("--min-objects", type=int, default=30)
    ap.add_argument("--min-sequential", type=int, default=3)
    ap.add_argument("--min-dup-users", type=int, default=3)
    ap.add_argument("--emit-siem", action="store_true")
    a = ap.parse_args()
    if a.emit_siem:
        print(emit_siem(a.min_objects, a.min_sequential))
        return 0
    if not a.traffic:
        print("BLOCKED: 需要 --traffic 或 --emit-siem", file=sys.stderr)
        return 1
    results = analyze(a.traffic, a.min_objects, a.min_sequential, a.min_dup_users)
    for r in results:
        print(json.dumps(r, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
