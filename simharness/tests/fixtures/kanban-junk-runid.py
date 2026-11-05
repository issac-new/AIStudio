"""patch 754 行为夹具：kanban 毒 run 指针免疫与 dir 卡建卡校验。

对注入后的 vendor/hermes-agent 树直接断言（PYTHONPATH 指向该树）：
run27 实录——外部直写把 run slug 存进 tasks.current_run_id，claim 路径
_reclaim_dangling_run 对其 int() 抛 ValueError，派单器 tick 每 60s 崩；
同批 dir 卡缺 workspace_path，spawn 面 burn 预算至 gave_up。
任何断言失败 exit 1，vitest 壳据此判红。
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.environ["KANBAN_VENDOR_ROOT"])

# 环境自持先于 vendor 模块导入（kanban_db import 期即读 HERMES_HOME 定位默认库）
HOME = tempfile.mkdtemp(prefix="kanban-junk-runid-")
os.environ["HERMES_HOME"] = HOME

from hermes_cli import kanban_db as kb  # noqa: E402
from hermes_cli import kanban_db_connect as kbc  # noqa: E402

JUNK = "20261105-v8-run27"  # run27 实录毒值：run slug 而非 task_runs 整型 id


def main() -> int:
    home = HOME
    kb.init_db()
    failures = []

    with kbc.connect() as conn:
        tid = kb.create_task(conn, title="毒指针卡", assignee="xiao-csw-cashier-mp")
        conn.execute("UPDATE tasks SET current_run_id=? WHERE id=?", (JUNK, tid))
        conn.execute(
            "INSERT INTO task_runs (task_id, profile, status, started_at) "
            "VALUES (?, 'probe', 'running', 0)",
            (tid,),
        )
        conn.commit()

        # ① 读路径免疫：毒指针读作 None，不再向调用方传染 ValueError
        if kb._current_run_id(conn, tid) is not None:
            failures.append(f"① _current_run_id 毒值应 None，实得 {kb._current_run_id(conn, tid)!r}")

        # ② goal 语义：不可整型化的 expected=不持有任何 run → superseded（且不崩）
        got = kb.goal_run_status(conn, tid, expected_run_id=JUNK)
        if got != "superseded":
            failures.append(f"② goal_run_status 毒值应 superseded，实得 {got!r}")

        # ③ reclaim 兜底：毒指针按 task_id 关开行并清指针，不变量双句恢复
        kb._reclaim_dangling_run(conn, tid, statuses=("ready",), now=123, note="probe")
        pointer = conn.execute(
            "SELECT current_run_id FROM tasks WHERE id=?", (tid,)
        ).fetchone()["current_run_id"]
        runs = conn.execute(
            "SELECT status, ended_at FROM task_runs WHERE task_id=?", (tid,)
        ).fetchall()
        if pointer is not None:
            failures.append(f"③ reclaim 后指针应 NULL，实得 {pointer!r}")
        if not runs or any(r["status"] == "running" or r["ended_at"] is None for r in runs):
            failures.append(f"③ 开行应被关闭，实得 {[(r['status'], r['ended_at']) for r in runs]!r}")

    # ④/⑤ 建卡面：dir 缺路径拒（结构化错误串含修法），dir 带路径不误伤
    from tools.kanban_tools import _handle_create

    rejected = _handle_create({"title": "d", "assignee": "xiao", "workspace_kind": "dir"})
    if "requires workspace_path" not in str(rejected):
        failures.append(f"④ dir 缺路径应结构化拒绝，实得 {str(rejected)[:120]!r}")

    accepted = _handle_create(
        {"title": "d", "assignee": "xiao", "workspace_kind": "dir", "workspace_path": home}
    )
    payload = json.loads(accepted) if accepted.strip().startswith("{") else {"raw": accepted}
    if not (payload.get("ok") or payload.get("task_id") or "task_id" in str(accepted)):
        failures.append(f"⑤ dir 带路径建卡被误伤，实得 {str(accepted)[:120]!r}")

    for msg in failures:
        print(f"FAIL {msg}", file=sys.stderr)
    print(f"kanban-junk-runid 夹具：{5 - len(failures)}/5 断言通过")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
