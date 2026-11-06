"""Per-model 工具描述/参数覆盖（吸收 codex per-model tool description 族，候补队列第二批）。

Origin：codex 29f056c/b2aa42e/f2654ea/8c66a5a（模型目录可按模型覆盖工具 description 与
parameters，轮中换模型即时生效，无效 schema 回退捆绑版并告警）。hermes 形状：

- 配置面：``config.yaml`` 顶层 ``tool_model_overrides``——

  .. code-block:: yaml

     tool_model_overrides:
       "qwen*":                    # 模型 id 精确或尾通配
         terminal:
           description: "…（为该模型定制的说明）"
       "glm-5.3*":
         delegate_task:
           parameters: { type: object, properties: {…}, required: […] }

- 应用点：``agent_init._load_tools`` 尾部（会话构建时模型已知即生效）；switch_model
  换模热切换列 v2（重跑 _load_tools 片段即可，本版不追）。
- 无效 schema（parameters 非 dict / type≠object / 缺 properties）→ 整条 override 跳过
  并告警一次，保留捆绑版（codex 同款 fail-safe：覆盖配置坏了不能拖垮请求装配，也
  不做半套用）。
"""

from __future__ import annotations

import fnmatch
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_warned: set[str] = set()


def load_overrides() -> Dict[str, Dict[str, Dict[str, Any]]]:
    """读 config 的 tool_model_overrides 节；缺失/坏形回空（fail-soft，但坏形必须告警留痕）。"""
    try:
        from hermes_cli.config import load_config_readonly
        raw = (load_config_readonly() or {}).get("tool_model_overrides")
    except Exception as exc:  # noqa: BLE001 - 配置面故障不拖垮装配，但零告警=吞错
        logger.warning("tool_model_overrides: config 读取失败，忽略全部覆盖: %s", exc)
        return {}
    if not isinstance(raw, dict):
        if raw is not None:
            logger.warning("tool_model_overrides: 配置节不是对象（got %s），忽略全部覆盖", type(raw).__name__)
        return {}
    out: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for pattern, tools in raw.items():
        if not isinstance(pattern, str) or not isinstance(tools, dict):
            continue
        clean = {t: o for t, o in tools.items() if isinstance(t, str) and isinstance(o, dict)}
        if clean:
            out[pattern] = clean
    return out


def _pattern_matches(pattern: str, model: str) -> bool:
    if "*" in pattern or "?" in pattern or "[" in pattern:
        return fnmatch.fnmatchcase(model or "", pattern)
    return pattern == model


def _valid_params_schema(params: Any) -> bool:
    """parameters 合格线：type=="object" 且 properties 是 dict（required 若给须是 list）。"""
    return (
        isinstance(params, dict)
        and params.get("type") == "object"
        and isinstance(params.get("properties"), dict)
        and (params.get("required") is None or isinstance(params.get("required"), list))
    )


def _apply_one(tool_def: Dict[str, Any], override: Dict[str, Any], model: str) -> Tuple[Dict[str, Any], bool]:
    """套用单条覆盖；返回 (可能改写的定义, 是否生效)。schema 不合规格整条跳过并告警一次。"""
    params = override.get("parameters")
    if params is not None and not _valid_params_schema(params):
        # 坏 schema 整条 override 不进请求（含 description——单条覆盖是一个整体，
        # 不做半套用），保留捆绑版（codex 语义：无效覆盖不污染请求装配）。
        _warn_once(f"invalid parameters schema for model={model}"
                   f"（须为 type=object 且含 properties 的对象），跳过该条覆盖保留捆绑版")
        return tool_def, False
    fn = dict(tool_def.get("function") or {})
    changed = False
    desc = override.get("description")
    if isinstance(desc, str) and desc.strip():
        fn["description"] = desc
        changed = True
    elif desc is not None:
        _warn_once(f"invalid description for model={model}")
    if params is not None:
        fn["parameters"] = params
        changed = True
    if not changed:
        return tool_def, False
    return {"type": "function", "function": fn}, True


def _warn_once(key: str) -> None:
    if key not in _warned:
        _warned.add(key)
        logger.warning("tool_model_overrides: %s", key)


def apply_model_tool_overrides(
    tool_defs: List[Dict[str, Any]], model: Optional[str],
    overrides: Optional[Dict[str, Dict[str, Dict[str, Any]]]] = None,
) -> List[Dict[str, Any]]:
    """按当前模型套用覆盖（不动入参；无匹配/无配置原样返回浅拷贝）。"""
    if overrides is None:
        overrides = load_overrides()
    model = (model or "").strip()
    if not overrides or not model:
        return list(tool_defs or [])
    matched = {t: o for pattern, tools in overrides.items()
               if _pattern_matches(pattern, model) for t, o in tools.items()}
    if not matched:
        return list(tool_defs)
    out: List[Dict[str, Any]] = []
    applied = 0
    for td in tool_defs or []:
        name = (td.get("function") or {}).get("name", "")
        override = matched.get(name)
        if override is None:
            out.append(td)
            continue
        new_td, changed = _apply_one(td, override, model)
        out.append(new_td)
        applied += 1 if changed else 0
    if applied:
        logger.info("tool_model_overrides: %d tools overridden for model=%s", applied, model)
    return out
