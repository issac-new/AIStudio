"""GoalManager → proactivity 对齐台账登记（overlay patch 696，2026-10-26）。

Qoder 主动性文章吸收轮挂账清偿：长期目标创建/契约变更 fail-soft 登记到 studio
对齐台账（同机共享 JSON），契约事实透传（completion contract=验收规则→L4 升仓
判据）。登记失败绝不阻断 goal 生命周期。
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from hermes_cli.goals import GoalContract, GoalManager, parse_contract


@pytest.fixture()
def ledger_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_GOAL_ALIGNMENT_DIR", str(tmp_path))
    monkeypatch.delenv("HERMES_GOAL_ALIGNMENT_OFF", raising=False)
    return tmp_path


def _read_entries(dir_: Path) -> list[dict]:
    path = dir_ / "alignment.json"
    assert path.exists()
    return json.loads(path.read_text(encoding="utf-8"))["entries"]


def test_set_registers_goal_with_contract_facts(ledger_dir):
    mgr = GoalManager("sess-alpha")
    headline, contract = parse_contract(
        "把里程碑推到上线\nverification: 全量测试 0 失败\nboundaries: 不动线上配置"
    )
    mgr.set(headline, contract=contract)
    entries = _read_entries(ledger_dir)
    assert len(entries) == 1
    entry = entries[0]
    assert entry["goalId"] == "hermes-goal:sess-alpha"
    assert "里程碑" in entry["goalSummary"]
    assert entry["contract"] == {"goalExplicit": True, "acceptanceCriteria": True}
    assert entry["confirmations"] == []


def test_set_without_contract_registers_acceptance_false(ledger_dir):
    GoalManager("sess-beta").set("随手清一下收件箱")
    entry = _read_entries(ledger_dir)[0]
    assert entry["contract"] == {"goalExplicit": True, "acceptanceCriteria": False}


def test_upsert_idempotent_preserves_confirmations_and_created(ledger_dir):
    mgr = GoalManager("sess-gamma")
    mgr.set("第一版目标")
    first = _read_entries(ledger_dir)[0]
    # 人已在治理页确认过（服务端写入确认台账）
    first["confirmations"].append({"at": 123.0, "by": "alice", "note": "方向没变"})
    (ledger_dir / "alignment.json").write_text(
        json.dumps({"entries": [first]}, ensure_ascii=False), encoding="utf-8"
    )
    # 目标改写 + 补契约 → upsert 不覆盖确认历史与 createdAt
    mgr.set("第二版目标", contract=GoalContract(verification="测试全绿"))
    entries = _read_entries(ledger_dir)
    assert len(entries) == 1
    assert entries[0]["goalSummary"] == "第二版目标"
    assert entries[0]["createdAt"] == first["createdAt"]
    assert entries[0]["confirmations"] == [{"at": 123.0, "by": "alice", "note": "方向没变"}]
    assert entries[0]["contract"]["acceptanceCriteria"] is True


def test_set_contract_updates_facts_in_place(ledger_dir):
    mgr = GoalManager("sess-delta")
    mgr.set("目标")
    mgr.set_contract(GoalContract(verification="验收命令绿"))
    entry = _read_entries(ledger_dir)[0]
    assert entry["contract"]["acceptanceCriteria"] is True


def test_off_switch_and_corrupt_ledger_tolerance(ledger_dir, monkeypatch):
    monkeypatch.setenv("HERMES_GOAL_ALIGNMENT_OFF", "1")
    GoalManager("sess-off").set("不该登记")
    assert not (ledger_dir / "alignment.json").exists()
    monkeypatch.delenv("HERMES_GOAL_ALIGNMENT_OFF")
    # 坏档：从空起步不炸
    (ledger_dir / "alignment.json").write_text("{oops", encoding="utf-8")
    GoalManager("sess-corrupt").set("坏档后登记")
    entries = _read_entries(ledger_dir)
    assert [e["goalId"] for e in entries] == ["hermes-goal:sess-corrupt"]


def test_registration_failure_never_breaks_goal_lifecycle(tmp_path, monkeypatch):
    # 目录被文件占位 → 写入必败 → goal 生命周期不受影响
    monkeypatch.setenv("HERMES_GOAL_ALIGNMENT_DIR", str(tmp_path / "blocker"))
    (tmp_path / "blocker").write_text("not a dir", encoding="utf-8")
    mgr = GoalManager("sess-fail")
    state = mgr.set("登记失败也要活下来", contract=GoalContract(verification="v"))
    assert state.goal == "登记失败也要活下来"
