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
import os
import sys
import tempfile
from pathlib import Path

SIM_ROOT = Path(os.environ.get('AIPAY_SIM_ROOT') or '/Users/cuishi/lab/ncwk-sim-mux')

# 每步「必须出现」的关键词（任一命中即可）与「不得出现」的空白态噪声。
# 语义来源：capture-plan.env 同键行的页签名/注释（见各行末注释）。

# N13 语义判据（2026-11-04）：面包屑＝页面身份，关键词命中可能只是侧栏字样的假阳性。
# 有 crumb 的键必须同时命中面包屑（去空白后比对），确保「拍的是这一步该在的页面」。
_FRAME_TAB = {
 'capture-precheck':'流程总览',
 'smoke_done':'账号','appinit_done':'文档评审','people_done':'组织','login_done':'账号',
 'g1_frozen':'质量门 G1','dispatch_done':'任务分解','register_done':'任务分解',
 'analysis_done':'G2 系统分析','anexec_done':'G2 系统分析','review_done':'G2 系统分析',
 'g2_arch_pass':'任务分解','close_done':'任务分解','plan_done':'排期',
 'triage_done':'看板','defect_done':'看板','testpass_done':'质量与测试',
 'release_done':'G5 审批','ready_done':'G5 审批','uat_done':'需求追溯',
 'workmgr_done':'交付健康','audit_done':'审计与变更','deliver_gate':'交付案例',
 'retro_done':'度量检查',
}
EXPECT = {
    # 启动自检帧（开跑前采集链自检，非 26 步之一）：证明登录态与总览已装载。
    'capture-precheck': {'want': [], 'title': '启动自检帧（登录/总览装载，页面身份=流程总览）'},
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
    'deliver_gate':  {'want': ['案例', '交付', '门禁', 'RFD-001', 'aipaydev'], 'title': '⑤验收·交付案例'},
    'uat_done':      {'want': ['追溯', '验收', '需求'], 'title': '⑤验收·需求追溯'},
    'workmgr_done':  {'want': ['交付健康', '看板', '验收'], 'title': '⑤验收·交付健康'},
    'audit_done':    {'want': ['审计', '治理', '变更'], 'title': '⑥治理·审计与变更'},
    'retro_done':    {'want': ['度量', '治理', '检查'], 'title': '⑥治理·度量检查'},
    'ide_done':      {'want': ['工作区', '任务', 'IDE'], 'title': 'IDE 工作区'},
    '26':            {'want': ['推演', '运行', '报告'], 'title': '全流程推演（报告承载面）'},
    # run25 补流批（2026-11-03）三键：两驱动位（此前注册缺席致 run25 零帧）+ 18b 文件域首帧
    'dispatch_done': {'want': ['任务', '看板', '分解'], 'title': '③分析设计·任务分解（派发后任务板）'},
    'report_done':   {'want': ['推演', '运行', '报告'], 'title': '全流程推演·导演台（报告生成后）'},
    'mp_runtime_proof': {'want': ['收银', '支付', '商户', 'Cashier'], 'title': '小程序收银台首帧（runtime-proof，18b 文件域）'},
    # 存量三键补投影（capture-plan-registry-coverage.test.ts 守门首跑抓出）：
    'release_done':  {'want': ['G5', '验收', '发布', '批准'], 'title': '⑤验收·G5 审批（发布留痕）'},
    'ready_inbox':   {'want': ['收件箱', '审批', '待办', '批准'], 'title': '审批收件箱'},
    'report_view':   {'want': ['推演', '运行', '报告'], 'title': '全流程推演·导演台（报告查看面）'},
}
# 空白态噪声：出现即说明拍到了空页面（比「没匹配到关键词」更强的信号）
# 空白/未推进态标记（2026-11-04 用户质询补强）：原四条只覆盖「列表空」，漏掉
# 「阶段未开始」「还没有…」这类整页未推进态——run26 的 g1_frozen 帧标题写着
# 「需求：冻结与启动 未开始」、plan_done 帧写着「还没有已排期的任务」，却在关键词
# 命中（侧栏/页签字样）下被判通过。页面态与步骤不符＝证据不实，必须显形。
# 只收「整页未推进/列表空」的明确措辞；不收裸「暂无」——顶栏「暂无阻塞、待审或待分类任务」
# 是健康态，会被误判（run26 复核时 26 帧全红即此坑）。
EMPTY_MARKERS = ['还没有任务工作区', '暂无可选任务', '未选择对象', '暂无数据', '没有找到',
                 '未开始', '还没有']


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
    # stderr 解码容错（2026-11-04 实证）：tesseract 混入非 UTF-8 字节时 text=True 严格
    # 解码会抛 UnicodeDecodeError，整个核对崩——这是「帧从未被核验」的隐性原因之一。
    out = subprocess.run(['tesseract', str(small), 'stdout', '-l', 'chi_sim', '--psm', '6'],
                         capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=120)
    return out.stdout or ''


def norm(t: str) -> str:
    return re.sub(r'\s+', '', t)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', default='')
    ap.add_argument('--out', default='')
    ap.add_argument('--only', default='')
    ap.add_argument('--dump-expect', action='store_true',
                    help='打印 EXPECT 的 shell 变量投影（MX_EXPECT_<key>=词1,词2）后退出')
    a = ap.parse_args()
    if a.dump_expect:
        # 单一事实源：拍摄器（r18-frames --expect）用的期望词就从这里导出，
        # 不另立一份表（2026-11-04 N13：两种表必漂移）。
        for _k, _v in EXPECT.items():
            # 键归一（-→_）：连字符键（如 capture-precheck）不能作 shell 赋值名，
            # 驱动 source 本输出时按命令解析 127 即死（burn-pre-run27 实锤）；
            # 消费端 mx-scenario-lib.sh r18_frames 同规则 ${step//-/_} 取值。
            # 33 键归一后无冲突（2026-11-05 核验）。
            print(f'MX_EXPECT_{_k.replace("-", "_")}="{",".join(_v["want"])}"')
        return 0
    if not a.run:
        print('需要 --run（或 --dump-expect）', file=sys.stderr)
        return 2
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
            ok = (bool(hit) or not exp['want']) and not empties
            why = ''
            _tab = _FRAME_TAB.get(key)
            if _tab:
                _meta_f = frame.parent / frame.name.replace('-op1-after.png', '-op1-meta.json')
                _title = ''
                try:
                    _title = str((json.loads(_meta_f.read_text(encoding='utf-8')) or {}).get('title') or '')
                except Exception:
                    _title = ''
                if _title:
                    if _tab.replace(' ', '') not in _title.replace(' ', ''):
                        ok = False
                        why = (why + '；' if why else '') + f'页面身份不符（title=「{_title}」缺「{_tab}」）'
                elif _tab.replace(' ', '') not in text:
                    ok = False
                    why = (why + '；' if why else '') + f'页面身份未证（无 sidecar 且 OCR 未见「{_tab}」）'
            if exp['want'] and not hit:
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
