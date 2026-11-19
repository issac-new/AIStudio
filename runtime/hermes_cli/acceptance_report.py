"""逐条 AC 验收报告：schema、校验与结构化 blockers。

来源：SoduWork 结果交付支柱的逐条 checks 校验（hub-backend
``task_acceptance_review.py:124-154``）与返修栅栏（``artifact_version_guard.py:21-85``）。
本模块只做纯函数校验，不碰 DB：评审周期、执行者/审查者身份、契约 criteria 由调用方
作为参数传入，避免第二事实源。

报告形状（随 ``kanban_complete.metadata.acceptance_report`` 提交）::

    {
      "version": 1,
      "reviewer": "reviewer-profile",
      "reviewerKind": "agent" | "human",          # 可选，缺省不校验
      "reviewRequestedEventId": 123,              # 可选；缺省绑定当前评审周期
      "verdict": "pass" | "changes_requested",
      "summary": "一句话结论",
      "checks": [
        {"id": "AC-1", "result": "pass|fail|na",
         "evidence": "复跑命令/产物路径/观察结论", "note": "fail/na 必填"}
      ]
    }

纪律：
- 条数、ID 与契约 AC 必须一一对应；不得多报、漏报、重报。
- 任一 ``fail`` 必须写 ``note``；``na`` 同样要说明为什么无法判定。
- 总体 verdict 必须与逐条结果一致；完成路径只接受 ``pass``。
- 审查者身份必须与 ``review_requested.implementer`` 不同（防自审）。
- 报告可显式绑定 ``reviewRequestedEventId``；显式值不是当前周期即拒（防重放）。
"""
from __future__ import annotations

import re
from typing import Any, Iterable, Optional

REPORT_VERSION = 1
VALID_VERDICTS = frozenset({"pass", "changes_requested"})
VALID_RESULTS = frozenset({"pass", "fail", "na"})
VALID_REVIEWER_KINDS = frozenset({"agent", "human"})
MAX_CHECKS = 64
MAX_TEXT = 2000
MAX_EVIDENCE = 1000
MAX_REVIEWER = 120

_AC_DIGITS = re.compile(r"\d+")


class AcceptanceReportViolation(ValueError):
    """报告不满足验收契约；``blockers`` 供 UI/重试策略按 code 分支。"""

    def __init__(self, blockers: list[dict[str, str]]):
        self.blockers = blockers
        reason = "；".join(
            f"{b['code']}：{b['detail']}" for b in blockers
        ) or "验收报告无效"
        super().__init__(reason)


def _blocker(code: str, title: str, detail: str, action: str) -> dict[str, str]:
    return {"code": code, "title": title, "detail": detail, "action": action}


def _clip(value: Any, cap: int) -> str:
    text = "" if value is None else str(value).strip()
    return text[:cap]


def _norm_identity(value: Any) -> str:
    """身份比较用归一：去首尾空白、折叠内部空白、大小写不敏感（不改变展示值）。"""
    return " ".join(str(value or "").strip().casefold().split())


def norm_ac_id(raw: Any) -> str:
    """AC 编号归一：``ac1`` / ``AC_1`` / ``AC-1`` → ``AC-1``；无数字时大写原样。"""
    text = str(raw or "").strip()
    digits = _AC_DIGITS.search(text)
    return f"AC-{digits.group(0)}" if digits else text.upper()


def expected_criteria_ids(criteria: Iterable[Any]) -> list[str]:
    """从完成契约 criteria（``[{"id": "AC-1", ...}]``）提取去重后的 AC ID 序列。"""
    out: list[str] = []
    seen: set[str] = set()
    for item in criteria or []:
        raw = item.get("id") if isinstance(item, dict) else item
        cid = norm_ac_id(raw)
        if cid and cid not in seen:
            seen.add(cid)
            out.append(cid)
    return out


def _coerce_evidence(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (list, tuple)):
        parts = [str(v).strip() for v in value if str(v).strip()]
        return "；".join(parts)
    return ""


def validate_report(
    report: Any,
    *,
    expected_ids: Iterable[Any],
    implementer: Optional[str],
    current_review_event_id: Optional[int] = None,
    require_pass: bool = True,
) -> dict[str, Any]:
    """校验并归一验收报告；不解则抛 :class:`AcceptanceReportViolation`（含全部 blockers）。

    ``current_review_event_id`` 是当前评审周期对应的 ``review_requested`` 事件 id；
    调方在无法定位周期时应传 ``None``，本函数按 fail-closed 拒绝——没有周期锚点的
    报告无法证明它审的是本次交付。
    """
    if not isinstance(report, dict):
        raise AcceptanceReportViolation([
            _blocker(
                "acceptance_report_missing",
                "缺少验收报告",
                "verification=independent 的完成必须携带 metadata.acceptance_report",
                "按 spec 形状提交报告后重试 kanban_complete",
            )
        ])

    blockers: list[dict[str, str]] = []
    if report.get("version") != REPORT_VERSION:
        blockers.append(_blocker(
            "schema_invalid", "报告版本不支持",
            f"version 必须为 {REPORT_VERSION}（收到 {report.get('version')!r}）",
            "按当前 schema 重新生成报告",
        ))

    reviewer = _clip(report.get("reviewer"), MAX_REVIEWER)
    if not reviewer:
        blockers.append(_blocker(
            "reviewer_missing", "缺少审查者",
            "reviewer 必须是非空身份（profile 名或人员标识）",
            "填写实际审查者身份后重试",
        ))
    reviewer_kind = report.get("reviewerKind")
    if reviewer_kind is not None and reviewer_kind not in VALID_REVIEWER_KINDS:
        blockers.append(_blocker(
            "schema_invalid", "reviewerKind 非法",
            f"reviewerKind 只能是 {sorted(VALID_REVIEWER_KINDS)} 或省略",
            "改为 agent/human，或省略该字段",
        ))

    implementer_norm = _norm_identity(implementer)
    if not implementer_norm:
        blockers.append(_blocker(
            "implementer_unknown", "执行者身份未知",
            "review_requested 事件没有可用的 implementer，无法证明审查独立性",
            "让实现方先走 kanban_request_review（记录 implementer），再提交报告",
        ))
    elif reviewer and _norm_identity(reviewer) == implementer_norm:
        blockers.append(_blocker(
            "reviewer_not_independent", "审查者与执行者相同",
            f"reviewer={reviewer!r} 与 implementer={implementer!r} 归一后相同",
            "换一个独立审查者；自审不构成独立验收",
        ))

    claimed_cycle = report.get("reviewRequestedEventId")
    if claimed_cycle is not None:
        try:
            claimed_cycle_int = int(claimed_cycle)
        except (TypeError, ValueError):
            claimed_cycle_int = None
        if claimed_cycle_int is None:
            blockers.append(_blocker(
                "schema_invalid", "reviewRequestedEventId 非法",
                f"reviewRequestedEventId 必须是整数（收到 {claimed_cycle!r}）",
                "填写当前 review_requested 事件 id，或省略该字段",
            ))
        elif current_review_event_id is None:
            blockers.append(_blocker(
                "review_cycle_missing", "找不到当前评审周期",
                "报告声明了 reviewRequestedEventId，但卡上没有对应的 review_requested 事件",
                "先让实现方走 kanban_request_review，再提交报告",
            ))
        elif claimed_cycle_int != int(current_review_event_id):
            blockers.append(_blocker(
                "stale_review_cycle", "报告绑定的是旧评审周期",
                f"报告周期 {claimed_cycle_int} ≠ 当前周期 {current_review_event_id}",
                "按本次交付重新审查并提交新报告；旧报告不能重放",
            ))
    elif current_review_event_id is None:
        blockers.append(_blocker(
            "review_cycle_missing", "找不到当前评审周期",
            "卡上没有 review_requested 事件，报告无法绑定到一次交付",
            "先让实现方走 kanban_request_review，再提交报告",
        ))

    verdict = report.get("verdict")
    if verdict not in VALID_VERDICTS:
        blockers.append(_blocker(
            "schema_invalid", "verdict 非法",
            f"verdict 只能是 {sorted(VALID_VERDICTS)}（收到 {verdict!r}）",
            "改为 pass 或 changes_requested",
        ))

    wanted = expected_criteria_ids(expected_ids)
    checks_raw = report.get("checks")
    if not wanted:
        blockers.append(_blocker(
            "criteria_missing", "卡上没有可判定的验收标准",
            "完成契约未派生任何 AC；independent 验收不能无标准通过",
            "在卡面补 AC-n 行或 dod 块，重新派发后再审查",
        ))
    if not isinstance(checks_raw, list):
        blockers.append(_blocker(
            "schema_invalid", "checks 形状非法",
            "checks 必须是数组",
            "按逐条 AC 数组提交",
        ))
        checks_raw = []
    if len(checks_raw) > MAX_CHECKS:
        blockers.append(_blocker(
            "schema_invalid", "checks 条数超限",
            f"最多 {MAX_CHECKS} 条（收到 {len(checks_raw)}）",
            "拆分任务或减少 AC",
        ))

    normalized_checks: dict[str, dict[str, str]] = {}
    for index, check in enumerate(checks_raw):
        if not isinstance(check, dict):
            blockers.append(_blocker(
                "report_inconsistent", f"第 {index + 1} 条 check 不是对象",
                "每条 check 必须是 {id,result,evidence,note} 对象",
                "修正报告结构",
            ))
            continue
        cid = norm_ac_id(check.get("id"))
        if not cid:
            blockers.append(_blocker(
                "report_inconsistent", f"第 {index + 1} 条 check 缺 id",
                "check.id 不能为空",
                "填写对应 AC 编号",
            ))
            continue
        if cid in normalized_checks:
            blockers.append(_blocker(
                "criteria_mismatch", f"{cid} 重复判定",
                "同一 AC 只能有一条判定",
                "删除重复项",
            ))
            continue
        result = check.get("result")
        if result not in VALID_RESULTS:
            blockers.append(_blocker(
                "report_inconsistent", f"{cid} 的 result 非法",
                f"result 只能是 {sorted(VALID_RESULTS)}（收到 {result!r}）",
                "改为 pass/fail/na",
            ))
            continue
        evidence = _clip(_coerce_evidence(check.get("evidence")), MAX_EVIDENCE)
        if not evidence:
            blockers.append(_blocker(
                "evidence_missing", f"{cid} 缺少证据",
                "每条判定必须附可核验证据（复跑命令/产物路径/观察结论）",
                "补证据后重试",
            ))
        note = _clip(check.get("note"), MAX_TEXT)
        if result in ("fail", "na") and not note:
            blockers.append(_blocker(
                "report_inconsistent", f"{cid} 的 {result} 判定缺少 note",
                "fail/na 必须说明原因或无法判定的理由",
                "补 note 后重试",
            ))
        normalized_checks[cid] = {
            "id": cid, "result": result, "evidence": evidence, "note": note,
        }

    if wanted:
        wanted_set = set(wanted)
        got = set(normalized_checks)
        missing = [cid for cid in wanted if cid not in got]
        extra = sorted(got - wanted_set)
        if missing or extra:
            detail_parts = []
            if missing:
                detail_parts.append(f"缺少 {', '.join(missing)}")
            if extra:
                detail_parts.append(f"多出 {', '.join(extra)}")
            blockers.append(_blocker(
                "criteria_mismatch", "报告与契约 AC 不一致",
                "；".join(detail_parts) or "条数不一致",
                "按契约 criteria 逐条重写报告",
            ))
        elif len(checks_raw) != len(wanted):
            blockers.append(_blocker(
                "criteria_mismatch", "报告条数与契约 AC 不一致",
                f"契约 {len(wanted)} 条，报告 {len(checks_raw)} 条",
                "按契约 criteria 逐条重写报告",
            ))

    if verdict in VALID_VERDICTS and normalized_checks:
        any_fail = any(c["result"] == "fail" for c in normalized_checks.values())
        if any_fail and verdict != "changes_requested":
            blockers.append(_blocker(
                "report_inconsistent", "总体结论与逐条结果矛盾",
                "存在 fail 项，但 verdict=pass",
                "改为 changes_requested，或修正判定",
            ))
        if not any_fail and verdict == "changes_requested":
            blockers.append(_blocker(
                "report_inconsistent", "总体结论与逐条结果矛盾",
                "没有 fail 项，但 verdict=changes_requested",
                "改为 pass，或补充 fail 判定",
            ))
        if require_pass and verdict != "pass":
            raise AcceptanceReportViolation(blockers + [_blocker(
                "verdict_not_pass", "审查未通过",
                f"report.verdict={verdict!r}，完成路径只接受 pass",
                "走 kanban_request_changes 退回返修；不要用完成动作表达不通过",
            )])

    if blockers:
        raise AcceptanceReportViolation(blockers)

    return {
        "version": REPORT_VERSION,
        "reviewer": reviewer,
        "reviewerKind": reviewer_kind,
        "reviewRequestedEventId": current_review_event_id,
        "verdict": verdict,
        "summary": _clip(report.get("summary"), MAX_TEXT),
        "checks": [normalized_checks[cid] for cid in wanted],
    }
