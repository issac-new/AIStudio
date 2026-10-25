"""记忆 FTS 索引守门（mimo P4 一期：markdown 源/索引视图/reconcile/BM25）。"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

_WORKTREE = Path(__file__).resolve().parents[2]
if str(_WORKTREE) not in sys.path:
    sys.path.insert(0, str(_WORKTREE))

from tools.memory_index import MemoryFTSIndex  # noqa: E402


class TestReconcile:
    def test_upsert_prune_idempotent(self, tmp_path):
        idx = MemoryFTSIndex(tmp_path / "index.sqlite")
        r1 = idx.reconcile({"memory": ["登录页 token 持久化方案", "编译参数缓存命中优化"], "user": ["偏好中文回复"]})
        assert r1 == {"indexed": 3, "removed": 0, "degraded": 0}
        # 幂等：同源再对账零变化。
        r2 = idx.reconcile({"memory": ["登录页 token 持久化方案", "编译参数缓存命中优化"], "user": ["偏好中文回复"]})
        assert r2["indexed"] == 3 and r2["removed"] == 0
        # 剪枝：源删一条后索引删一条。
        r3 = idx.reconcile({"memory": ["登录页 token 持久化方案"], "user": []})
        assert r3 == {"indexed": 1, "removed": 2, "degraded": 0}
        assert [r["entry"] for r in idx.search("token")] and not idx.search("偏好")
        idx.close()

    def test_content_change_reindexes(self, tmp_path):
        idx = MemoryFTSIndex(tmp_path / "index.sqlite")
        idx.reconcile({"memory": ["旧内容 alpha"]})
        idx.reconcile({"memory": ["新内容 beta"]})
        assert idx.search("beta") and not idx.search("alpha")
        idx.close()


class TestSearch:
    def test_bm25_ranking_and_target_filter(self, tmp_path):
        idx = MemoryFTSIndex(tmp_path / "index.sqlite")
        idx.reconcile({
            "memory": ["登录页 token 持久化方案详解", "编译参数缓存命中优化"],
            "user": ["用户偏好 token 免密"],
        })
        hits = idx.search("token")
        assert len(hits) == 2
        # BM25：命中词密度更高的条目排前（详解条 vs 偏好条按词频不可断言顺序，但两桶都在）。
        assert {h["target"] for h in hits} == {"memory", "user"}
        only_user = idx.search("token", target="user")
        assert len(only_user) == 1 and only_user[0]["target"] == "user"
        # 中文分词按 FTS5 unicode61 整串/子串匹配口径——查询词命中含该词的条目。
        assert len(idx.search("缓存命中")) == 1
        idx.close()

    def test_empty_query_no_rows(self, tmp_path):
        idx = MemoryFTSIndex(tmp_path / "index.sqlite")
        idx.reconcile({"memory": ["x"]})
        assert idx.search("   ") == []
        idx.close()


class TestDegradation:
    def test_bad_path_degrades_not_raises(self, tmp_path):
        # 目录占位成文件 → 打不开 → reconcile/search 降级而非抛错（记忆读写不受影响）。
        blocker = tmp_path / "index.sqlite"
        blocker.write_text("not a dir will block? no this IS the file", encoding="utf-8")
        idx = MemoryFTSIndex(blocker)
        assert idx.reconcile({"memory": ["a"]})["degraded"] == 1
        assert idx.search("a") == []

    def test_memory_tool_search_action(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_HOME", str(tmp_path))
        from tools import memory_tool as mt
        from tools.memory_tool_store import MemoryStore
        store = MemoryStore()
        store.memory_entries = ["登录页 token 持久化方案", "编译缓存命中优化"]
        store.user_entries = ["偏好中文"]
        out = json.loads(mt.memory_tool("search", target="memory", content="token", store=store))
        assert out["success"] is True and out["count"] == 1
        assert "token" in out["results"][0]["entry"]
        # 未检索桶不串。
        assert all(r["target"] == "memory" for r in out["results"])
        # 空查询走错误 JSON 不炸。
        bad = json.loads(mt.memory_tool("search", target="memory", content="  ", store=store))
        assert bad["success"] is False
        # 未知动作报错面更新。
        unknown = json.loads(mt.memory_tool("explode", store=store))
        assert "search" in unknown.get("error", "")
