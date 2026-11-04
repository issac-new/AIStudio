"""W4 输入冻结（补丁 750）写侧测试：claim 开 run 时 task_runs.metadata 带
input_manifest（body sha256＋附件行清单）。拼合树跑法：vendor/hermes-agent
检出 + runtime/ 覆盖后 python3.14 -m pytest。"""
import json
import sqlite3
from pathlib import Path

import pytest

pytest.importorskip("hermes_cli.kanban_db_connect", reason="拼合树未装配")
from hermes_cli import kanban_db as kdb  # noqa: E402
from hermes_cli import kanban_db_connect as kbc  # noqa: E402


@pytest.fixture
def kanban_home(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    kdb.init_db()
    return home


def test_claim_run_freezes_input_manifest(kanban_home):
    conn = kbc.connect()
    conn.row_factory = sqlite3.Row
    # 建卡（ready）+挂两附件
    task_id = kdb.create_task(conn, title="反馈分析", body="输入正文 v1")
    # 测试直改状态为 ready（合法状态机值；create_task 只收 blocked/running）
    conn.execute("UPDATE tasks SET status = 'ready' WHERE id = ?", (task_id,))
    conn.commit()
    for name, size in (("feedback.csv", 2048), ("spec.md", 512)):
        conn.execute(
            "INSERT INTO task_attachments (task_id, filename, stored_path, size, created_at)"
            " VALUES (?, ?, ?, ?, strftime('%s','now'))",
            (task_id, name, f"/tmp/{name}", size),
        )
    conn.commit()
    # claim 开 run（补丁 750 路径：_claim_and_open_run 的 CAS INSERT 带 metadata）
    now = 1700000000
    run_id = kdb._claim_and_open_run(
        conn, task_id, source_status="ready", lock="t-lock", expires=now + 600, now=now,
    )
    assert run_id is not None, "claim CAS 失败（未开 run）"
    meta = conn.execute(
        "SELECT metadata FROM task_runs WHERE id = ?", (run_id,)
    ).fetchone()["metadata"]
    manifest = json.loads(meta)["input_manifest"]
    assert manifest["bodySha256"] and len(manifest["bodySha256"]) == 64
    assert manifest["attachments"] == [
        {"id": 1, "filename": "feedback.csv", "size": 2048},
        {"id": 2, "filename": "spec.md", "size": 512},
    ]
    # 冻结语义：claim 后改 body，manifest 不变
    conn.execute("UPDATE tasks SET body = '改过的正文' WHERE id = ?", (task_id,))
    conn.commit()
    meta2 = conn.execute("SELECT metadata FROM task_runs WHERE id = ?", (run_id,)).fetchone()["metadata"]
    assert json.loads(meta2)["input_manifest"]["bodySha256"] == manifest["bodySha256"]
    conn.close()
