"""记忆自动沉淀 v1 守门（mimo P4 二期：规则式 distill——同文副本合一/容量剪枝/报告；
W1 落盘守卫、W2 精确判重、W3 无人值守不静默删除）。"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from tools.memory_consolidate import apply_distill, distill_pass  # noqa: E402
from tools.memory_tool_store import ENTRY_DELIMITER, MemoryStore  # noqa: E402


def _seed(tmp_path, monkeypatch, entries, *, memory_char_limit=2000):
    """把条目写进真实记忆文件再加载——沉淀读盘面原始条目，测试必须走盘。"""
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    store = MemoryStore(memory_char_limit=memory_char_limit)
    path = store._path_for("memory")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(ENTRY_DELIMITER.join(entries), encoding="utf-8")
    store.load_from_disk()
    return store


def _disk_entries(store):
    return store._read_file(store._path_for("memory"))


class TestDistill:
    def test_exact_dup_collapses_near_dup_kept(self, tmp_path, monkeypatch):
        """W2 守门：判重键=精确匹配；仅大小写/空白不同的条目不是重复，只进报告不删。"""
        store = _seed(tmp_path, monkeypatch, [
            "/tmp/Report.md 位置", "/tmp/report.md 位置",        # 仅大小写不同 → 均保留
            "登录页 token  持久化方案", "登录页 token 持久化方案",  # 仅空白不同 → 均保留
            "精确重复条目", "精确重复条目",                      # 精确重复 → 合一
        ])
        report = distill_pass(store)
        apply_distill(store, report)
        assert report.merged == 1
        entries = _disk_entries(store)
        assert "/tmp/Report.md 位置" in entries and "/tmp/report.md 位置" in entries
        assert "登录页 token  持久化方案" in entries and "登录页 token 持久化方案" in entries
        assert entries.count("精确重复条目") == 1
        assert any("疑似重复" in d for d in report.detail)  # 疑似只报告，绝不落盘删除

    def test_capacity_prune_oldest_first_only_when_over_line(self, tmp_path, monkeypatch):
        store = _seed(tmp_path, monkeypatch, ["x" * 30, "y" * 30, "z" * 30], memory_char_limit=100)
        report = distill_pass(store)
        apply_distill(store, report)
        assert report.pruned == 0 and _disk_entries(store) == ["x" * 30, "y" * 30, "z" * 30]
        store = _seed(tmp_path, monkeypatch, ["x" * 40, "y" * 40, "z" * 40], memory_char_limit=100)
        report = distill_pass(store)
        apply_distill(store, report)
        assert report.pruned == 1 and _disk_entries(store) == ["y" * 40, "z" * 40]  # 剪最旧

    def test_external_entry_survives_consolidate(self, tmp_path, monkeypatch):
        """W1 守门：外部进程追加的条目不在删除计划内，consolidate 落盘必须保留。"""
        from tools import memory_tool as mt
        store = _seed(tmp_path, monkeypatch, ["旧条目一", "旧条目一", "旧条目二"])
        path = store._path_for("memory")
        path.write_text(path.read_text(encoding="utf-8") + ENTRY_DELIMITER + "外部进程追加的条目",
                        encoding="utf-8")  # 外部进程手工追加（§ 分隔，可回环）
        out = json.loads(mt.memory_tool("consolidate", store=store))
        assert out["success"] is True and out["applied"] is True
        entries = _disk_entries(store)
        assert "外部进程追加的条目" in entries
        assert entries.count("旧条目一") == 1 and "旧条目二" in entries

    def test_external_drift_writes_backup_and_aborts(self, tmp_path, monkeypatch):
        """W1 守门：外部漂移（超整面上限的自由文本）→ 上游漂移守卫写 .bak 并中止，不覆写。"""
        store = _seed(tmp_path, monkeypatch, ["旧条目一", "旧条目一"])
        path = store._path_for("memory")
        path.write_text(path.read_text(encoding="utf-8") + ENTRY_DELIMITER + "w" * 2200,
                        encoding="utf-8")  # 外部超长自由文本 → 不可回环 → 漂移
        report = distill_pass(store)
        apply_distill(store, report)
        assert list(path.parent.glob("MEMORY.md.bak.*"))  # .bak 已存
        assert any("落盘中止" in d for d in report.detail)
        assert any("w" * 2200 in e for e in _disk_entries(store))  # 外部内容原样保留

    def test_unattended_no_silent_merge(self, tmp_path, monkeypatch):
        """W3 守门：无人值守 consolidate 只出报告不落盘，同文副本一条不少。"""
        from tools import memory_tool as mt
        from tools.skill_provenance import reset_current_write_origin, set_current_write_origin
        store = _seed(tmp_path, monkeypatch, ["重复条目", "重复条目", "普通条目"])
        tok = set_current_write_origin("background_review")
        try:
            out = json.loads(mt.memory_tool("consolidate", store=store))
        finally:
            reset_current_write_origin(tok)
        assert out["applied"] is False and out["dry_run"] is True
        assert out["merged"] == 1  # 报告如实告知拟合一
        assert _disk_entries(store) == ["重复条目", "重复条目", "普通条目"]  # 未静默删除

    def test_unattended_no_silent_prune(self, tmp_path, monkeypatch):
        """W3 守门：无人值守容量剪枝同样只出报告不落盘。"""
        from tools import memory_tool as mt
        from tools.skill_provenance import reset_current_write_origin, set_current_write_origin
        store = _seed(tmp_path, monkeypatch, ["x" * 40, "y" * 40, "z" * 40], memory_char_limit=100)
        tok = set_current_write_origin("background_review")
        try:
            out = json.loads(mt.memory_tool("consolidate", store=store))
        finally:
            reset_current_write_origin(tok)
        assert out["pruned"] == 1 and out["applied"] is False  # 报告拟剪 1 条
        assert _disk_entries(store) == ["x" * 40, "y" * 40, "z" * 40]  # 未静默删除

    def test_report_and_action_surface(self, tmp_path, monkeypatch):
        from tools import memory_tool as mt
        store = _seed(tmp_path, monkeypatch, ["a", "a", "b"])
        out = json.loads(mt.memory_tool("consolidate", store=store))
        assert out["success"] is True and out["merged"] == 1
        assert out["entries_after"] == 2 and out["applied"] is True
        unknown = json.loads(mt.memory_tool("explode", store=store))
        assert "consolidate" in unknown.get("error", "")
