#!/usr/bin/env python3
"""workspace_audit.py — 工作区快照 diff 机械防伪（LongHorizon-Harness 融合）.

来源算法：lh_harness/adapters/claude_permissions.py:120-195（workspace_snapshot_diff）。
用途：审查 worker 在【只读审计】前后各拍一次快照，diff 非空 = 审计者篡改了工作区
→ integrity violation，该审计报告不能支撑任何 completed 记录。

用法：
  # 拍快照（审计开始前）
  workspace_audit.py snapshot --root <工作区> --out /tmp/ws_before.json
  # 审计结束后 diff
  workspace_audit.py diff --before /tmp/ws_before.json --root <工作区>
  # 输出 JSON：{"mutation_detected": bool, "mutations": {added/changed/deleted/type_changed}, ...}
  # exit code: 0=clean, 1=mutation detected, 2=usage/error

排除：--exclude 可多次指定（默认 .git, node_modules, __pycache__, .lh-harness）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# 大于此阈值的文件只记录 size+mtime，不读内容做 digest（对齐 LHH _small_file_digest 语义）
_MAX_DIGEST_BYTES = 8 * 1024 * 1024
_CHUNK = 1 << 20
_MAX_ERRORS = 100


@dataclass(frozen=True)
class Snapshot:
    records: dict[str, tuple]
    errors: tuple


def _small_file_digest(path: Path, size: int) -> str:
    if size > _MAX_DIGEST_BYTES:
        return f"size-only:{size}"
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(_CHUNK)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def snapshot(root: Path, excludes: set[Path]) -> Snapshot:
    """全量扫描 root：文件记 (type, mode, size, mtime_ns, digest)，目录记 (type, mode, mtime_ns)，symlink 记 readlink 目标。"""
    records: dict[str, tuple] = {}
    errors: list[str] = []
    stack = [root]
    while stack:
        directory = stack.pop()
        try:
            entries = list(os.scandir(directory))
        except OSError as exc:
            errors.append(f"{directory}: {type(exc).__name__}: {exc}")
            continue
        for entry in entries:
            path = Path(entry.path)
            if path in excludes:
                continue
            try:
                relative = path.relative_to(root).as_posix()
                stat = entry.stat(follow_symlinks=False)
                if entry.is_symlink():
                    records[relative] = ("symlink", stat.st_mode, stat.st_mtime_ns, os.readlink(path))
                elif entry.is_dir(follow_symlinks=False):
                    records[relative] = ("dir", stat.st_mode, stat.st_mtime_ns)
                    stack.append(path)
                elif entry.is_file(follow_symlinks=False):
                    digest = _small_file_digest(path, stat.st_size)
                    records[relative] = ("file", stat.st_mode, stat.st_size, stat.st_mtime_ns, digest)
                else:
                    records[relative] = ("other", stat.st_mode, stat.st_size, stat.st_mtime_ns)
            except OSError as exc:
                errors.append(f"{path}: {type(exc).__name__}: {exc}")
    return Snapshot(records=records, errors=tuple(errors[:_MAX_ERRORS]))


def diff(before: Snapshot, after: Snapshot) -> dict[str, Any]:
    """added/deleted/changed/type_changed 四类，任一非空 = mutation_detected。"""
    before_paths = set(before.records)
    after_paths = set(after.records)
    added = sorted(after_paths - before_paths)
    deleted = sorted(before_paths - after_paths)
    changed: list[str] = []
    type_changed: list[str] = []
    for path in sorted(before_paths & after_paths):
        old = before.records[path]
        new = after.records[path]
        if old == new:
            continue
        if old and new and old[0] != new[0]:
            type_changed.append(path)
        else:
            changed.append(path)
    return {
        "workspace_guard": True,
        "mutation_detected": bool(added or deleted or changed or type_changed),
        "mutations": {
            "added": added,
            "changed": changed,
            "deleted": deleted,
            "type_changed": type_changed,
        },
        "counts": {
            "added": len(added),
            "changed": len(changed),
            "deleted": len(deleted),
            "type_changed": len(type_changed),
        },
        "snapshot_errors": list(after.errors or before.errors),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="工作区快照 diff 机械防伪（审计只读校验）")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_snap = sub.add_parser("snapshot", help="拍快照到 JSON 文件")
    p_snap.add_argument("--root", required=True, help="被审计的工作区根目录")
    p_snap.add_argument("--out", required=True, help="快照 JSON 输出路径")
    p_snap.add_argument("--exclude", action="append", default=[".git", "node_modules", "__pycache__", ".lh-harness"],
                        help="排除的目录名（可多次）")

    p_diff = sub.add_parser("diff", help="对照 before 快照 diff 当前工作区")
    p_diff.add_argument("--before", required=True, help="之前拍的快照 JSON 路径")
    p_diff.add_argument("--root", required=True, help="被审计的工作区根目录")
    p_diff.add_argument("--exclude", action="append", default=[".git", "node_modules", "__pycache__", ".lh-harness"],
                        help="排除的目录名（可多次，须与 snapshot 一致）")

    args = parser.parse_args(argv)

    try:
        if args.cmd == "snapshot":
            root = Path(args.root).expanduser().resolve(strict=True)
            excludes = {root / name for name in args.exclude}
            snap = snapshot(root, excludes)
            payload = {"root": str(root), "exclude": args.exclude, "records": {k: list(v) for k, v in snap.records.items()}, "errors": list(snap.errors)}
            Path(args.out).expanduser().parent.mkdir(parents=True, exist_ok=True)
            Path(args.out).expanduser().write_text(json.dumps(payload, ensure_ascii=False))
            print(f"snapshot: {len(snap.records)} records, {len(snap.errors)} errors -> {args.out}")
            return 0

        # diff
        before_path = Path(args.before).expanduser()
        payload = json.loads(before_path.read_text())
        root = Path(args.root).expanduser().resolve(strict=True)
        if payload.get("root") != str(root):
            print(f"WARN: root mismatch before={payload.get('root')} now={root}", file=sys.stderr)
        before_records = {k: tuple(v) for k, v in payload["records"].items()}
        excludes = {root / name for name in args.exclude}
        after = snapshot(root, excludes)
        result = diff(Snapshot(records=before_records, errors=tuple(payload.get("errors", []))), after)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if result["mutation_detected"] else 0
    except (OSError, KeyError, ValueError, json.JSONDecodeError) as exc:
        # 运行错误（路径不存在/快照损坏等）exit 2，绝不与"检出篡改"的 exit 1 混淆
        print(f"error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
