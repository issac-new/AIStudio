"""HERMES_CUSTOM[outcome-kanban]（AI 原生组织运行模型批一 Task 9＋批二补丁 807）守门：
tasks.outcome_id 列 + decompose 子卡继承 + create_task 带 parents 建卡继承。

锚点：specs/2026-11-19-ai-native-operating-model-design.md（批一）——结果合同
挂靠列（tasks.outcome_id TEXT，Studio 侧 kanban-bind.ts 在合同激活时写入，只
允许「空→值」或同值）；decompose 建子卡时子卡继承父卡 outcome_id（继承落点=
kanban_db_graph._insert_decomposed_child，与 session_id 继承同事务）。
锚点：specs/2026-11-20-ai-native-cognition-batch2.md §2（批二补丁 807）——
kanban_db.create_task 带 parents 时继承父卡 outcome_id（父序首个非空值，同
tenant 继承位次语义；多父绑定到不同 outcome 即拒，异值纪律同批一三态），
自然覆盖 kanban_swarm 建卡与 CLI --parent 两路（均经 create_task）。

直跑说明：kanban_db_graph/kanban_swarm 不在 overlay runtime 镜像（部署时从
上游解析），本测直接 import 真模块——纯 overlay runtime（无该文件且 vendor
不在 PYTHONPATH）时 skip，不在该环境下造假绿。
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import sqlite3
import sys
from pathlib import Path

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

try:
    from hermes_cli.kanban_db_graph import decompose_triage_task
except Exception:  # pragma: no cover - 纯 overlay runtime 无该模块
    decompose_triage_task = None

try:
    from hermes_cli import kanban_swarm
except Exception:  # pragma: no cover - 纯 overlay runtime 无该模块
    kanban_swarm = None

try:
    # CLI --parent 场景经真解析器＋_cmd_create；_cmd_create 内联 import
    # agent.delegation_context（overlay 无 agent/ 树），一并探针。
    from agent.delegation_context import is_dispatcher_owned_worker_context  # noqa: F401
    from hermes_cli.kanban import _cmd_create
    from hermes_cli.kanban_parser import build_parser
except Exception:  # pragma: no cover - 纯 overlay runtime 无该模块
    _cmd_create = None
    build_parser = None

import pytest

from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc


def _prepare_home(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_KANBAN_HOME", str(tmp_path))
    kb._INITIALIZED_PATHS.clear()
    return kbc.connect()  # 直连（connect_closing 是 context manager，测试自管 close）


def _make_task(conn, title, assignee, status="todo"):
    tid = kb.create_task(
        conn=conn, title=title, body="", assignee=assignee,
        created_by="test", workspace_kind="dir",
    )
    with kb.write_txn(conn):
        conn.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, tid))
    return tid


def _children(title_a="child-a", title_b="child-b"):
    return [
        {"title": title_a, "body": "b", "assignee": "chen", "parents": []},
        {"title": title_b, "body": "b", "assignee": "chen", "parents": [0]},
    ]


def _outcome_of(conn, task_id):
    row = conn.execute(
        "SELECT outcome_id FROM tasks WHERE id = ?", (task_id,)
    ).fetchone()
    return row["outcome_id"] if row is not None else None


def _bind(conn, task_id, outcome):
    # 激活绑定面（批一 kanban-bind.ts「空→值」）的最小等价写——测试只关心
    # 父卡带上 outcome_id 后建卡路径的继承行为。
    with kb.write_txn(conn):
        conn.execute("UPDATE tasks SET outcome_id = ? WHERE id = ?", (outcome, task_id))


def _create_child(conn, parents, title="child"):
    return kb.create_task(
        conn=conn, title=title, body="", assignee="chen",
        created_by="test", workspace_kind="dir", parents=tuple(parents),
    )


class TestCreateTaskParentOutcomeInheritance:
    """补丁 807：create_task 带 parents 继承父卡 outcome_id（批二 spec §2）。"""

    def test_single_bound_parent_inherits(self, tmp_path, monkeypatch):
        # CLI `kanban create --parent <已绑定卡>` 单父形态：空→值继承。
        conn = _prepare_home(tmp_path, monkeypatch)
        parent = _make_task(conn, "parent", "orch")
        _bind(conn, parent, "oc-cli")
        child = _create_child(conn, [parent])
        assert _outcome_of(conn, child) == "oc-cli", "child of a bound parent must inherit"
        conn.close()

    def test_first_bound_parent_in_parent_order_wins(self, tmp_path, monkeypatch):
        # 首父未绑定＋次父已绑定＝「空→值」合法路径：继承父序首个非空值
        # （与 initial_task_state 的 tenant 继承同位次语义），不留守卫盲卡。
        conn = _prepare_home(tmp_path, monkeypatch)
        unbound = _make_task(conn, "unbound", "orch")
        bound = _make_task(conn, "bound", "orch")
        _bind(conn, bound, "oc-2")
        child = _create_child(conn, [unbound, bound])
        assert _outcome_of(conn, child) == "oc-2"
        conn.close()

    def test_swarm_fanin_three_bound_parents_inherits(self, tmp_path, monkeypatch):
        # swarm verifier 形态：三父（workers）全部绑定同一 outcome → 汇聚卡继承。
        conn = _prepare_home(tmp_path, monkeypatch)
        workers = [_make_task(conn, f"w{i}", "w") for i in range(3)]
        for w in workers:
            _bind(conn, w, "oc-swarm")
        child = _create_child(conn, workers, title="verifier")
        assert _outcome_of(conn, child) == "oc-swarm"
        conn.close()

    def test_swarm_fanin_disagreeing_parents_refuse(self, tmp_path, monkeypatch):
        # 多父异值＝异值拒（805 三态纪律在建卡面的等价物）：一张卡不得同时
        # 挂两个结果合同——建卡整体失败，不留半写（无卡行、无链接）。
        conn = _prepare_home(tmp_path, monkeypatch)
        w1 = _make_task(conn, "w1", "w")
        w2 = _make_task(conn, "w2", "w")
        w3 = _make_task(conn, "w3", "w")
        _bind(conn, w1, "oc-a")
        _bind(conn, w2, "oc-b")
        _bind(conn, w3, "oc-a")
        tasks_before = conn.execute("SELECT COUNT(*) c FROM tasks").fetchone()["c"]
        links_before = conn.execute("SELECT COUNT(*) c FROM task_links").fetchone()["c"]
        with pytest.raises(ValueError, match="outcome"):
            _create_child(conn, [w1, w2, w3])
        assert conn.execute("SELECT COUNT(*) c FROM tasks").fetchone()["c"] == tasks_before
        assert conn.execute("SELECT COUNT(*) c FROM task_links").fetchone()["c"] == links_before
        conn.close()

    def test_unbound_parents_stay_null(self, tmp_path, monkeypatch):
        # 父卡全未绑定：子卡保持 NULL（继承不是凭空造绑定）。
        conn = _prepare_home(tmp_path, monkeypatch)
        p1 = _make_task(conn, "p1", "orch")
        p2 = _make_task(conn, "p2", "orch")
        child = _create_child(conn, [p1, p2])
        assert _outcome_of(conn, child) is None
        conn.close()


@pytest.mark.skipif(kanban_swarm is None, reason="kanban_swarm 不可用（纯 overlay runtime）")
class TestRealSwarmPath:
    """真 kanban_swarm 建卡全链过 create_task（批二 807 覆盖声明的行为面）。"""

    def _create_three_worker_swarm(self, conn):
        return kanban_swarm.create_swarm(
            conn, goal="ship the report",
            workers=[
                kanban_swarm.SwarmWorkerSpec(profile=f"w{i}", title=f"worker {i}", body="b")
                for i in range(3)
            ],
            verifier_assignee="verifier", synthesizer_assignee="synth",
            created_by="t",
        )

    def test_swarm_cards_unbound_when_root_unbound(self, tmp_path, monkeypatch):
        # swarm 根卡建卡时新鲜未绑定：全图卡保持 NULL——继承面不得凭空造绑定，
        # swarm 建卡行为与 807 之前一致。
        conn = _prepare_home(tmp_path, monkeypatch)
        created = self._create_three_worker_swarm(conn)
        for tid in [created.root_id, *created.worker_ids, created.verifier_id, created.synthesizer_id]:
            assert _outcome_of(conn, tid) is None
        conn.close()

    def test_bound_swarm_member_new_child_inherits(self, tmp_path, monkeypatch):
        # 两路互补（spec §2）：激活绑定（批一）落存量 swarm 卡之后，经
        # create_task 新建的子卡（CLI --parent / 再分解手工挂靠）自动继承。
        conn = _prepare_home(tmp_path, monkeypatch)
        created = self._create_three_worker_swarm(conn)
        worker = created.worker_ids[0]
        _bind(conn, worker, "oc-live")
        followup = _create_child(conn, [worker], title="followup")
        assert _outcome_of(conn, followup) == "oc-live"
        conn.close()


@pytest.mark.skipif(_cmd_create is None, reason="CLI create 面不可用（纯 overlay runtime）")
class TestCliParentCreate:
    """CLI `kanban create --parent`：真解析器＋_cmd_create 全链继承验证。"""

    def test_cli_create_parent_inherits(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        parent = _make_task(conn, "cli-parent", "orch")
        _bind(conn, parent, "oc-cli-1")

        wrap = argparse.ArgumentParser(prog="kanban-wrap", add_help=False)
        parser = build_parser(wrap.add_subparsers(dest="_top"))
        args = parser.parse_args(["create", "cli child", "--parent", parent, "--json"])

        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = _cmd_create(args)
        assert rc == 0, buf.getvalue()
        payload = json.loads(buf.getvalue())
        assert _outcome_of(conn, payload["id"]) == "oc-cli-1"
        conn.close()


@pytest.mark.skipif(decompose_triage_task is None, reason="kanban_db_graph 不可用（纯 overlay runtime）")
class TestDecomposeInheritsOutcomeId:
    def test_children_inherit_bound_root(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        root = _make_task(conn, "root", "orch", status="triage")
        with kb.write_txn(conn):
            conn.execute(
                "UPDATE tasks SET outcome_id = ? WHERE id = ?", ("oc-1", root)
            )
        child_ids = decompose_triage_task(
            conn, root, root_assignee="orch", children=_children(), author="t",
        )
        assert child_ids, "root in triage with no prior decompose must fan out"
        for cid in child_ids:
            assert _outcome_of(conn, cid) == "oc-1", "child must inherit root outcome_id"
        assert _outcome_of(conn, root) == "oc-1", "root keeps its outcome_id"
        conn.close()

    def test_children_null_when_root_unbound(self, tmp_path, monkeypatch):
        conn = _prepare_home(tmp_path, monkeypatch)
        root = _make_task(conn, "root", "orch", status="triage")
        child_ids = decompose_triage_task(
            conn, root, root_assignee="orch", children=_children(), author="t",
        )
        assert child_ids
        for cid in child_ids:
            assert _outcome_of(conn, cid) is None
        conn.close()

    def test_single_promotion_keeps_binding(self, tmp_path, monkeypatch):
        # fanout=false 只提升根卡自身（specify_triage_task），不建子卡——
        # 根卡 outcome_id 必须原样保留（继承只发生在「新建子卡」面）。
        conn = _prepare_home(tmp_path, monkeypatch)
        root = _make_task(conn, "root", "orch", status="triage")
        with kb.write_txn(conn):
            conn.execute(
                "UPDATE tasks SET outcome_id = ? WHERE id = ?", ("oc-9", root)
            )
        ok = kb.specify_triage_task(
            conn, root, title="promoted", body="b", assignee="orch", author="t",
        )
        assert ok
        assert _outcome_of(conn, root) == "oc-9"
        conn.close()


@pytest.mark.skipif(decompose_triage_task is None, reason="kanban_db_graph 不可用（纯 overlay runtime）")
class TestLegacyDbMigration:
    def test_legacy_db_without_column_migrates_and_data_intact(self, tmp_path, monkeypatch):
        # 老库（无 outcome_id 列）→ 首次 connect 触发 ALTER 惰性迁移，既有行零丢失；
        # 迁移后 decompose 全链照常（继承可写）。
        conn = _prepare_home(tmp_path, monkeypatch)
        root = _make_task(conn, "legacy-root", "orch", status="triage")
        other = _make_task(conn, "legacy-other", "chen", status="done")
        conn.close()

        raw = sqlite3.connect(str(tmp_path / "kanban.db"))
        raw.row_factory = sqlite3.Row
        raw.execute("ALTER TABLE tasks DROP COLUMN outcome_id")
        raw.commit()
        raw.close()

        conn2 = _prepare_home(tmp_path, monkeypatch)
        cols = {r["name"] for r in conn2.execute("PRAGMA table_info(tasks)")}
        assert "outcome_id" in cols, "connect() must lazily add outcome_id to legacy boards"
        # 数据完好：两行仍在，状态/标题不坏
        rows = {
            r["id"]: r
            for r in conn2.execute(
                "SELECT id, title, status FROM tasks WHERE id IN (?, ?)", (root, other)
            )
        }
        assert rows[root]["title"] == "legacy-root" and rows[root]["status"] == "triage"
        assert rows[other]["status"] == "done"
        # 迁移列可用：绑定 + decompose 继承一路可写
        with kb.write_txn(conn2):
            conn2.execute(
                "UPDATE tasks SET outcome_id = ? WHERE id = ?", ("oc-legacy", root)
            )
        child_ids = decompose_triage_task(
            conn2, root, root_assignee="orch", children=_children(), author="t",
        )
        assert child_ids
        for cid in child_ids:
            assert _outcome_of(conn2, cid) == "oc-legacy"
        conn2.close()
