"""交付版本纯逻辑与 kanban 事件集成测试（2026-11-19 不可变交付版本批）。"""
from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from hermes_cli import kanban_db as kb
from hermes_cli import kanban_db_connect as kbc
from hermes_cli.delivery_version import (
    current_delivery_checksum,
    delivery_checksum,
    latest_delivery_version,
    record_delivery_version,
    verify_delivery_version,
)


@pytest.fixture
def kanban_home(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    kb.init_db()
    return home


def test_version_created_and_idempotent(tmp_path, kanban_home):
    with kbc.connect() as conn:
        tid = kb.create_task(conn, title="dv", assignee="w", body="AC-1: 产物存在\n")
        with kb.write_txn(conn):
            v1 = record_delivery_version(conn, tid, source="test")
        assert v1["seq"] == 1
        assert len(v1["checksum"]) == 64
        assert v1["versionId"].startswith("dv_")
        assert verify_delivery_version(v1) is True
        assert latest_delivery_version(conn, tid)["versionId"] == v1["versionId"]

        # 同内容重复记录：幂等，不追加新事件
        with kb.write_txn(conn):
            again = record_delivery_version(conn, tid, source="test")
        assert again["versionId"] == v1["versionId"]
        kinds = [e.kind for e in kb.list_events(conn, tid)]
        assert kinds.count("delivery_version") == 1


def test_new_attachment_supersedes_previous_version(tmp_path, kanban_home):
    with kbc.connect() as conn:
        tid = kb.create_task(conn, title="dv2", assignee="w", body="AC-1: x\n")
        with kb.write_txn(conn):
            v1 = record_delivery_version(conn, tid, source="request_review")
        # store_attachment_bytes 自带写事务；版本记录单独开事务
        kb.store_attachment_bytes(conn, tid, "artifact.txt", b"hello world\n")
        with kb.write_txn(conn):
            v2 = record_delivery_version(conn, tid, source="request_review")
        assert v2["versionId"] != v1["versionId"]
        assert v2["seq"] == 2
        latest = latest_delivery_version(conn, tid)
        assert latest["versionId"] == v2["versionId"]
        attachments = v2["content"]["attachments"]
        assert len(attachments) == 1
        assert attachments[0]["sha256"] == hashlib.sha256(b"hello world\n").hexdigest()
        assert attachments[0]["missing"] is False
        kinds = [e.kind for e in kb.list_events(conn, tid)]
        assert kinds.count("delivery_version") == 2
        assert kinds.count("delivery_version_superseded") == 1


def test_checksum_changes_with_content(tmp_path, kanban_home):
    with kbc.connect() as conn:
        tid = kb.create_task(conn, title="dv3", assignee="w", body="AC-1: x\n")
        with kb.write_txn(conn):
            v1 = record_delivery_version(conn, tid, source="test")
        with kb.write_txn(conn):
            conn.execute("UPDATE tasks SET body = ? WHERE id = ?", ("AC-1: y\n", tid))
            v2 = record_delivery_version(conn, tid, source="test")
        assert v1["checksum"] != v2["checksum"]
        assert latest_delivery_version(conn, tid)["versionId"] == v2["versionId"]


def test_corrupt_version_is_detected():
    fake = {"versionId": "dv_deadbeef", "checksum": "0" * 64, "content": {"taskId": "t"}}
    assert verify_delivery_version(fake) is False
    good = {"taskId": "t", "bodySha256": "b", "attachments": []}
    checksum = delivery_checksum(good)
    assert verify_delivery_version({
        "versionId": f"dv_{checksum[:16]}", "checksum": checksum, "content": good,
    }) is True


def test_current_delivery_checksum_tracks_card_content(tmp_path, kanban_home):
    """卡片当前内容的校验和与已记录版本同算法：未改动时相等，改正文或加附件后不等。"""
    with kbc.connect() as conn:
        tid = kb.create_task(conn, title="dv-current", assignee="w", body="AC-1: 产物存在\n")
        v1 = record_delivery_version(conn, tid, source="test")
        assert current_delivery_checksum(conn, tid) == v1["checksum"]

        kb.edit_task(conn, tid, body="AC-1: 产物存在\n补充说明\n")
        assert current_delivery_checksum(conn, tid) != v1["checksum"]

        attachment = tmp_path / "extra.txt"
        attachment.write_text("extra", encoding="utf8")
        kb.add_attachment(conn, tid, filename="extra.txt", stored_path=str(attachment), size=5)
        v2 = record_delivery_version(conn, tid, source="test")
        assert v2["checksum"] == current_delivery_checksum(conn, tid)
        assert latest_delivery_version(conn, tid)["versionId"] == v2["versionId"]
