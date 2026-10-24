#!/usr/bin/env python3
"""mx-load-probe.py — 容量压测探针（评测门禁·QPS×2 档，2026-10-13 挂账清偿续批）。

用途：对运行中的 SwarmStudio/hermes 服务按目标 QPS 持续打压，实测可达吞吐与
错误率，产出「峰值 QPS×2 压测通过/不通过」的机械判据（腾讯 ADP Pre-Launch
清单口径；方案 V8.22 §2.6.3 评测门禁）。纯标准库，零第三方依赖。

用法：
  python3 mux/mx-load-probe.py --base-url http://127.0.0.1:8802 \\
      --paths /health/ready --qps 40 --duration 30 [--concurrency 8] \\
      [--timeout 5] [--auth-bearer TOKEN] [--json out.json]

判据（全过才 exit 0）：
  ① 错误率 < 1%（非 2xx 或超时/连接失败计错误）
  ② 实际达成 QPS ≥ 目标的 90%（打不进去=容量不足）
  ③ p99 ≤ 2×p50（尖刺控制；样本 <20 跳过本条）
输出：人类可读一行结论 + 明细表；--json 追加写机器可读档案。
"""
from __future__ import annotations

import argparse
import json
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--base-url', required=True, help='服务基址（如 http://127.0.0.1:8802）')
    ap.add_argument('--paths', default='/health/ready', help='轮询路径，逗号分隔（默认 /health/ready）')
    ap.add_argument('--qps', type=float, required=True, help='目标 QPS（建议=当轮实测峰值×2）')
    ap.add_argument('--duration', type=float, default=30.0, help='持续时间秒（默认 30）')
    ap.add_argument('--concurrency', type=int, default=8, help='并发工作线程数（默认 8）')
    ap.add_argument('--timeout', type=float, default=5.0, help='单请求超时秒（默认 5）')
    ap.add_argument('--auth-bearer', default='', help='可选 Authorization Bearer（鉴权面压测）')
    ap.add_argument('--json', default='', help='可选：追加写 JSON 结果档案')
    return ap.parse_args()


class Stats:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.ok = 0
        self.err = 0
        self.latencies: list[float] = []

    def record(self, ok: bool, latency_ms: float) -> None:
        with self.lock:
            if ok:
                self.ok += 1
                self.latencies.append(latency_ms)
            else:
                self.err += 1


def percentile(sorted_values: list[float], p: float) -> float:
    if not sorted_values:
        return 0.0
    idx = min(len(sorted_values) - 1, max(0, int(round(p / 100.0 * len(sorted_values))) - 1))
    return sorted_values[idx]


def main() -> int:
    args = parse_args()
    paths = [p.strip() for p in args.paths.split(',') if p.strip()] or ['/health/ready']
    urls = [args.base_url.rstrip('/') + p for p in paths]
    headers = {'User-Agent': 'mx-load-probe/1'}
    if args.auth_bearer:
        headers['Authorization'] = f'Bearer {args.auth_bearer}'

    stats = Stats()
    stop_at = time.monotonic() + args.duration
    # 令牌桶节奏：全体线程共享下一发时刻，保证总量贴住目标 QPS
    next_shot = [0.0]
    pace_lock = threading.Lock()
    interval = 1.0 / args.qps if args.qps > 0 else 0.0
    url_idx = [0]

    def worker() -> None:
        while True:
            with pace_lock:
                now = time.monotonic()
                fire = max(next_shot[0], now)
                next_shot[0] = fire + interval
                my_url = urls[url_idx[0] % len(urls)]
                url_idx[0] += 1
            wait = fire - time.monotonic()
            if wait > 0:
                if time.monotonic() + wait >= stop_at:
                    return
                time.sleep(wait)
            if time.monotonic() >= stop_at:
                return
            t0 = time.monotonic()
            ok = False
            try:
                req = urllib.request.Request(my_url, headers=headers)
                with urllib.request.urlopen(req, timeout=args.timeout) as resp:
                    ok = 200 <= resp.status < 300
            except urllib.error.HTTPError:
                ok = False
            except Exception:
                ok = False
            stats.record(ok, (time.monotonic() - t0) * 1000.0)

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(max(1, args.concurrency))]
    started = time.monotonic()
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=args.duration + 15)
    wall = time.monotonic() - started

    total = stats.ok + stats.err
    error_rate = stats.err / total if total else 1.0
    achieved_qps = total / wall if wall > 0 else 0.0
    lat_sorted = sorted(stats.latencies)
    p50 = percentile(lat_sorted, 50)
    p95 = percentile(lat_sorted, 95)
    p99 = percentile(lat_sorted, 99)

    checks = {
        'error_rate_lt_1pct': error_rate < 0.01,
        'achieved_qps_ge_90pct': achieved_qps >= 0.9 * args.qps,
        'p99_le_2x_p50': (len(lat_sorted) < 20) or (p99 <= 2 * max(p50, 1e-6)),
    }
    verdict = 'PASS' if all(checks.values()) else 'FAIL'

    print(f'[mx-load-probe] {verdict}  base={args.base_url} paths={paths}')
    print(f'  目标 QPS {args.qps:g} → 实测 {achieved_qps:.1f}；请求 {total}（ok={stats.ok} err={stats.err}，错误率 {error_rate * 100:.2f}%）')
    print(f'  时延 ms：p50={p50:.0f} p95={p95:.0f} p99={p99:.0f}（样本 {len(lat_sorted)}）')
    for name, ok in checks.items():
        print(f'  判据 {name}: {"过" if ok else "不过"}')

    if args.json:
        out = {
            'ts': int(time.time()),
            'base_url': args.base_url,
            'paths': paths,
            'target_qps': args.qps,
            'duration_s': args.duration,
            'achieved_qps': round(achieved_qps, 2),
            'total': total,
            'ok': stats.ok,
            'err': stats.err,
            'error_rate': round(error_rate, 5),
            'latency_ms': {'p50': round(p50, 1), 'p95': round(p95, 1), 'p99': round(p99, 1)},
            'checks': checks,
            'verdict': verdict,
        }
        path = Path(args.json)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('a', encoding='utf-8') as fh:
            fh.write(json.dumps(out, ensure_ascii=False) + '\n')
        print(f'  档案追加：{path}')

    return 0 if verdict == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
