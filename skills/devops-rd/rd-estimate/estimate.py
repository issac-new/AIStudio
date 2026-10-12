import json
import math
import sys
from collections.abc import MutableMapping


SCHEMA_VERSION = "rd-estimate/v1"

# 基准权重（low/med/high）。依据 /tmp/rd-estimate-contract.md §3 计算约定。
BASE_WEIGHT = {
    "ILF": {"low": 7, "med": 10, "high": 15},
    "EIF": {"low": 5, "med": 7, "high": 10},
    "EI":  {"low": 3, "med": 4, "high": 6},
    "EO":  {"low": 4, "med": 5, "high": 7},
    "EQ":  {"low": 3, "med": 4, "high": 6},
}
KINDS = set(BASE_WEIGHT)
COMPLEXITIES = {"low", "med", "high"}

# 复用调整系数（reuse）：high/mid/low → 1/3、2/3、1
REUSE_COEFF = {"high": 1 / 3, "mid": 2 / 3, "low": 1}
# 变更调整系数（change）：add/modify/delete → 1、0.8、0.2
CHANGE_COEFF = {"add": 1, "modify": 0.8, "delete": 0.2}

REUSE_VALUES = set(REUSE_COEFF)
CHANGE_VALUES = set(CHANGE_COEFF)

# 必填顶层段。依据契约 §2：decomposition、scope、functions、adjustment、workload、budget
REQUIRED_TOP_LEVEL = ["decomposition", "scope", "functions", "adjustment", "workload", "budget"]

# evidence_class 取值
EVIDENCE_CLASSES = {"observed", "user_input", "external_example"}
CONFIDENCE_VALUES = {"high", "medium", "low"}


# error name → 退出码（契约 §4：rc=2/3/4/5）
RC_BY_ERROR = {
    "INVALID_INPUT": 2,
    "INSUFFICIENT_EVIDENCE": 3,
    "FORBIDDEN_RUNTIME_BASIS": 4,
    "INTERNAL_ERROR": 5,
}


def _err(name, msg, field=None, retryable=False):
    out = {"error": name, "message": msg, "field": field, "retryable": retryable}
    sys.stderr.write(json.dumps(out, ensure_ascii=False) + "\n")
    sys.exit(RC_BY_ERROR.get(name, 5))


def _is_number(x):
    try:
        f = float(x)
    except (TypeError, ValueError):
        return False
    return math.isfinite(f)


def validate(data):
    """输入校验。任一步失败返回 rc=2 INVALID_INPUT（函数的返回值仅用于测试可读性）。"""
    if not isinstance(data, MutableMapping):
        _err("INVALID_INPUT", "输入必须是 JSON 对象", field="root")
    for section in REQUIRED_TOP_LEVEL:
        if section not in data:
            _err("INVALID_INPUT", f"缺少顶层段 {section}", field=section, retryable=True)

    decomposition = data["decomposition"]
    if not isinstance(decomposition, MutableMapping) or not decomposition.get("goal"):
        _err("INVALID_INPUT", "decomposition 缺少 goal", field="decomposition.goal")
    acceptance = decomposition.get("acceptance")
    if not isinstance(acceptance, list) or not acceptance:
        _err("INVALID_INPUT", "decomposition.acceptance 必须为非空可机械验证验收项列表", field="decomposition.acceptance")

    scope = data["scope"]
    if not isinstance(scope, MutableMapping) or not scope.get("system_boundary"):
        _err("INVALID_INPUT", "scope 缺少 system_boundary", field="scope.system_boundary")
    users = scope.get("users")
    if not isinstance(users, list) or not users:
        _err("INVALID_INPUT", "scope.users 至少需要一个用户", field="scope.users")
    for u in users:
        if not isinstance(u, MutableMapping) or u.get("type") not in ("human", "program"):
            _err("INVALID_INPUT", "scope.users 每项需含 type=human|program", field="scope.users.type")

    functions = data["functions"]
    if not isinstance(functions, MutableMapping):
        _err("INVALID_INPUT", "functions 必须是对象", field="functions")

    data_list = functions.get("data", [])
    tx_list = functions.get("transactional", [])
    for lst, label in ((data_list, "functions.data"), (tx_list, "functions.transactional")):
        if not isinstance(lst, list):
            _err("INVALID_INPUT", f"{label} 必须是数组", field=label)
        for item in lst:
            if not isinstance(item, MutableMapping):
                _err("INVALID_INPUT", f"{label} 每项必须是对象", field=label)
            if item.get("kind") not in KINDS:
                _err("INVALID_INPUT", f"{label} kind 非法: {item.get('kind')}", field=f"{label}.kind")
            if item.get("complexity") not in COMPLEXITIES:
                _err("INVALID_INPUT", f"{label} complexity 非法: {item.get('complexity')}", field=f"{label}.complexity")

    # 无任何功能点可计：无法建立计数依据 → rc=3 INSUFFICIENT_EVIDENCE
    if not data_list and not tx_list:
        _err("INSUFFICIENT_EVIDENCE", "data 与 transactional 均为空，无法建立功能计数", field="functions", retryable=True)

    adjustment = data["adjustment"]
    if not isinstance(adjustment, MutableMapping):
        _err("INVALID_INPUT", "adjustment 必须是对象", field="adjustment")
    if adjustment.get("reuse") not in REUSE_VALUES:
        _err("INVALID_INPUT", f"adjustment.reuse 非法: {adjustment.get('reuse')}", field="adjustment.reuse")
    if adjustment.get("change_type") not in CHANGE_VALUES:
        _err("INVALID_INPUT", f"adjustment.change_type 非法: {adjustment.get('change_type')}", field="adjustment.change_type")
    share = adjustment.get("workload_share", 1.0)
    if not _is_number(share) or not (0 < float(share) <= 1):
        _err("INVALID_INPUT", "adjustment.workload_share 必须在 (0,1]", field="adjustment.workload_share")
    qf = adjustment.get("quality_factors", {})
    if not isinstance(qf, MutableMapping):
        _err("INVALID_INPUT", "adjustment.quality_factors 必须是对象", field="adjustment.quality_factors")
    for k, v in qf.items():
        if not _is_number(v) or not (0 <= float(v) <= 4):
            _err("INVALID_INPUT", f"quality_factors[{k}] 必须在 [0,4]", field=f"adjustment.quality_factors.{k}")

    workload = data["workload"]
    if not isinstance(workload, MutableMapping):
        _err("INVALID_INPUT", "workload 必须是对象", field="workload")
    eclass = workload.get("evidence_class")
    if eclass not in EVIDENCE_CLASSES:
        _err("INVALID_INPUT", f"workload.evidence_class 非法: {eclass}", field="workload.evidence_class")
    productivity = workload.get("productivity_hours_per_size")
    if not _is_number(productivity) or float(productivity) <= 0:
        _err("INVALID_INPUT", "workload.productivity_hours_per_size 必须为正数", field="workload.productivity_hours_per_size")
    hpm = workload.get("hours_per_month", 160)
    if not _is_number(hpm) or float(hpm) <= 0:
        _err("INVALID_INPUT", "workload.hours_per_month 必须为正数", field="workload.hours_per_month")
    rate = workload.get("rate_per_person_month")
    if rate is not None and (not _is_number(rate) or float(rate) <= 0):
        _err("INVALID_INPUT", "workload.rate_per_person_month 必须为正数或 null", field="workload.rate_per_person_month")

    budget = data["budget"]
    if not isinstance(budget, MutableMapping):
        _err("INVALID_INPUT", "budget 必须是对象", field="budget")


def estimate(data):
    """主估算函数。输入已过 validate()；返回符合契约 §3 的 dict。"""
    functions = data["functions"]
    adjustment = data["adjustment"]
    workload = data["workload"]
    budget = data["budget"]

    data_list = functions.get("data", [])
    tx_list = functions.get("transactional", [])

    reuse_c = REUSE_COEFF[adjustment.get("reuse", "low")]
    change_c = CHANGE_COEFF[adjustment.get("change_type", "add")]

    ufp = 0.0
    per_function_us = []
    provenance = []

    for item in data_list + tx_list:
        kind = item["kind"]
        cplx = item["complexity"]
        base = BASE_WEIGHT[kind][cplx]
        fused = base * reuse_c * change_c
        ufp += base
        per_function_us.append({
            "id": item.get("id", f"{kind}-{len(per_function_us)}"),
            "kind": kind,
            "base": base,
            "adjusted": round(fused, 6),
        })
        provenance.append(f"functions.{'data' if item in data_list else 'transactional'}[{item.get('id', '?')}]")

    qf_sum = sum(float(v) for v in adjustment.get("quality_factors", {}).values())
    quality_factor = 1.0 + 0.025 * qf_sum
    share = float(adjustment.get("workload_share", 1.0))
    productivity = float(workload["productivity_hours_per_size"])
    hours_per_month = float(workload.get("hours_per_month", 160))
    rate = workload.get("rate_per_person_month")

    us = sum(f["adjusted"] for f in per_function_us)
    hours = us * productivity * quality_factor * share
    person_months = hours / hours_per_month
    cost = None
    if rate is not None:
        cost = person_months * float(rate)

    # 置信度启发式：observed>user_input>无依据；外部示例已在 validate 阶段拒绝（rc=4）
    eclass = workload.get("evidence_class")
    if eclass == "observed" and workload.get("productivity_source"):
        confidence = "high"
    elif eclass == "user_input" or workload.get("productivity_source"):
        confidence = "medium"
    else:
        confidence = "low"

    # 预算对象：goal_max_turns_estimate 原样透传，不换算
    goal_turns = budget.get("goal_max_turns_estimate")
    history_anchor = budget.get("history_anchor")

    if goal_turns is not None and not _is_number(goal_turns):
        # 透传字段不参与计算，但应可打印——非数值则标记 low 并说明
        confidence = "low"

    explanations = [
        f"ufp={round(ufp,3)}（Σ 基准权重，引用 BASE_WEIGHT）",
        f"us={round(us,3)} = Σ(base × reuse({adjustment.get('reuse')})={round(reuse_c,3)} × change({adjustment.get('change_type')})={round(change_c,3)})",
    ]
    explanations.append(f"quality_factor=1+0.025×{round(qf_sum,3)}={round(quality_factor,3)}")
    explanations.append(f"hours={round(hours,3)} = us × productivity({productivity}) × qf × workload_share({share})")
    explanations.append(f"person_months={round(person_months,4)} = hours/{hours_per_month}")
    if cost is not None:
        explanations.append(f"cost={round(cost,2)} = person_months × rate({rate})")
    else:
        explanations.append("cost=null（rate_per_person_month 未提供，不计算成本）")
    if eclass == "observed":
        explanations.append(f"生产率依据 evidence_class=observed，置信度高（productivity_source={workload.get('productivity_source')}）")
    elif eclass == "user_input":
        explanations.append("生产率依据为 user_input，建议以本机历史校准后提升置信")
    else:
        explanations.append("生产率依据层级待校准，估算为粗粒度参考")

    provenance.append("scope.system_boundary")
    provenance.append("scope.users")
    if workload.get("productivity_source"):
        provenance.append("workload.productivity_source")

    return {
        "schema_version": SCHEMA_VERSION,
        "task_id": data.get("task_id"),
        "status": "estimated",
        "size": {"ufp": round(ufp, 3), "us": round(us, 3)},
        "workload": {
            "hours": round(hours, 3),
            "person_months": round(person_months, 4),
            "productivity_hours_per_size": productivity,
            "workload_share": share,
        },
        "budget": {
            "cost": None if cost is None else round(cost, 2),
            "goal_max_turns_estimate": goal_turns,
            "history_anchor": history_anchor,
            "confidence": confidence,
        },
        "evidence": {
            "provenance": provenance,
            "confidence": confidence,
            "history_anchor": history_anchor,
            "no_network": True,
            "no_secret_access": True,
        },
        "explanations": explanations,
        "per_function_us": per_function_us,
    }


def main(argv):
    if len(argv) != 2:
        _err("INVALID_INPUT", "用法: python3 estimate.py <input.json>", field="argv")
    path = argv[1]
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        _err("INVALID_INPUT", f"读取/解析失败: {e}", field="input.json")

    validate(data)

    # 外部示例禁止作为运行时预算依据 → rc=4 FORBIDDEN_RUNTIME_BASIS
    eclass = data["workload"].get("evidence_class")
    if eclass == "external_example":
        _err("FORBIDDEN_RUNTIME_BASIS",
             "evidence_class=external_example 仅用于对照，不可作为运行时预算依据", field="workload.evidence_class")

    result = estimate(data)
    # 任何异常统一走 rc=5 INTERNAL_ERROR，绝不伪造结果
    try:
        sys.stdout.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
        return 0
    except Exception as e:  # pragma: no cover — 防御性兜底
        _err("INTERNAL_ERROR", f"输出序列化异常: {e}", field=None)


if __name__ == "__main__":
    sys.exit(main(sys.argv))