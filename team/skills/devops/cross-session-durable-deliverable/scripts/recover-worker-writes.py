#!/usr/bin/env python3
"""从 assignee profile 的 state.db 恢复被误删的 worker 交付物。

场景：done 卡的 git worktree 已被 `git worktree remove --force` 摘除，卡上
`artifacts` 声明的交付物全是未提交/未追踪文件，随目录一并消失——git 恢复不了。

原理：worker 每一次 write_file 的完整 content 都留在该 profile 的会话库里
（state.db → messages.tool_calls 的 JSON，按 session_id 归集），与 worktree
是否存活无关。按原路径重放即可逐字节还原。

用法：
    # 不知道 session_id 时先摸底（哪个会话写过哪些路径）
    python3 recover-worker-writes.py --profile data-flink --list-sessions

    # 恢复（--name 可重复，用于只挑回执 artifacts 里那几个文件）
    python3 recover-worker-writes.py --profile data-flink \
        --session 20261014_144002_aeb4ff --dest <恢复根目录> \
        --name RECONCILIATION --name sql/

恢复后必做（缺一不算补完）：卡片附件 + 共享 workspace 持久层 + 冷盘存档。
原 worktree 路径会随下一次摘除一起消失，只落附件区等于没补。
"""
import argparse
import json
import os
import sqlite3
import sys


def connect(profile):
    """profile 可为简名（data-flink）或绝对路径。state.db 可能处于 WAL 模式，
    故用 mode=ro 而非 immutable=1——live writer 下 immutable 读到的是旧快照。"""
    home = (profile if os.path.isdir(profile)
            else os.path.expanduser("~/.hermes/profiles/" + profile))
    db = os.path.join(home, "state.db")
    if not os.path.exists(db):
        sys.exit("找不到 state.db: " + db)
    return sqlite3.connect("file:" + db + "?mode=ro", uri=True)


def iter_write_calls(con, session=None):
    """产出 (session_id, 原始路径, content)。tool_calls 列有两种形态：
    裸 list、含 function.name/arguments 的 dict 包装——两种都要吃下。"""
    if session:
        cur = con.execute(
            "SELECT session_id, tool_calls FROM messages "
            "WHERE session_id=? AND tool_calls IS NOT NULL ORDER BY id", (session,))
    else:
        cur = con.execute(
            "SELECT session_id, tool_calls FROM messages "
            "WHERE tool_calls IS NOT NULL ORDER BY id")
    for sid, raw in cur:
        try:
            calls = json.loads(raw)
        except Exception:
            continue
        if isinstance(calls, dict):
            calls = [calls]
        if not isinstance(calls, list):
            continue
        for call in calls:
            if not isinstance(call, dict):
                continue
            fn = call.get("function") or {}
            name = str(fn.get("name") or call.get("name") or "")
            if "write" not in name.lower():      # write_file / write
                continue
            args = fn.get("arguments", call.get("arguments"))
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    continue
            if not isinstance(args, dict):
                continue
            path = args.get("path") or args.get("file_path")
            content = args.get("content")
            if path and content is not None:
                yield sid, str(path), str(content)


def relpath_under_workspace(orig):
    """算出落盘用的相对路径。worktree 内路径剥掉 `.worktrees/<tid>/` 前缀——
    保留其下的子目录结构（如 sql/01_x.sql），因为回执 artifacts 是按这些相对
    路径声明的，摊平会让调用方对不上号。非 worktree 路径取末两级，避免把
    /Volumes/... 这类外部绝对路径整体重建进恢复目录。"""
    parts = orig.split("/")
    if ".worktrees" in parts:
        i = parts.index(".worktrees")
        rest = parts[i + 2:]          # 跳过 .worktrees 与 <tid>
        if rest:
            return "/".join(rest)
    return "/".join(parts[-2:]) if len(parts) > 1 else parts[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", required=True, help="assignee profile 名或绝对路径")
    ap.add_argument("--session", help="会话 ID；省略则恢复全部会话")
    ap.add_argument("--dest", help="恢复根目录；与 --list-sessions 互斥")
    ap.add_argument("--name", action="append", default=[],
                    help="只恢复路径含该子串的文件（可重复）")
    ap.add_argument("--list-sessions", action="store_true", help="只列会话与写过的路径")
    a = ap.parse_args()

    con = connect(a.profile)
    if a.list_sessions:
        per = {}
        for sid, path, _ in iter_write_calls(con, a.session):
            per.setdefault(sid, set()).add(path)
        for sid, paths in sorted(per.items()):
            print(sid + "  (%d files)" % len(paths))
            for p in sorted(paths)[:20]:
                print("    " + p)
        return 0

    if not a.dest:
        ap.error("需要 --dest（或先用 --list-sessions 摸底）")
    os.makedirs(a.dest, exist_ok=True)

    written = {}
    for sid, orig, content in iter_write_calls(con, a.session):
        if a.name and not any(n in orig for n in a.name):
            continue
        dest = os.path.join(a.dest, relpath_under_workspace(orig))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "w") as f:
            f.write(content)
        written[dest] = (sid, orig, len(content))   # 同名多版本：保留最后一次写入

    for dest, meta in sorted(written.items()):
        sid, orig, n = meta
        print("  recovered %s  (%d bytes, 原路径 %s)" % (dest, n, orig))
    if not written:
        print("  未匹配到任何写入——检查 --session / --name 过滤条件", file=sys.stderr)
        return 1
    print("\n共恢复 %d 个文件到 %s" % (len(written), a.dest))
    print("下一步必做：卡片附件 + workspace 持久层 + 冷盘存档")
    return 0


if __name__ == "__main__":
    sys.exit(main())