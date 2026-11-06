#!/usr/bin/env python3
"""run27 零变化帧复盘补隔离（2026-11-06 帧采集准确性根治收口件）。

对 run27 采集期双帧伪模型产物（19 步前后帧 md5 相同＝无操作证据）做四件事：
  1. 18 个真实步的零变化帧对隔离 .invalid（保留可查、退出证据池）；
  2. 预检探针帧（capture-precheck）移出 steps/ 至 screenshots/ 父目录；
  3. r18-steps.json 剥离对应 ops 帧注册（op 条目保留、frames 清空——如实记录「拍过已隔离」）；
  4. issues.log 逐键落 ISSUE＋DISP 成对记单（已修：采集模型已根治入码），不产生待处置。

幂等：.invalid 在案/探针已移/单已在案均跳过；先备份 r18-steps.json。
"""
import json
import shutil
import sys
import time
from pathlib import Path

SIM = Path('/Users/cuishi/lab/ncwk-sim-mux')
RUN = '20261105-v8-run27'
EVID = SIM / 'runs' / RUN / 'evidence'
STEPS = EVID / 'screenshots' / 'steps'
SHOTP = EVID / 'screenshots'

# run27 实测零变化 18 步（md5 扫描定谳；17 弱承载已重分类 none/repo + ide_done）
KEYS = ['analysis_done', 'appinit_done', 'close_done', 'devimpl_done', 'dispatch_done',
        'g1_frozen', 'g2_arch_pass', 'ide_done', 'login_done', 'people_done',
        'ready_inbox', 'release_done', 'report_done', 'retro_done', 'room_done',
        'smoke_done', 'triage_done', 'workmgr_done']

STAMP = time.strftime('%Y-%m-%d %H:%M')

def md5(p: Path) -> str:
    import hashlib
    return hashlib.md5(p.read_bytes()).hexdigest()

# ── 1. 零变化对核验＋隔离（先复核 md5 再隔离——不凭名单盲隔） ──
quarantined, skipped = [], []
for k in KEYS:
    b, a = STEPS / f'{k}-op1-before.png', STEPS / f'{k}-op1-after.png'
    act = STEPS / f'{k}-op1-action.png'
    if b.with_suffix('.png.invalid').exists() or (not b.exists() and not a.exists()):
        quarantined.append(k)  # 已隔离/已不在池
        continue
    if b.exists() and a.exists() and md5(b) == md5(a):
        b.rename(b.with_name(b.name + '.invalid'))
        a.rename(a.with_name(a.name + '.invalid'))
        act.unlink(missing_ok=True)
        quarantined.append(k)
    else:
        skipped.append(k)  # 名单与盘态不符——如实报告，人工核
print(f'隔离 {len([k for k in quarantined if (STEPS / f"{k}-op1-before.png.invalid").exists()])} 步；名单不符 {skipped or "无"}')

# ── 2. 探针帧出池 ──
moved = 0
for f in STEPS.glob('capture-precheck-op1-*.png'):
    shutil.move(str(f), SHOTP / f.name)
    moved += 1
print(f'探针帧出池 {moved} 张')

# ── 3. r18-steps.json 剥离注册 ──
r18f = EVID / 'r18-steps.json'
bak = EVID / 'r18-steps.json.bak-frame-accuracy'
if not bak.exists():
    shutil.copy2(r18f, bak)
r18 = json.loads(r18f.read_text(encoding='utf-8'))
# 结构：{_schema:…, steps:{<step_key>:{ops:[…]}}}（步条目在 steps 子字典下）
_step_entries = r18.get('steps') if isinstance(r18.get('steps'), dict) else r18
stripped = 0
for sn, sv in _step_entries.items():
    ops = (sv or {}).get('ops') if isinstance(sv, dict) else None
    if not ops:
        continue
    for og in ops:
        for f in list(og.get('frames') or []):
            fn = str(f)
            if fn.split('-op')[0] in KEYS or fn.startswith('capture-precheck'):
                og['frames'].remove(f)
                stripped += 1
r18f.write_text(json.dumps(r18, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'r18 剥离 {stripped} 帧注册（备份 {bak.name}）')

# ── 4. issues.log 成对记单（幂等：按 step 键查重在案跳过） ──
ilog = EVID / 'issues.log'
existing = ilog.read_text(encoding='utf-8', errors='replace') if ilog.exists() else ''
lines = []
for k in KEYS:
    if f'frame-zero-change-voided|step-{k}|' in existing:
        continue
    lines.append(f'ISSUE|frame-zero-change-voided|step-{k}|复盘补隔离（{STAMP} 帧采集准确性根治批）：run27 采集期双帧伪模型产物，前后帧 md5 相同＝无操作证据；帧已隔离 .invalid 不入证据池，该步分类按 capture-plan.env 四态落位（模型根治=spec 2026-11-06-frame-capture-accuracy）')
    lines.append(f'DISP|frame-zero-change-voided|step-{k}|已修（采集模型根治入码：无动作步完成态单帧＋动作真实执行＋审计单帧口径；run27 帧隔离为本单处置动作）')
ilog.parent.mkdir(parents=True, exist_ok=True)
with ilog.open('a', encoding='utf-8') as fh:
    fh.write('\n'.join(lines) + ('\n' if lines else ''))
print(f'记单 {len(lines)//2} 键（新落）')

if skipped:
    sys.exit(2)  # 名单不符=不静默——退 2 人工核
print('CLOSURE-OK')
