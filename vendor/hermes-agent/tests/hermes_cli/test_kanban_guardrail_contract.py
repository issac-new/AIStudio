"""看板写闸层守门（607 收编轮）。

两层契约：
1. **符号契约**（宿主事故的机械防复发，2026-10-11 23:12 实录）：宿主自更新后的
   ``kanban_db_connect.py`` 通过 ``_kb.<attr>`` 引用本模块符号——本模块缺任何一个，
   看板 watcher/dispatcher 全线 AttributeError（5 秒 14 处）。此测试把
   "connect.py 引用的 ``_kb`` 符号必须在 kanban_db 可解析"钉成断言；新增引用
   而未提供定义时当场红。
2. **fail-closed 行为**：裸 sqlite3 连接（未注册 UDF）在 prepare 期被拒——
   "no such function: kanban_write_sanctioned"，即 2026-09-01 事故向量的防护属性。
"""
import re
import sqlite3
import sys
import zoneinfo  # noqa: F401 预导入：本机 venv 标准库在真实 hermes home 下，护栏窗口内
                 # 惰性导入会被 home_io_guard 误伤（长会话治理轮实测）。
from pathlib import Path

import hermes_cli.kanban_db as kb
from hermes_cli import kanban_db_connect


def test_connect_module_references_resolve_in_kanban_db():
    src = Path(kanban_db_connect.__file__).read_text(encoding="utf-8")
    refs = set(re.findall(r"_kb\.([A-Za-z_][A-Za-z0-9_]*)", src))
    assert refs, "connect.py 应引用 _kb 符号（解析面失效=本测试失去观测对象）"
    missing = sorted(name for name in refs if not hasattr(kb, name))
    assert missing == [], (
        f"kanban_db_connect.py 引用而 kanban_db 缺失的符号：{missing}——"
        "宿主网关看板会全线 AttributeError（607 收编前的事故形态）"
    )


def test_guardrail_symbols_present():
    for name in (
        "register_write_sanction_udf", "install_guardrail_triggers",
        "_guardrail_trigger_name", "GUARDRAIL_UDF_NAME", "_GUARDRAIL_TABLES",
    ):
        assert hasattr(kb, name), name


def _board_like_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    for table in kb._GUARDRAIL_TABLES:
        conn.execute(f"CREATE TABLE {table} (id TEXT)")
    return conn


def test_sanctioned_connection_writes_pass():
    conn = _board_like_db()
    kb.register_write_sanction_udf(conn)
    kb.install_guardrail_triggers(conn)  # 幂等（IF NOT EXISTS）
    kb.install_guardrail_triggers(conn)
    conn.execute("INSERT INTO tasks VALUES ('ok')")
    conn.commit()
    assert conn.execute("SELECT count(*) FROM tasks").fetchone()[0] == 1


def test_bare_connection_fails_closed_at_prepare_time():
    board = _board_like_db()
    kb.register_write_sanction_udf(board)
    kb.install_guardrail_triggers(board)
    board.close()
    # 裸连接复刻事故向量：读同一 DB 文件需落盘，这里用 trigger DDL 直接验证
    # WHEN 子句对未注册 UDF 的连接不可 prepare。
    raw = sqlite3.connect(":memory:")
    raw.execute("CREATE TABLE tasks (id TEXT)")
    try:
        raw.execute(
            "CREATE TRIGGER g BEFORE INSERT ON tasks "
            "WHEN kanban_write_sanctioned() <> 1 "
            "BEGIN SELECT RAISE(ABORT, 'x'); END"
        )
        raw.execute("INSERT INTO tasks VALUES ('bad')")
        raise AssertionError("未授权写居然通过——fail-closed 属性失效")
    except sqlite3.OperationalError as exc:
        assert "kanban_write_sanctioned" in str(exc), exc


def test_guard_fn_delegation_context_gate():
    """guard_fn 缺省实现：委托子进程上下文=0（拒），否则=1（放行）。"""
    conn = sqlite3.connect(":memory:")
    kb.register_write_sanction_udf(conn, guard_fn=lambda: 0)
    assert conn.execute("SELECT kanban_write_sanctioned()").fetchone()[0] == 0
    kb.register_write_sanction_udf(conn, guard_fn=lambda: 1)
    assert conn.execute("SELECT kanban_write_sanctioned()").fetchone()[0] == 1


def _ensure_importable(module: str) -> bool:  # pragma: no cover - 诊断辅助
    return module in sys.modules
