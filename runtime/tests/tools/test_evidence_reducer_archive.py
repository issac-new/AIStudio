#!/usr/bin/env python3
"""770 归档失败保真（spec 2026-11-13-superagent-contract-closure）：全文归档拿不到
路径（返回 None 或抛异常）时必须原样 passthrough——不调摘要模型、不产 receipt、
ledger 记 passthrough_archive_error。无全文可回溯的摘要等于造假，保真优先于省 token。

运行口径：PYTHONPATH=vendor/hermes-agent:runtime（拼合树正本——runtime/tools 无
__init__.py，命名空间包让位于 vendor 正包；runtime/ 与 vendor/ 两份文件由补丁 770
保持同构，Task 4 以 diff 断言双侧一致）。_write_to_spillover 系函数内延迟 import，
patch 打在其宿主模块 tool_result_storage 上。"""

import json
from unittest.mock import patch

import pytest

from hermes_constants import reset_hermes_home_override, set_hermes_home_override
from tools import evidence_reducer as er
from tools import tool_result_storage as trs


@pytest.fixture(autouse=True)
def isolated_home(tmp_path):
    token = set_hermes_home_override(str(tmp_path / "hermes"))
    yield tmp_path
    reset_hermes_home_override(token)


BIG = "\n".join(f"2026-11-13T10:00:{i % 60:02d} INFO step {i} ok" for i in range(300))


def enabled_config():
    return er.ReducerConfig({"enabled": True, "provider": "testp", "model": "testm"})


def test_archive_none_path_passes_through_without_model_call():
    with patch.object(er, "_call_reducer_model") as model, \
         patch.object(trs, "_write_to_spillover", return_value=None):
        out = er.maybe_reduce_observation(BIG, "terminal", "tid_arch_none", config=enabled_config())
    assert out is BIG
    model.assert_not_called()


def test_archive_exception_passes_through_without_model_call():
    with patch.object(er, "_call_reducer_model") as model, \
         patch.object(trs, "_write_to_spillover", side_effect=RuntimeError("disk full")):
        out = er.maybe_reduce_observation(BIG, "terminal", "tid_arch_err", config=enabled_config())
    assert out is BIG
    model.assert_not_called()


def test_archive_failure_ledger_outcome():
    with patch.object(er, "_call_reducer_model") as model, \
         patch.object(trs, "_write_to_spillover", return_value=None):
        er.maybe_reduce_observation(BIG, "terminal", "tid_arch_ledger", config=enabled_config())
    from tools.efficiency_ledger import ledger_path
    events = [json.loads(l) for l in ledger_path().read_text().splitlines()]
    outcomes = {e["ref"]: e["outcome"] for e in events if e["kind"] == "evidence_reduce"}
    assert outcomes["tid_arch_ledger"] == "passthrough_archive_error"
