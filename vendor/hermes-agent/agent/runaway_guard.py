"""Runaway-guard：六类死循环信号检测（吸收自 minimax-code agent-modules/runaway-guard）。

Origin: upstream/minimax-code ``packages/agent-modules/runaway-guard/src/contracts.ts:3-10``
（六类信号枚举）+ ``fingerprint.ts:6-14``（工具步进 HMAC 指纹，限 16KB 有界序列化）。
见 docs/upstream-analysis/minimax-code.md §2.6 与差距表「死循环防护」行。

六信号（与 minimax 同名同义）：
- exact_action_repeat        同一动作（工具+参数指纹）连续重复
- exact_result_repeat        同一结果指纹连续重复（动作可不同）
- same_error_family          同族错误反复（异常类/错误首行归类）
- abab_action_cycle          A/B 交替动作循环（周期 2）
- polling_repeat             轮询式重复：同工具同目标反复且结果不变
- unchanged_progress_repeat  动作在变但结果持续不变（无进展）

语义边界：本守卫只观测与报告（warn 日志 + agent._last_runaway_signal + 观察者通知），
默认不打断执行；``HERMES_RUNAWAY_GUARD_INTERRUPT=1`` 时触发 agent.interrupt()，
``HERMES_RUNAWAY_GUARD=0`` 整体关闭（旁路不影响执行链）。
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

RUNAWAY_SIGNALS = (
    "exact_action_repeat",
    "exact_result_repeat",
    "same_error_family",
    "abab_action_cycle",
    "polling_repeat",
    "unchanged_progress_repeat",
)

# 文本侧信号（mimo max-mode ngram 原语，P6 spec §3.2；与工具侧六信号分表冻结）。
TEXT_SIGNALS = ("text_ngram_repeat",)

_NGRAM_N_WORDS = 8          # mimo max-mode.ts:22-28 同款词级 8-gram
_NGRAM_REPEAT_THRESHOLD = 0.6
_NGRAM_CONSECUTIVE_WINDOWS = 2
_TEXT_WINDOW = 4             # 滚动保留最近几条 assistant 文本

_FINGERPRINT_INPUT_CAP_BYTES = 16 * 1024  # minimax fingerprint.ts 同款有界序列化
_DEFAULT_WINDOW = 24


def runaway_guard_enabled() -> bool:
    return os.environ.get("HERMES_RUNAWAY_GUARD", "1").strip().lower() not in ("0", "false", "off", "no")


def should_interrupt_on_signal() -> bool:
    return os.environ.get("HERMES_RUNAWAY_GUARD_INTERRUPT", "0").strip().lower() in ("1", "true", "yes", "on")


def _bounded_bytes(value: Any) -> bytes:
    """有界序列化：超限值截断（16KB 上限，同 minimax 语义——指纹稳定且防超大参数 DoS）。"""
    try:
        raw = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    except (TypeError, ValueError):
        raw = repr(value).encode("utf-8", "replace")
    if len(raw) > _FINGERPRINT_INPUT_CAP_BYTES:
        raw = raw[:_FINGERPRINT_INPUT_CAP_BYTES] + b"...[truncated]"
    return raw


def step_fingerprint(tool: str, args: Any) -> str:
    return hmac.new(b"hermes-runaway-guard", tool.encode("utf-8", "replace") + b"\x00" + _bounded_bytes(args),
                    hashlib.sha256).hexdigest()


def _result_fingerprint(result: Any) -> str:
    return hashlib.sha256(_bounded_bytes(result)).hexdigest()


def _error_family(result: Any) -> Optional[str]:
    """结果错误的族名：首行做数字归一化（端口/行号/计数等动态尾巴不影响族判定）。"""
    if not isinstance(result, str) or "error" not in result.lower():
        return None
    first = result.strip().splitlines()[0] if result.strip() else ""
    if not first:
        return None
    import re
    return re.sub(r"\d+", "N", first)[:80]


@dataclass
class RunawaySignal:
    signal: str
    tool: str
    count: int
    detail: str
    fingerprint: Optional[str] = None


@dataclass
class RunawayGuard:
    """滚动窗口六信号检测器（无 IO、无锁；每 agent 一实例）。"""

    window: int = _DEFAULT_WINDOW
    exact_repeat_threshold: int = 3      # 连续同动作/同结果次数
    abab_cycle_threshold: int = 2        # 完整 AB 周期数
    polling_threshold: int = 4           # 同工具同结果轮询次数
    unchanged_threshold: int = 5         # 动作变结果不变次数
    error_family_threshold: int = 3      # 同族错误窗口内次数
    _actions: list = field(default_factory=list)   # [(tool, action_fp)]
    _results: list = field(default_factory=list)   # [result_fp]
    _errors: list = field(default_factory=list)    # [family]
    _texts: list = field(default_factory=list)     # [frozenset(ngram) | None]
    _text_hot_windows: int = 0
    _last_signal: Optional[RunawaySignal] = None

    def observe_tool_step(self, tool: str, args: Any, result: Any) -> Optional[RunawaySignal]:
        """每个完成的工具调用喂一次；返回本次触发的信号（可 None）。同一指纹多次触发每步都报（计数递增）。"""
        action_fp = step_fingerprint(tool, args)
        result_fp = _result_fingerprint(result)
        family = _error_family(result)
        self._actions.append((tool, action_fp))
        self._results.append(result_fp)
        self._errors.append(family)
        for buf in (self._actions, self._results, self._errors):
            # window 下限夹到 ≥1：防御性误设 window=0 时 -0==0 什么都不裁（无界增长）。
            del buf[: -max(1, self.window)]

        signal = (
            self._check_exact_action_repeat(tool, action_fp)
            or self._check_exact_result_repeat(tool, result_fp)
            or self._check_same_error_family(tool, family)
            or self._check_abab_cycle(tool)
            or self._check_polling_repeat(tool, action_fp, result_fp)
            or self._check_unchanged_progress(tool, result_fp)
        )
        if signal is not None:
            self._last_signal = signal
        return signal

    # ── 文本侧（ngram 防循环，mimo max-mode 原语；P6 spec §3.2）──

    def observe_text_step(self, text: str) -> Optional[RunawaySignal]:
        """每条完成的 assistant 文本喂一次；相邻两窗 ngram 重复率连续超阈 → 信号。

        只发信号不打断（处置权在人，与 cockpit 失控信号语义一致）。短文本（不足一个
        8-gram）不参与，避免把简短确认语误判为循环。
        """
        grams = self._text_ngrams(text)
        if not grams:
            self._texts.append(None)  # 占位保持窗口连续性语义：无法判定 ≠ 通过
            del self._texts[:-_TEXT_WINDOW]
            self._text_hot_windows = 0
            return None
        self._texts.append(grams)
        del self._texts[:-_TEXT_WINDOW]
        prev = self._texts[-2] if len(self._texts) >= 2 else None
        if prev is None:
            return None
        overlap = len(grams & prev) / max(1, len(grams | prev))  # Jaccard
        if overlap > _NGRAM_REPEAT_THRESHOLD:
            self._text_hot_windows += 1
            if self._text_hot_windows >= _NGRAM_CONSECUTIVE_WINDOWS:
                sig = RunawaySignal(
                    "text_ngram_repeat", "(assistant-text)", self._text_hot_windows,
                    f"相邻文本窗 8-gram 重复率连续 {self._text_hot_windows} 次超 {_NGRAM_REPEAT_THRESHOLD}（最新 {overlap:.2f}）",
                )
                self._last_signal = sig
                return sig
        else:
            self._text_hot_windows = 0
        return None

    @staticmethod
    def _text_ngrams(text: str) -> Optional[frozenset]:
        words = text.split()
        if len(words) < _NGRAM_N_WORDS:
            return None
        return frozenset(
            " ".join(words[i:i + _NGRAM_N_WORDS])
            for i in range(len(words) - _NGRAM_N_WORDS + 1)
        )

    @property
    def last_signal(self) -> Optional[RunawaySignal]:
        return self._last_signal

    # ── 各信号判定（按检测代价从廉到贵排列）──

    def _check_exact_action_repeat(self, tool: str, action_fp: str) -> Optional[RunawaySignal]:
        n = 0
        for _, fp in reversed(self._actions):
            if fp != action_fp:
                break
            n += 1
        if n >= self.exact_repeat_threshold:
            return RunawaySignal("exact_action_repeat", tool, n,
                                 f"同一动作连续 {n} 次（阈值 {self.exact_repeat_threshold}）", action_fp)
        return None

    def _check_exact_result_repeat(self, tool: str, result_fp: str) -> Optional[RunawaySignal]:
        """同工具内同一结果连续重复；跨工具的"结果不变"归 unchanged_progress_repeat。"""
        n = 0
        for (t, _), rfp in zip(reversed(self._actions), reversed(self._results)):
            if t != tool or rfp != result_fp:
                break
            n += 1
        if n >= self.exact_repeat_threshold:
            return RunawaySignal("exact_result_repeat", tool, n,
                                 f"同一结果连续 {n} 次（同工具；动作可不同）", result_fp)
        return None

    def _check_same_error_family(self, tool: str, family: Optional[str]) -> Optional[RunawaySignal]:
        if family is None:
            return None
        n = sum(1 for f in self._errors if f is not None and f == family)
        if n >= self.error_family_threshold:
            return RunawaySignal("same_error_family", tool, n,
                                 f"窗口内同族错误 {n} 次：{family[:60]}")
        return None

    def _check_abab_cycle(self, tool: str) -> Optional[RunawaySignal]:
        acts = [fp for _, fp in self._actions]
        if len(acts) < 2 * self.abab_cycle_threshold:
            return None
        tail = acts[-(2 * self.abab_cycle_threshold):]
        a, b = tail[0], tail[1]
        if a == b:
            return None  # AAAA 由 exact_action_repeat 管
        if all(fp == (a if i % 2 == 0 else b) for i, fp in enumerate(tail)):
            return RunawaySignal("abab_action_cycle", tool, self.abab_cycle_threshold,
                                 f"A/B 交替动作循环 ≥{self.abab_cycle_threshold} 完整周期", a)
        return None

    def _check_polling_repeat(self, tool: str, action_fp: str, result_fp: str) -> Optional[RunawaySignal]:
        """同工具 + 同动作指纹 + 同结果：轮询未果（区别于 exact_action_repeat 的纯动作重复）。"""
        n = 0
        for (t, afp), rfp in zip(reversed(self._actions), reversed(self._results)):
            if t == tool and afp == action_fp and rfp == result_fp:
                n += 1
            else:
                break
        if n >= self.polling_threshold:
            return RunawaySignal("polling_repeat", tool, n,
                                 f"同工具同参数轮询 {n} 次结果不变（阈值 {self.polling_threshold}）", action_fp)
        return None

    def _check_unchanged_progress(self, tool: str, result_fp: str) -> Optional[RunawaySignal]:
        """动作指纹在变但结果持续不变：有在动、没在走。"""
        n = 0
        for rfp in reversed(self._results):
            if rfp != result_fp:
                break
            n += 1
        if n >= self.unchanged_threshold:
            distinct_actions = len({fp for _, fp in self._actions[-n:]})
            if distinct_actions >= 2:
                return RunawaySignal("unchanged_progress_repeat", tool, n,
                                     f"结果连续 {n} 次不变而动作有 {distinct_actions} 种（无进展）", result_fp)
        return None


def get_agent_guard(agent: Any) -> RunawayGuard:
    """每 agent 惰性单例（挂在 agent 上，随会话生命周期）。"""
    guard = getattr(agent, "_runaway_guard", None)
    if guard is None:
        guard = RunawayGuard()
        agent._runaway_guard = guard
    return guard


def observe_tool_step(agent: Any, tool: str, args: Any, result: Any,
                      notify: Optional[Callable[[RunawaySignal], None]] = None) -> Optional[RunawaySignal]:
    """tool_executor 步进接线点：关守卫时零成本直通。"""
    if not runaway_guard_enabled():
        return None
    guard = get_agent_guard(agent)
    signal = guard.observe_tool_step(tool, args, result)
    if signal is not None:
        _report_signal(agent, signal, notify)
    return signal


def _report_signal(agent: Any, signal: RunawaySignal,
                   notify: Optional[Callable[[RunawaySignal], None]]) -> None:
    logger.warning("runaway-guard [%s] %s: %s", signal.signal, signal.tool, signal.detail)
    agent._last_runaway_signal = signal
    if notify is not None:
        try:
            notify(signal)
        except Exception:  # noqa: BLE001 - 通知面故障绝不影响执行链
            pass
    if should_interrupt_on_signal():
        try:
            agent.interrupt(f"runaway-guard: {signal.signal}")
        except Exception:  # noqa: BLE001
            pass
    # 605 监督决策面：report/watchdog_retry/ralph_loop 三模式处置（默认 report 只报）。
    # 懒加载避免模块环；fail-open。
    try:
        from agent.runaway_supervisor import handle_runaway_signal
        handle_runaway_signal(agent, signal)
    except Exception:  # noqa: BLE001
        pass


def _text_content(message: Any) -> str:
    """从 assistant 消息或裸字符串提取文本内容（容错：非文本形态返回空）。"""
    if isinstance(message, str):
        return message
    content = getattr(message, "content", None)
    if content is None and isinstance(message, dict):
        content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and isinstance(part.get("text"), str):
                parts.append(part["text"])
        return "\n".join(parts)
    return ""


def observe_text_step(agent: Any, message_or_text: Any,
                      notify: Optional[Callable[[RunawaySignal], None]] = None) -> Optional[RunawaySignal]:
    """conversation_loop 文本侧接线点（每条 assistant 消息一次）；关守卫时零成本直通。"""
    if not runaway_guard_enabled():
        return None
    guard = get_agent_guard(agent)
    signal = guard.observe_text_step(_text_content(message_or_text))
    if signal is not None:
        _report_signal(agent, signal, notify)
    return signal
