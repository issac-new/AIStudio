"""r18_matrix.py — R18 必采证据表（单一事实源；正本 §5.5 必采证据表与收尾判据③、§5.6 必采证据表）

矩阵（正本 2026-10-05-mux-v8-fullflow-plan.md §5.5 + §5.6 必采证据表）：
  对话全文 = {步 9/11/17/19/21}，dialogs 非空即达标；
  操作前后帧 = {步 25}（N28-5 四态收敛：8/10 转 none 型，真值由 matrix 消息流承载），
    每组 ops ≥2 帧（操作前+系统响应）且帧文件在位；
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
分母 = 13（步绑定 11＋产品成效 2）；分子 = 达标项数。禁「任一载荷键在位即计」。

消费方：mx-report-gen.py hero 统计「全量呈现覆盖」、mx-report-audit.py 查 8。
改任一端，tests/harness-gate-integrity.test.ts ⑫ 当场失败。
"""

DIALOG_STEPS = frozenset({9, 11, 17, 19, 21})
# N28-5（run28 收尾批）：OP_STEPS 随 run27 四态重分类收敛——8(dispatch)/10(register) 为
# none 型（真值=matrix 消息流，capture-plan 四态口径），不再硬要求 UI 操作前后帧；
# 25(IDE) 保留（真 UI 承载）。run28 审计环 11 轮中该三处口径错位是主要缺口源。
OP_STEPS = frozenset({25})
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
STEP_TOTAL = len(DIALOG_STEPS) + len(OP_STEPS) + len(EFFECT_STEPS) + len(SKILL_STEPS) + len(DELIVERY_STEPS)  # 11
PRODUCT_OUTCOME_TOTAL = 2
TOTAL = STEP_TOTAL + PRODUCT_OUTCOME_TOTAL  # 13
import re as _re

_PO_EXEC_RE = _re.compile(r'idempot|幂等|order-flow|下单', _re.IGNORECASE)


def _png(name: str) -> str:
    return name if name.endswith('.png') else name + '.png'


def as_dict(value):
    """载荷对象访问的安全入口：非 dict（None/字符串/列表）统一视为空对象。

    R18 载荷允许人工补录（run28 现场做法），形状错误必须在读取侧降级为
    「未达标/告警」，不能让 AttributeError 终止报告生成或整轮审计。
    """
    return value if isinstance(value, dict) else {}


def as_list(value):
    """载荷数组访问的安全入口：非 list 统一视为空数组。"""
    return value if isinstance(value, list) else []


def frame_name(value) -> str:
    """帧引用归一：支持字符串文件名与 {file, caption} 两种登记形态。"""
    if isinstance(value, dict):
        value = value.get('file')
    return value if isinstance(value, str) else ''


def schema_errors(steps):
    """R18 载荷形状校验（单一事实源）。

    返回 [(step, path, expected, got), ...]；空列表=通过。写入端
    （r18-collect.py validate/save）、报告生成、审计预检与测试共用本函数，
    避免三处各写一份校验。允许缺键（缺键=未采集，不是形状错误）；键在但
    类型不符即报错。
    """
    errors = []
    if not isinstance(steps, dict):
        return [('-', 'steps', 'object', type(steps).__name__)]

    def bad(step, path, expected, got):
        errors.append((str(step), path, expected, type(got).__name__))

    for step, entry in steps.items():
        if not isinstance(entry, dict):
            bad(step, 'steps[n]', 'object', entry)
            continue

        if 'dialogs' in entry:
            dialogs = entry['dialogs']
            if not isinstance(dialogs, list):
                bad(step, 'dialogs', 'array', dialogs)
            else:
                for i, dialog in enumerate(dialogs):
                    if not isinstance(dialog, dict):
                        bad(step, f'dialogs[{i}]', 'object', dialog)
                        continue
                    if 'messages' in dialog:
                        messages = dialog['messages']
                        if not isinstance(messages, list):
                            bad(step, f'dialogs[{i}].messages', 'array', messages)
                        else:
                            for j, message in enumerate(messages):
                                if not isinstance(message, dict):
                                    bad(step, f'dialogs[{i}].messages[{j}]', 'object', message)

        if 'ops' in entry:
            ops = entry['ops']
            if not isinstance(ops, list):
                bad(step, 'ops', 'array', ops)
            else:
                for i, op in enumerate(ops):
                    if not isinstance(op, dict):
                        bad(step, f'ops[{i}]', 'object', op)
                        continue
                    if 'frames' in op:
                        frames = op['frames']
                        if not isinstance(frames, list):
                            bad(step, f'ops[{i}].frames', 'array', frames)
                        else:
                            for j, frame in enumerate(frames):
                                if not (isinstance(frame, str)
                                        or (isinstance(frame, dict) and isinstance(frame.get('file'), str))):
                                    bad(step, f'ops[{i}].frames[{j}]', 'string|{file}', frame)

        if 'effect' in entry:
            effect = entry['effect']
            if not isinstance(effect, dict):
                bad(step, 'effect', 'object', effect)
            else:
                if 'text' in effect and not isinstance(effect['text'], str):
                    bad(step, 'effect.text', 'string', effect['text'])
                if 'evidence' in effect:
                    evidence = effect['evidence']
                    if not isinstance(evidence, list):
                        bad(step, 'effect.evidence', 'array', evidence)
                    else:
                        for i, item in enumerate(evidence):
                            if not isinstance(item, dict):
                                bad(step, f'effect.evidence[{i}]', 'object', item)

        for key in ('skill', 'delivery'):
            if key in entry and not isinstance(entry[key], dict):
                bad(step, key, 'object', entry[key])
        if isinstance(entry.get('skill'), dict):
            for bucket in ('gen', 'invoke'):
                if bucket in entry['skill'] and not isinstance(entry['skill'][bucket], list):
                    bad(step, f'skill.{bucket}', 'array', entry['skill'][bucket])
        if isinstance(entry.get('delivery'), dict) and 'frames' in entry['delivery']:
            if not isinstance(entry['delivery']['frames'], list):
                bad(step, 'delivery.frames', 'array', entry['delivery']['frames'])

        if 'note' in entry and not isinstance(entry['note'], str):
            bad(step, 'note', 'string', entry['note'])
    return errors


def step_ok(n, payload, frame_exists=None):
    """必采步 n 是否达标。payload = r18-steps.json 的 steps[n]；非必采步返回 None。

    frame_exists(name)->bool 判帧文件在位（缺帧按 未达标 计——与生成器
    "帧缺失"占位、审计器缺帧 FAIL 同口径）。非 dict 载荷按空对象处理：
    形状错误由 schema_errors 单独呈现，不在读取侧抛异常。
    """
    payload = as_dict(payload)
    fe = frame_exists or (lambda _name: True)
    if n in DIALOG_STEPS:
        return any(isinstance(dialog, dict) for dialog in as_list(payload.get('dialogs')))
    if n in OP_STEPS:
        ops = [op for op in as_list(payload.get('ops')) if isinstance(op, dict)]
        if not ops:
            return False
        for op in ops:
            frames = [f for f in (frame_name(x) for x in as_list(op.get('frames')))
                      if f and fe(_png(f))]
            if len(frames) < 2:
                return False
        return True
    if n in EFFECT_STEPS:
        eff = as_dict(payload.get('effect'))
        if not str(eff.get('text', '')).strip():
            return False
        return any(str(item.get('anchor', '')).strip()
                   for item in as_list(eff.get('evidence')) if isinstance(item, dict))
    if n in DELIVERY_STEPS:
        dlv = as_dict(payload.get('delivery'))
        frames = [f for f in (frame_name(x) for x in as_list(dlv.get('frames')))
                  if f and fe(_png(f))]
        return len(frames) >= DELIVERY_MIN
    if n in SKILL_STEPS:
        sk = as_dict(payload.get('skill'))
        gen = [f for f in (frame_name(x) for x in as_list(sk.get('gen')))
               if f and fe(_png(f))]
        invoke = [f for f in (frame_name(x) for x in as_list(sk.get('invoke')))
                  if f and fe(_png(f))]
        return len(gen) >= SKILL_GEN_MIN and len(invoke) >= SKILL_INVOKE_MIN
    return None


def evaluate(steps, frame_exists=None):
    """整表实测：返回 (达标数, 分母, [(步号, 达标bool), ...])。steps = steps 映射。"""
    steps = as_dict(steps)
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
    """步绑定 11 项 + 产品成效 2 项合并实测：返回 (达标数, 分母, 步明细, 产品成效 dict)。

    产品成效登记降级口径：frames 缺席但 degraded=True 时该项计达标（WARN 口径），
    exec 项不适用降级（执行输出可无 UI 面亦产出，缺席即真缺口）。
    """
    met, _, detail = evaluate(steps, frame_exists)
    po = product_outcome_status(evid_dir, issue_log_text)
    po_met = (1 if po['exec_met'] else 0) + (1 if (po['frames_met'] or po['degraded']) else 0)
    return met + po_met, TOTAL, detail, po
