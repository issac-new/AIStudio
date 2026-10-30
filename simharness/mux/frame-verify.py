#!/usr/bin/env python3
"""frame-verify.py — 步级实拍帧的「内容与要求是否匹配」机械化核对（run23 用户指令）。

为什么不是「调视觉模型打分」：先试过 cc-switch 代理（模型 glm-5.3 声明 supports_vision），
`input_image` 传 data URL / HTTP URL / 对象形态三种写法，上游一律回 `[Unsupported Image]`
（代理不转发图像部件）。所以本脚本走**本地 OCR 关键词断言**：确定性、可复跑、零外部依赖
（tesseract + chi_sim 已装），且判据可被人独立复核——比一次性的模型打分更适合做守门。

判据（每条都可反查）：
  1. 帧文件在位；
  2. OCR 文本里出现该步「必须出现」的关键词之一（页面标题/页签名/步骤专属词）；
  3. OCR 文本里不得出现「未分类/报错」类噪声关键词（可选，用于抓空白态）。

期望表来源：EXPECT 表（下方）＝capture-plan.env 的拍摄位语义 + 步标题，单一事实源在
capture-plan；本表只是它可供机器断言的投影，改拍摄位须同步本表（tests 有守门）。

用法：
  python3 frame-verify.py --run <RUN_ID> [--out <json>] [--only key1,key2]
退出码：0=全部匹配；1=有偏差（逐条打印）；2=环境缺依赖。
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SIM_ROOT = Path('/Users/cuishi/lab/ncwk-sim-mux')

# 每步「必须出现」的关键词（任一命中即可）与「不得出现」的空白态噪声。
# 语义来源：capture-plan.env 同键行的页签名/注释（见各行末注释）。
EXPECT = {
    'smoke_done':    {'want': ['流程总览', '环境准备', 'AIStudio'], 'title': '首页/流程总览'},
    'appinit_done':  {'want': ['应用资产', '治理', '文档评审'], 'title': '⑥治理·文档评审'},
    'people_done':   {'want': ['组织', '角色', '权限'], 'title': '①搭建·组织与团队'},
    'login_done':    {'want': ['账号', '登录', '搭建'], 'title': '①搭建·账号'},
    'g1_frozen':     {'want': ['需求', '冻结', '验收标准'], 'title': '②需求·文档评审'},
    'room_done':     {'want': ['会话', '工作台', '协作'], 'title': '工作台·会话画布'},
    'register_done': {'want': ['任务', '看板', '分解'], 'title': '③分析设计·任务分解'},
    'analysis_done': {'want': ['分析', '系统分析', '清单'], 'title': '③分析设计·系统分析'},
    'triage_done':   {'want': ['看板', '卡', '任务'], 'title': '④开发·看板'},
    'anexec_done':   {'want': ['分析', '系统分析', '四路'], 'title': '③分析设计·系统分析'},
    'review_done':   {'want': ['分析', '设计', '评审'], 'title': '③分析设计'},
    'g2_arch_pass':  {'want': ['评审', '任务', '架构'], 'title': '③分析设计·任务分解（评审卡）'},
    'close_done':    {'want': ['任务', '主卡', '分解'], 'title': '③分析设计·任务分解'},
    'plan_done':     {'want': ['排期', '计划', '人日'], 'title': '③分析设计·排期'},
    'devimpl_done':  {'want': ['工作区', '任务', '代码'], 'title': 'IDE 工作区'},
    'testpass_done': {'want': ['看板', '测试', '任务'], 'title': '④开发·看板'},
    'defect_done':   {'want': ['看板', '缺陷', '任务'], 'title': '④开发·看板（缺陷）'},
    'eval_done':     {'want': ['评', '指标', '覆盖'], 'title': '评测工作台'},
    'ready_done':    {'want': ['验收', 'G5', '发布'], 'title': '⑤验收·G5 审批'},
    'deliver_gate':  {'want': ['案例', '交付', '门禁'], 'title': '⑤验收·交付案例'},
    'uat_done':      {'want': ['追溯', '验收', '需求'], 'title': '⑤验收·需求追溯'},
    'workmgr_done':  {'want': ['交付健康', '看板', '验收'], 'title': '⑤验收·交付健康'},
    'audit_done':    {'want': ['审计', '治理', '变更'], 'title': '⑥治理·审计与变更'},
    'retro_done':    {'want': ['度量', '治理', '检查'], 'title': '⑥治理·度量检查'},
    'ide_done':      {'want': ['工作区', '任务', 'IDE'], 'title': 'IDE 工作区'},
    '26':            {'want': ['推演', '运行', '报告'], 'title': '全流程推演（报告承载面）'},
}
# 空白态噪声：出现即说明拍到了空页面（比「没匹配到关键词」更强的信号）
EMPTY_MARKERS = ['还没有任务工作区', '暂无可选任务', '未选择对象', '暂无数据', '没有找到']


def ocr(path: Path, tmp: Path) -> str:
    # 缩到宽约 1600：tesseract 对超大图既慢又易碎行，缩到这个量级中文行长更稳
    small = tmp / (path.stem + '-ocr.png')
    try:
        from PIL import Image
        im = Image.open(path).convert('L')
        if im.width > 1600:
            im = im.resize((1600, int(im.height * 1600 / im.width)))
        im.save(small)
    except Exception:
        small = path
    out = subprocess.run(['tesseract', str(small), 'stdout', '-l', 'chi_sim', '--psm', '6'],
                         capture_output=True, text=True, timeout=120)
    return out.stdout or ''


def norm(t: str) -> str:
    return re.sub(r'\s+', '', t)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', required=True)
    ap.add_argument('--out', default='')
    ap.add_argument('--only', default='')
    a = ap.parse_args()
    if not shutil.which('tesseract'):
        print('缺 tesseract（brew install tesseract + chi_sim 语言包）', file=sys.stderr)
        return 2

    steps_dir = SIM_ROOT / 'runs' / a.run / 'evidence' / 'screenshots' / 'steps'
    keys = [k.strip() for k in a.only.split(',') if k.strip()] or list(EXPECT)
    rows = []
    bad = 0
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for key in keys:
            exp = EXPECT.get(key)
            if not exp:
                continue
            frame = steps_dir / f'{key}-op1-after.png'
            if not frame.exists():
                frame = steps_dir / f'{key}-op1-before.png'
            if not frame.exists():
                rows.append({'key': key, 'ok': False, 'why': '缺帧', 'title': exp['title']})
                bad += 1
                continue
            text = norm(ocr(frame, tmp))
            hit = [w for w in exp['want'] if w in text]
            empties = [m for m in EMPTY_MARKERS if m in text]
            ok = bool(hit) and not empties
            why = ''
            if not hit:
                why = '未命中期望词 ' + '/'.join(exp['want'])
            if empties:
                why = (why + '；' if why else '') + '空白态：' + '/'.join(empties)
            rows.append({'key': key, 'ok': ok, 'title': exp['title'], 'hit': hit, 'why': why,
                         'frame': frame.name})
            if not ok:
                bad += 1
    print(f'帧内容核对：{len(rows)} 帧，匹配 {len(rows) - bad}，偏差 {bad}')
    for r in rows:
        if not r['ok']:
            print(f"  ✗ {r['key']:<15} 期望「{r['title']}」— {r['why']}")
    if a.out:
        Path(a.out).write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding='utf-8')
        print('明细 →', a.out)
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    raise SystemExit(main())
