"""``obs_recall`` — paged recall of archived tool observations (SoL-Pi ObservationPack parity).

The spillover layer (``tools/tool_result_storage.py``) archives oversized tool results and
leaves the model a handle + excerpt. Recall used to require ``read_file`` with the archive
PATH — which the model loses under context pressure exactly when it needs the data, and
which bypasses none of read_file's own guards when it guesses wrong. ``obs_recall`` keys on
the ``tool_result`` id the model already has (every assistant tool_call carries it):

* ``ref`` = tool_call_id (``toolu_...`` / ``toolu_xxx_part0`` budget spills) OR an archive
  path exactly as printed inside a ``<persisted-output>`` block;
* confinement: id-derived lookups resolve inside the canonical spillover dir only; path
  refs must resolve INSIDE the spillover dir or a sandbox ``hermes-results`` temp dir —
  this is a recall tool, not a second ``read_file`` with line numbers, so read_file's
  device/proc deny lists must not be bypassable through it;
* output is line-numbered and paginated like ``read_file`` (``LINE|CONTENT``), with
  ``next_offset`` continuation.
"""

import logging
import os

from tools.registry import registry, tool_error, tool_result
from tools.tool_result_storage import _safe_result_filename, get_spillover_dir

logger = logging.getLogger(__name__)

_MAX_RECALL_LIMIT = 500
_DEFAULT_RECALL_LIMIT = 200
_MAX_ARCHIVE_CHARS = 4_000_000  # 4 MB hard read ceiling; larger archives page anyway
_SANDBOX_RESULT_DIRNAME = "hermes-results"


def _expand(ref: str) -> str:
    return os.path.abspath(os.path.expanduser(str(ref or "")))


def _inside_dir(path: str, directory) -> bool:
    try:
        return os.path.commonpath([os.path.realpath(path), str(directory)]) == str(directory)
    except ValueError:
        return False


def resolve_archive_ref(ref: str, env=None) -> str | None:
    """Ref → archive path, or None when it cannot be recalled safely.

    Order: (1) verbatim path (only when confined to the spillover dir or a sandbox
    ``hermes-results`` temp dir); (2) spillover file named after the ref id.
    """
    if not ref or not str(ref).strip():
        return None
    raw = str(ref).strip()
    spill_dir = get_spillover_dir()
    candidate = _expand(raw)
    if os.path.isfile(candidate) and (_inside_dir(candidate, spill_dir) or
                                      os.path.basename(os.path.dirname(candidate)) == _SANDBOX_RESULT_DIRNAME):
        return candidate
    by_id = spill_dir / _safe_result_filename(raw)
    if by_id.is_file():
        return str(by_id)
    return None


def _recall_observation(ref: str, offset: int = 1, limit: int = _DEFAULT_RECALL_LIMIT,
                        env=None) -> str:
    from tools.efficiency_ledger import record_efficiency_event

    path = resolve_archive_ref(ref, env)
    if path is None:
        return tool_error(
            f"obs_recall: no archived observation for ref {ref!r}. Refs are the tool_call_id "
            "of the original call or the path inside a <persisted-output> block; archives "
            "live ~24h (spillover pruning). Re-run the tool if the archive expired.")
    try:
        size = os.path.getsize(path)
        if size > _MAX_ARCHIVE_CHARS:
            return tool_error(
                f"obs_recall: archive {os.path.basename(path)} is {size:,} bytes (over the "
                f"{_MAX_ARCHIVE_CHARS:,} read ceiling). Page it with read_file on the same path.")
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            lines = fh.read().split("\n")
    except OSError as exc:
        return tool_error(f"obs_recall: cannot read archive {os.path.basename(path)}: {exc}")

    if lines and lines[-1] == "":
        lines.pop()
    total = len(lines)
    offset = max(1, int(offset or 1))
    limit = max(1, min(int(limit or _DEFAULT_RECALL_LIMIT), _MAX_RECALL_LIMIT))
    start_idx = min(offset - 1, total)
    end_idx = min(start_idx + limit, total)
    numbered = "\n".join(
        f"{lineno}|{lines[lineno - 1]}" for lineno in range(start_idx + 1, end_idx + 1))
    truncated = end_idx < total
    payload = {
        "archive": path,
        "offset": start_idx + 1,
        "limit": limit,
        "total_lines": total,
        "content": numbered,
        "truncated": truncated,
    }
    if truncated:
        payload["next_offset"] = end_idx + 1
        payload["hint"] = f"Showing lines {start_idx + 1}-{end_idx} of {total}. Use offset={end_idx + 1} to continue."
    record_efficiency_event("obs_recall", ref=str(ref), lines=min(limit, max(0, end_idx - start_idx)),
                            archive=os.path.basename(path))
    return tool_result(payload)


def _handle_obs_recall(args, **kw):
    ref = args.get("ref", "")
    if not isinstance(ref, str) or not ref.strip():
        return tool_error("obs_recall: 'ref' is required — the tool_call_id of the archived "
                          "result or the path from its <persisted-output> block.")
    env = None
    try:
        from tools.terminal_tool_lifecycle import get_active_env
        env = get_active_env(kw.get("task_id") or "default")
    except Exception:
        env = None
    return _recall_observation(
        ref=ref, offset=int(args.get("offset", 1) or 1),
        limit=int(args.get("limit", _DEFAULT_RECALL_LIMIT) or _DEFAULT_RECALL_LIMIT), env=env)


OBS_RECALL_SCHEMA = {
    "name": "obs_recall",
    "description": (
        "Recall an archived large tool result (the ones replaced by a <persisted-output> "
        "handle + excerpt) with line-numbered pagination. Pass the ORIGINAL tool_call_id "
        "as ref, or the archive path printed in the <persisted-output> block. Use this "
        "instead of re-running the original tool: the full output is already on disk. "
        "Archives are pruned after ~24h; re-run the tool if expired."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "ref": {"type": "string", "description": "tool_call_id of the archived result, or its archive file path"},
            "offset": {"type": "integer", "description": "Line number to start from (1-indexed, default 1)", "default": 1, "minimum": 1},
            "limit": {"type": "integer", "description": f"Maximum lines per page (default {_DEFAULT_RECALL_LIMIT}, max {_MAX_RECALL_LIMIT})", "default": _DEFAULT_RECALL_LIMIT, "maximum": _MAX_RECALL_LIMIT},
        },
        "required": ["ref"],
    },
}

registry.register(name="obs_recall", toolset="file", schema=OBS_RECALL_SCHEMA,
                  handler=_handle_obs_recall, emoji="🗃️", max_result_size_chars=100_000)
