"""recap v1 守门（cc/codex/dsh recap 域合并，矩阵 §3.9 P0）：重派任务的开局上下文带 checkpoint 上次进展。"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from hermes_cli import kanban_db as kb  # noqa: E402
from hermes_cli.kanban_db_connect import connect  # noqa: E402


@pytest.fixture()
def fresh_home(tmp_path, monkeypatch):
    home = tmp_path / "hermes-home"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setenv("HERMES_KANBAN_HOME", str(home))
    try:
        import hermes_constants
        hermes_constants._cached_default_hermes_root = None  # type: ignore[attr-defined]
    except Exception:
        pass
    kb._INITIALIZED_PATHS.clear()
    return home


def _write_checkpoint(tid: str) -> Path:
    from agent.session_checkpoint import checkpoints_dir
    cp_dir = checkpoints_dir()
    cp_dir.mkdir(parents=True, exist_ok=True)
    path = cp_dir / f"{tid}.md"
    path.write_text(
        f"<!-- checkpoint task={tid} generation=1 reason=budget_exhausted -->\n"
        "## goal\n修复登录\n\n## done\n- 修了 src/auth.ts:61\n\n## next\n跑 pytest 全量\n\n"
        "## blockers\nnone\n\n## artifacts\nnone\n<!-- /checkpoint -->\n",
        encoding="utf-8")
    return path


class TestRecapInjection:
    def test_checkpoint_present_in_worker_context(self, fresh_home):
        conn = connect()
        tid = kb.create_task(conn, title="recap 任务", body="b")
        _write_checkpoint(tid)
        ctx = kb.build_worker_context(conn, tid)
        assert "上次进展" in ctx
        assert "checkpoint 续跑" in ctx
        # 注入行集合精确断言：goal/done/next 逐行进开局，blockers=none 被跳过。
        head = "## 上次进展（checkpoint 续跑——已完成项勿重做）"
        block = ctx.split(head, 1)[1].split("\n\n", 1)[0]
        assert block.strip().splitlines() == [
            "- goal: 修复登录",
            "- done: - 修了 src/auth.ts:61",
            "- next: 跑 pytest 全量",
        ]
        assert "none" not in block

    def test_no_checkpoint_silent(self, fresh_home):
        conn = connect()
        tid = kb.create_task(conn, title="无 checkpoint", body="b")
        ctx = kb.build_worker_context(conn, tid)
        assert "上次进展" not in ctx

    def test_reconcile_anchors_task_workspace(self, fresh_home, tmp_path, monkeypatch):
        """workspace_root 传任务 workspace：相对锚点按它判级，不按网关 cwd 误判回写 [unverified]。"""
        ws = tmp_path / "ws"
        (ws / "src").mkdir(parents=True)
        (ws / "src" / "auth.ts").write_text("x", encoding="utf-8")
        conn = connect()
        tid = kb.create_task(conn, title="带 workspace", body="b",
                             workspace_kind="dir", workspace_path=str(ws))
        cp_path = _write_checkpoint(tid)
        from agent import session_checkpoint as sc
        seen: dict = {}
        real_reconcile = sc.reconcile_checkpoint

        def _spy(task_id, **kwargs):
            seen.update(kwargs)
            return real_reconcile(task_id, **kwargs)

        monkeypatch.setattr(sc, "reconcile_checkpoint", _spy)
        kb.build_worker_context(conn, tid)
        assert seen.get("workspace_root") == Path(ws)  # 判级锚点 = 任务 workspace，不是进程 cwd
        assert "[unverified" not in cp_path.read_text(encoding="utf-8")  # 锚点文件在 workspace 内 → verified，不误标
