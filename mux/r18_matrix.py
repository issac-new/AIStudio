"""r18_matrix.py — R18 必采矩阵（单一事实源；正本 §5.5 必采矩阵与收官判据③）

矩阵（正本 2026-10-05-mux-v8-fullflow-plan.md §5.5）：
  对话全文 = {步 9/11/17/19/21}，dialogs 非空即达标；
  操作前后帧 = {步 8/10/25}，每组 ops ≥2 帧（操作前+系统响应）且帧文件在位；
  环节效果 = {步 7/20/24}，陈述非空且 evidence 至少一条带可反查锚
  （commit/event/文件路径——纯文字一句话不计入）。
分母 = 11（5+3+3）；分子 = 达标项数。禁"任一载荷键在位即计"。

消费方：mx-report-gen.py hero 统计「全量呈现覆盖」、mx-report-audit.py 查 8。
改任一端，tests/harness-gate-integrity.test.ts ⑫ 当场失败。
"""

DIALOG_STEPS = frozenset({9, 11, 17, 19, 21})
OP_STEPS = frozenset({8, 10, 25})
EFFECT_STEPS = frozenset({7, 20, 24})
TOTAL = len(DIALOG_STEPS) + len(OP_STEPS) + len(EFFECT_STEPS)  # 11


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
    return None


def evaluate(steps, frame_exists=None):
    """整表实算：返回 (达标数, 分母, [(步号, 达标bool), ...])。steps = steps 映射。"""
    steps = steps or {}
    detail = []
    met = 0
    for n in sorted(DIALOG_STEPS | OP_STEPS | EFFECT_STEPS):
        ok = bool(step_ok(n, steps.get(str(n)) or steps.get(n), frame_exists))
        met += 1 if ok else 0
        detail.append((n, ok))
    return met, TOTAL, detail
