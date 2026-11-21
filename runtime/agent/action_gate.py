"""Action 契约确定性校验器核心 (fail-closed)。

P1-2b impl-2 (kanban t_7c07c663)。来源设计:
- 契约来源: ~/.hermes/profiles/_shared/action-contracts.yaml (由 ontology.md §二 机械生成)
- 借鉴 nous L1 constraint_parser.py:100-128 —— 加载失败/0 条契约 -> FAIL_CLOSED
- 借鉴 Hermes plugins.py:6354-6357 —— 校验器自身异常 -> 返回 block message
- 借鉴 nous L2 triviality_filter —— local_reversible 动作零开销直通
- 借鉴 nous L4 V1/V4 思想 —— terminal 命令黑名单正则

P1-2b impl-4 (kanban t_cc655ecb): shadow 灰度支持
- config.yaml action_gate.mode: shadow|enforce (默认 shadow)
- shadow 模式: 校验照跑, block 候选写 JSONL 日志, 不阻断
- enforce 模式: 真实阻断
- 借鉴 nous observability.log_decision 的 JSONL 落盘形状

本模块只做「校验并返回 Optional[block message]」, 不含拦截层嵌入 (impl-3)。
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

import hermes_yaml as yaml

DEFAULT_CONTRACTS_PATH = Path.home() / ".hermes" / "profiles" / "_shared" / "action-contracts.yaml"
DEFAULT_SHADOW_LOG_PATH = Path.home() / ".hermes" / "profiles" / "_shared" / "action_gate_shadow.jsonl"

# ---------------------------------------------------------------------------
# impl-4: shadow 灰度 — mode 解析 + JSONL 日志
# ---------------------------------------------------------------------------

_VALID_MODES = frozenset({"shadow", "enforce"})
_DEFAULT_MODE = "shadow"


# 延迟导入的 config 加载器, 便于测试时 mock。
# 生产环境从 hermes_cli.config 导入; 测试可 patch 此模块级引用。
try:
    from hermes_cli.config import load_config_readonly
except ImportError:
    load_config_readonly = None  # type: ignore[assignment]


def get_action_gate_mode() -> str:
    """从 config.yaml 读取 action_gate.mode，默认 shadow。

    任何读取异常（config 不存在、YAML 解析错、键缺失、非法值）均回退到
    shadow —— 灰度默认安全侧，不阻断线上 agent 行为。
    """
    try:
        if load_config_readonly is None:
            return _DEFAULT_MODE
        cfg = load_config_readonly()
        gate_cfg = cfg.get("action_gate")
        if not isinstance(gate_cfg, dict):
            return _DEFAULT_MODE
        mode = gate_cfg.get("mode", _DEFAULT_MODE)
        if isinstance(mode, str) and mode.lower() in _VALID_MODES:
            return mode.lower()
        return _DEFAULT_MODE
    except Exception:
        return _DEFAULT_MODE


def log_shadow_decision(
    tool_name: str,
    args: Optional[Dict[str, Any]],
    block_message: str,
    *,
    log_path: Optional[Path] = None,
) -> None:
    """把 shadow 模式下的 block 候选写入 JSONL 日志。

    借鉴 nous observability.log_decision 形状: 每行一个 JSON 对象,
    含时间戳、工具名、参数摘要、block 原因。日志写入失败不影响主流程。
    """
    path = Path(log_path) if log_path is not None else DEFAULT_SHADOW_LOG_PATH
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        # 参数摘要: 截断防止大对象撑爆日志
        args_summary: Dict[str, Any] = {}
        if isinstance(args, dict):
            for k, v in args.items():
                s = repr(v)
                args_summary[k] = s[:200] if len(s) > 200 else s
        record = {
            "ts": time.time(),
            "ts_iso": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "gate": "action_gate",
            "mode": "shadow",
            "tool": tool_name,
            "args_summary": args_summary,
            "block_message": block_message,
            "action": "would_block",
        }
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass  # 日志写入失败不阻断


def gate_tool_call(
    tool_name: str,
    args: Optional[Dict[str, Any]],
    contracts: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """统一入口: 根据 action_gate.mode 决定 shadow 还是 enforce。

    - enforce: 校验失败 -> 返回 block message (真实阻断)
    - shadow:  校验照跑, block 候选写 JSONL 日志, 返回 None (不阻断)

    这是 impl-3 拦截层嵌入的唯一调用点。
    """
    block_message = check_action_contract(tool_name, args, contracts)
    if block_message is None:
        return None

    mode = get_action_gate_mode()
    if mode == "enforce":
        return block_message

    # shadow: 落日志, 放行
    log_shadow_decision(tool_name, args, block_message)
    return None


class ActionGateLoadError(Exception):
    """契约 YAML 加载失败或契约数为 0 时抛出 (fail-closed)。"""


# ---------------------------------------------------------------------------
# 加载
# ---------------------------------------------------------------------------

def load_action_contracts(path: Optional[Path] = None) -> Dict[str, Any]:
    """加载 action 契约 YAML。加载失败或 0 条 action -> ActionGateLoadError。

    Fail-closed (借鉴 nous constraint_parser.py:100-128): 门禁数据缺失时
    宁可拒绝运行也不放行未知状态。
    """
    contracts_path = Path(path) if path is not None else DEFAULT_CONTRACTS_PATH
    try:
        if not contracts_path.exists():
            raise ActionGateLoadError(
                f"action contracts file not found: {contracts_path} (fail-closed)"
            )
        with contracts_path.open("r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
    except ActionGateLoadError:
        raise
    except Exception as exc:  # YAML 解析错 / IO 错等
        raise ActionGateLoadError(
            f"failed to load action contracts from {contracts_path}: {exc} (fail-closed)"
        ) from exc

    if not isinstance(data, dict):
        raise ActionGateLoadError(
            f"action contracts root is not a mapping: {contracts_path} (fail-closed)"
        )
    actions = data.get("actions")
    if not isinstance(actions, dict) or len(actions) == 0:
        raise ActionGateLoadError(
            f"action contracts contain 0 actions: {contracts_path} (fail-closed)"
        )
    return data


# ---------------------------------------------------------------------------
# 校验
# ---------------------------------------------------------------------------

# 语义层契约名 (如 browser_navigate) 可能对应多个现行工具名; 反向索引在加载时构建
def _build_reverse_mapping(contracts: Dict[str, Any]) -> Dict[str, str]:
    """tool 名 -> 语义契约 action 名。"""
    reverse: Dict[str, str] = {}
    mapping = contracts.get("tool_mapping") or {}
    if isinstance(mapping, dict):
        for semantic_name, tool_names in mapping.items():
            if isinstance(tool_names, list):
                for tool_name in tool_names:
                    reverse.setdefault(str(tool_name), str(semantic_name))
    return reverse


def _resolve_action(tool_name: str, contracts: Dict[str, Any]) -> Optional[str]:
    """把现行工具名解析为契约 action 名; 直接命中优先, 其次走 tool_mapping。
    
    先处理 legacy tool aliases (model_tools._LEGACY_TOOL_ALIASES), 再走契约映射。
    """
    # 先尝试解析 legacy alias
    try:
        from model_tools import _LEGACY_TOOL_ALIASES as _lta
        tool_name = _lta.get(tool_name, tool_name)
    except Exception:
        pass
    
    actions = contracts["actions"]
    if tool_name in actions:
        return tool_name
    reverse = _build_reverse_mapping(contracts)
    mapped = reverse.get(tool_name)
    if mapped in actions:
        return mapped
    return None


def _check_terminal_blacklist(command: Any, patterns: List[str]) -> Optional[str]:
    if not isinstance(command, str) or not command.strip():
        return None
    for pattern in patterns:
        try:
            if re.search(pattern, command):
                return (
                    f"action-gate: terminal command matches blacklist pattern "
                    f"`{pattern}` — blocked (fail-closed)"
                )
        except re.error as exc:
            # 黑名单正则本身坏掉 -> fail-closed
            return f"action-gate: blacklist regex error `{pattern}`: {exc} — blocked (fail-closed)"
    return None


def _check_arg_contracts(
    action_name: str,
    args: Dict[str, Any],
    arg_contracts: Dict[str, Any],
) -> Optional[str]:
    spec = arg_contracts.get(action_name)
    if not isinstance(spec, dict):
        return None

    when_action = spec.get("when_action")
    if when_action is not None and args.get("action") != when_action:
        return None

    for required in spec.get("required_args") or []:
        value = args.get(required)
        if value is None or (isinstance(value, str) and not value.strip()):
            return (
                f"action-gate: `{action_name}` requires arg `{required}` "
                f"(reversible=false contract) — blocked"
            )

    enum_args = spec.get("enum_args") or {}
    if isinstance(enum_args, dict):
        for arg_name, allowed in enum_args.items():
            value = args.get(arg_name)
            if value is None:
                return (
                    f"action-gate: `{action_name}` requires enum arg `{arg_name}` "
                    f"(allowed: {allowed}) — blocked"
                )
            if value not in allowed:
                return (
                    f"action-gate: `{action_name}` arg `{arg_name}`={value!r} "
                    f"not in allowed enum {allowed} — blocked"
                )
    return None


def check_action_contract(
    tool_name: str,
    args: Optional[Dict[str, Any]],
    contracts: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """校验一次工具调用是否符合 Action 契约。

    返回 block message (str) 或 None (放行)。

    Fail-closed 三处:
    1. 契约加载失败/0 条 -> 由 load_action_contracts 抛 ActionGateLoadError;
       本函数内部捕获并转为 block message。
    2. 校验器自身任何异常 -> 返回 block message (借鉴 plugins.py:6354-6357)。
    3. 新工具未在契约中显式登记 -> 按 default_policy (reversible=false,
       shared_state) 兜底, reversible=false 即 block (ontology.md v1.4 条款)。
    """
    try:
        if contracts is None:
            contracts = load_action_contracts()
    except ActionGateLoadError as exc:
        return f"action-gate: contracts load failed: {exc} — blocked (fail-closed)"
    except Exception as exc:  # 防御: 加载路径上的任何异常
        return f"action-gate: unexpected contracts load error: {exc} — blocked (fail-closed)"

    try:
        return _check_action_contract_inner(tool_name, args, contracts)
    except Exception as exc:
        return f"action-gate: internal validator error: {exc} — blocked (fail-closed)"


def _check_action_contract_inner(
    tool_name: str,
    args: Optional[Dict[str, Any]],
    contracts: Dict[str, Any],
) -> Optional[str]:
    safe_args: Dict[str, Any] = args if isinstance(args, dict) else {}
    actions: Dict[str, Any] = contracts["actions"]
    gated_levels = set(contracts.get("gated_levels") or ["high_risk", "shared_state"])

    action_name = _resolve_action(tool_name, contracts)

    if action_name is None:
        # 新工具兜底 (ontology.md v1.4): 默认 reversible=false/shared_state。
        # reversible=false 的未登记工具在登记前一律 block。
        default_policy = contracts.get("default_policy") or {}
        if default_policy.get("reversible") is False:
            return (
                f"action-gate: tool `{tool_name}` is not registered in action "
                f"contracts; default policy reversible=false/shared_state applies "
                f"(ontology v1.4) — blocked until explicitly registered"
            )
        return None

    entry = actions.get(action_name) or {}
    reversible = entry.get("reversible")
    level = entry.get("level")

    # local_reversible / reversible=true / reversible=NA: 零开销直通
    # (借鉴 nous L2 triviality filter: 只对高危层进入深度校验)
    if reversible is not False or level not in gated_levels:
        # terminal 例外: level=command_dependent, reversible=false 但 level
        # 不在 gated_levels —— 仍需跑命令黑名单 (借鉴 nous L4 V1/V4)。
        if action_name == "terminal":
            patterns = contracts.get("terminal_blacklist") or []
            return _check_terminal_blacklist(safe_args.get("command"), list(patterns))
        return None

    # reversible=false 且 level ∈ gated_levels: 参数级契约校验
    arg_contracts = contracts.get("arg_contracts") or {}
    if isinstance(arg_contracts, dict):
        verdict = _check_arg_contracts(action_name, safe_args, arg_contracts)
        if verdict is not None:
            return verdict
    return None
