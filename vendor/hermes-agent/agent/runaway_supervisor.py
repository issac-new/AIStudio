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
from typing import Literal, Optional

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
