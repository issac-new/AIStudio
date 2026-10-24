#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
site_drift_monitor.py — Web 站点变更漂移监控（simhash 四维比对，自包含单文件）

来源: ARL-Next (https://github.com/owl234/ARL-Next) backend/app/services/asset_site_monitor.py
      + fetchSite.py simhash 指纹 — GPL-3.0
移植: 2026-09-08, Hermes hack-team 融合（open-source-skill-fusion-v2 流程）
剥离: MongoDB(状态 JSON 落盘) / scope_id 体系(--sites 参数) / fetch_site 并发类(内联 ThreadPool)
保留: 四维比对(status/title/simhash/length) + simhash Hamming 距离>3 实质变更判据 +
      无 simhash 时回退长度阈值(>500 且 >5%) + 网关错误防抖(consecutive_error_count 容忍 2/3 次)
依赖: requests, simhash（pip install simhash requests）

用法:
  python3 site_drift_monitor.py --sites https://a.com https://b.com --state drift_state.json
      [--output drift.json] [--tolerance-entry 2] [--tolerance-normal 3]

机制（对齐源码锚点）:
- fetchSite.py:76-77  simhash = str(Simhash(conn.text).value)
- asset_site_monitor.py:64-97  compare_simhash: 距离>3 判实质变更；无旧 simhash 回退长度
- asset_site_monitor.py:95-114 compare_length: |Δ|>500 且 >5% 才告警（防动态页面误报）
- asset_site_monitor.py:161-176  防抖: 0/502/503/504 连续错误 < 容忍限(入口2/普通3) 挂起告警

纪律: 仅用于授权范围内目标（配合 _shared/constraint-policy.md scope 门）。
退出码: 0=有变更告警, 1=无变更, 2=运行错误
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional

try:
    import requests
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except ImportError:
    print("[!] 缺少 requests: pip install requests", file=sys.stderr)
    sys.exit(2)

try:
    from simhash import Simhash
except ImportError:
    print("[!] 缺少 simhash: pip install simhash", file=sys.stderr)
    sys.exit(2)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
FETCH_TIMEOUT = (5.0, 15.0)


def fetch_snapshot(url: str) -> Optional[dict]:
    """抓取单站点快照（对齐 fetchSite.py work(): status/title/body_length/simhash）。"""
    try:
        conn = requests.get(url, headers={"User-Agent": UA}, verify=False,
                            timeout=FETCH_TIMEOUT, allow_redirects=True)
        body = conn.content
        title = ""
        try:
            text = conn.text
            low = text.lower()
            i = low.find("<title")
            if i >= 0:
                s = text.find(">", i)
                e = text.find("</title>", s)
                if s > 0 and e > s:
                    title = text[s + 1:e].strip()[:200]
        except Exception:
            pass
        try:
            # 特征分词用 4-gram 字符 shingle（Simhash 文本构造在 Python≥3.14 有 uint8 溢出 bug，
            # 改走 features 构造路径——int 构造/distance 均正常）
            text = conn.text
            feats = [text[i:i + 4] for i in range(0, max(len(text) - 3, 1), 2)] or [text]
            sim = str(Simhash(feats).value)
        except Exception:
            sim = ""
        return {
            "site": url[:200],
            "status": conn.status_code,
            "title": title,
            "body_length": len(body),
            "simhash": sim,
            "consecutive_error_count": 0,
            "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
    except Exception:
        return {
            "site": url[:200], "status": 0, "title": "", "body_length": 0,
            "simhash": "", "consecutive_error_count": 0,
            "ts": time.strftime("%Y-%m-%d %H:%M:%S"),
        }


def fetch_all(sites: List[str], concurrency: int = 6) -> List[dict]:
    out = []
    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        futs = {ex.submit(fetch_snapshot, s): s for s in sites}
        for f in as_completed(futs):
            try:
                out.append(f.result())
            except Exception:
                pass
    return out


def compare_length(curr: dict, old: dict) -> Optional[dict]:
    """对齐 compare_length: |Δ|>500 且 >5% 才算变更。"""
    cl, ol = curr.get("body_length", 0), old.get("body_length", 0)
    if ol > 0 and cl > 0:
        diff = abs(cl - ol)
        if diff > 500 and diff / ol > 0.05:
            return {"site": curr["site"], "length": cl, "old_length": ol, "kind": "length"}
    return None


def compare_simhash(curr: dict, old: dict) -> Optional[dict]:
    """对齐 compare_simhash: 旧无 simhash → 回退长度；距离>3 → 实质变更。"""
    if not old.get("simhash"):
        r = compare_length(curr, old)
        if r:
            r["kind"] = "length(fallback)"
        return r
    cs, os_ = curr.get("simhash"), old.get("simhash")
    if cs and os_ and cs != os_:
        try:
            distance = Simhash(int(cs)).distance(Simhash(int(os_)))
        except Exception:
            distance = 0
        if distance > 3:
            return {"site": curr["site"], "distance": distance, "kind": "simhash"}
    return None


def compare_status(curr: dict, old: dict) -> Optional[dict]:
    if curr.get("status", 0) != old.get("status", 0):
        return {"site": curr["site"], "old_status": old.get("status", 0),
                "status": curr.get("status", 0), "kind": "status"}
    return None


def compare_title(curr: dict, old: dict) -> Optional[dict]:
    if curr.get("title") and curr.get("title", "") != old.get("title", ""):
        return {"site": curr["site"], "old_title": old.get("title", ""),
                "title": curr.get("title", ""), "kind": "title"}
    return None


def atomic_write(path: str, data: dict):
    d = os.path.dirname(os.path.abspath(path)) or "."
    fd, tmp = tempfile.mkstemp(prefix=".drift_state.", dir=d)
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except Exception:
            pass
        raise


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        prog="site_drift_monitor",
        description="Web 站点变更漂移监控（simhash 四维比对，来源 ARL-Next, GPL-3.0）")
    ap.add_argument("--sites", nargs="+", required=True, help="授权站点 URL 列表")
    ap.add_argument("--state", required=True, help="状态文件（基线快照+错误计数，原子写）")
    ap.add_argument("--output", default=None, help="变更告警 JSON 落盘（默认 drift_<ts>.json）")
    ap.add_argument("--concurrency", type=int, default=6)
    ap.add_argument("--tolerance-entry", type=int, default=2, help="入口站连续错误容忍（默认 2）")
    ap.add_argument("--tolerance-normal", type=int, default=3, help="普通站连续错误容忍（默认 3）")
    ap.add_argument("--entry-keywords", nargs="*", default=["www.", "mail.", "vpn.", "oa."],
                    help="URL 含此关键词视为入口站（防抖容忍更低）")
    args = ap.parse_args(argv)

    state = {}
    if os.path.exists(args.state):
        try:
            state = json.load(open(args.state))
        except Exception as e:
            print(f"[!] state 文件损坏: {e}", file=sys.stderr)
            return 2
    old_map: Dict[str, dict] = state.get("sites", {})

    snapshots = fetch_all(args.sites, args.concurrency)
    alerts = []
    new_map = {}
    for snap in snapshots:
        site = snap["site"]
        old = old_map.get(site)
        entry = any(k in site for k in args.entry_keywords)
        tolerance = args.tolerance_entry if entry else args.tolerance_normal

        # 防抖：0/502/503/504 连续错误 < 容忍限 → 挂起告警，仅累加计数
        if snap["status"] in (0, 502, 503, 504):
            snap["consecutive_error_count"] = (old or {}).get("consecutive_error_count", 0) + 1
            new_map[site] = snap
            if snap["consecutive_error_count"] < tolerance:
                continue  # 挂起，不告警
            alerts.append({"site": site, "kind": "status",
                           "old_status": (old or {}).get("status", "?"),
                           "status": snap["status"],
                           "note": f"连续错误 {snap['consecutive_error_count']} 次达容忍限"})
            continue
        snap["consecutive_error_count"] = 0

        if old:
            for cmp_fn in (compare_title, compare_status, compare_simhash):
                hit = cmp_fn(snap, old)
                if hit:
                    alerts.append(hit)
        new_map[site] = snap

    state["sites"] = new_map
    state["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        atomic_write(args.state, state)
    except Exception as e:
        print(f"[!] state 写入失败: {e}", file=sys.stderr)
        return 2

    out_path = args.output or f"drift_{int(time.time())}.json"
    try:
        json.dump({"total": len(alerts), "alerts": alerts, "scanned": len(snapshots)},
                  open(out_path, "w"), ensure_ascii=False, indent=1)
    except Exception as e:
        print(f"[!] 告警落盘失败: {e}", file=sys.stderr)

    print(f"\n=== 站点漂移监控 ===")
    print(f"扫描 {len(snapshots)} 站点 | 变更告警 {len(alerts)} 条 | 落盘: {out_path}")
    for a in alerts[:20]:
        if a["kind"] == "simhash":
            print(f"  [simhash] {a['site']} distance={a['distance']}（页面实质变更）")
        elif a["kind"] == "title":
            print(f"  [title]   {a['site']} '{a['old_title'][:20]}' → '{a['title'][:20]}'")
        elif a["kind"] == "status":
            print(f"  [status]  {a['site']} {a.get('old_status')} → {a['status']}")
        else:
            print(f"  [length]  {a['site']} {a.get('old_length')} → {a.get('length')}")
    if len(alerts) > 20:
        print(f"  ... 其余 {len(alerts) - 20} 条见 JSON")

    return 0 if alerts else 1


if __name__ == "__main__":
    sys.exit(main())
