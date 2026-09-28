"""studio-file-approval — filesystem approval transport for unattended workers.

Contract (hermes_cli/approval_transport.py): the host builds a redacted,
digest-bound :class:`ApprovalRequest`; the transport presents it to a human
and returns a correlated :class:`ApprovalDecision`. This implementation:

1. appends the request (id/digest/command/description/choices/timeout) to
   ``<HERMES_HOME>/approvals/queue.jsonl`` — SwarmStudio's approval inbox
   (``/api/approvals/pending``) tails this file;
2. polls ``<HERMES_HOME>/approvals/responses/<request_id>.json`` until the
   request deadline; the studio decide endpoint writes that file;
3. returns the decision verbatim (host re-validates id + digest binding).

Any absence — timeout, unreadable response, bad JSON, unknown choice —
returns nothing usable and the host fails closed to a denial.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

TRANSPORT_NAME = "studio_file"
_POLL_INTERVAL = 1.0
_MAX_QUEUE_LINE = 8192


def _approvals_root() -> Path:
    home = os.environ.get("HERMES_HOME") or os.path.expanduser("~/.hermes")
    return Path(home) / "approvals"


def register(ctx):
    ctx.register_approval_transport(TRANSPORT_NAME, present)


def present(request):
    root = _approvals_root()
    queue = root / "queue.jsonl"
    responses = root / "responses"
    try:
        responses.mkdir(parents=True, exist_ok=True)
        entry = {
            "schema_version": 1,
            "transport": TRANSPORT_NAME,
            "request_id": request.request_id,
            "digest": request.digest,
            "command": request.command,
            "description": request.description,
            "surface": request.surface,
            "allowed_choices": list(request.allowed_choices),
            "timeout_seconds": request.timeout_seconds,
            "enqueued_at": int(time.time() * 1000),
        }
        # 追加写 + 行内截断护栏：队列由 studio 侧轮询清理，行级丢失不致命
        # （该请求在 studio 不可见 → 无人答 → 超时拒绝，fail-closed）。
        line = json.dumps(entry, ensure_ascii=False)[:_MAX_QUEUE_LINE]
        with open(queue, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except Exception:
        # 入队失败 = 无人能看到该请求：让宿主按传输失败拒绝（fail-closed）。
        raise

    deadline = time.monotonic() + max(float(request.timeout_seconds or 0.0), 0.0)
    response_file = responses / f"{request.request_id}.json"
    while time.monotonic() < deadline:
        try:
            raw = response_file.read_text(encoding="utf-8")
            data = json.loads(raw)
            if data.get("request_id") == request.request_id:
                choice = str(data.get("choice") or "").strip().lower()
                if choice in ("once", "session", "always", "deny"):
                    from hermes_cli.approval_transport import ApprovalDecision
                    return ApprovalDecision(request.request_id, request.digest, choice)
        except FileNotFoundError:
            pass
        except Exception:
            pass
        time.sleep(_POLL_INTERVAL)
    # 超时：不返回决策（宿主按 timeout 拒绝），响应文件留给 studio 清理。
    return None
