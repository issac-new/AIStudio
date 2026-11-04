"""732 项目暂停拦机器派单：projects-state.json 的 paused 项目不进机器选卡面。

行为面（三处过滤 + 通知）：
- dispatch 选卡面：paused 项目的 ready/review 行被滤出（计数进
  ``DispatchResult.paused_project_filtered``），active / 无项目卡照常派发；
- ``_has_spawnable``：paused 行剔除后再判 profile 存在，遥测口径与选卡面一致；
- auto-decompose：paused 项目的 triage 卡不进分解清单；
- fail-open：状态文件缺失 / 坏 JSON 一律按无暂停处理，派单主链路不受拖垮。
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc
from hermes_cli import kanban_db_dispatch as kbd
from hermes_cli import kanban_projects_pause as kpp


@pytest.fixture
def kanban_home(tmp_path, monkeypatch):
    """隔离的 HERMES_HOME + 空 kanban 库（照 test_kanban_dispatch_claim_allowlist）。"""
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    kb.init_db()
    return home


@pytest.fixture(autouse=True)
def _clear_pause_cache():
    """每个用例前后清空暂停读取器的模块级缓存，避免用例间串味。"""
    kpp._PAUSE_CACHE.clear()
    yield
    kpp._PAUSE_CACHE.clear()


@pytest.fixture(autouse=True)
def _no_memory_pressure(monkeypatch):
    """宿主机内存压力不定：钉住 unknown，避免 elevated 把 spawn 预算压到 1
    干扰「多卡同 tick 派发」断言（与暂停行为无关的环境变量）。"""
    monkeypatch.setattr(kbd, "_memory_pressure_level", lambda sample=None: "unknown")


def _write_state(home: Path, projects: dict) -> None:
    """写 projects-state.json（Node 侧结构的只读替身）。"""
    (home / "projects-state.json").write_text(
        json.dumps({"version": 1, "projects": projects}), encoding="utf-8",
    )
    kpp._PAUSE_CACHE.clear()


def _uncap_board(home: Path) -> None:
    """板级并发闸 kanban.board_concurrency 缺省 1（routa 语义）会把这个 tick
    的 spawn 压到 1 张；多卡断言的用例写 0（不设闸）解除。"""
    (home / "config.yaml").write_text("kanban:\n  board_concurrency: 0\n", encoding="utf-8")


def _make_task(conn, title: str, assignee: str, *, project_id=None, status="ready") -> str:
    """建卡后直接改 status/project_id——project_id 无 projects.db 背书时
    create_task 会丢弃链接，故用 UPDATE 落列（tasks 表本就带该列）。"""
    tid = kb.create_task(conn, title=title, assignee=assignee)
    conn.execute(
        "UPDATE tasks SET status = ?, project_id = ? WHERE id = ?",
        (status, project_id, tid),
    )
    conn.commit()
    return tid


# --- 读取器本体 ---


def test_pause_reader_statuses_and_fail_open(kanban_home):
    """paused 计入；active/completed 不计；坏 JSON / 缺文件 → 空集（fail-open）。"""
    _write_state(kanban_home, {
        "proj-paused": {"status": "paused"},
        "proj-active": {"status": "active"},
        "proj-done": {"status": "completed"},
    })
    assert kpp.paused_project_ids() == frozenset({"proj-paused"})
    assert kpp.is_project_paused("proj-paused") is True
    assert kpp.is_project_paused("proj-active") is False
    # None / 空串：无项目归属的卡不受项目暂停约束。
    assert kpp.is_project_paused(None) is False
    assert kpp.is_project_paused("") is False
    # 坏 JSON：按无暂停处理。
    (kanban_home / "projects-state.json").write_text("{not json", encoding="utf-8")
    kpp._PAUSE_CACHE.clear()
    assert kpp.paused_project_ids() == frozenset()
    # 缺文件：同上。
    (kanban_home / "projects-state.json").unlink()
    kpp._PAUSE_CACHE.clear()
    assert kpp.paused_project_ids() == frozenset()


def test_pause_reader_mtime_cache(kanban_home):
    """文件未变命中缓存；内容变了（stat 键变化）会重读。"""
    _write_state(kanban_home, {"p1": {"status": "paused"}})
    assert kpp.paused_project_ids() == frozenset({"p1"})
    key = str(kanban_home / "projects-state.json")
    assert key in kpp._PAUSE_CACHE
    # 未变：直接取缓存值（同对象）。
    assert kpp.paused_project_ids() is kpp._PAUSE_CACHE[key][1]
    # 变更（size 变化 ⇒ stat 键变化）：重读。
    _write_state(kanban_home, {"p1": {"status": "active"}, "p2": {"status": "paused"}})
    assert kpp.paused_project_ids() == frozenset({"p2"})


# --- dispatch 选卡面 ---


def test_missing_state_file_dispatches_everything(kanban_home, all_assignees_spawnable):
    """缺状态文件 = 全放行：项目归属卡照常进选卡面（暂停面故障不拦派单）。"""
    _uncap_board(kanban_home)
    with kbc.connect() as conn:
        t_paused_proj = _make_task(conn, "proj card", "alice", project_id="proj-x")
        t_bare = _make_task(conn, "bare card", "bob")
        assert kbd.has_spawnable_ready(conn) is True
        res = kbd.dispatch_once(conn, dry_run=True)
    assert sorted(t for t, _a, _w in res.spawned) == sorted([t_paused_proj, t_bare])
    assert res.paused_project_filtered == 0


def test_paused_project_ready_rows_filtered(kanban_home, all_assignees_spawnable):
    """paused 项目的 ready 行被滤出并计数；active / 无项目卡保留。"""
    _uncap_board(kanban_home)
    _write_state(kanban_home, {
        "proj-paused": {"status": "paused"},
        "proj-active": {"status": "active"},
    })
    with kbc.connect() as conn:
        t_p1 = _make_task(conn, "paused 1", "alice", project_id="proj-paused")
        t_p2 = _make_task(conn, "paused 2", "bob", project_id="proj-paused")
        t_active = _make_task(conn, "active", "carol", project_id="proj-active")
        t_bare = _make_task(conn, "no project", "dave")
        res = kbd.dispatch_once(conn, dry_run=True)
    assert sorted(t for t, _a, _w in res.spawned) == sorted([t_active, t_bare])
    assert res.paused_project_filtered == 2
    # 卡本身不被 block / 改状态：只是本 tick 不选。
    with kbc.connect() as conn:
        statuses = {
            row["id"]: row["status"] for row in conn.execute(
                "SELECT id, status FROM tasks WHERE id IN (?, ?)", (t_p1, t_p2),
            )
        }
    assert statuses == {t_p1: "ready", t_p2: "ready"}


def test_paused_project_review_rows_filtered(kanban_home, all_assignees_spawnable):
    """review 列同受暂停过滤；active 项目的 review 卡照常派发。"""
    _write_state(kanban_home, {
        "proj-paused": {"status": "paused"},
        "proj-active": {"status": "active"},
    })
    with kbc.connect() as conn:
        t_review_paused = _make_task(
            conn, "review paused", "alice", project_id="proj-paused", status="review",
        )
        t_review_active = _make_task(
            conn, "review active", "carol", project_id="proj-active", status="review",
        )
        assert kbd.has_spawnable_review(conn) is True
        res = kbd.dispatch_once(conn, dry_run=True)
    spawned = sorted(t for t, _a, _w in res.spawned)
    assert spawned == [t_review_active]
    assert t_review_paused not in spawned
    assert res.paused_project_filtered == 1


def test_has_spawnable_all_paused_is_false(kanban_home, all_assignees_spawnable):
    """整列都是 paused 项目卡 → 遥测判「无 spawnable」（与选卡面一致），
    且在 profile 判定之前就返回 False。"""
    _write_state(kanban_home, {"proj-paused": {"status": "paused"}})
    with kbc.connect() as conn:
        _make_task(conn, "paused only", "alice", project_id="proj-paused")
        assert kbd.has_spawnable_ready(conn) is False
        # 补一张 active 卡后恢复 True。
        _make_task(conn, "active", "carol", project_id="proj-active")
        assert kbd.has_spawnable_ready(conn) is True


def test_describe_suppression_counts_project_paused(kanban_home, all_assignees_spawnable):
    """被滤行数并入抑制摘要：零 spawn 时能看出「项目暂停按住」而非卡死。"""
    _write_state(kanban_home, {"proj-paused": {"status": "paused"}})
    with kbc.connect() as conn:
        _make_task(conn, "paused 1", "alice", project_id="proj-paused")
        _make_task(conn, "paused 2", "bob", project_id="proj-paused")
        res = kbd.dispatch_once(conn, dry_run=True)
    assert "project_paused=2" in kbd.describe_suppression([res])


# --- auto-decompose 过滤 ---


def test_auto_decompose_filters_paused_triage(kanban_home):
    """paused 项目的 triage 卡被滤出分解清单；active / 无项目卡保留；读库失败原样返回。"""
    from gateway.kanban_watchers_dispatcher import _filter_paused_triage
    _write_state(kanban_home, {"proj-paused": {"status": "paused"}})
    with kbc.connect() as conn:
        t_paused = _make_task(conn, "triage paused", "alice", project_id="proj-paused", status="triage")
        t_active = _make_task(conn, "triage active", "carol", project_id="proj-active", status="triage")
        t_bare = _make_task(conn, "triage bare", "dave", status="triage")
    paused = kpp.paused_project_ids()
    kept = _filter_paused_triage(None, [t_paused, t_active, t_bare], paused)
    assert kept == [t_active, t_bare]
    # 无暂停集：零开销路径，原样返回。
    assert _filter_paused_triage(None, [t_paused], frozenset()) == [t_paused]
    # 读库失败（fail-open）：不滤。
    import gateway.kanban_watchers_dispatcher as kwd

    def _boom():
        raise OSError("db gone")

    original = kwd._kbc
    kwd._kbc = _boom
    try:
        assert _filter_paused_triage(None, [t_paused, t_active], paused) == [t_paused, t_active]
    finally:
        kwd._kbc = original


# --- 改派通知（ping-only）---


class _FakeEv:
    def __init__(self, payload: dict):
        self.payload = payload


class _FakeN:
    head = "[b] @a Kanban T1"


def test_notifier_assigned_formatter_rules():
    """机器默认分派（payload 带 source）静默；显式改派 ping 且含 from→assignee；
    assigned 只进 TERMINAL_KINDS（ping-only，不唤醒创建者）。"""
    from gateway.kanban_watchers_notifier import (
        _EVENT_FORMATTERS, _WAKE_KINDS, TERMINAL_KINDS, _fmt_assigned,
    )
    assert "assigned" in TERMINAL_KINDS
    assert "assigned" not in _WAKE_KINDS
    assert _EVENT_FORMATTERS["assigned"] is _fmt_assigned

    n = _FakeN()
    # 派单器默认分派：静默。
    assert _fmt_assigned(_FakeEv({"assignee": "sage", "source": "kanban.default_assignee"}), n) == (None, None, None)
    # 显式改派：文案可见 from → assignee。
    msg, wake, detail = _fmt_assigned(_FakeEv({"from": "dev-a", "assignee": "dev-b"}), n)
    assert msg is not None and "dev-a" in msg and "dev-b" in msg and n.head in msg
    assert wake is None and detail is None
    # 初次指派（无 from）：不渲染 from 段。
    msg2, _w, _d = _fmt_assigned(_FakeEv({"assignee": "dev-b"}), n)
    assert msg2 is not None and "dev-b" in msg2
