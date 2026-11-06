"""runaway 监督模式（routa §七#8 吸收，矩阵 §3.6 P1——衔接 401 runaway-guard 信号）。

routa 语义（workflow-orchestrator.ts:28-29/56-74）：dev 列 watchdog 30s 扫描 +
监督模式 watchdog_retry|ralph_loop + 有界恢复 maxRecoveryAttempts。

hermes 形状（判定面先行，执行钩子列后续——同 415 编排执行半环模式）：
- 401 runaway-guard 六信号/405 ngram 文本信号 → 本模块决策动作；
- 三模式：report（只报不处置，默认）| watchdog_retry（信号→有界重试当前轮）
  | ralph_loop（信号→重跑任务，Ralph 循环）；
- 有界恢复：maxRecoveryAttempts（默认 3）——超界转人工（stop）；
- 配置：HERMES_RUNAWAY_SUPERVISOR=report|watchdog_retry|ralph_loop、
  HERMES_RUNAWAY_MAX_RECOVERY=3。
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Literal, Optional

SupervisorMode = Literal["report", "watchdog_retry", "ralph_loop"]
SupervisorAction = Literal["report", "retry", "ralph_loop", "stop"]

DEFAULT_MAX_RECOVERY = 3


def supervisor_mode() -> SupervisorMode:
    raw = os.environ.get("HERMES_RUNAWAY_SUPERVISOR", "report").strip().lower()
    return raw if raw in ("report", "watchdog_retry", "ralph_loop") else "report"


def max_recovery() -> int:
    try:
        n = int(os.environ.get("HERMES_RUNAWAY_MAX_RECOVERY", str(DEFAULT_MAX_RECOVERY)))
        return n if n > 0 else DEFAULT_MAX_RECOVERY
    except (TypeError, ValueError):
        return DEFAULT_MAX_RECOVERY


@dataclass
class SupervisorDecision:
    action: SupervisorAction
    attempts_used: int
    attempts_limit: int
    detail: str


class RunawaySupervisor:
    """每 agent/task 一实例：信号→动作决策（纯判定+计数，执行面挂接后续）。"""

    def __init__(self, mode: Optional[SupervisorMode] = None, limit: Optional[int] = None):
        self.mode = mode or supervisor_mode()
        self.limit = limit if limit is not None else max_recovery()
        self._attempts = 0

    @property
    def attempts_used(self) -> int:
        return self._attempts

    def on_signal(self, signal_name: str) -> SupervisorDecision:
        if self.mode == "report":
            return SupervisorDecision("report", self._attempts, self.limit, f"runaway 信号 {signal_name} 只报不处置")
        if self._attempts >= self.limit:
            # 有界恢复转人工（routa maxRecoveryAttempts 语义）。
            return SupervisorDecision("stop", self._attempts, self.limit, f"恢复尝试已尽（{self._attempts}/{self.limit}），转人工")
        self._attempts += 1
        if self.mode == "watchdog_retry":
            return SupervisorDecision("retry", self._attempts, self.limit, f"watchdog_retry 第 {self._attempts}/{self.limit} 次：重试当前轮（{signal_name}）")
        return SupervisorDecision("ralph_loop", self._attempts, self.limit, f"ralph_loop 第 {self._attempts}/{self.limit} 次：重跑任务（{signal_name}）")

    def reset(self) -> None:
        self._attempts = 0


# ── 执行面接线（长会话治理 605）：401 判定面的消费方 ──────────────────────────

_ACTION_INTERRUPT_TEXT = {
    "retry": (
        "runaway supervisor (watchdog_retry): the last tool loop is repeating without "
        "progress. Change approach or persist a done/left/blocked handoff; do not "
        "re-issue the same failing call."
    ),
    "ralph_loop": (
        "runaway supervisor (ralph_loop): the task needs a fresh restart from its "
        "task card; summarize done/left/blocked before continuing."
    ),
    "stop": (
        "runaway supervisor: bounded recovery attempts exhausted — stop autonomous "
        "retries, persist a done/left/blocked handoff and surface the blocker for a human."
    ),
}


def get_agent_supervisor(agent: Any) -> "RunawaySupervisor":
    """每 agent 惰性单例（随会话生命周期；与 401 的 guard 单例同款挂法）。"""
    supervisor = getattr(agent, "_runaway_supervisor", None)
    if supervisor is None:
        supervisor = RunawaySupervisor()
        agent._runaway_supervisor = supervisor
    return supervisor


def handle_runaway_signal(agent: Any, signal: Any) -> Optional["SupervisorDecision"]:
    """401 观测到六信号后的决策执行面（runaway_guard.observe_tool_step 调用）。

    - report（默认）：monitoring 事件 + 计数，不干预执行链；
    - watchdog_retry / ralph_loop / stop：调用 agent.interrupt() 带指引文本终止当前轮
      （v1 语义：重试/重跑以"带指引的打断"落地，接手会话/下一轮按指引重启）；
    - 与 401 自身的 HERMES_RUNAWAY_GUARD_INTERRUPT 直通打断独立：若守卫已打断，
      supervisor 只补决策记录不再重复打断。
    全函数 fail-open：决策面故障绝不影响执行链。
    """
    try:
        supervisor = get_agent_supervisor(agent)
        decision = supervisor.on_signal(getattr(signal, "signal", str(signal)))
        agent._runaway_decisions = getattr(agent, "_runaway_decisions", 0) + 1
        agent._last_runaway_decision = decision
        try:
            from agent.monitoring import emit
            emit({
                "event": "runaway_supervisor",
                "signal": getattr(signal, "signal", None),
                "tool": getattr(signal, "tool", None),
                "count": getattr(signal, "count", None),
                "decision": decision.action,
                "attempts_used": decision.attempts_used,
                "attempts_limit": decision.attempts_limit,
            })
        except Exception:  # noqa: BLE001 - 监控面缺席不阻断
            pass
        if decision.action in _ACTION_INTERRUPT_TEXT and not getattr(agent, "_interrupt_requested", False):
            try:
                agent.interrupt(_ACTION_INTERRUPT_TEXT[decision.action])
            except Exception:  # noqa: BLE001
                pass
        return decision
    except Exception:  # noqa: BLE001
        return None
