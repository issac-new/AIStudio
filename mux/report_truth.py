"""报告真值三件套（run20 复盘根治，2026-10-16；用户 goal「复盘识别问题→修复→完善」批）

三件套对应 run20 实测锤实的三类报告失真：

①交付物轮次一致性（stale）：文件头声明的 RUN/轮次 与当前轮不符=往轮产物冒充。
  run20 实锤：步 13「系分稿 PAYCORE」渲染的是 RUN=20261012-v8-run16 文档、
  「系分稿 MP」是 RUN=20261010-v8-run14 文档——二者经 integration 合并
  （central 64dff9e cherry-pick C 独有 A 文件）扫入分支，被生成器当本轮交付物
  呈现。旧 freshness 判据（_art_refreshed：ref 上该路径最后提交时刻 ≥ 轮起点）
  被 21:10 的合并「刷新」蒙过——路径被碰过≠产物是本轮的。

②锚点活性（dead-anchor）：交付物锚 ref 必须存在于远端（ls-remote）。
  run20 实锤：13 件交付物锚 origin/integration/RFD-001@658971a，而远端
  （github.com/issac-new/aipaydev）赛后已无该分支、658971a 无任何分支包含
  （游离提交）——报告自称「双凭证可反查」实际集体不可反查。

③逐步问题单注册（step-issue）：issues.log 命中步注册键的问题单必须渲染进取步
  ③段。run20 实锤：STEPS_META_20261015_V8_RUN20 26 步全未注册 issue_keys，
  报告 27 处「已知问题：无（本步零问题单）」与台账 139 行 ISSUE 并存——
  逐步问题单空渲染=单步层面的「账实不符」。

纯函数 + 薄 IO 封装：判据可单测（tests/report-truth-anchor.test.sh），
生成器/审计器共用同一判据源（单一事实源）。
"""

from __future__ import annotations

import re
import subprocess
from typing import Optional, Tuple

# 轮 id 形状：20261015-v8-run20（日期-版本线-轮次）
RUN_ID_RE = re.compile(r'\b(\d{8}-v\d+-run\d+)\b')

# 权威位模式：文件头声明「本稿属于哪轮」的字段。同一行内 RUN= 之前若带
# 上轮/历轮/对照等前缀（见 _NON_AUTH_PREFIX）=非本稿声明，跳过。
_AUTH_PATTERNS = [
    re.compile(r'轮次[：:|\s][^。\n]{0,60}?(\d{8}-v\d+-run\d+)'),
    re.compile(r'派发标识[：:|\s][^。\n]{0,60}?(\d{8}-v\d+-run\d+)'),
]
# 权威位前置的排除词（同一行内出现在 RUN= 之前 ≤12 字）=非本稿声明
_NON_AUTH_PREFIX = re.compile(r'(上轮|历轮|前轮|对照|历史轮|源轮|基线轮|上一轮)[^。\n]{0,12}$')

# 文件头窗口：声明位只在头部（前 15 行）；正文中段的 RUN= 引用（如「上轮实锤」）
# 不是交付物归属声明。
HEADER_LINES = 15


def header_of(text: str) -> str:
    """取文件头窗口（前 HEADER_LINES 行）——声明位判定的作用域。"""
    return '\n'.join((text or '').splitlines()[:HEADER_LINES])


def extract_declared_run(text: str) -> str:
    """从文件头提取本稿声明的轮 id；无声明位=''（不妄断陈旧）。

    判据优先「轮次/派发标识」声明位；退化到文件头首个 RUN= 字面（排除上轮/
    历轮等前缀）。返回 '' = 该文件不携带轮次声明（如 roster/app-registry
    等注册表类工件跨轮延续，无声明位即不参与陈旧判定）。
    """
    head = header_of(text)
    if not head.strip():
        return ''
    for pat in _AUTH_PATTERNS:
        for m in pat.finditer(head):
            line_start = head.rfind('\n', 0, m.start()) + 1
            prefix = head[line_start:m.start()]
            if _NON_AUTH_PREFIX.search(prefix):
                continue
            return m.group(1)
    for m in RUN_ID_RE.finditer(head):
        line_start = head.rfind('\n', 0, m.start()) + 1
        prefix = head[line_start:m.start()]
        if _NON_AUTH_PREFIX.search(prefix):
            continue
        return m.group(1)
    return ''


def stale_verdict(text: str, run_id: str) -> Tuple[bool, str]:
    """→ (是否往轮产物, 声明轮 id)。

    run_id 为空（历史兼容）=不判（False, ''）——无本轮锚时的旧语义保持。
    文件无声明位=不判（False, ''）——注册表类工件跨轮延续合法。
    """
    if not run_id:
        return False, ''
    declared = extract_declared_run(text or '')
    if not declared:
        return False, ''
    return (declared != run_id), declared


def anchor_alive(git_dir: str, branch: str, timeout: int = 15) -> bool:
    """远端分支活性（ls-remote --heads）。网络失败/超时=True（fail-open：
    不把网络抖动误判成锚点死亡——死锚判定由生成器渲染层+审计器双确认）。"""
    if not branch:
        return True
    try:
        r = subprocess.run(
            ['git', '--git-dir', git_dir, 'ls-remote', '--heads', 'origin', branch],
            capture_output=True, text=True, timeout=timeout)
        if r.returncode != 0:
            return True  # 查询失败=不判死
        return bool(r.stdout.strip())
    except Exception:
        return True


def ledger_rows_by_keys(issues_log: str, keys) -> list:
    """issues.log 中键命中 keys 的行（步归属过滤；生成器/审计器共用）。

    行形：ISSUE|<key>|<subject>|<desc>｜DISP|<key>|<subject>|<desc>
    """
    keys = set(keys or [])
    if not keys:
        return []
    rows = []
    try:
        with open(issues_log, encoding='utf-8', errors='replace') as fh:
            for ln in fh:
                p = ln.rstrip('\n').split('|', 3)
                if len(p) < 4 or p[0] not in ('ISSUE', 'DISP', 'RISK'):
                    continue
                if p[1] in keys:
                    rows.append((p[0], p[1], p[2], p[3]))
    except OSError:
        return []
    return rows


def unregistered_ledger_keys(issues_log: str, registered: dict) -> list:
    """台账里未注册到任何步的键（收尾链漏注册的机械暴露——run20 实锤：
    139 行 ISSUE 中多数键无步归属，逐步问题单因此整轮空渲染）。

    registered: {step: [keys]}
    """
    all_keys = set()
    for ks in (registered or {}).values():
        all_keys.update(ks or [])
    seen = []
    try:
        with open(issues_log, encoding='utf-8', errors='replace') as fh:
            for ln in fh:
                p = ln.rstrip('\n').split('|', 3)
                if len(p) >= 4 and p[0] == 'ISSUE' and p[1] not in all_keys and p[1] not in seen:
                    seen.append(p[1])
    except OSError:
        return []
    return seen


# ── 孤儿帧自动挂接（run20 复盘 C3 根治件）──
# run20 实锤：59 帧真实截图落盘、叙事注册 imgs 全空 → 53 帧成孤儿（审计 A5a
# 「盘上未引用帧」），报告口径却写「本轮未拍摄」。采集链拍了、报告没接——挂接
# 责任不能只压在收尾链手工注册上：imgs 空=按步键自动扫盘挂接，诚实标注来源。

def orphan_frames_for(keys, step_no, shots_dir) -> list:
    """步的自动挂接候选帧（叙事 imgs 空时的兜底）。

    匹配盘上 runs/<RUN>/evidence/screenshots/steps/ 的 <key>-op<k>-<phase>.png
    （key ∈ 该步 state 键）与 <step_no>-op<k>-<phase>.png（数字前缀形态，run20
    实存 19-op1-action.png）。返回帧名前缀列表（不含扩展名），before/action/after
    相位序稳定。目录不存在/无匹配=空列表（回落「截图缺失」三态，不改变降级语义）。
    """
    import os
    if not shots_dir or not os.path.isdir(shots_dir):
        return []
    keys = [k for k in (keys or []) if k]
    prefixes = set()
    for name in os.listdir(shots_dir):
        if not name.endswith('.png'):
            continue
        stem = name[:-4]
        m = re.match(r'^(.+?)-op\d+-(before|action|after)$', stem)
        if not m:
            continue
        head = m.group(1)
        if head in keys or (str(step_no) == head):
            prefixes.add(stem)
    order = {'before': 0, 'action': 1, 'after': 2}
    def _sort_key(s):
        m = re.match(r'^(.+?)-op(\d+)-(before|action|after)$', s)
        return (m.group(1), int(m.group(2)), order.get(m.group(3), 9)) if m else (s, 0, 9)
    return sorted(prefixes, key=_sort_key)
