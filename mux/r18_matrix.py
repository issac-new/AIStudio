"""r18_matrix.py — R18 必采矩阵（单一事实源；正本 §5.5 必采矩阵与收官判据③、§5.7 F-4）

矩阵（正本 2026-10-05-mux-v8-fullflow-plan.md §5.5 + §5.7 F-4）：
  对话全文 = {步 9/11/17/19/21}，dialogs 非空即达标；
  操作前后帧 = {步 8/10/25}，每组 ops ≥2 帧（操作前+系统响应）且帧文件在位；
  环节效果 = {步 7/20/24}，陈述非空且 evidence 至少一条带可反查锚
  （commit/event/文件路径——纯文字一句话不计入）；
  skill 过程帧（§5.7 F-4，§2.5 步级承载面承诺入矩阵）= {步 13}：
    payload['skill'] 的 gen 帧 ≥3（xxx-dev 生成过程）且 invoke 帧 ≥2（开发调用
    过程），帧文件在位方计数（r18-frames.mjs 实拍，r18-collect.py skill 登记）。
delivery 门禁灯帧（R29/P15）= {步 23}：payload['delivery']['frames'] ≥1 且帧在位
  （MX_DELIVERY=1 全程开启，产品 Delivery Cases 面板实拍；产品面未就绪按§5.7 F-2 记单降级）。
分母 = 13（5+3+3+1+1）；分子 = 达标项数。禁"任一载荷键在位即计"。

消费方：mx-report-gen.py hero 统计「全量呈现覆盖」、mx-report-audit.py 查 8。
改任一端，tests/harness-gate-integrity.test.ts ⑫ 当场失败。
"""

DIALOG_STEPS = frozenset({9, 11, 17, 19, 21})
OP_STEPS = frozenset({8, 10, 25})
EFFECT_STEPS = frozenset({7, 20, 24})
SKILL_STEPS = frozenset({13})
SKILL_GEN_MIN = 3
SKILL_INVOKE_MIN = 2
# delivery 协议面门禁灯帧（R29/P15，§5.7 F-4）：绑步 23（审计独立见证位——六闸门禁灯
# 在产品 Delivery Cases 面板的投影帧；不与效果类步重叠，evaluate 每步只判一次）
DELIVERY_STEPS = frozenset({23})
DELIVERY_MIN = 1
TOTAL = len(DIALOG_STEPS) + len(OP_STEPS) + len(EFFECT_STEPS) + len(SKILL_STEPS) + len(DELIVERY_STEPS)  # 13


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
    """整表实算：返回 (达标数, 分母, [(步号, 达标bool), ...])。steps = steps 映射。"""
    steps = steps or {}
    detail = []
    met = 0
    for n in sorted(DIALOG_STEPS | OP_STEPS | EFFECT_STEPS | SKILL_STEPS | DELIVERY_STEPS):
        ok = bool(step_ok(n, steps.get(str(n)) or steps.get(n), frame_exists))
        met += 1 if ok else 0
        detail.append((n, ok))
    return met, TOTAL, detail
