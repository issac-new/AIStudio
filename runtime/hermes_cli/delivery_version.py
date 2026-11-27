"""任务级不可变交付版本：交付清单、内容 checksum 与 supersede 事件。

来源：SoduWork 结果交付支柱的 `ArtifactVersion`（checksum/commit/state + 新版本
作废旧版本）。本仓的单一事实源是 kanban DB：任务、事件、附件、完成门都在这里，
因此版本不另开表，用 append-only 事件表达：

    delivery_version              {versionId, seq, checksum, manifest, createdAt, ...}
    delivery_version_superseded   {versionId, supersededBy, at}

纪律：
- 版本内容不可变：checksum = sha256(canonical({taskId, bodySha256, attachments}))；
  同 checksum 重复创建返回既有版本（幂等），不追加新事件。
- 新版本创建时，先把当前 active 版本标 superseded，再追加新版本；旧验收报告因
  `deliveryVersionId`/`artifactChecksum` 不匹配而自然失效。
- 版本只在 `request_review` 与 `complete_task` 记录；两次记录之间卡片被改动
  （正文或附件）不会产生新版本，由 `current_delivery_checksum` 与版本 checksum 的
  比对识别（独立验收据此拒绝凭旧版本报告完成，见 kanban_db._independent_acceptance）。
- 附件哈希在版本创建时读取持久附件文件计算；文件缺失如实记 `missing=true`，
  sha256=null，不猜内容。
- 调用方必须已经持有 write_txn（与 _append_event 同约定）。

边界：本模块不建新表、不做数据库级不可变；不可变性由「只追加事件 + 内容寻址」
保证。强不可变表结构（触发器/唯一约束）留待后续批。
"""
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Optional

DELIVERY_VERSION_KIND = "delivery_version"
SUPERSEDED_KIND = "delivery_version_superseded"
_CHUNK = 1024 * 1024


def canonical_json(value: Any) -> str:
    """键序稳定的 JSON 序列化（与 evidence 链的 canonicalJson 同哲学）。"""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: str | Path) -> Optional[str]:
    """流式哈希；文件不存在/不可读返回 None（调用方记 missing，不猜）。"""
    h = hashlib.sha256()
    try:
        with open(path, "rb") as fh:
            while True:
                chunk = fh.read(_CHUNK)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def _task_body(conn, task_id: str) -> str:
    row = conn.execute("SELECT body FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return (row["body"] if row is not None else "") or ""


def _attachments(conn, task_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, filename, stored_path, size FROM task_attachments "
        "WHERE task_id = ? ORDER BY id",
        (task_id,),
    ).fetchall()
    out: list[dict[str, Any]] = []
    for row in rows:
        path = row["stored_path"]
        digest = sha256_file(path) if path else None
        out.append({
            "id": row["id"],
            "filename": row["filename"],
            "size": int(row["size"] or 0),
            "sha256": digest,
            "missing": digest is None,
        })
    return out


def delivery_content(task_id: str, body: str, attachments: list[dict[str, Any]]) -> dict[str, Any]:
    """版本内容（checksum 的输入；不含 seq/createdAt 等可变字段）。"""
    return {
        "taskId": task_id,
        "bodySha256": sha256_bytes(body.encode("utf8")),
        "attachments": attachments,
    }


def delivery_checksum(content: dict[str, Any]) -> str:
    return sha256_bytes(canonical_json(content).encode("utf8"))


def version_id_of(checksum: str) -> str:
    return f"dv_{checksum[:16]}"


def _current_content(conn, task_id: str) -> dict[str, Any]:
    """卡片当前内容（正文加附件）；记录版本与过期校验共用这一处算法。"""
    return delivery_content(task_id, _task_body(conn, task_id), _attachments(conn, task_id))


def current_delivery_checksum(conn, task_id: str) -> str:
    """卡片当前内容的校验和。

    与最新交付版本的 checksum 不一致，说明版本记录之后卡片被改动过。
    """
    return delivery_checksum(_current_content(conn, task_id))


def _event_rows(conn, task_id: str) -> list[Any]:
    return conn.execute(
        "SELECT id, kind, payload FROM task_events WHERE task_id = ? "
        "AND kind IN (?, ?) ORDER BY id",
        (task_id, DELIVERY_VERSION_KIND, SUPERSEDED_KIND),
    ).fetchall()


def _payload(row) -> dict[str, Any]:
    try:
        value = json.loads(row["payload"] or "{}")
    except (TypeError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def latest_delivery_version(conn, task_id: str) -> Optional[dict[str, Any]]:
    """当前 active 版本（被 superseded 的版本不算）；没有返回 None。"""
    current: Optional[dict[str, Any]] = None
    for row in _event_rows(conn, task_id):
        payload = _payload(row)
        if row["kind"] == DELIVERY_VERSION_KIND:
            current = payload
        elif row["kind"] == SUPERSEDED_KIND:
            if current is not None and payload.get("versionId") == current.get("versionId"):
                current = None
    return current


def verify_delivery_version(version: dict[str, Any]) -> bool:
    """重算 checksum 与 versionId，判断版本行自身是否自洽。"""
    if not isinstance(version, dict):
        return False
    content = version.get("content")
    checksum = version.get("checksum")
    version_id = version.get("versionId")
    if not isinstance(content, dict) or not isinstance(checksum, str):
        return False
    recomputed = delivery_checksum(content)
    return recomputed == checksum and version_id == version_id_of(checksum)


def _next_seq(conn, task_id: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM task_events WHERE task_id = ? AND kind = ?",
        (task_id, DELIVERY_VERSION_KIND),
    ).fetchone()
    return int(row["n"] if row is not None else 0) + 1


def _append_event(conn, task_id: str, kind: str, payload: dict[str, Any]) -> None:
    """复用 kanban 事件写入（envelope/actor/reason/trace 同源）；延迟导入避免环。"""
    from hermes_cli.kanban_db import _append_event as kb_append_event

    kb_append_event(conn, task_id, kind, payload)


def record_delivery_version(
    conn, task_id: str, *, source: str, created_by: Optional[str] = None,
) -> dict[str, Any]:
    """在调用方事务内记录一个交付版本；同 checksum 幂等返回既有版本。

    返回完整版本 dict（含 versionId/checksum/content/manifest/seq 等）。
    """
    content = _current_content(conn, task_id)
    checksum = delivery_checksum(content)
    current = latest_delivery_version(conn, task_id)
    if current is not None and current.get("checksum") == checksum:
        return current

    version_id = version_id_of(checksum)
    now = int(time.time())
    if current is not None:
        _append_event(conn, task_id, SUPERSEDED_KIND, {
            "versionId": current.get("versionId"),
            "supersededBy": version_id,
            "at": now,
        })
    version = {
        "versionId": version_id,
        "seq": _next_seq(conn, task_id),
        "checksum": checksum,
        "content": content,
        "source": source,
        "createdAt": now,
        "createdBy": created_by,
    }
    _append_event(conn, task_id, DELIVERY_VERSION_KIND, version)
    return version
