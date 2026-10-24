#!/usr/bin/env python3
"""
Orchestrator Hook: Matrix Message → Kanban Task Router

此脚本作为 Hermes orchestrator profile 的 hook，当 Matrix 消息到达时：
1. 分析消息内容
2. 在 swarm 上创建任务
3. 自动分配合适的 worker
4. 设置租户隔离
5. 订阅状态变更通知

使用方法:
  1. 将本脚本放在 ~/.hermes/profiles/orchestrator/scripts/matrix_kanban_router.py
  2. 在 orchestrator 的 config.yaml 中配置 hooks 指向本脚本
  3. 确保 orchestrator profile 已启用 kanban 工具集

环境变量依赖:
  - HERMES_KANBAN_BOARD: 目标看板 (默认 swarm)
  - HERMES_PROFILE: 当前 profile 名
  - 标准 gateway 消息元数据 (由 Hermes 注入)
"""

import json
import os
import re
import sys
from datetime import datetime
from typing import Optional

# 尝试导入 kanban_db
sys.path.insert(0, os.path.expanduser("~/.hermes/hermes-agent"))
try:
    from hermes_cli import kanban_db as kb
except ImportError:
    print("ERROR: kanban_db not available", file=sys.stderr)
    sys.exit(1)


# ── 配置 ───────────────────────────────────────────────────────────

BOARD = os.environ.get("HERMES_KANBAN_BOARD", "swarm")
DEFAULT_ASSIGNEE = "worker-coder"

# Worker 分配规则: 关键词 → profile
WORKER_RULES = [
    ("worker-coder", ["code", "python", "rust", "js", "java", "go", "编程", "代码", "程序", "bug", "fix", "写", "开发", "build", "compile", "git", "github", "docker", "deploy"]),
    ("worker-researcher", ["research", "analyze", "调查", "研究", "分析", "search", "find", "lookup", "compare", "review", "总结", "报告", "report"]),
]

# 直接由 orchestrator 处理的类型 (不创建 kanban 任务)
DIRECT_HANDLE_PATTERNS = [
    r"^(hi|hello|hey|你好|在吗|在？|哈喽|嗨)\b",
    r"^(transfer|转接|联系|@)\b",
    r"^/(status|help|kanban|platforms|whoami)\b",
]


# ── 辅助函数 ───────────────────────────────────────────────────────

def get_tenant(msg_meta: dict) -> str:
    """从消息元数据提取租户名: 群聊名优先，否则用户名。"""
    room_name = msg_meta.get("room_name", "")
    user_name = msg_meta.get("user_name", "")
    chat_id = msg_meta.get("chat_id", "")
    
    # 群聊: 用 room display name
    if room_name and room_name != user_name:
        return room_name.replace(" ", "_").replace("/", "_")[:64]
    
    # DM: 用对方用户名
    if user_name:
        return user_name.replace(" ", "_").replace("/", "_")[:64]
    
    # 兜底
    return chat_id[:64] if chat_id else "default"


def classify_message(text: str) -> tuple[str, Optional[str]]:
    """
    分析消息内容，返回 (action, assignee)。
    action: "assign" | "triage" | "direct"
    assignee: profile 名或 None
    """
    text_lower = text.lower()
    
    # 检查是否直接处理
    for pattern in DIRECT_HANDLE_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            return "direct", None
    
    # 检查各 worker 规则
    for worker, keywords in WORKER_RULES:
        for kw in keywords:
            if kw.lower() in text_lower:
                return "assign", worker
    
    # 无法分类 → triage
    return "triage", None


def create_kanban_task(title: str, body: str, assignee: Optional[str], tenant: str) -> Optional[str]:
    """在 swarm 上创建任务，返回 task_id。"""
    try:
        conn = kb.connect(board=BOARD)
        try:
            # triage 状态通过 triage=True 参数设置，initial_status 只能是 running/blocked
            is_triage = assignee is None
            
            task_id = kb.create_task(
                conn,
                title=title[:120],
                body=body,
                assignee=assignee or DEFAULT_ASSIGNEE,
                tenant=tenant,
                triage=is_triage,
                initial_status="running",
                created_by=os.environ.get("HERMES_PROFILE", "orchestrator"),
            )
            return task_id
        finally:
            conn.close()
    except Exception as e:
        print(f"ERROR creating kanban task: {e}", file=sys.stderr)
        return None


def build_task_body(text: str, meta: dict) -> str:
    """构建任务 body，包含原始消息和元数据。"""
    lines = [
        f"原始消息: {text}",
        "",
        f"来源: {meta.get('platform', 'matrix')}",
        f"用户: {meta.get('user_name', 'unknown')} ({meta.get('user_id', '')})",
    ]
    if meta.get("room_name"):
        lines.append(f"群聊: {meta.get('room_name')}")
    lines.append(f"时间: {datetime.now().isoformat()}")
    return "\n".join(lines)


# ── 主入口 ──────────────────────────────────────────────────────────

def main():
    """
    从 stdin 读取 JSON 消息，处理并输出结果。
    
    输入格式 (由 Hermes gateway 注入):
    {
        "text": "消息内容",
        "user_id": "@user:matrix.org",
        "user_name": "testuser1",
        "chat_id": "!roomid:matrix.org",
        "room_name": "My Room",
        "platform": "matrix",
        "thread_id": "..."
    }
    """
    try:
        raw = sys.stdin.read()
        msg = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        msg = {"text": raw}
    
    text = msg.get("text", "").strip()
    if not text:
        print(json.dumps({"action": "ignore", "reason": "empty message"}))
        return
    
    # 分类
    action, assignee = classify_message(text)
    
    if action == "direct":
        # orchestrator 直接处理，不创建任务
        print(json.dumps({
            "action": "direct",
            "reason": "message matches direct-handle pattern",
            "suggested_response": "收到，我来处理。"
        }))
        return
    
    # 提取租户
    tenant = get_tenant(msg)
    
    # 构建标题和 body
    title = f"{msg.get('user_name', 'Unknown')}: {text[:80]}"
    body = build_task_body(text, msg)
    
    # 创建 kanban 任务
    task_id = create_kanban_task(title, body, assignee, tenant)
    
    if task_id:
        result = {
            "action": "created",
            "task_id": task_id,
            "board": BOARD,
            "tenant": tenant,
            "assignee": assignee or DEFAULT_ASSIGNEE,
            "status": "running" if assignee else "triage",
            "message": f"已在 swarm 创建任务 {task_id}，分配至 {assignee or DEFAULT_ASSIGNEE} (租户: {tenant})",
        }
    else:
        result = {
            "action": "error",
            "reason": "failed to create kanban task",
            "message": "任务创建失败，请检查 kanban 配置。"
        }
    
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
