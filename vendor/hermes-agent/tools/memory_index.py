"""记忆 FTS 索引视图（mimo P4 一期：markdown 为源、索引为视图 + reconcile）。

Origin：MiMo-Code memory/service.ts（SQLite FTS5 + BM25 排序、markdown 源不变、
reconcile 增量索引与剪枝），按 hermes 文件型记忆形状重设计（见调研 §3.5 与
mimo P4 分期：二期才上 auto-dream/distill 自动沉淀）。

设计要点（零侵入纪律）：
- **不改 MemoryStore**：索引不挂写路径；``search`` 前先 ``reconcile`` 全量对账
  （条目受字符预算约束、量小，全量 diff 恒廉价且恒正确——索引漂移不可能超过一次查询）。
- 索引落 ``<home>/memories/index.sqlite``；FTS5 虚表 + BM25（mimo 同款排序）。
- 容错：索引库任何故障（路径不可写/表损坏）只影响 search 返回（降级 JSON 错误），
  记忆读写完全不受影响——索引是视图，视图坏了视图自己承担。
"""

from __future__ import annotations

import hashlib
import logging
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS memory_index_meta (
    entry_key TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    updated_at REAL NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(content, target UNINDEXED, entry_key UNINDEXED);
"""


def _entry_key(target: str, content_hash: str) -> str:
    return f"{target}:{content_hash}"


class MemoryFTSIndex:
    def __init__(self, db_path: Optional[Path] = None):
        if db_path is None:
            from hermes_constants import get_hermes_home
            db_path = get_hermes_home() / "memories" / "index.sqlite"
        self.db_path = Path(db_path)
        self._conn: Optional[sqlite3.Connection] = None

    # ── 连接与容错 ──

    def _connection(self) -> Optional[sqlite3.Connection]:
        if self._conn is not None:
            return self._conn
        try:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(str(self.db_path), timeout=5.0)
            conn.executescript(_SCHEMA)
            self._conn = conn
            return conn
        except sqlite3.Error as exc:
            logger.warning("memory-index: open failed (%s) — search degrades", exc)
            return None

    # ── reconcile（markdown 源 → 索引视图）──

    def reconcile(self, targets: Dict[str, List[str]]) -> Dict[str, int]:
        """全量对账：源条目 upsert（哈希变化才重写）、消失条目剪枝。幂等。"""
        conn = self._connection()
        if conn is None:
            return {"indexed": 0, "removed": 0, "degraded": 1}
        wanted: Dict[str, str] = {}
        for target, entries in targets.items():
            for entry in entries or []:
                text = (entry or "").strip()
                if not text:
                    continue
                wanted[_entry_key(target, hashlib.sha256(text.encode("utf-8")).hexdigest())] = (
                    f"{target}\x00{text}"
                )
        try:
            with conn:
                have = {row[0] for row in conn.execute("SELECT entry_key FROM memory_index_meta")}
                for key, blob in wanted.items():
                    if key in have:
                        continue
                    target, text = blob.split("\x00", 1)
                    conn.execute(
                        "INSERT OR REPLACE INTO memory_index_meta (entry_key, target, content, content_hash, updated_at) "
                        "VALUES (?, ?, ?, ?, strftime('%s','now'))",
                        (key, target, text, key.split(":", 1)[1],),
                    )
                    conn.execute("INSERT INTO memory_fts (content, target, entry_key) VALUES (?, ?, ?)", (text, target, key))
                stale = have - set(wanted)
                for key in stale:
                    conn.execute("DELETE FROM memory_index_meta WHERE entry_key = ?", (key,))
                    conn.execute("DELETE FROM memory_fts WHERE entry_key = ?", (key,))
            return {"indexed": len(wanted), "removed": len(stale), "degraded": 0}
        except sqlite3.Error as exc:
            logger.warning("memory-index: reconcile failed (%s)", exc)
            return {"indexed": 0, "removed": 0, "degraded": 1}

    # ── search（BM25）──

    def search(self, query: str, *, target: Optional[str] = None, limit: int = 8) -> List[Dict[str, object]]:
        """FTS5 MATCH + bm25 排序（越小越相关）；query 经最小转义（短语按原样）。

        中文兜底：FTS5 默认 unicode61 分词器不切 CJK（连续汉字=单 token），含 CJK
        的查询 FTS 未命中时退 LIKE 子串扫（存储/过滤仍走索引，排序退化为时间序）。
        """
        conn = self._connection()
        if conn is None or not (query or "").strip():
            return []
        match = '"' + query.strip().replace('"', '""') + '"'
        sql = (
            "SELECT f.target, m.content, bm25(memory_fts) AS rank "
            "FROM memory_fts f JOIN memory_index_meta m ON m.entry_key = f.entry_key "
            "WHERE memory_fts MATCH ? "
        )
        params: List[object] = [match]
        if target:
            sql += " AND f.target = ?"
            params.append(target)
        sql += " ORDER BY rank LIMIT ?"
        params.append(int(limit))
        try:
            rows = conn.execute(sql, params).fetchall()
        except sqlite3.Error as exc:
            logger.warning("memory-index: search failed (%s)", exc)
            return []
        if rows:
            return [{"target": r[0], "entry": r[1], "rank": r[2]} for r in rows]
        if any("\u4e00" <= ch <= "\u9fff" for ch in query):
            return self._like_fallback(query.strip(), target=target, limit=limit)
        return []

    def _like_fallback(self, needle: str, *, target: Optional[str], limit: int) -> List[Dict[str, object]]:
        conn = self._conn
        assert conn is not None
        sql = "SELECT target, content, updated_at FROM memory_index_meta WHERE content LIKE ?"
        params: List[object] = [f"%{needle}%"]
        if target:
            sql += " AND target = ?"
            params.append(target)
        sql += " ORDER BY updated_at DESC LIMIT ?"
        params.append(int(limit))
        try:
            rows = conn.execute(sql, params).fetchall()
        except sqlite3.Error:
            return []
        return [{"target": r[0], "entry": r[1], "rank": None} for r in rows]

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except sqlite3.Error:
                pass
            self._conn = None
