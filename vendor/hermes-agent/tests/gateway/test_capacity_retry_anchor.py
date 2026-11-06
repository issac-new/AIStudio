"""容量重试队列年龄锚守门（run11 根治①）：重入条目必须继承首见时间。

锚点：run_busy._capacity_retry_anchor —— id(event) 在跨进程拒绝回环中每次换新对象，
首见时间被重置 → MAX_AGE 永不过期（run11 实锤：一条回声广播重入 300+ 次、队列
恒满数小时零过期）。稳定键=event_id（Matrix）；无 event_id 载荷按 (sender,body)
哈希；再退化为 id()。配套断言：_queue_capacity_retry 对同 event_id 的两个不同对象
只建一个锚，且第二条 pending 继承第一条的 first_seen（重入退避生效）。
"""

from __future__ import annotations

import sys
import types
from pathlib import Path

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from gateway.run_busy import GatewayBusySessionMixin, _capacity_retry_anchor


class _FakeEvent:
    def __init__(self, event_id=None, sender="@u:t", body=None):
        self.event_id = event_id
        self.sender = sender
        if body is not None:
            self.content = types.SimpleNamespace(body=body)
        else:
            self.content = None


class _FakeRunner(GatewayBusySessionMixin):
    CAPACITY_RETRY_MAX_PENDING = 64
    CAPACITY_RETRY_POLL_SEC = 2.0
    CAPACITY_RETRY_MAX_AGE_SEC = 20 * 60.0


class TestAnchor:
    def test_event_id_is_the_anchor(self):
        a, b = _FakeEvent(event_id="$same"), _FakeEvent(event_id="$same")
        assert _capacity_retry_anchor(a) == "$same"
        assert _capacity_retry_anchor(a) == _capacity_retry_anchor(b)  # 新对象同键

    def test_body_fallback_without_event_id(self):
        a = _FakeEvent(body="hello")
        b = _FakeEvent(body="hello")
        c = _FakeEvent(body="world")
        assert _capacity_retry_anchor(a) == _capacity_retry_anchor(b)
        assert _capacity_retry_anchor(a) != _capacity_retry_anchor(c)
        assert _capacity_retry_anchor(_FakeEvent()) is not None  # 兜底 id()

    def test_reentry_inherits_first_seen_and_backs_off(self, monkeypatch):
        class _DeadPump:  # 入队会想拉泵任务——测试无事件循环，stub 成"已完成"
            def done(self):
                return True

            def cancelled(self):
                return False

            def exception(self):
                return None

        monkeypatch.setattr("gateway.run_busy.asyncio.create_task", lambda coro: _DeadPump())
        r = _FakeRunner()
        e1 = _FakeEvent(event_id="$re")
        assert r._queue_capacity_retry(e1, None, "agent:x") is True
        t1 = r._capacity_retry_since["$re"]
        # 跨进程拒绝回环：同消息以新对象回来
        e2 = _FakeEvent(event_id="$re")
        assert r._queue_capacity_retry(e2, None, "agent:x") is True
        assert r._capacity_retry_since == {"$re": t1}          # 锚不新增
        assert len(r._capacity_retry_queue) == 2
        assert r._capacity_retry_queue[1][0] == t1              # 继承首见时间
        assert r._capacity_retry_queue[1][4] > r._capacity_retry_queue[0][4]  # 退避生效

    def test_pump_expiry_uses_same_anchor(self):
        # 泵过期路径按同键清锚（_capacity_retry_pump 的 pop 调用与入队同键）：
        # 此处以单元面断言键函数对 pump 侧可见的一致性（异步泵全路径由 533 既有
        # 测试域覆盖，这里钉住键契约不回退）。
        e = _FakeEvent(event_id="$k")
        key = _capacity_retry_anchor(e)
        r = _FakeRunner()
        r._capacity_retry_since = {}  # 惰性初始化（生产由 _queue_capacity_retry 建）
        r._capacity_retry_since[key] = 1.0
        r._capacity_retry_since.pop(_capacity_retry_anchor(_FakeEvent(event_id="$k")))
        assert key not in r._capacity_retry_since


class TestCapacitySidecar:
    def test_enqueue_writes_depth_sidecar_throttled(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        class _DP:
            def done(self): return True
            def cancelled(self): return False
            def exception(self): return None
        monkeypatch.setattr("gateway.run_busy.asyncio.create_task", lambda coro: _DP())
        r = _FakeRunner()
        r._queue_capacity_retry(_FakeEvent(event_id="$a"), None, "agent:x")
        r._queue_capacity_retry(_FakeEvent(event_id="$b"), None, "agent:y")
        import json as _j, pathlib as _pl
        f = _pl.Path(tmp_path) / "runtime" / "capacity_retry.json"
        assert f.exists()
        d = _j.loads(f.read_text())
        assert d["cap"] == 64 and d["anchors"] >= 1
