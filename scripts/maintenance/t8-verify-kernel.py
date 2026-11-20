"""Task 8 内核回环快验（进程内版）：create_task → dataclass/事件/列值/CLI dict。

子进程 stdout 在当前环境会被吞，因此全部在进程内 import 完成。
在 vendor/hermes-agent 注入态树上运行；HERMES_HOME 指向临时目录。
"""
import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AGENT = os.path.join(ROOT, "vendor", "hermes-agent")
sys.path.insert(0, AGENT)
os.environ["HERMES_HOME"] = tempfile.mkdtemp(prefix="t8-verify-")

from hermes_cli import kanban_db as kb              # noqa: E402
from hermes_cli import kanban_db_connect as kdc    # noqa: E402
from hermes_cli import kanban_output as ko          # noqa: E402

results = []

# 1) 创建带能力需求
conn = kdc.connect()
tid = kb.create_task(conn, title="t8 验证任务", required_capabilities=["coding", "review"])
t = kb.get_task(conn, tid)
assert t.required_capabilities == ["coding", "review"], t.required_capabilities
results.append("create/dataclass: coding,review")

# 2) 列值与 created 事件 payload
col = json.loads(conn.execute(
    "SELECT required_capabilities FROM tasks WHERE id=?", (tid,)).fetchone()[0])
ev = json.loads(conn.execute(
    "SELECT payload FROM task_events WHERE kind='created' AND task_id=?",
    (tid,)).fetchone()[0]).get("requiredCapabilities")
assert col == ["coding", "review"] and ev == ["coding", "review"], (col, ev)
results.append("column/event: coding,review")

# 3) CLI JSON dict（kanban_output）
d = ko._task_to_dict(t)
assert d["required_capabilities"] == ["coding", "review"], d
results.append("cli dict: coding,review")

# 4) 迁移幂等：再 connect 一次（_ensure_columns 重跑）不炸
conn2 = kdc.connect()
assert kb.get_task(conn2, tid).required_capabilities == ["coding", "review"]
results.append("migration idempotent")

# 5) 旧行为：不带参数 → None（非 []）
tid2 = kb.create_task(conn, title="legacy 无声明")
t2 = kb.get_task(conn, tid2)
assert t2.required_capabilities is None, t2.required_capabilities
assert ko._task_to_dict(t2)["required_capabilities"] is None
results.append("legacy: null")

# 6) 负例：逗号串拒绝（词法与 skills 同门）
try:
    kb.create_task(conn, title="bad", required_capabilities=["a,b"])
    raise AssertionError("comma string accepted")
except ValueError as e:
    assert "comma" in str(e)
results.append("comma rejected")

# 7) parser 有旗标定义
import argparse                                            # noqa: E402
from hermes_cli import kanban_parser as kp              # noqa: E402
_p = argparse.ArgumentParser()
sub = _p.add_subparsers()
kp.build_parser(sub)
ns = _p.parse_args(["kanban", "create", "x", "--required-capability", "coding"])
assert ns.required_capabilities == ["coding"]
results.append("parser flag ok")

print("T8-KERNEL-PASS " + " | ".join(results))
