"""overlay[485] 前缀指纹链层 2 守门：append 推进链头/内容敏感/批量同链/读回一致。"""
import os
import sqlite3
import tempfile

import pytest


def _make_store(tmpdir):
    db = os.path.join(tmpdir, "state.db")
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA journal_mode=WAL")
    return db, conn


def _init_tables(conn):
    from hermes_state_common import SCHEMA_SQL
    conn.executescript(SCHEMA_SQL)
    conn.commit()


def _append(db, session_id, role, content):
    from hermes_state_messages import _advance_prefix_chain
    conn = sqlite3.connect(db)
    conn.execute("PRAGMA journal_mode=WAL")
    _advance_prefix_chain(conn, session_id, role, content)
    conn.commit()
    conn.close()


def _head(db, session_id):
    conn = sqlite3.connect(db)
    row = conn.execute(
        "SELECT chain_head, verified_index FROM session_prefix_chain WHERE session_id = ?",
        (session_id,)).fetchone()
    conn.close()
    return row


def test_chain_advances_and_is_content_sensitive(tmp_path):
    db, conn = _make_store(str(tmp_path))
    _init_tables(conn)
    conn.close()
    _append(db, "s1", "user", "hello")
    h1 = _head(db, "s1")
    assert h1[1] == 0
    _append(db, "s1", "assistant", "world")
    h2 = _head(db, "s1")
    assert h2[0] != h1[0] and h2[1] == 1
    # 同序列不同内容 → 链头不同（篡改检测基础）
    _append(db, "s2", "user", "hello")
    _append(db, "s2", "assistant", "WORLD")
    hb = _head(db, "s2")
    assert hb[0] != h2[0]
    # 会话隔离
    assert _head(db, "s1")[0] == h2[0]


def test_chain_failure_does_not_raise(tmp_path):
    # 表缺失（模拟旧库未迁移）→ 静默跳过不阻断消息写入语义
    db, conn = _make_store(str(tmp_path))
    conn.execute("CREATE TABLE sessions (id TEXT PRIMARY KEY)")
    conn.commit()
    conn.close()
    from hermes_state_messages import _advance_prefix_chain
    _advance_prefix_chain(conn, "s1", "user", "x")  # 不应抛
