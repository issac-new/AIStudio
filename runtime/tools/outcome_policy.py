"""Outcome 合同策略面（批一 Task 11，spec 2026-11-19-ai-native-operating-model §4.3）。

Hermes 审批守卫的 outcome 接线单一事实源：``tools/approval.py`` 在既有 floors 与
yolo 判定之间调用 ``outcome_context``/``evaluate``，非 outcome-scoped 会话（任一环
缺席）由调用方走既有行为。

- ``outcome_context()``：网关注入的 env（HERMES_KANBAN_TASK/HERMES_KANBAN_DB，
  gateway/session_kanban.bind_worker_context）→ 只读查板库 ``tasks.outcome_id``
  （补丁 805）→ 读 ``~/.hermes-web-ui/outcome/<id>/contract.json``（照 TS 侧
  custom/server/outcome/outcome-store.ts 的 underWebUi 根与目录布局；
  HERMES_OUTCOME_STORE env 覆盖同 TS 侧 OUTCOME_STORE 语义）。任一环缺席→
  None=非 outcome-scoped（fail-soft 不猜数）。
- ``classify_profile``/``combine_declared``/``decide``/``evaluate``：三维画像与授权
  矩阵，判据与 TS 侧 custom/server/outcome/decision-matrix.ts 逐字对齐（正则翻译），
  由 runtime/tests/tools/test_outcome_policy.py 与 TS 侧
  __tests__/decision-matrix.test.ts 在同一份 decision-vectors.json 上双侧锁定。

词表立法（向量文件头注）：高危词表与 one-way/对外词表刻意分开维护（HIGH 含「部署」
而 one-way 表不含，改一处不得静默影响另一处）——两侧翻译必须保持同型分表。
"""
from __future__ import annotations

import json
import logging
import os
import re
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------- 词表（与 TS decision-matrix.ts 逐字对齐；见文件头注） ----------

# 高危：不可逆或对外可见的命令模式（HIGH_COMMAND）。
_HIGH_COMMAND = [
    re.compile(r"\bgit\s+push\b", re.IGNORECASE),
    re.compile(r"\bgit\s+reset\s+--hard\b", re.IGNORECASE),
    re.compile(r"\bgit\s+clean\s+-[a-z]*f", re.IGNORECASE),
    re.compile(r"\brm\s+", re.IGNORECASE),
    re.compile(r"\brmdir\s+", re.IGNORECASE),
    re.compile(r"\b(npm|yarn|pnpm)\s+publish\b", re.IGNORECASE),
    re.compile(r"\bdocker(-|\s+)compose\s+down\b", re.IGNORECASE),
    re.compile(r"\bdocker\s+(rm|rmi|stop|kill|system\s+prune)\b", re.IGNORECASE),
    re.compile(r"\b(kill|pkill|killall)\s+-?\d*", re.IGNORECASE),
    re.compile(r"\bkubectl\s+(apply|delete|drain|rollout)\b", re.IGNORECASE),
    re.compile(r"\bhelm\s+(install|upgrade|uninstall|rollback)\b", re.IGNORECASE),
    re.compile(r"\bdrop\s+(table|database|index)\b", re.IGNORECASE),
    re.compile(r"\btruncate\s+(table\s+)?\w+", re.IGNORECASE),
    re.compile("(发布|部署|上线|发版)"),
]

# 组合/写副作用形态：管道、命令序列、重定向、命令替换、find -exec、xargs/tee。
# 首词只读不代表整条只读（cat payload.sh | bash、echo x > /etc/cron.d/x），
# 任一命中即不得判 low（v1 保守原则：拿不准一律 medium）。
_SHELL_COMPOSITE = re.compile(
    r"[|;&<>$`" "\n" r"]|\bexec\b|-exec(dir)?\b|\bxargs\b|\btee\b",
    re.IGNORECASE,
)

# 低风险：只读命令（首词命中、无组合/写副作用形态）。
_LOW_COMMAND_LEAD = frozenset({
    "ls", "pwd", "cat", "head", "tail", "less", "more", "grep", "rg", "find",
    "wc", "which", "echo", "printf", "env", "date", "uname", "ps", "df", "du",
    "tree", "stat", "file", "jq", "sort", "uniq", "diff", "basename", "dirname",
    "realpath", "readlink", "id", "whoami", "hostname", "uptime",
})

# git 只读子命令（带任何参数都不写仓库）。
_GIT_READONLY_ANY_ARGS = frozenset({
    "status", "log", "diff", "show", "rev-parse", "blame", "describe", "shortlog",
})

# git 条件只读子命令：仅当参数命中只读形态时算 low（branch -d / tag v1 / stash push 均为写）。
# 注意锚语义：TS 侧 branch/tag 带 ^…$ 全锚（整串匹配），remote/stash 只带 ^ 前缀
# （前缀匹配）——翻译用 \A/\Z 保持同型，勿漏 \A（否则零宽匹配在任意位置成立）。
_GIT_READONLY_SAFE_ARGS = {
    "branch": re.compile(r"\A(-[av]\s*)*\Z"),
    "tag": re.compile(r"\A(-[ln]\s*\S*\s*)*\Z"),
    "remote": re.compile(r"\A(-v|show\b|get-url\b)"),
    "stash": re.compile(r"\A(list|show)\b"),
}

# git 全局旗标（-C <path>、-c k=v、--git-dir=… 等）：剥掉后子命令/高危判据才不被首词
# 干扰（git -C /repo push 曾绕过 /\bgit\s+push\b/ 高危正则——安全向缺陷，TS 侧已修）。
_GIT_GLOBAL_FLAG = re.compile(
    r"(?:-C\s+\S+|-c\s+\S+=\S+|--git-dir(?:=\s*\S+|\s+\S+)|--work-tree(?:=\s*\S+|\s+\S+)"
    r"|--namespace(?:=\s*\S+|\s+\S+)|--no-pager|--no-optional-locks|--literal-pathspecs)\s*"
)

_WS_SPLIT = re.compile(r"\s+")

# 不可逆词表（ONE_WAY_COMMAND，简报 v1 逐字；与 _HIGH_COMMAND 刻意分开维护）。
_ONE_WAY_COMMAND = [
    re.compile(r"\bgit\s+push\b", re.IGNORECASE),
    re.compile(r"\b(npm|yarn|pnpm)\s+publish\b", re.IGNORECASE),
    re.compile(r"\bdrop\s+(table|database|index)\b", re.IGNORECASE),
    re.compile(r"\btruncate\s+(table\s+)?\w+", re.IGNORECASE),
    re.compile(r"\bkubectl\s+delete\b", re.IGNORECASE),
    re.compile("(发布|上线|发版)"),
]

# 对外影响词表（EXTERNAL_EFFECT，简报 v1 逐字）：push / publish / deploy / 发送 / 上传。
_EXTERNAL_EFFECT = re.compile(r"\b(push|publish|deploy)\b|(发送|上传)", re.IGNORECASE)

_NPM_READONLY = re.compile(r"^(npm|yarn|pnpm)\s+(ls|list|outdated|view|info|audit)\b", re.IGNORECASE)
_VERSION_QUERY = re.compile(r"^(node|python3?|ruby|java|go|rustc)\s+(--version|-v|-V)\Z")


def _strip_git_global_flags(args: str) -> str:
    """循环剥掉 git 全局旗标（TS stripGitGlobalFlags 同构）。"""
    while True:
        m = _GIT_GLOBAL_FLAG.match(args)
        if not m:
            return args
        args = args[m.end():]


def _effective_command_text(text: str) -> str:
    """高危判据、one-way 与对外词表共用的有效文本：剥掉 git 全局旗标后的命令。"""
    if re.match(r"git\b", text):
        return ("git " + _strip_git_global_flags(text[3:].strip())).strip()
    return text


def _is_readonly_git(rest: str) -> bool:
    args = _strip_git_global_flags(rest)
    parts = _WS_SPLIT.split(args)
    sub = parts[0] if parts else ""
    if sub in _GIT_READONLY_ANY_ARGS:
        return True
    safe = _GIT_READONLY_SAFE_ARGS.get(sub)
    if safe is None:
        return False
    return safe.search(args[len(sub):].strip()) is not None


def _classify_command(detail: str) -> str:
    """riskTier 三档（TS classifyCommand 同判据）：高危词表→high、组合形态→medium、
    只读 lead/git 只读/版本查询→low、其余 medium。"""
    text = detail.strip()
    if not text:
        return "medium"
    effective = _effective_command_text(text)
    for pattern in _HIGH_COMMAND:
        if pattern.search(effective):
            return "high"
    if _SHELL_COMPOSITE.search(effective):
        return "medium"
    parts = _WS_SPLIT.split(effective)
    lead = parts[0] if parts else ""
    lead = "" if lead == "sudo" else lead
    rest = effective[effective.index(lead) + len(lead):].strip() if lead else effective.strip()
    if lead.lower() in _LOW_COMMAND_LEAD:
        return "low"
    if lead == "git" and _is_readonly_git(rest):
        return "low"
    if _NPM_READONLY.search(effective):
        return "low"
    if _VERSION_QUERY.search(effective):
        return "low"
    return "medium"


def classify_profile(command: str) -> dict:
    """决策画像三维分类（TS classifyDecisionProfile 的 command 面同判据）：
    reversibility v1 只分三路——one-way 词表命中→one-way、纯只读（判 low）→reversible、
    其余写副作用→unknown（v1 不自动判 costly，costly 只经声明调严进入）。"""
    text = (command or "").strip()
    risk_tier = _classify_command(text)
    effective = _effective_command_text(text) if text else ""
    if any(p.search(effective) for p in _ONE_WAY_COMMAND):
        reversibility = "one-way"
    elif risk_tier == "low":
        reversibility = "reversible"
    else:
        reversibility = "unknown"
    return {
        "riskTier": risk_tier,
        "reversibility": reversibility,
        "externalEffect": _EXTERNAL_EFFECT.search(effective) is not None if effective else False,
    }


_RISK_ORDER = {"low": 0, "medium": 1, "high": 2}
_REVERSIBILITY_ORDER = {"reversible": 0, "costly": 1, "one-way": 2}


def combine_declared(auto: dict, declared: dict | None) -> dict:
    """声明合并（spec §4.3「只能调严、不能调松」；TS combineProfiles 同判据）：
    riskTier 只升不降；reversibility 只向 one-way 收且 unknown 冻结；externalEffect
    只可置 true。违规项一律忽略，不抛错；declared 缺省原样返回。"""
    if not declared:
        return dict(auto)
    merged = dict(auto)
    wanted_risk = declared.get("riskTier")
    if wanted_risk in _RISK_ORDER and _RISK_ORDER[wanted_risk] > _RISK_ORDER[auto["riskTier"]]:
        merged["riskTier"] = wanted_risk
    wanted_rev = declared.get("reversibility")
    if wanted_rev in _REVERSIBILITY_ORDER and auto["reversibility"] != "unknown" \
            and wanted_rev != "unknown" \
            and _REVERSIBILITY_ORDER[wanted_rev] > _REVERSIBILITY_ORDER[auto["reversibility"]]:
        merged["reversibility"] = wanted_rev
    if declared.get("externalEffect") is True:
        merged["externalEffect"] = True
    return merged


def decide(mode: str, profile: dict) -> dict:
    """授权矩阵逐格裁决（spec §4.3 表＝decision-vectors.json 单一事实源）：
    plan 先于矩阵一律 deny；high+one-way → ask＋双签；high/one-way/unknown/对外任一 →
    ask；medium 或 costly → build:ask、guarded/yolo:allow；low+reversible+无对外 →
    allow；未知挡 fail-closed 为 ask。"""
    if mode == "plan":
        return {"action": "deny", "dual_sign_required": False,
                "decidedBy": "policy:plan-readonly", "rule": "plan-readonly"}
    if mode not in ("build", "guarded", "yolo"):
        return {"action": "ask", "dual_sign_required": False,
                "decidedBy": "policy:risk-evaluated", "rule": "fail-closed-unknown-mode"}
    if profile["riskTier"] == "high" and profile["reversibility"] == "one-way":
        return {"action": "ask", "dual_sign_required": True,
                "decidedBy": "policy:risk-evaluated", "rule": "high-one-way-dual-sign"}
    if profile["riskTier"] == "high" or profile["reversibility"] in ("one-way", "unknown") \
            or profile["externalEffect"]:
        return {"action": "ask", "dual_sign_required": False,
                "decidedBy": "policy:risk-evaluated", "rule": "risk-strict-ask"}
    if profile["riskTier"] == "medium" or profile["reversibility"] == "costly":
        if mode == "build":
            return {"action": "ask", "dual_sign_required": False,
                    "decidedBy": "policy:risk-evaluated", "rule": "medium-costly-build-ask"}
        return {"action": "allow", "dual_sign_required": False,
                "decidedBy": "policy:risk-evaluated", "rule": "medium-costly-policy-allow"}
    if profile["riskTier"] == "low" and profile["reversibility"] == "reversible" \
            and not profile["externalEffect"]:
        return {"action": "allow", "dual_sign_required": False,
                "decidedBy": "policy:readonly", "rule": "low-reversible-allow"}
    return {"action": "ask", "dual_sign_required": False,
            "decidedBy": "policy:risk-evaluated", "rule": "fail-closed-ask"}


def current_mode() -> str:
    """矩阵四挡：HERMES_OUTCOME_MODE 显式覆盖（plan 挡逃生/测试面）> 审批挡映射
    （off 或 yolo 活跃→yolo；smart→guarded；manual→build——与 approval._approval_ledger_mode
    同语义）。矩阵对未知挡 fail-closed 为 ask。"""
    explicit = (os.environ.get("HERMES_OUTCOME_MODE") or "").strip().lower()
    if explicit:
        return explicit
    try:
        from tools import approval_context
        if approval_context._get_approval_mode() == "off":
            return "yolo"
        mode = approval_context._get_approval_mode()
    except Exception:
        mode = "manual"
    if mode == "smart":
        return "guarded"
    if mode in ("plan", "build", "guarded", "yolo"):
        return mode
    return "build"


def evaluate(command: str, *, mode: str | None = None, context: dict | None = None) -> dict:
    """分类＋合同声明合并＋矩阵裁决一体。``context`` 缺省取 ``outcome_context()``，
    ``mode`` 缺省取 ``current_mode()``。返回 ``{action, dual_sign_required, profile,
    decidedBy, rule}``。"""
    if context is None:
        context = outcome_context()
    if mode is None:
        mode = current_mode()
    auto = classify_profile(command)
    declared = None
    if context:
        declared = {}
        if context.get("riskTier") in _RISK_ORDER:
            declared["riskTier"] = context["riskTier"]
        if context.get("defaultReversibility") in _REVERSIBILITY_ORDER:
            declared["reversibility"] = context["defaultReversibility"]
        declared = declared or None
    profile = combine_declared(auto, declared)
    return {**decide(mode, profile), "profile": profile}


# ---------- 可信任务上下文（env → 板库 → 合同） ----------

_OUTCOME_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")


def outcome_store_root() -> Path:
    """存储根：HERMES_OUTCOME_STORE env > HERMES_WEB_UI_HOME/outcome > ~/.hermes-web-ui/outcome
    （照 TS 侧 outcomeStoreRoot 的 underWebUi 语义）。"""
    explicit = (os.environ.get("HERMES_OUTCOME_STORE") or "").strip()
    if explicit:
        return Path(explicit)
    webui = (os.environ.get("HERMES_WEB_UI_HOME") or "").strip()
    if webui:
        return Path(webui) / "outcome"
    return Path.home() / ".hermes-web-ui" / "outcome"


def _task_outcome_id(db_path: str, task_id: str) -> str | None:
    """只读查板库 tasks.outcome_id（补丁 805 列）。查询失败/列缺失/无绑定→None。"""
    if not _OUTCOME_ID_RE.match(task_id):
        return None
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True, timeout=5.0)
        try:
            row = conn.execute("SELECT outcome_id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        finally:
            conn.close()
    except sqlite3.Error:
        return None
    if not row or not isinstance(row[0], str) or not row[0].strip():
        return None
    return row[0].strip()


def _read_contract(outcome_id: str) -> dict | None:
    """读 <root>/<outcomeId>/contract.json；缺/坏/身份不符→None（fail-soft 不猜数，
    照 TS getContract：目录名≠合同 outcomeId 视同坏档拒绝认领）。"""
    if not _OUTCOME_ID_RE.match(outcome_id):
        return None
    path = outcome_store_root() / outcome_id / "contract.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(raw, dict) or raw.get("outcomeId") != outcome_id:
        return None
    return raw


def outcome_context(env=None) -> dict | None:
    """outcome-scoped 会话的可信任务上下文：HERMES_KANBAN_TASK → 只读查板库
    tasks.outcome_id → 读合同。任一环缺席→None=非 outcome-scoped（守卫走既有行为）。"""
    source = os.environ if env is None else env
    task_id = (source.get("HERMES_KANBAN_TASK") or "").strip()
    if not task_id:
        return None
    db_path = (source.get("HERMES_KANBAN_DB") or "").strip()
    if not db_path:
        return None
    outcome_id = _task_outcome_id(db_path, task_id)
    if outcome_id is None:
        return None
    contract = _read_contract(outcome_id)
    if contract is None:
        return None
    return {
        "taskId": task_id,
        "outcomeId": outcome_id,
        "contractVersion": contract.get("version"),
        "riskTier": contract.get("riskTier"),
        "defaultReversibility": contract.get("defaultReversibility"),
        "ownerPersonId": contract.get("ownerPersonId"),
        "verificationOwnerId": contract.get("verificationOwnerId"),
        "status": contract.get("status"),
    }
