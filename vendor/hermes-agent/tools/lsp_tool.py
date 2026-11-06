"""Agent-callable LSP navigation tool (read-only, five operations).

P2 of the 2026-09-24 MiMo-Code research absorption
(docs/superpowers/specs/2026-09-24-mimo-code-coding-tools-research.md):
MiMo-Code ships a 91-line ``lsp`` tool with nine operations; hermes already had
the stronger substrate (real language-server subprocesses per (server, root),
multi-root pyright, write-post diagnostics) but nothing the model could call.
This exposes the five READ-ONLY operations first — hover / definition /
references / document_symbol / workspace_symbol — deliberately omitting the
mutating ones (rename, call-hierarchy edits): writes stay on write_file/patch.

Failure mode is descriptive, never raising: the model learns WHY there is no
answer (disabled vs. unsupported file type vs. server error) instead of an
opaque empty result.

Path safety mirrors read_file (tools/file_tools.py): the NT/device-namespace
guard runs on the RAW model-supplied string first (merely resolving
``\\?\\UNC\\host\\share`` already triggers outbound SMB auth — an NTLM
credential leak), then the path is resolved against the task workspace and
passed through the Hermes read denylist (credential stores, ``.env``, ...).
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional
from urllib.parse import unquote, urlparse

from agent.file_safety import get_nt_namespace_error, get_read_block_error
from tools.file_tools_paths import _resolve_path_for_task
from tools.registry import registry

logger = logging.getLogger("tools.lsp")

_MAX_LOCATIONS = 50
_MAX_HOVER_CHARS = 4000
_MAX_SYMBOLS = 200

# file:///C:/x 的 path 是 "/C:/x"：file_uri（agent/lsp/client.py）生成的 Windows
# 盘符形态多一个前导斜杠，输出前剥掉还原成 "C:/x"。
_WINDOWS_DRIVE_PREFIX = re.compile(r"^/([A-Za-z]:)")


def _uri_to_path(uri: str) -> str:
    """LSP URI → 显示路径：URL 解码（%20/中文等）并还原 Windows 盘符前导斜杠。"""
    if not uri.startswith("file://"):
        return uri
    path = unquote(urlparse(uri).path)
    return _WINDOWS_DRIVE_PREFIX.sub(r"\1", path)


def _fmt_location(loc: Dict[str, Any]) -> str:
    path = _uri_to_path(str(loc.get("uri") or ""))
    rng = loc.get("range") or {}
    start = (rng.get("start") or {})
    line = int(start.get("line", 0)) + 1
    end = (rng.get("end") or {})
    end_line = int(end.get("line", 0)) + 1
    col = int(start.get("character", 0)) + 1
    if end_line != line:
        return f"{path}:{line}-{end_line} (col {col})"
    return f"{path}:{line} (col {col})"


def _normalize_locations(raw: Any) -> List[str]:
    """definition/references return Location | Location[] | LocationLink[]."""
    if raw is None:
        return []
    items = raw if isinstance(raw, list) else [raw]
    out: List[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        # LocationLink（client 声明 linkSupport:true）字段是 targetUri/targetRange，
        # 没有 "uri" —— 原先的恒真式取 item["uri"] 会得到 None，输出 ":1 (col 1)"。
        if "uri" in item:
            loc = item
        else:
            loc = {"uri": item.get("targetUri"),
                   "range": item.get("targetRange") or item.get("targetSelectionRange")}
        out.append(_fmt_location(loc))
    return out[:_MAX_LOCATIONS]


def _normalize_hover(raw: Any) -> str:
    if not isinstance(raw, dict):
        return ""
    contents = raw.get("contents")
    if isinstance(contents, dict):
        value = contents.get("value")
        if value is not None:
            return str(value)[:_MAX_HOVER_CHARS]
    if isinstance(contents, list):
        parts = []
        for c in contents:
            if isinstance(c, dict) and c.get("value") is not None:
                parts.append(str(c["value"]))
            elif isinstance(c, str):
                parts.append(c)
        return "\n".join(parts)[:_MAX_HOVER_CHARS]
    return str(contents or "")[:_MAX_HOVER_CHARS]


def _normalize_symbols(raw: Any) -> List[str]:
    """documentSymbol returns DocumentSymbol[] (hierarchical) or SymbolInformation[]."""
    if raw is None:
        return []
    items = raw if isinstance(raw, list) else [raw]
    out: List[str] = []

    def _walk(node: Dict[str, Any], depth: int) -> None:
        if len(out) >= _MAX_SYMBOLS or not isinstance(node, dict):
            return
        name = node.get("name")
        if name:
            kind = node.get("kind")
            detail = node.get("detail")
            line = ""
            rng = node.get("range") or (node.get("location") or {}).get("range") or {}
            start = (rng.get("start") or {})
            if start.get("line") is not None:
                line = f":{int(start['line']) + 1}"
            suffix = f" — {detail}" if detail else ""
            out.append(f"{'  ' * depth}{kind} {name}{line}{suffix}")
        for child in node.get("children") or []:
            _walk(child, depth + 1)

    for item in items:
        if isinstance(item, dict) and "name" in item:
            _walk(item, 0)
        else:
            out.append(str(item))
    return out[:_MAX_SYMBOLS]


def _active_service():
    """The profile's LSPService, or None (disabled / import failure)."""
    try:
        from agent.lsp import get_service
        return get_service()
    except Exception:  # noqa: BLE001
        return None


def lsp_navigate(
    operation: str = "",
    file_path: str = "",
    line: Optional[int] = None,
    character: Optional[int] = None,
    query: str = "",
    task_id: str = "default",
    **_kwargs: Any,
) -> str:
    """Handle one ``lsp`` tool call; always returns a string for the model."""
    op = str(operation or "").strip()
    path = str(file_path or "").strip()
    if not path:
        return json.dumps({"ok": False, "error": "file_path is required"})
    # 与 read_file 同序：NT 命名空间守卫跑在 RAW 字符串上（任何解析都会触发
    # NTLM 凭据泄露），随后按 task 工作区解析，再过 Hermes 读拒绝清单。
    nt_err = get_nt_namespace_error(path, verb="Read")
    if nt_err:
        return json.dumps({"ok": False, "error": nt_err})
    resolved = _resolve_path_for_task(path, task_id)
    block_error = get_read_block_error(str(resolved))
    if block_error:
        return json.dumps({"ok": False, "error": block_error})
    if not os.path.isfile(str(resolved)):
        return json.dumps({"ok": False, "error": f"file not found: {path}"})

    svc = _active_service()
    if svc is None:
        return json.dumps({
            "ok": False,
            "error": "LSP is not active for this profile (enable via config `lsp` section or `hermes lsp install`)",
        })

    verdict = svc.navigation_sync(
        str(resolved), op,
        line=line, character=character, query=query or None,
    )
    if not verdict.get("ok"):
        return json.dumps(verdict)

    raw = verdict.get("result")
    op = verdict.get("operation", op)
    if op in ("definition", "references"):
        locations = _normalize_locations(raw)
        body = {"ok": True, "operation": op, "server": verdict.get("server"),
                "count": len(locations), "locations": locations}
    elif op == "hover":
        body = {"ok": True, "operation": op, "server": verdict.get("server"),
                "hover": _normalize_hover(raw) or "(no hover information at this position)"}
    else:  # document_symbol / workspace_symbol
        symbols = _normalize_symbols(raw)
        body = {"ok": True, "operation": op, "server": verdict.get("server"),
                "count": len(symbols), "symbols": symbols}
    if body.get("count") == 0 and "hover" not in body:
        body["note"] = "no matches (position may be whitespace, or the symbol is not indexed)"
    return json.dumps(body, ensure_ascii=False)


LSP_SCHEMA = {
    "name": "lsp",
    "description": (
        "Language-server code intelligence for the open workspace: `hover` "
        "(type/doc info at a position), `definition` (where a symbol is "
        "defined), `references` (all reference sites), `document_symbol` "
        "(symbol tree of one file), `workspace_symbol` (search symbols across "
        "the workspace by name). Lines/characters are 1-based, as shown by "
        "read_file. Precise where search_files is lexical: use it to resolve "
        "imports, jump to definitions, or enumerate call sites. Read-only; "
        "edits go through write_file/patch."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "operation": {
                "type": "string",
                "enum": ["hover", "definition", "references", "document_symbol", "workspace_symbol"],
                "description": "Which code-intelligence query to run.",
            },
            "file_path": {
                "type": "string",
                "description": "Absolute or workspace-relative file path. For workspace_symbol, any file in the workspace fixes the server.",
            },
            "line": {"type": "integer", "minimum": 1, "description": "1-based line (hover/definition/references)."},
            "character": {"type": "integer", "minimum": 1, "description": "1-based column (hover/definition/references)."},
            "query": {"type": "string", "description": "Symbol-name query (workspace_symbol)."},
        },
        "required": ["operation", "file_path"],
    },
}


def _handle_lsp(args: Dict[str, Any], **kw: Any) -> str:
    """Registry handler: 把 task_id 传进解析链（schema 允许工作区相对路径，
    按进程 cwd 解析会与 read_file 的 _resolve_path_for_task 不一致）。"""
    return lsp_navigate(
        operation=args.get("operation") or "",
        file_path=args.get("file_path") or "",
        line=args.get("line"),
        character=args.get("character"),
        query=args.get("query") or "",
        task_id=kw.get("task_id") or "default",
    )


registry.register(
    name="lsp",
    toolset="file",
    schema=LSP_SCHEMA,
    handler=_handle_lsp,
    emoji="🧭",
)
