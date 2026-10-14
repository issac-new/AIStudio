#!/usr/bin/env python3
"""llmpool_ref.py — LLM failover pool 参考实现（stdlib only，线程安全，语义基准）

接口契约：
  pool = Pool(providers=[{id, priority}], fail_codes={401,402,429,500,502,503},
              cooldown_s=30, clock=time.monotonic, sleeper=time.sleep)
  prov = pool.next_provider()          # 选 provider；全池熔断抛 PoolExhausted
  pool.report_result(prov_id, status)  # 200 系=成功；fail_codes 命中=熔断
"""
import threading
import time
import urllib.request

class PoolExhausted(Exception):
    pass

class _Circuit:
    __slots__ = ("open_until", "half_open_inflight")

    def __init__(self):
        self.open_until = 0.0
        self.half_open_inflight = False

class Pool:
    def __init__(self, providers, fail_codes=None, cooldown_s=30.0,
                 clock=None, sleeper=None):
        # providers: [{id: str, priority: int}]（小数字=高优先级）
        self.fail_codes = fail_codes or {401, 402, 429, 500, 502, 503}
        self.cooldown_s = cooldown_s
        self.clock = clock or time.monotonic
        self.sleeper = sleeper or time.sleep
        self._lock = threading.Lock()
        self._circuits = {}
        self._rr = {}
        ranks = {}
        for p in sorted(providers, key=lambda x: x["priority"]):
            ranks.setdefault(p["priority"], []).append(p["id"])
            self._circuits[p["id"]] = _Circuit()
        self._ranks = [ranks[k] for k in sorted(ranks)]

    def _tripped(self, pid):
        c = self._circuits[pid]
        now = self.clock()
        if now >= c.open_until:
            return False
        return True

    def next_provider(self, timeout_s=5.0):
        deadline = self.clock() + timeout_s
        while True:
            with self._lock:
                chosen = None
                for rank in self._ranks:
                    avail = [pid for pid in rank if not self._tripped(pid)]
                    if not avail:
                        continue
                    i = self._rr.get(id(rank), 0) % len(avail)
                    chosen = avail[i]
                    self._rr[id(rank)] = i + 1
                    # 半开：冷却刚过的 provider 只允许单并发试探
                    c = self._circuits[chosen]
                    if c.open_until and c.half_open_inflight:
                        continue
                    if c.open_until:
                        c.half_open_inflight = True
                    break
                if chosen:
                    return chosen
            if self.clock() >= deadline:
                raise PoolExhausted("全部 provider 熔断中（fail-closed）")
            self.sleeper(0.05)

    def report_result(self, pid, status):
        with self._lock:
            c = self._circuits[pid]
            c.half_open_inflight = False
            if status in self.fail_codes:
                c.open_until = self.clock() + self.cooldown_s
            else:
                c.open_until = 0.0

    def call(self, pid, url, payload, timeout=10):
        """最小 POST helper；生产接入时替换为 harness 的传输层"""
        req = urllib.request.Request(url, data=payload.encode(),
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                status = r.status
        except urllib.error.HTTPError as e:
            status = e.code
        self.report_result(pid, status)
        return status
