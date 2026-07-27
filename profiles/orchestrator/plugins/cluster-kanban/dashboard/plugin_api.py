"""
cluster-kanban dashboard plugin — backend API routes.

Mounts at /api/plugins/cluster-kanban/ via the Hermes Dashboard plugin system.
Proxies requests to the hermes-cluster service.
Supports config management: read/write cluster.yaml, runtime capability updates.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, List, Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()

# Default cluster endpoint (can be overridden via POST /config)
_CLUSTER_ENDPOINT = "http://127.0.0.1:8787"

# Config file paths (checked in order)
_CONFIG_PATHS = [
    Path.home() / ".hermes" / "cluster-kanban" / "cluster.yaml",
    Path.home() / ".hermes" / "cluster-kanban" / "cluster-worker.yaml",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _proxy(method: str, path: str, data: dict = None) -> Any:
    """Proxy an API call to the hermes-cluster service."""
    url = f"{_CLUSTER_ENDPOINT}{path}"
    body = json.dumps(data).encode() if data else None
    req = Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        with urlopen(req, timeout=10) as resp:
            raw = resp.read().decode()
            if raw.strip():
                return json.loads(raw)
            return {}
    except URLError as e:
        raise HTTPException(status_code=502, detail=f"Cluster proxy error: {e.reason}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Cluster proxy error: {e}")


def _read_config_file() -> tuple[Optional[dict], Optional[str], Optional[str]]:
    """Read cluster.yaml, return (parsed_dict, raw_yaml, path)."""
    for p in _CONFIG_PATHS:
        if p.exists():
            try:
                raw = p.read_text(encoding="utf-8")
                parsed = yaml.safe_load(raw) or {}
                return parsed, raw, str(p)
            except Exception as e:
                logger.warning("Failed to read %s: %s", p, e)
                continue
    return None, None, None


def _write_config_file(cfg: dict) -> str:
    """Write config dict to the first available path, creating dir if needed."""
    path = _CONFIG_PATHS[0]
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = yaml.dump(cfg, default_flow_style=False, allow_unicode=True)
    path.write_text(raw, encoding="utf-8")
    return str(path)


# ---------------------------------------------------------------------------
# Config CRUD
# ---------------------------------------------------------------------------


class EndpointBody(BaseModel):
    endpoint: str


@router.post("/config")
async def set_endpoint(body: EndpointBody):
    """Set the hermes-cluster service endpoint URL."""
    global _CLUSTER_ENDPOINT
    _CLUSTER_ENDPOINT = body.endpoint.rstrip("/")
    logger.info("Cluster endpoint set to %s", _CLUSTER_ENDPOINT)
    return {"ok": True, "endpoint": _CLUSTER_ENDPOINT}


@router.get("/config")
async def get_endpoint():
    """Get the current hermes-cluster service endpoint URL."""
    return {"ok": True, "endpoint": _CLUSTER_ENDPOINT}


@router.get("/config/node")
async def get_node_config():
    """Get node configuration from config file and runtime."""
    cfg, raw_yaml, cfg_path = _read_config_file()

    result = {
        "ok": True,
        "config_file": cfg_path,
        "cluster": None,
        "node": None,
        "server": None,
        "lease": None,
        "watchdog": None,
    }

    if cfg:
        result["cluster"] = cfg.get("cluster", {})
        result["node"] = cfg.get("node", {})
        result["server"] = cfg.get("server", {})
        result["lease"] = cfg.get("lease", {})
        result["watchdog"] = cfg.get("watchdog", {})
        result["telemetry"] = cfg.get("telemetry", {})

    # Try to get runtime node info from service
    try:
        nodes = _proxy("GET", "/api/v1/nodes")
        if isinstance(nodes, list) and nodes:
            # Merge runtime status (online/offline) into result
            runtime_map = {n["id"]: n for n in nodes}
            node_id = (result.get("node") or {}).get("id", "")
            if node_id and node_id in runtime_map:
                result["runtime"] = runtime_map[node_id]
    except HTTPException:
        result["runtime"] = None

    return result


class CapabilitiesBody(BaseModel):
    capabilities: List[str]


@router.put("/config/capabilities")
async def update_capabilities(body: CapabilitiesBody):
    """Update node capabilities at runtime AND persist to config file."""
    cfg, raw_yaml, cfg_path = _read_config_file()
    if not cfg:
        raise HTTPException(status_code=404, detail="Config file not found")

    node_id = (cfg.get("node") or {}).get("id", "node_main")
    caps = body.capabilities

    # 1. Update in config file
    if "node" not in cfg:
        cfg["node"] = {}
    cfg["node"]["capabilities"] = caps
    saved_path = _write_config_file(cfg)
    logger.info("Saved capabilities to %s: %s", saved_path, caps)

    # 2. Update at runtime via Go API (best-effort)
    runtime_result = None
    try:
        runtime_result = _proxy("PATCH", f"/api/v1/nodes/{node_id}/capabilities", {
            "capabilities": caps,
        })
        logger.info("Runtime capability update result: %s", runtime_result)
    except HTTPException:
        runtime_result = {"warning": "Cluster service not reachable, saved to config only"}

    return {
        "ok": True,
        "node_id": node_id,
        "capabilities": caps,
        "config_file": saved_path,
        "runtime": runtime_result,
    }


class NodeConfigBody(BaseModel):
    """Update persistent node config (requires restart to take full effect)."""
    name: Optional[str] = None
    capabilities: Optional[List[str]] = None


@router.put("/config/node")
async def update_node_config(body: NodeConfigBody):
    """Update node identity in config file (requires restart for most fields)."""
    cfg, raw_yaml, cfg_path = _read_config_file()
    if not cfg:
        raise HTTPException(status_code=404, detail="Config file not found")

    if "node" not in cfg:
        cfg["node"] = {}

    changed = []
    if body.name is not None:
        cfg["node"]["name"] = body.name
        changed.append("name")
    if body.capabilities is not None:
        cfg["node"]["capabilities"] = body.capabilities
        changed.append("capabilities")

    saved_path = _write_config_file(cfg)

    # Runtime capability update if capabilities changed
    runtime_result = None
    if "capabilities" in changed:
        node_id = cfg["node"].get("id", "node_main")
        try:
            runtime_result = _proxy(
                "PATCH",
                f"/api/v1/nodes/{node_id}/capabilities",
                {"capabilities": cfg["node"]["capabilities"]},
            )
        except HTTPException:
            runtime_result = {"warning": "Cluster not reachable"}

    return {
        "ok": True,
        "changed": changed,
        "config_file": saved_path,
        "runtime": runtime_result,
        "needs_restart": [f for f in changed if f != "capabilities"],
    }


@router.get("/config/yaml")
async def get_config_yaml():
    """Get full config as raw YAML string."""
    cfg, raw_yaml, cfg_path = _read_config_file()
    return {
        "ok": True,
        "config_file": cfg_path,
        "yaml": raw_yaml or "",
    }


class YamlBody(BaseModel):
    yaml: str


@router.put("/config/yaml")
async def save_config_yaml(body: YamlBody):
    """Save full config YAML (requires restart to take effect)."""
    try:
        parsed = yaml.safe_load(body.yaml)
        if not isinstance(parsed, dict):
            raise ValueError("Config must be a YAML mapping")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")

    saved_path = _write_config_file(parsed)
    return {"ok": True, "config_file": saved_path, "needs_restart": True}


@router.post("/config/restart")
async def restart_service():
    """Attempt to restart the hermes-cluster service."""
    import shutil
    import subprocess

    cfg_path = str(_CONFIG_PATHS[0])
    if not Path(cfg_path).exists():
        raise HTTPException(status_code=404, detail="Config file not found")

    binary = shutil.which("hermes-cluster")
    if not binary:
        raise HTTPException(status_code=404, detail="hermes-cluster binary not found in PATH")

    try:
        # Find and kill existing process
        result = subprocess.run(
            ["pkill", "-f", "hermes-cluster"],
            capture_output=True, text=True, timeout=5,
        )
        logger.info("pkill result: %s", result.stdout or result.stderr or "ok")

        # Start new process
        proc = subprocess.Popen(
            [binary, "-config", cfg_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return {"ok": True, "pid": proc.pid, "config": cfg_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restart failed: {e}")


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@router.get("/health")
async def health():
    """Check if the cluster service is reachable."""
    try:
        result = _proxy("GET", "/api/v1/nodes")
        return {"ok": True, "nodes": len(result) if isinstance(result, list) else 0}
    except HTTPException:
        return {"ok": False, "error": "Cluster service unreachable"}


# ---------------------------------------------------------------------------
# Cluster Data
# ---------------------------------------------------------------------------


@router.get("/nodes")
async def list_nodes():
    """List all cluster nodes."""
    return _proxy("GET", "/api/v1/nodes")


@router.get("/tasks")
async def list_tasks():
    """List all cluster tasks."""
    return _proxy("GET", "/api/v1/tasks")


@router.get("/leases")
async def list_leases():
    """List all active leases."""
    return _proxy("GET", "/api/v1/leases")


@router.get("/status")
async def get_status(
    node: str = "",
    status: str = "",
    capability: str = "",
):
    """Get global cluster status view with optional filters."""
    params = []
    if node:
        params.append(f"node={node}")
    if status:
        params.append(f"status={status}")
    if capability:
        params.append(f"capability={capability}")
    qs = "?" + "&".join(params) if params else ""
    return _proxy("GET", f"/api/v1/status{qs}")


@router.get("/topology")
async def get_topology():
    """Get cluster topology."""
    return _proxy("GET", "/api/v1/cluster/topology")


@router.get("/cluster-metrics")
async def get_cluster_metrics():
    """Get aggregated cluster metrics."""
    return _proxy("GET", "/api/v1/cluster/metrics")


@router.get("/timeline")
async def get_timeline():
    """Get cluster event timeline."""
    return _proxy("GET", "/api/v1/cluster/timeline")


@router.get("/workflow/graph")
async def get_workflow_graph():
    """Get workflow dependency graph."""
    return _proxy("GET", "/api/v1/workflow/graph")


# ---------------------------------------------------------------------------
# Kanban Board
# ---------------------------------------------------------------------------


class MoveTaskBody(BaseModel):
    status: str
    node_id: Optional[str] = None


@router.get("/kanban/tasks/{task_id}")
async def kanban_task_detail(task_id: str):
    """Get full task detail including dependents and trigger chain."""
    return _proxy("GET", f"/api/v1/tasks/{task_id}")


@router.post("/kanban/tasks/{task_id}/move")
async def kanban_move_task(task_id: str, body: MoveTaskBody):
    """Move a task to a new status column (kanban drag-and-drop)."""
    status = body.status
    # Map kanban column names to cluster task operations
    if status == "completed":
        return _proxy("POST", f"/api/v1/tasks/{task_id}/complete")
    elif status == "failed":
        return _proxy("POST", f"/api/v1/tasks/{task_id}/fail")
    elif status in ("ready", "pending"):
        # Reset task to ready (unassign if needed)
        task = _proxy("GET", f"/api/v1/tasks/{task_id}")
        if isinstance(task, dict) and task.get("assigned_to"):
            _proxy("POST", f"/api/v1/tasks/{task_id}/release", {
                "node_id": task["assigned_to"],
                "reason": "moved_back_to_ready",
            })
        return _proxy("POST", f"/api/v1/tasks/{task_id}/advance")
    elif status == "running":
        # Claim by a node
        node = body.node_id or "node_main"
        return _proxy("POST", f"/api/v1/tasks/{task_id}/claim", {"node_id": node})
    else:
        raise HTTPException(status_code=400, detail=f"Unknown status: {status}")


@router.get("/kanban/columns")
async def kanban_columns():
    """Return kanban board column definitions with tasks grouped."""
    tasks = _proxy("GET", "/api/v1/tasks")
    nodes = _proxy("GET", "/api/v1/nodes")
    if not isinstance(tasks, list):
        tasks = []
    if not isinstance(nodes, list):
        nodes = []

    # Build node lookup
    node_map = {n["id"]: n for n in nodes}

    # Group tasks by status
    columns = {
        "pending": {"label": "Pending", "color": "#3b82f6", "tasks": []},
        "ready": {"label": "Ready", "color": "#3b82f6", "tasks": []},
        "running": {"label": "Running", "color": "#8b5cf6", "tasks": []},
        "completed": {"label": "Completed", "color": "#22c55e", "tasks": []},
        "failed": {"label": "Failed", "color": "#ef4444", "tasks": []},
        "blocked": {"label": "Blocked", "color": "#eab308", "tasks": []},
    }

    for t in tasks:
        status = t.get("status", "pending")
        if status not in columns:
            status = "pending"
        assigned_node = node_map.get(t.get("assigned_to", ""), {})
        columns[status]["tasks"].append({
            "id": t["id"],
            "title": t.get("title", "Untitled"),
            "priority": t.get("priority", 3),
            "requires": t.get("requires", []),
            "depends_on": t.get("depends_on", []),
            "assigned_to": t.get("assigned_to"),
            "assigned_node_name": assigned_node.get("name", t.get("assigned_to")),
            "node_status": assigned_node.get("status", ""),
            "created_at": t.get("created_at", ""),
            "fail_reason": t.get("fail_reason", ""),
        })

    return {
        "columns": [
            {"id": "pending", **columns["pending"]},
            {"id": "ready", **columns["ready"]},
            {"id": "running", **columns["running"]},
            {"id": "completed", **columns["completed"]},
            {"id": "failed", **columns["failed"]},
            {"id": "blocked", **columns["blocked"]},
        ],
        "node_count": len(nodes),
        "online_count": sum(1 for n in nodes if n.get("status") == "online"),
    }


# ---------------------------------------------------------------------------
# Node Management (Kanban CRUD)
# ---------------------------------------------------------------------------


class CreateNodeBody(BaseModel):
    node_name: str
    capabilities: List[str] = []
    endpoint: str = ""


@router.post("/kanban/nodes")
async def kanban_create_node(body: CreateNodeBody):
    """Register a new node in the cluster."""
    return _proxy("POST", "/api/v1/nodes/join", {
        "node_name": body.node_name,
        "capabilities": body.capabilities,
        "endpoint": body.endpoint,
    })


@router.get("/kanban/nodes/{node_id}")
async def kanban_get_node(node_id: str):
    """Get single node detail."""
    return _proxy("GET", f"/api/v1/nodes/{node_id}")


class UpdateNodeBody(BaseModel):
    name: Optional[str] = None
    capabilities: Optional[List[str]] = None


@router.patch("/kanban/nodes/{node_id}")
async def kanban_update_node(node_id: str, body: UpdateNodeBody):
    """Update node name and/or capabilities."""
    payload = {}
    if body.name is not None:
        payload["name"] = body.name
    if body.capabilities is not None:
        payload["capabilities"] = body.capabilities
    return _proxy("PATCH", f"/api/v1/nodes/{node_id}", payload)


@router.delete("/kanban/nodes/{node_id}")
async def kanban_delete_node(node_id: str):
    """Remove a node from the cluster."""
    return _proxy("DELETE", f"/api/v1/nodes/{node_id}")


# ---------------------------------------------------------------------------
# Task Management (Kanban CRUD)
# ---------------------------------------------------------------------------


class CreateTaskBody(BaseModel):
    title: str
    requires: List[str] = []
    priority: int = 3
    depends_on: List[str] = []


@router.post("/kanban/tasks")
async def kanban_create_task(body: CreateTaskBody):
    """Create a new task in the cluster."""
    return _proxy("POST", "/api/v1/tasks", {
        "title": body.title,
        "requires": body.requires,
        "priority": body.priority,
        "depends_on": body.depends_on,
    })


@router.patch("/kanban/tasks/{task_id}")
async def kanban_update_task(task_id: str, body: UpdateTaskRequest):
    """Update task fields."""
    payload = {}
    if body.title is not None:
        payload["title"] = body.title
    if body.requires is not None:
        payload["requires"] = body.requires
    if body.priority is not None:
        payload["priority"] = body.priority
    if body.depends_on is not None:
        payload["depends_on"] = body.depends_on
    return _proxy("PATCH", f"/api/v1/tasks/{task_id}", payload)


@router.delete("/kanban/tasks/{task_id}")
async def kanban_delete_task(task_id: str):
    """Delete a task."""
    return _proxy("DELETE", f"/api/v1/tasks/{task_id}")


# ---------------------------------------------------------------------------
# Chat (node-to-node messaging)
# ---------------------------------------------------------------------------


class SendChatMessageBody(BaseModel):
    sender_node: str
    target_node: str = ""
    content: str
    msg_type: str = "direct"
    session_id: str = ""


class CreateChatSessionBody(BaseModel):
    name: str = ""
    participants: List[str]
    session_type: str = "group"


class MarkReadBody(BaseModel):
    msg_ids: List[str]


@router.get("/chat/peers")
async def chat_list_peers():
    """List all online nodes as chat peers."""
    return _proxy("GET", "/api/v1/chat/peers")


@router.post("/chat/send")
async def chat_send_message(body: SendChatMessageBody):
    """Send a direct or group message."""
    return _proxy("POST", "/api/v1/chat/send", {
        "sender_node": body.sender_node,
        "target_node": body.target_node,
        "content": body.content,
        "msg_type": body.msg_type,
        "session_id": body.session_id,
    })


@router.get("/chat/inbox/{node_id}")
async def chat_get_inbox(node_id: str, unread_only: bool = False):
    """Get messages for a node."""
    qs = "?unread_only=true" if unread_only else ""
    return _proxy("GET", f"/api/v1/chat/inbox/{node_id}{qs}")


@router.post("/chat/inbox/{node_id}/read")
async def chat_mark_read(node_id: str, body: MarkReadBody):
    """Mark messages as read."""
    return _proxy("POST", f"/api/v1/chat/inbox/{node_id}/read", {
        "msg_ids": body.msg_ids,
    })


@router.get("/chat/conversation/{node_a}/{node_b}")
async def chat_get_conversation(node_a: str, node_b: str):
    """Get 1:1 conversation between two nodes."""
    return _proxy("GET", f"/api/v1/chat/conversation/{node_a}/{node_b}")


@router.post("/chat/sessions")
async def chat_create_session(body: CreateChatSessionBody):
    """Create a new group chat session."""
    return _proxy("POST", "/api/v1/chat/sessions", {
        "name": body.name,
        "participants": body.participants,
        "session_type": body.session_type,
    })


@router.get("/chat/sessions")
async def chat_list_sessions(node_id: str = ""):
    """List chat sessions."""
    qs = f"?node_id={node_id}" if node_id else ""
    return _proxy("GET", f"/api/v1/chat/sessions{qs}")


@router.get("/chat/sessions/{session_id}")
async def chat_get_session(session_id: str):
    """Get session details with messages."""
    return _proxy("GET", f"/api/v1/chat/sessions/{session_id}")


@router.post("/chat/sessions/{session_id}/join")
async def chat_join_session(session_id: str, body: dict):
    """Join a group session."""
    return _proxy("POST", f"/api/v1/chat/sessions/{session_id}/join", body)


@router.post("/chat/sessions/{session_id}/leave")
async def chat_leave_session(session_id: str, body: dict):
    """Leave a group session."""
    return _proxy("POST", f"/api/v1/chat/sessions/{session_id}/leave", body)


@router.post("/chat/sessions/{session_id}/send")
async def chat_send_session_message(session_id: str, body: SendChatMessageBody):
    """Send a message to a group session."""
    return _proxy("POST", f"/api/v1/chat/sessions/{session_id}/send", {
        "sender_node": body.sender_node,
        "content": body.content,
    })


@router.delete("/chat/sessions/{session_id}")
async def chat_delete_session(session_id: str):
    """Delete a group session."""
    return _proxy("DELETE", f"/api/v1/chat/sessions/{session_id}")
