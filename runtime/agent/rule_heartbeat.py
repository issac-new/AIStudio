"""规则心跳（rule heartbeat，长会话治理 601）：周期性把核心纪律重申进当前回合。

问题：长会话里系统提示词为保前缀缓存全程冻结（重建仅发生在压缩/能力版本变化），
早期约束被大量中间产物稀释——指令遵循与证据纪律随轮次衰减（run12 假截图、
run14「结论可信证据不可信」的实测形态）。

机制：完全复用 iteration-budget warning 的注入缝——只把通知追加到**最新一条
尚未持久化的 tool 行**尾部（``agent/turn_iteration_prep.py`` 先例），绝不新增
合成 user/system 行、绝不触碰冻结的系统提示词前缀，前缀缓存零破坏。计数器
``_rule_heartbeat_step`` 每次外层迭代 +1，每逢 interval 整数倍注入一次。

配置（config.yaml ``agent.rule_heartbeat_interval``，经 ``_apply_agent_section``）：
- 缺省 = 12（每 12 次迭代一次）；0 = 关闭；<3 夹到 3（防每迭代刷屏）。
- 追加段：``<HERMES_HOME>/rule-heartbeat.md`` 存在时读入（2048 字符有界），
  作为部署侧自定义条款注入（style-charter 的运行时伴生位）。

kanban worker 变体（HERMES_KANBAN_TASK + 派发器持有 + kanban_complete 在工具表）：
额外重申验收判据纪律——结卡前回看任务卡验收标准，diff/commit 不构成完成证据。
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

logger = logging.getLogger("agent.conversation_loop")

DEFAULT_HEARTBEAT_INTERVAL = 12
MIN_HEARTBEAT_INTERVAL = 3
_EXTRA_SECTION_CAP = 2048

RULE_HEARTBEAT_TEMPLATE = (
    "[SYSTEM NOTICE — rule heartbeat #{index}] Standing rules still apply:\n"
    "1. Stay inside your assigned role and task boundary; do not take over other roles' work.\n"
    "2. Every claim needs an evidence anchor (file:line, command output, or URL); "
    "no evidence, no PASS.\n"
    "3. Do not declare completion without verification; a diff or a commit alone "
    "is not completion evidence.\n"
    "4. If blocked, persist a handoff (done / left / blocked) instead of idling."
)

_KANBAN_WORKER_ADDENDUM = (
    "\n5. Before continuing, re-check the task card's acceptance criteria; call "
    "kanban_complete only when all requirements are verified, otherwise "
    "kanban_request_review or persist a kanban_comment handoff."
)


def resolve_heartbeat_interval(agent: Any) -> int:
    """0 = off；缺省 DEFAULT；<3 夹到 MIN（防每迭代刷屏）。"""
    raw = getattr(agent, "rule_heartbeat_interval", None)
    if raw is None:
        return DEFAULT_HEARTBEAT_INTERVAL
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_HEARTBEAT_INTERVAL
    if value <= 0:
        return 0
    return max(value, MIN_HEARTBEAT_INTERVAL)


def _extra_section() -> str:
    """部署侧自定义条款（<HERMES_HOME>/rule-heartbeat.md，有界、缺席为空）。"""
    try:
        from hermes_constants import get_hermes_home
        path = get_hermes_home() / "rule-heartbeat.md"
        if not path.is_file():
            return ""
        text = path.read_text(encoding="utf-8", errors="replace").strip()
        if len(text) > _EXTRA_SECTION_CAP:
            text = text[:_EXTRA_SECTION_CAP] + "\n...[truncated]"
        return "\nDeployed charter:\n" + text if text else ""
    except Exception:  # noqa: BLE001 - 心跳面故障绝不影响执行链
        return ""


def _is_kanban_worker(agent: Any) -> bool:
    try:
        from agent.delegation_context import is_dispatcher_owned_worker_context
        return (
            bool(os.environ.get("HERMES_KANBAN_TASK"))
            and is_dispatcher_owned_worker_context()
            and "kanban_complete" in getattr(agent, "valid_tool_names", ())
        )
    except Exception:  # noqa: BLE001
        return False


def maybe_inject_rule_heartbeat(agent: Any, messages: Any) -> bool:
    """每次外层迭代调用一次（prepare_iteration 内）；返回是否注入。

    缓存契约（与 budget warning 同款）：仅当最新行是**未持久化**的 tool 行时
    追加文本；否则本次心跳静默跳过（step 已计数，下一倍数再试）——绝不把
    通知塞进历史行或合成新行，前缀缓存不受影响。
    """
    if getattr(agent, "_interrupt_requested", False):
        return False
    interval = resolve_heartbeat_interval(agent)
    if interval <= 0:
        return False
    step = getattr(agent, "_rule_heartbeat_step", 0) + 1
    agent._rule_heartbeat_step = step
    if step % interval != 0:
        return False

    from agent.context_compressor import _DB_PERSISTED_MARKER
    if (not messages or messages[-1].get("role") != "tool"
            or messages[-1].get(_DB_PERSISTED_MARKER)):
        return False

    notice = RULE_HEARTBEAT_TEMPLATE.format(index=getattr(agent, "_rule_heartbeats_emitted", 0) + 1)
    if _is_kanban_worker(agent):
        notice += _KANBAN_WORKER_ADDENDUM
    notice += _extra_section()

    message = messages[-1]
    content = message.get("content", "")
    if isinstance(content, str):
        message["content"] = content + f"\n\n{notice}"
    elif isinstance(content, list) or content is None:
        message["content"] = [*(content or []), {"type": "text", "text": notice}]
    else:
        return False

    agent._rule_heartbeats_emitted = getattr(agent, "_rule_heartbeats_emitted", 0) + 1
    logger.info(
        "rule heartbeat #%s injected at iteration step %s (session=%s)",
        agent._rule_heartbeats_emitted, step, getattr(agent, "session_id", "-"),
    )
    return True


def heartbeat_counters(agent: Any) -> dict:
    """遥测读数（602 sidecar 消费）：累计步数/已注入次数/生效间隔。"""
    return {
        "step": getattr(agent, "_rule_heartbeat_step", 0),
        "emitted": getattr(agent, "_rule_heartbeats_emitted", 0),
        "interval": resolve_heartbeat_interval(agent),
    }


def parse_heartbeat_config(raw: Any) -> Optional[int]:
    """config.yaml agent.rule_heartbeat_interval 归一化：非法值回落缺省（None 表缺省）。"""
    if raw is None:
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value >= 0 else None
