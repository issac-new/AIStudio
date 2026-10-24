"""
ACP Client Plugin (stdio transport)
====================================

Connects Hermes to agents running ACP (Agent Client Protocol) servers
over stdio. Supports multiple providers:

  - **opencode** — spawns ``opencode acp``
  - **codex** — spawns ``npx @zed-industries/codex-acp``

All providers speak the same NDJSON (JSON-RPC 2.0) protocol.

Tools provided:
  acp_agents   — discover available agents/modes
  acp_send     — send a prompt and get the response
  acp_sessions — list active sessions
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

MAX_RESPONSE_CHARS = 120_000
MAX_THOUGHT_CHARS = 12_000
MAX_TERMINAL_BUFFER_BYTES = 262_144
TRUNCATION_NOTICE = "… [truncated by ACP client safety limit]"

# ═══════════════════════════════════════════════════════════════════════════
#  Config
# ═══════════════════════════════════════════════════════════════════════════

_CONFIG_FILE = "config.yaml"
_cached_config: Optional[Dict[str, Any]] = None


def _plugin_dir() -> Path:
    return Path(__file__).parent


def _load_config(reload: bool = False) -> Dict[str, Any]:
    global _cached_config
    if _cached_config is not None and not reload:
        return _cached_config
    path = _plugin_dir() / _CONFIG_FILE
    if not path.exists() or yaml is None:
        _cached_config = {}
        return _cached_config
    with open(path) as f:
        _cached_config = yaml.safe_load(f) or {}
    return _cached_config


# ═══════════════════════════════════════════════════════════════════════════
#  Provider definitions
# ═══════════════════════════════════════════════════════════════════════════

def _resolve_provider(name: str) -> Tuple[List[str], str]:
    """Return (command, display_name) for a provider, or raise on failure.

    Validates that the required binary/package is available before returning.
    """
    cfg = _load_config()
    providers_cfg = cfg.get("providers", {})
    provider_cfg = providers_cfg.get(name, {})

    if name == "opencode":
        binary = provider_cfg.get("binary", cfg.get("opencode_binary", "~/.opencode/bin/opencode"))
        binary = os.path.expanduser(binary)
        if not os.path.isfile(binary):
            raise FileNotFoundError(
                f"OpenCode binary not found at '{binary}'. "
                f"Install OpenCode or set providers.opencode.binary in config.yaml"
            )
        return [binary, "acp"], "OpenCode"

    elif name == "codex":
        npx = provider_cfg.get("npx", "npx")
        npx_path = shutil.which(npx)
        if not npx_path:
            # Try common locations not always in PATH
            for candidate in [
                "/home/linuxbrew/.linuxbrew/bin/npx",
                "/usr/local/bin/npx",
                os.path.expanduser("~/.nvm/current/bin/npx"),
            ]:
                if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                    npx_path = candidate
                    break
        if not npx_path:
            raise FileNotFoundError(
                f"npx not found in PATH. Install Node.js/npm to use the codex provider."
            )
        package = provider_cfg.get("package", "@zed-industries/codex-acp")
        cmd = [npx_path, package]
        # Codex sandbox config overrides: danger-full-access + never-ask.
        # The sandbox (bubblewrap/seatbelt) mount namespace can't see /bin/zsh
        # in the Hermes gateway/service context, so workspace-write mode fails.
        # danger-full-access disables the sandbox; process boundaries are the
        # safety layer (see codex SKILL.md Hermes Gateway Caveat).
        extra_args = provider_cfg.get("args", [])
        if not extra_args:
            extra_args = [
                "-c", 'sandbox_mode="danger-full-access"',
                "-c", 'approval_policy="never"',
            ]
        cmd.extend(extra_args)
        return cmd, "Codex"

    elif name == "claude":
        # 1) Direct binary path (preferred)
        binary = provider_cfg.get("binary", "")
        if binary:
            binary = os.path.expanduser(binary)
            if not os.path.isfile(binary):
                raise FileNotFoundError(
                    f"Claude ACP binary not found at '{binary}'. "
                    f"Install with: npm install -g @agentclientprotocol/claude-agent-acp"
                )
            extra_args = provider_cfg.get("args", [])
            return [binary] + extra_args, "Claude Agent"

        # 2) Via npx (fallback)
        npx = provider_cfg.get("npx", "npx")
        npx_path = shutil.which(npx)
        if not npx_path:
            for candidate in [
                "/home/linuxbrew/.linuxbrew/bin/npx",
                "/usr/local/bin/npx",
                os.path.expanduser("~/.nvm/current/bin/npx"),
            ]:
                if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                    npx_path = candidate
                    break
        if npx_path:
            package = provider_cfg.get("package", "@agentclientprotocol/claude-agent-acp")
            return [npx_path, package], "Claude Agent"

        raise FileNotFoundError(
            "Claude ACP provider requires either:\n"
            "  1) binary path to claude-agent-acp, or\n"
            "  2) npx (Node.js) to run @agentclientprotocol/claude-agent-acp"
        )

    else:
        raise ValueError(
            f"Unknown ACP provider: '{name}'. Available: opencode, codex, claude"
        )


# ═══════════════════════════════════════════════════════════════════════════
#  ACP Client — stdio NDJSON transport
# ═══════════════════════════════════════════════════════════════════════════


class ACPClient:
    """Manage an ACP server subprocess with bidirectional JSON-RPC 2.0."""

    def __init__(self, cmd: List[str], default_cwd: str, auto_approve: bool = True,
                 provider_name: str = "opencode"):
        self.cmd = cmd
        self.default_cwd = os.path.expanduser(default_cwd)
        self.auto_approve = auto_approve
        self.provider_name = provider_name
        self.process: Optional[subprocess.Popen] = None

        # JSON-RPC bookkeeping
        self._msg_id = 0
        self._lock = threading.Lock()
        self._write_lock = threading.Lock()  # Protects stdin.write() from concurrent access
        self._resp_events: Dict[int, threading.Event] = {}
        self._resp_data: Dict[int, dict] = {}
        self._resp_lock = threading.Lock()  # Protects _resp_events and _resp_data

        # Streaming update collectors (session_id → bounded aggregate state)
        self._update_queues: Dict[str, dict] = {}
        self._update_queues_lock = threading.Lock()  # Protects _update_queues

        # Terminal subprocess management
        self._terminals: Dict[str, subprocess.Popen] = {}
        self._term_bufs: Dict[str, bytearray] = {}
        self._term_truncated: Dict[str, bool] = {}
        self._term_bufs_lock = threading.Lock()  # Protects _term_bufs

        self._reader: Optional[threading.Thread] = None
        self._stderr_reader: Optional[threading.Thread] = None
        self._watchdog: Optional[threading.Thread] = None
        self._alive = False
        self.agent_info: Optional[dict] = None

    # ── ID generation ──────────────────────────────────────────────────

    def _next_id(self) -> int:
        with self._lock:
            self._msg_id += 1
            return self._msg_id

    # ── Lifecycle ──────────────────────────────────────────────────────

    def start(self) -> dict:
        """Spawn the ACP subprocess and perform the initialize handshake."""
        if self._alive:
            return {"already_started": True}

        # Build launch command — opencode needs --cwd, codex uses config
        launch_cmd = list(self.cmd)
        if self.provider_name == "opencode":
            launch_cmd.extend(["--cwd", self.default_cwd])

        logger.info("Starting ACP subprocess: %s", " ".join(launch_cmd))

        self.process = subprocess.Popen(
            launch_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        self._alive = True  # must be set BEFORE reader starts
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()

        # Spawn stderr reader thread to capture subprocess errors
        self._stderr_reader = threading.Thread(target=self._stderr_loop, daemon=True)
        self._stderr_reader.start()

        # Spawn watchdog thread to detect idle process death
        self._watchdog = threading.Thread(target=self._watchdog_loop, daemon=True)
        self._watchdog.start()

        resp = self._request("initialize", {
            "protocolVersion": 1,
            "clientInfo": {"name": "hermes-acp-client", "version": "1.0.0"},
            "clientCapabilities": {
                "fs": {"readTextFile": True, "writeTextFile": True},
                "terminal": True,
                "auth": {"terminal": True},
            },
        })

        if "result" in resp:
            self.agent_info = resp["result"].get("agentInfo")
        return resp

    def stop(self):
        """Terminate the ACP subprocess and clean up."""
        self._alive = False
        if self.process:
            try:
                self.process.stdin.close()
            except Exception:
                pass
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except Exception:
                self.process.kill()
            self.process = None

        for proc in self._terminals.values():
            try:
                proc.kill()
            except Exception:
                pass
        self._terminals.clear()
        self._term_bufs.clear()
        self._term_truncated.clear()

    @property
    def is_alive(self) -> bool:
        return (
            self._alive
            and self.process is not None
            and self.process.poll() is None
        )

    def _new_update_collector(self) -> dict:
        return {
            "response_parts": [],
            "response_chars": 0,
            "response_truncated": False,
            "thought_parts": [],
            "thought_chars": 0,
            "thought_truncated": False,
            "tool_calls": {},
            "plan": [],
            "usage": None,
            "ignored_updates": 0,
        }

    def _append_bounded(self, collector: dict, parts_key: str, chars_key: str,
                        truncated_key: str, text: str, max_chars: int):
        if not text or collector.get(truncated_key):
            return
        current = collector.get(chars_key, 0)
        remaining = max_chars - current
        if remaining <= 0:
            collector[truncated_key] = True
            return
        if len(text) <= remaining:
            collector[parts_key].append(text)
            collector[chars_key] = current + len(text)
            return
        collector[parts_key].append(text[:remaining])
        collector[chars_key] = max_chars
        collector[truncated_key] = True

    def _record_update(self, session_id: str, upd: dict):
        collector = self._update_queues.get(session_id)
        if not collector:
            return

        kind = upd.get("sessionUpdate", "")

        if kind == "agent_message_chunk":
            content = upd.get("content", {})
            if content.get("type") == "text":
                self._append_bounded(
                    collector,
                    "response_parts",
                    "response_chars",
                    "response_truncated",
                    content.get("text", ""),
                    MAX_RESPONSE_CHARS,
                )
            return

        if kind == "agent_thought_chunk":
            content = upd.get("content", {})
            if content.get("type") == "text":
                self._append_bounded(
                    collector,
                    "thought_parts",
                    "thought_chars",
                    "thought_truncated",
                    content.get("text", ""),
                    MAX_THOUGHT_CHARS,
                )
            return

        if kind == "tool_call":
            tcid = upd.get("toolCallId", "")
            if tcid:
                collector["tool_calls"][tcid] = {
                    "title": upd.get("title", ""),
                    "kind": upd.get("kind", ""),
                    "status": upd.get("status", ""),
                }
            return

        if kind == "tool_call_update":
            tcid = upd.get("toolCallId", "")
            if not tcid:
                return
            tool_call = collector["tool_calls"].setdefault(tcid, {
                "title": upd.get("title", ""),
                "kind": upd.get("kind", ""),
                "status": "",
            })
            if upd.get("status"):
                tool_call["status"] = upd["status"]
            if upd.get("title") and not tool_call.get("title"):
                tool_call["title"] = upd["title"]
            if upd.get("kind") and not tool_call.get("kind"):
                tool_call["kind"] = upd["kind"]
            return

        if kind == "plan":
            collector["plan"] = [
                {"title": e.get("title", ""), "status": e.get("status", "")}
                for e in upd.get("entries", [])
            ]
            return

        if kind == "usage_update":
            collector["usage"] = {k: v for k, v in upd.items() if k != "sessionUpdate"}
            return

        collector["ignored_updates"] = collector.get("ignored_updates", 0) + 1

    def _drain_terminal_output(self, terminal_id: str) -> str:
        with self._term_bufs_lock:
            buf = self._term_bufs.pop(terminal_id, bytearray())
            truncated = self._term_truncated.pop(terminal_id, False)
        out = buf.decode("utf-8", errors="replace")
        if truncated:
            return f"[output truncated by ACP client safety limit: {MAX_TERMINAL_BUFFER_BYTES} bytes kept]\n{out}"
        return out

    # ── Wire protocol ─────────────────────────────────────────────────

    def _send(self, msg: dict):
        if not self.process or not self.process.stdin:
            raise ConnectionError("ACP process not running")
        payload = json.dumps(msg, separators=(",", ":")).encode() + b"\n"
        with self._write_lock:
            self.process.stdin.write(payload)
            self.process.stdin.flush()

    def _request(self, method: str, params: dict = None, timeout: int = 300) -> dict:
        mid = self._next_id()
        evt = threading.Event()
        with self._resp_lock:
            self._resp_events[mid] = evt

        msg: dict = {"jsonrpc": "2.0", "id": mid, "method": method}
        if params is not None:
            msg["params"] = params

        self._send(msg)

        # Poll for response with process death detection
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                with self._resp_lock:
                    self._resp_events.pop(mid, None)
                raise TimeoutError(f"ACP timeout ({timeout}s) on {method}")

            if evt.wait(timeout=min(2.0, remaining)):
                break

            # Check if process died during wait
            if not self.is_alive:
                with self._resp_lock:
                    self._resp_events.pop(mid, None)
                raise ConnectionError("ACP subprocess died during request")

        with self._resp_lock:
            data = self._resp_data.pop(mid, {})
            self._resp_events.pop(mid, None)
        return data

    # ── Reader thread ─────────────────────────────────────────────────

    def _read_loop(self):
        while self._alive and self.process and self.process.stdout:
            try:
                line = self.process.stdout.readline()
                if not line:
                    break
            except Exception as exc:
                logger.error("ACP reader pipe error: %s", exc)
                break

            line = line.strip()
            if not line:
                continue

            try:
                msg = json.loads(line)
                self._dispatch(msg)
            except json.JSONDecodeError:
                logger.warning("ACP reader: malformed JSON: %s", line[:100])
                continue
            except Exception as exc:
                logger.error("ACP dispatch error: %s", exc)
                continue

        self._alive = False
        # Wake any pending waiters so they don't hang forever
        with self._resp_lock:
            for evt in list(self._resp_events.values()):
                evt.set()

    def _stderr_loop(self):
        """Read and log stderr from the ACP subprocess."""
        if not self.process or not self.process.stderr:
            return
        try:
            for line in self.process.stderr:
                if line:
                    logger.warning("ACP subprocess stderr: %s", line.rstrip())
        except Exception:
            pass

    def _watchdog_loop(self):
        """Periodically poll process to detect death when idle."""
        while self._alive:
            time.sleep(5)
            if not self._alive:
                break
            if self.process and self.process.poll() is not None:
                logger.error("ACP subprocess died (watchdog detected)")
                self._alive = False
                with self._resp_lock:
                    for evt in list(self._resp_events.values()):
                        evt.set()
                break

    def _dispatch(self, msg: dict):
        # 1) Response to our request
        if "id" in msg and ("result" in msg or "error" in msg) and "method" not in msg:
            mid = msg["id"]
            with self._resp_lock:
                if mid in self._resp_events:
                    self._resp_data[mid] = msg
                    self._resp_events[mid].set()
            return

        # 2) Notification (no id)
        if "method" in msg and "id" not in msg:
            self._on_notification(msg)
            return

        # 3) Agent→client request  (has id AND method) — handle in own thread
        if "method" in msg and "id" in msg:
            threading.Thread(
                target=self._on_agent_request, args=(msg,), daemon=True,
            ).start()

    # ── Notifications ─────────────────────────────────────────────────

    def _on_notification(self, msg: dict):
        method = msg.get("method")
        params = msg.get("params", {})
        if method == "session/update":
            sid = params.get("sessionId", "")
            upd = params.get("update", {})
            with self._update_queues_lock:
                self._record_update(sid, upd)

    # ── Agent → Client requests ───────────────────────────────────────

    def _on_agent_request(self, msg: dict):
        method = msg["method"]
        mid = msg["id"]
        params = msg.get("params", {})

        try:
            if method == "session/request_permission":
                self._do_permission(mid, params)
            elif method == "fs/read_text_file":
                self._do_fs_read(mid, params)
            elif method == "fs/write_text_file":
                self._do_fs_write(mid, params)
            elif method.startswith("terminal/"):
                self._do_terminal(method.split("/", 1)[-1], mid, params)
            else:
                self._send({
                    "jsonrpc": "2.0", "id": mid,
                    "error": {"code": -32601, "message": f"Unsupported: {method}"},
                })
        except Exception as exc:
            logger.error("Error handling %s: %s", method, exc)
            try:
                self._send({
                    "jsonrpc": "2.0", "id": mid,
                    "error": {"code": -32603, "message": str(exc)},
                })
            except Exception:
                pass

    def _do_permission(self, mid: int, params: dict):
        oid = "allow_once"
        if self.auto_approve:
            # Prefer allow_always, fall back to allow_once, then any available
            options = params.get("options", [])
            for opt in options:
                if opt.get("kind") == "allow_always":
                    oid = opt["optionId"]
                    break
            else:
                for opt in options:
                    if opt.get("kind") == "allow_once":
                        oid = opt["optionId"]
                        break
                else:
                    # Codex ACP uses different option kinds (e.g. execpolicy-amendment).
                    # Fall back to the first available option so auto-approve works.
                    if options:
                        oid = options[0].get("optionId", oid)
        # Return ACP spec-compliant format: outcome wrapper with option_id.
        # Claude Code ACP tolerates legacy {"optionId": ...} but codex-acp requires
        # the {"outcome": {"outcome": "selected", "option_id": ...}} structure.
        self._send({
            "jsonrpc": "2.0", "id": mid,
            "result": {
                "outcome": {
                    "outcome": "selected",
                    "optionId": oid,
                }
            }
        })

    def _do_fs_read(self, mid: int, params: dict):
        path = params.get("path", "")
        try:
            with open(path) as f:
                content = f.read()
            self._send({"jsonrpc": "2.0", "id": mid, "result": {"content": content}})
        except Exception as exc:
            self._send({
                "jsonrpc": "2.0", "id": mid,
                "error": {"code": -32603, "message": str(exc)},
            })

    def _do_fs_write(self, mid: int, params: dict):
        path = params.get("path", "")
        content = params.get("content", "")
        try:
            dirname = os.path.dirname(path)
            if dirname:
                os.makedirs(dirname, exist_ok=True)
            with open(path, "w") as f:
                f.write(content)
            self._send({"jsonrpc": "2.0", "id": mid, "result": {}})
        except Exception as exc:
            self._send({
                "jsonrpc": "2.0", "id": mid,
                "error": {"code": -32603, "message": str(exc)},
            })

    # ── Terminal handling ─────────────────────────────────────────────

    def _do_terminal(self, op: str, mid: int, params: dict):
        if op == "create":
            tid = f"t-{uuid.uuid4().hex[:8]}"
            command = params.get("command", "")
            args = params.get("args", [])
            cwd = params.get("cwd", self.default_cwd)
            env = {**os.environ, **(params.get("env") or {})}

            cmd = [command] + args if args else command
            proc = subprocess.Popen(
                cmd,
                shell=isinstance(cmd, str),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                cwd=cwd,
                env=env,
            )
            self._terminals[tid] = proc
            self._term_bufs[tid] = bytearray()
            self._term_truncated[tid] = False
            # Background reader for terminal stdout
            threading.Thread(
                target=self._term_reader, args=(tid,), daemon=True,
            ).start()
            self._send({"jsonrpc": "2.0", "id": mid, "result": {"terminalId": tid}})

        elif op == "output":
            tid = params.get("terminalId", "")
            out = self._drain_terminal_output(tid)
            with self._term_bufs_lock:
                self._term_bufs[tid] = bytearray()
                self._term_truncated[tid] = False
            self._send({"jsonrpc": "2.0", "id": mid, "result": {"output": out}})

        elif op == "wait_for_exit":
            tid = params.get("terminalId", "")
            proc = self._terminals.get(tid)
            if not proc:
                self._send({
                    "jsonrpc": "2.0", "id": mid,
                    "error": {"code": -32002, "message": f"Terminal not found: {tid}"},
                })
                return
            try:
                exit_code = proc.wait(timeout=600)
            except subprocess.TimeoutExpired:
                proc.kill()
                exit_code = -1
            time.sleep(0.1)  # let reader catch final output
            out = self._drain_terminal_output(tid)
            self._terminals.pop(tid, None)
            self._send({
                "jsonrpc": "2.0", "id": mid,
                "result": {"exitCode": exit_code, "output": out},
            })

        elif op == "kill":
            tid = params.get("terminalId", "")
            proc = self._terminals.get(tid)
            if proc:
                proc.kill()
            self._terminals.pop(tid, None)
            self._drain_terminal_output(tid)
            self._send({"jsonrpc": "2.0", "id": mid, "result": {}})

        elif op == "release":
            tid = params.get("terminalId", "")
            self._terminals.pop(tid, None)
            self._drain_terminal_output(tid)
            self._send({"jsonrpc": "2.0", "id": mid, "result": {}})

        else:
            self._send({
                "jsonrpc": "2.0", "id": mid,
                "error": {"code": -32601, "message": f"Unknown terminal op: {op}"},
            })

    def _term_reader(self, tid: str):
        """Background reader for a terminal subprocess's stdout."""
        proc = self._terminals.get(tid)
        if not proc or not proc.stdout:
            return
        while True:
            chunk = proc.stdout.read(4096)
            if not chunk:
                break
            with self._term_bufs_lock:
                if tid in self._term_bufs:
                    buf = self._term_bufs[tid]
                    remaining = MAX_TERMINAL_BUFFER_BYTES - len(buf)
                    if remaining > 0:
                        buf.extend(chunk[:remaining])
                    if len(chunk) > remaining:
                        self._term_truncated[tid] = True

    # ── High-level API ────────────────────────────────────────────────

    def new_session(self, cwd: str = None) -> dict:
        """Create a new ACP session for a workspace."""
        return self._request("session/new", {
            "cwd": os.path.expanduser(cwd or self.default_cwd),
            "mcpServers": [],
        })

    def prompt(self, session_id: str, text: str, timeout: int = 600) -> dict:
        """Send a prompt and collect all streaming updates.

        Returns ``{"wire": <rpc response>, "updates": <bounded collector>}``.
        On timeout, sends session/cancel and returns partial updates.
        """
        with self._update_queues_lock:
            self._update_queues[session_id] = self._new_update_collector()
        try:
            result = self._request("session/prompt", {
                "sessionId": session_id,
                "prompt": [{"type": "text", "text": text}],
            }, timeout=timeout)
        except TimeoutError:
            # Cancel in-progress prompt
            try:
                self._send({
                    "jsonrpc": "2.0",
                    "method": "session/cancel",
                    "params": {"sessionId": session_id},
                })
            except Exception:
                pass
            with self._update_queues_lock:
                updates = self._update_queues.pop(session_id, [])
            return {
                "wire": {"result": {"stopReason": "timeout"}},
                "updates": updates,
            }

        with self._update_queues_lock:
            updates = self._update_queues.pop(session_id, [])
        return {"wire": result, "updates": updates}

    def set_mode(self, session_id: str, mode_id: str) -> dict:
        """Switch the agent/mode for a session."""
        return self._request("session/set_mode", {
            "sessionId": session_id, "modeId": mode_id,
        })

    def list_sessions(self, cwd: str = None) -> dict:
        """List existing sessions, optionally filtered by workspace."""
        params: dict = {}
        if cwd:
            params["cwd"] = os.path.expanduser(cwd)
        return self._request("session/list", params)


# ═══════════════════════════════════════════════════════════════════════════
#  Client pool — one per provider
# ═══════════════════════════════════════════════════════════════════════════

_clients: Dict[str, ACPClient] = {}
_clients_lock = threading.Lock()


def _get_client(provider: str = None) -> ACPClient:
    """Get or create the client for a given provider."""
    cfg = _load_config(reload=True)

    if not provider:
        provider = cfg.get("default_provider", "opencode")

    # Fast path: check for existing alive client
    with _clients_lock:
        existing = _clients.get(provider)
        if existing and existing.is_alive:
            return existing
        if existing:
            existing.stop()

    # Create and start client outside lock (start() does network I/O)
    cmd, display = _resolve_provider(provider)
    cwd = cfg.get("default_cwd", "~")
    auto = cfg.get("auto_approve", True)

    # Per-provider cwd override
    providers_cfg = cfg.get("providers", {})
    pcfg = providers_cfg.get(provider, {})
    if pcfg.get("default_cwd"):
        cwd = pcfg["default_cwd"]

    client = ACPClient(cmd, cwd, auto, provider_name=provider)
    client.start()

    # Insert into dictionary under lock
    with _clients_lock:
        _clients[provider] = client
    return client


# ═══════════════════════════════════════════════════════════════════════════
#  Response assembly
# ═══════════════════════════════════════════════════════════════════════════

def _assemble(raw: dict) -> dict:
    """Turn raw prompt result + streaming updates into a clean response."""
    updates = raw.get("updates", [])
    wire = raw.get("wire", {})

    if isinstance(updates, dict):
        response = "".join(updates.get("response_parts", []))
        if updates.get("response_truncated"):
            response += TRUNCATION_NOTICE

        result: Dict[str, Any] = {
            "response": response,
        }

        wire_result = wire.get("result", {})
        result["stop_reason"] = wire_result.get("stopReason", "unknown")
        if wire_result.get("usage"):
            result["usage"] = wire_result["usage"]
        elif updates.get("usage"):
            result["usage"] = updates["usage"]

        thinking = "".join(updates.get("thought_parts", []))
        if thinking:
            if updates.get("thought_truncated") or len(thinking) > 3000:
                result["thinking"] = thinking[:3000] + "… [truncated]"
            else:
                result["thinking"] = thinking

        tool_calls = list(updates.get("tool_calls", {}).values())
        if tool_calls:
            result["tool_calls"] = tool_calls

        plan_entries = updates.get("plan", [])
        if plan_entries:
            result["plan"] = plan_entries

        if updates.get("ignored_updates"):
            result["ignored_updates"] = updates["ignored_updates"]

        if "error" in wire:
            result["error"] = wire["error"]

        return result

    text_parts: List[str] = []
    thought_parts: List[str] = []
    tool_calls: Dict[str, dict] = {}
    plan_entries: List[dict] = []
    usage: Optional[dict] = None

    for u in updates:
        kind = u.get("sessionUpdate", "")

        if kind == "agent_message_chunk":
            c = u.get("content", {})
            if c.get("type") == "text":
                text_parts.append(c["text"])

        elif kind == "agent_thought_chunk":
            c = u.get("content", {})
            if c.get("type") == "text":
                thought_parts.append(c["text"])

        elif kind == "tool_call":
            tcid = u.get("toolCallId", "")
            tool_calls[tcid] = {
                "title": u.get("title", ""),
                "kind": u.get("kind", ""),
                "status": u.get("status", ""),
            }

        elif kind == "tool_call_update":
            tcid = u.get("toolCallId", "")
            if tcid in tool_calls:
                if u.get("status"):
                    tool_calls[tcid]["status"] = u["status"]

        elif kind == "plan":
            plan_entries = [
                {"title": e.get("title", ""), "status": e.get("status", "")}
                for e in u.get("entries", [])
            ]

        elif kind == "usage_update":
            usage = {k: v for k, v in u.items() if k != "sessionUpdate"}

    # Build result
    result: Dict[str, Any] = {
        "response": "".join(text_parts),
    }

    # Use wire-level usage if available, else streaming usage
    wire_result = wire.get("result", {})
    result["stop_reason"] = wire_result.get("stopReason", "unknown")
    if wire_result.get("usage"):
        result["usage"] = wire_result["usage"]
    elif usage:
        result["usage"] = usage

    # Include thinking if present (truncate if huge)
    thinking = "".join(thought_parts)
    if thinking:
        if len(thinking) > 3000:
            result["thinking"] = thinking[:3000] + "… [truncated]"
        else:
            result["thinking"] = thinking

    if tool_calls:
        result["tool_calls"] = list(tool_calls.values())

    if plan_entries:
        result["plan"] = plan_entries

    # Surface errors
    if "error" in wire:
        result["error"] = wire["error"]

    return result


# ═══════════════════════════════════════════════════════════════════════════
#  Tool handlers
# ═══════════════════════════════════════════════════════════════════════════

def handle_acp_agents(args: Dict[str, Any], **kwargs) -> str:
    """Discover available agents/modes from the ACP server."""
    try:
        provider = args.get("provider", "")
        client = _get_client(provider or None)
        cwd = args.get("cwd") or client.default_cwd
        resp = client.new_session(cwd=cwd)

        if "error" in resp:
            return json.dumps({"error": resp["error"]})

        r = resp.get("result", {})
        modes = r.get("modes", {})
        models = r.get("models", {})

        agents = []
        for m in modes.get("availableModes", []):
            agents.append({
                "id": m.get("id", ""),
                "name": m.get("name", ""),
                "description": m.get("description", ""),
            })

        return json.dumps({
            "provider": client.provider_name,
            "agent_info": client.agent_info,
            "agents": agents,
            "current_agent": modes.get("currentModeId", ""),
            "current_model": models.get("currentModelId", ""),
            "available_models": [
                {"id": m.get("modelId", ""), "name": m.get("name", "")}
                for m in models.get("availableModels", [])
            ],
            "session_id": r.get("sessionId", ""),
            "cwd": cwd,
        })

    except Exception as exc:
        return json.dumps({"error": str(exc)})


def handle_acp_send(args: Dict[str, Any], **kwargs) -> str:
    """Send a prompt to an ACP agent and return the assembled response."""
    prompt_text = args.get("prompt", "").strip()
    if not prompt_text:
        return json.dumps({"error": "prompt is required"})

    try:
        provider = args.get("provider", "")
        client = _get_client(provider or None)
        cwd = args.get("cwd") or client.default_cwd
        agent = args.get("agent", "")
        session_id = args.get("session_id", "")
        timeout = int(args.get("timeout", 600))

        # Create or reuse session
        if not session_id:
            resp = client.new_session(cwd=cwd)
            if "error" in resp:
                return json.dumps({"error": resp["error"]})

            r = resp["result"]
            session_id = r["sessionId"]
            current_mode = r.get("modes", {}).get("currentModeId", "")

            # Switch mode if requested and different
            if agent and agent != current_mode:
                mode_resp = client.set_mode(session_id, agent)
                if "error" in mode_resp:
                    return json.dumps({
                        "error": f"Failed to set agent '{agent}': {mode_resp['error']}",
                        "session_id": session_id,
                    })
        elif agent:
            # Existing session — try switching mode (ignore if same)
            client.set_mode(session_id, agent)

        # Send the prompt
        raw = client.prompt(session_id, prompt_text, timeout=timeout)
        assembled = _assemble(raw)
        assembled["provider"] = client.provider_name
        assembled["session_id"] = session_id
        assembled["agent"] = agent or "default"

        return json.dumps(assembled)

    except Exception as exc:
        return json.dumps({"error": str(exc)})


def handle_acp_sessions(args: Dict[str, Any], **kwargs) -> str:
    """List active ACP sessions."""
    try:
        provider = args.get("provider", "")
        client = _get_client(provider or None)
        cwd = args.get("cwd")
        resp = client.list_sessions(cwd=cwd)

        if "error" in resp:
            return json.dumps({"error": resp["error"]})

        sessions = resp.get("result", {}).get("sessions", [])
        return json.dumps({
            "provider": client.provider_name,
            "sessions": [
                {
                    "session_id": s.get("sessionId", ""),
                    "cwd": s.get("cwd", ""),
                    "title": s.get("title", ""),
                    "updated_at": s.get("updatedAt", ""),
                }
                for s in sessions
            ],
        })

    except Exception as exc:
        return json.dumps({"error": str(exc)})


# ═══════════════════════════════════════════════════════════════════════════
#  Tool schemas
# ═══════════════════════════════════════════════════════════════════════════

_PROVIDER_DESC = (
    "ACP provider to use: 'opencode', 'codex', or 'claude'. "
    "Defaults to config default_provider."
)

ACP_AGENTS_SCHEMA = {
    "name": "acp_agents",
    "description": (
        "Discover available agents/modes from an ACP server. "
        "Returns agent names, descriptions, available models, and a pre-created "
        "session_id you can reuse with acp_send. Call this first to see what "
        "agents are configured before sending prompts."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "provider": {
                "type": "string",
                "description": _PROVIDER_DESC,
            },
            "cwd": {
                "type": "string",
                "description": (
                    "Workspace directory for agent discovery. "
                    "Defaults to config default_cwd."
                ),
            },
        },
        "required": [],
    },
}

ACP_SEND_SCHEMA = {
    "name": "acp_send",
    "description": (
        "Send a prompt to an ACP agent and get the response. The agent can "
        "autonomously read/write files, run terminal commands, and use tools "
        "in the workspace. Returns the agent's text response, tool call summary, "
        "execution plan, and token usage. Use acp_agents first to discover "
        "available agents. Use session_id to continue multi-turn conversations."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "The message or task to send to the agent.",
            },
            "provider": {
                "type": "string",
                "description": _PROVIDER_DESC,
            },
            "agent": {
                "type": "string",
                "description": (
                    "Agent/mode name as returned by acp_agents. "
                    "Omit for the workspace's default agent."
                ),
            },
            "cwd": {
                "type": "string",
                "description": (
                    "Workspace directory for the session. "
                    "Defaults to config default_cwd."
                ),
            },
            "session_id": {
                "type": "string",
                "description": (
                    "Session ID from a previous acp_send or acp_agents call "
                    "to continue an existing conversation. Omit for a new session."
                ),
            },
            "timeout": {
                "type": "integer",
                "description": "Max seconds to wait for the response (default: 600).",
            },
        },
        "required": ["prompt"],
    },
}

ACP_SESSIONS_SCHEMA = {
    "name": "acp_sessions",
    "description": (
        "List active ACP sessions. Sessions persist across prompts and can be "
        "resumed by passing session_id to acp_send. Useful for checking what "
        "conversations are in progress."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "provider": {
                "type": "string",
                "description": _PROVIDER_DESC,
            },
            "cwd": {
                "type": "string",
                "description": "Filter sessions by workspace directory.",
            },
        },
        "required": [],
    },
}


# ═══════════════════════════════════════════════════════════════════════════
#  Plugin entry point
# ═══════════════════════════════════════════════════════════════════════════

def register(ctx):
    """Called by the Hermes plugin system on load."""
    ctx.register_tool(
        name="acp_agents",
        toolset="acp",
        schema=ACP_AGENTS_SCHEMA,
        handler=handle_acp_agents,
        description="Discover available ACP agents/modes",
        emoji="🤖",
    )
    ctx.register_tool(
        name="acp_send",
        toolset="acp",
        schema=ACP_SEND_SCHEMA,
        handler=handle_acp_send,
        description="Send a prompt to an ACP agent",
        emoji="📡",
    )
    ctx.register_tool(
        name="acp_sessions",
        toolset="acp",
        schema=ACP_SESSIONS_SCHEMA,
        handler=handle_acp_sessions,
        description="List active ACP sessions",
        emoji="📋",
    )
    logger.info("acp-client plugin loaded — toolset: acp")
