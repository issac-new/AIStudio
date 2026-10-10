"""r18_matrix.py — R18 必采证据表（单一事实源；正本 §5.5 必采证据表与收尾判据③、§5.6 必采证据表）

矩阵（正本 2026-10-05-mux-v8-fullflow-plan.md §5.5 + §5.6 必采证据表）：
  对话全文 = {步 9/11/17/19/21}，dialogs 非空即达标；
  操作前后帧 = {步 8/10/25}，每组 ops ≥2 帧（操作前+系统响应）且帧文件在位；
  环节效果 = {步 7/20/24}，陈述非空且 evidence 至少一条带可反查锚
  （commit/event/文件路径——纯文字一句话不计入）；
  skill 过程帧（§5.6 必采证据表，§2.5 步级承载范围承诺入矩阵）= {步 13}：
    payload['skill'] 的 gen 帧 ≥3（xxx-dev 生成过程）且 invoke 帧 ≥2（开发调用
    过程），帧文件在位方计数（r18-frames.mjs 实拍，r18-collect.py skill 登记）。
delivery 门禁灯帧（R29/P15）= {步 23}：payload['delivery']['frames'] ≥1 且帧在位
  （MX_DELIVERY=1 全程开启，产品 Delivery Cases 面板实拍；产品面未就绪按§5.6 采集纪律⑩ 登记降级）。
产品成效（§5.4 产品成效呈现 + §5.6 必采证据表「run13 起入分母」——run13 轮缺席登记收尾，
  run14 起接线）：2 项，不绑步，数据源=evidence/product-outcome/：
    exec 项：幂等/下单执行输出件 ≥1（实跑输出原文，禁手抄）；
    frames 项：下单流程帧 ≥2 张（真实产品 UI 前后帧；交付物无 UI 面〔逻辑层 SDK〕
    按 §5.6 采集纪律⑩ 登记降级——issue 在位 product-outcome-missing 族即降级不 FAIL）。
分母 = 15（5+3+3+1+1+2）；分子 = 达标项数。禁"任一载荷键在位即计"。

消费方：mx-report-gen.py hero 统计「全量呈现覆盖」、mx-report-audit.py 查 8。
改任一端，tests/harness-gate-integrity.test.ts ⑫ 当场失败。
"""

DIALOG_STEPS = frozenset({9, 11, 17, 19, 21})
OP_STEPS = frozenset({8, 10, 25})
EFFECT_STEPS = frozenset({7, 20, 24})
SKILL_STEPS = frozenset({13})
SKILL_GEN_MIN = 3
SKILL_INVOKE_MIN = 2
# delivery 协议面门禁灯帧（R29/P15，§5.6 必采证据表）：绑步 23（审计独立见证位——六闸门禁灯
# 在产品 Delivery Cases 面板的投影帧；不与效果类步重叠，evaluate 每步只判一次）
DELIVERY_STEPS = frozenset({23})
DELIVERY_MIN = 1
# 产品成效两项（§5.4/§5.6，run13 起入分母）
PRODUCT_OUTCOME_EXEC_MIN = 1
PRODUCT_OUTCOME_FRAME_MIN = 2
STEP_TOTAL = len(DIALOG_STEPS) + len(OP_STEPS) + len(EFFECT_STEPS) + len(SKILL_STEPS) + len(DELIVERY_STEPS)  # 13
PRODUCT_OUTCOME_TOTAL = 2
TOTAL = STEP_TOTAL + PRODUCT_OUTCOME_TOTAL  # 15
import re as _re

_PO_EXEC_RE = _re.compile(r'idempot|幂等|order-flow|下单', _re.IGNORECASE)


def _png(name: str) -> str:
    return name if name.endswith('.png') else name + '.png'


def step_ok(n, payload, frame_exists=None):
    """必采步 n 是否达标。payload = r18-steps.json 的 steps[n]；非必采步返回 None。

    frame_exists(name)->bool 判帧文件在位（缺帧按 未达标 计——与生成器
    "帧缺失"占位、审计器缺帧 FAIL 同口径）。
    """
    payload = payload or {}
    if n in DIALOG_STEPS:
        return bool(payload.get('dialogs'))
    if n in OP_STEPS:
        ops = payload.get('ops') or []
        if not ops:
            return False
        fe = frame_exists or (lambda _name: True)
        for op in ops:
            frames = [f for f in (op.get('frames') or []) if fe(_png(str(f)))]
            if len(frames) < 2:
                return False
        return True
    if n in EFFECT_STEPS:
        eff = payload.get('effect') or {}
        if not str(eff.get('text', '')).strip():
            return False
        return any(str(e.get('anchor', '')).strip()
                   for e in (eff.get('evidence') or []))
    if n in DELIVERY_STEPS:
        fe = frame_exists or (lambda _name: True)
        dlv = payload.get('delivery') or {}
        frames = [f for f in (dlv.get('frames') or []) if fe(_png(str(f)))]
        return len(frames) >= DELIVERY_MIN
    if n in SKILL_STEPS:
        sk = payload.get('skill') or {}
        fe = frame_exists or (lambda _name: True)
        gen = [f for f in (sk.get('gen') or []) if fe(_png(str(f)))]
        invoke = [f for f in (sk.get('invoke') or []) if fe(_png(str(f)))]
        return len(gen) >= SKILL_GEN_MIN and len(invoke) >= SKILL_INVOKE_MIN
    return None


def evaluate(steps, frame_exists=None):
    """整表实测：返回 (达标数, 分母, [(步号, 达标bool), ...])。steps = steps 映射。"""
    steps = steps or {}
    detail = []
    met = 0
    for n in sorted(DIALOG_STEPS | OP_STEPS | EFFECT_STEPS | SKILL_STEPS | DELIVERY_STEPS):
        ok = bool(step_ok(n, steps.get(str(n)) or steps.get(n), frame_exists))
        met += 1 if ok else 0
        detail.append((n, ok))
    return met, TOTAL, detail


def product_outcome_status(evid_dir, issue_log_text=None):
    """产品成效两项实测（§5.4/§5.6，run13 起入分母）。

    evid_dir = runs/<RUN>/evidence 目录（Path 或 str）。返回 dict：
      exec_met  幂等/下单执行输出件 ≥1（evidence/product-outcome/ 下非 env 输出件）
      frames_met 下单流程帧 ≥2 张（product-outcome/ 下 png）
      degraded  台账在位 product-outcome-missing/-degraded 族问题单（§5.6⑩ 登记降级口径，
                审计降 WARN 不 FAIL；frames 缺席且未登记=FAIL 由审计侧执行）
    """
    from pathlib import Path as _P
    po = _P(evid_dir) / 'product-outcome'
    files = [f.name for f in po.iterdir() if f.is_file()] if po.exists() else []
    execs = [f for f in files
             if not f.endswith('.png') and not f.endswith('.env')
             and _PO_EXEC_RE.search(f)]
    if not execs:
        # 兜底：目录在且存在任意非 png/env 输出件（命名规范外的实跑输出也算——文件名
        # 匹配是加速判，不是否认件本身）
        execs = [f for f in files if not f.endswith('.png') and not f.endswith('.env')]
    frames = [f for f in files if f.endswith('.png')]
    txt = issue_log_text or ''
    degraded = ('product-outcome-missing' in txt) or ('product-outcome-degraded' in txt)
    return {
        'exec_met': len(execs) >= PRODUCT_OUTCOME_EXEC_MIN,
        'frames_met': len(frames) >= PRODUCT_OUTCOME_FRAME_MIN,
        'degraded': degraded,
        'exec_files': execs,
        'frame_files': frames,
    }


def evaluate_full(steps, frame_exists, evid_dir, issue_log_text=None):
    """步绑定 13 项 + 产品成效 2 项合并实测：返回 (达标数, 分母, 步明细, 产品成效 dict)。

    产品成效登记降级口径：frames 缺席但 degraded=True 时该项计达标（WARN 口径），
    exec 项不适用降级（执行输出可无 UI 面亦产出，缺席即真缺口）。
    """
    met, _, detail = evaluate(steps, frame_exists)
    po = product_outcome_status(evid_dir, issue_log_text)
    po_met = (1 if po['exec_met'] else 0) + (1 if (po['frames_met'] or po['degraded']) else 0)
    return met + po_met, TOTAL, detail, po
