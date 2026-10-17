#!/usr/bin/env python3
# report-narrative.py — V4 路演报告叙事层（2026-09-28 V4 路演重构方案 §四）
# 讨论意见三条落地：
#   意见1 呈现具体化 → 挑战与协同章：真实案例（问题单台账实测统计数字）+ 机制点出 harness+multi-agent
#   意见2 差异化亮点 → 六卡（对比行业通用方案），每条带证据锚点
#   意见3 双 loop + 左移 + 四维协作质量 → HTML/CSS 循环图（免 mermaid，V3 实锤 mmdc 依赖脆弱）
# 红线：所有数字生成时从 evidence 实测统计（issues.log / state.env）；取不到显式标 ⬜，不编造。
# 供 mx-report-gen.py import：render_narrative(state: dict, evid: Path) -> str（HTML 片段）。
import html as H
import re
from collections import Counter
from pathlib import Path

ESC = lambda s: H.escape(str(s), quote=True)


def _issue_counts(evid: Path) -> Counter:
    """（返回 (Counter, ledger_found) 语义由调用方组合——缺键=0 次≠数据缺失）"""
    """问题单台账实测统计：ISSUE|类型|主体|描述 → 按类型计数。"""
    f = evid / 'issues.log'
    c: Counter = Counter()
    if not f.exists():
        return c
    for line in f.read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'^ISSUE\|([^|]+)\|', line)
        if m:
            c[m.group(1)] += 1
    return c


def _state_mark(state: dict, key: str) -> str:
    """状态锚点：存在 ✅ + 值截断；缺失 ⬜（不造假）。"""
    v = state.get(key, '')
    if not v:
        return '<span class="nv-miss">⬜ 未取得</span>'
    v = str(v)
    if len(v) <= 2:
        return '<span class="nv-ok">✅</span> <span>已写入通过标记</span>'
    if v.isdigit() and len(v) >= 10:
        import datetime
        return f'<span class="nv-ok">✅</span> <code>{datetime.datetime.fromtimestamp(int(v[:10])).strftime("%m-%d %H:%M:%S")}</code>'
    if len(v) > 42:
        v = v[:42] + '…'
    return f'<span class="nv-ok">✅</span> <code>{ESC(v)}</code>'


def _circle_nodes(items, radius=150, size=340, start_deg=-90):
    """环形布局：返回 [(text, x, y)]，圆心居中，start 在正上方。"""
    import math
    n = len(items)
    out = []
    for i, text in enumerate(items):
        deg = start_deg + i * 360 / n
        rad = math.radians(deg)
        x = size / 2 + radius * math.cos(rad)
        y = size / 2 + radius * math.sin(rad)
        out.append((text, x, y, i))
    return out


def _loop_diagram(items, center_label, back_edge, caption, accent='#2563eb'):
    """通用 loop 环图：节点环形排布 + 中心标签 + 回流虚线说明（纯 HTML/CSS）。"""
    size = 340
    radius = 132
    nodes = _circle_nodes(items, radius, size)
    parts = [f'<div class="nv-loop" style="--accent:{accent};width:{size}px;height:{size}px">']
    parts.append(f'<div class="nv-loop-center">{center_label}</div>')  # center_label 为本模块静态文案（含 <br/>），非外部输入
    for text, x, y, i in nodes:
        parts.append(
            f'<div class="nv-loop-node" style="left:{x:.0f}px;top:{y:.0f}px">'
            f'<span class="nv-loop-idx">{i + 1}</span>{ESC(text)}</div>'
        )
    parts.append('</div>')
    parts.append(
        f'<div class="nv-loop-side">'
        f'<div class="nv-loop-back">↩ {ESC(back_edge)}</div>'
        f'<div class="nv-loop-caption">{caption}</div></div>'
    )
    return f'<div class="nv-loop-wrap">{"".join(parts)}</div>'


def render_narrative(state: dict, evid: Path) -> str:
    """叙事层 HTML：价值主张 hero → 挑战与协同 → 双 loop → 差异化亮点 → 四维协作质量。"""
    counts = _issue_counts(evid)
    ledger_found = (evid / 'issues.log').exists()
    def _c(n):
        # 台账在场：缺键=本轮 0 次（≠数据缺失）；台账缺失才显式 ⬜（"取不到显式 ⬜"口径）
        return str(n) if ledger_found else '⬜'
    def _z(n, note='——根治后未复现（建群全量预邀）'):
        return note if (ledger_found and n == 0) else ''
    total_issues = sum(counts.values())
    n_invite = counts.get('room-invite-gap', 0)
    n_evidence = counts.get('done-without-verifiable-evidence', 0) + counts.get('kanban-registration-skipped', 0)
    n_gate = sum(v for k, v in counts.items() if re.match(r'^(g[1-6]-|review-card)', k))  # 闸门键族（2026-10-07 修复硬编码白名单漏 g5-ready-fail）

    # ── ① 价值主张 hero ──
    hero = f'''
<section class="nv-hero" id="nv-hero">
  <div class="nv-hero-title">人机协作的多智能体软件研发：一条需求从冻结到验收的完整旅程</div>
  <div class="nv-hero-sub">人的角色从"生产者"转向"意图持有者、仲裁者和最终验证者"——AI 员工主理执行，六道强制关卡守住意图核对一致与不可逆决策。</div>
  <div class="nv-hero-metrics">
    <div class="nv-metric"><b>26</b><span>标准流程步</span></div>
    <div class="nv-metric"><b>6</b><span>道强制关卡（G1-G6）</span></div>
    <div class="nv-metric"><b>15×2</b><span>人编制 ×（人+AI 助理）账号</span></div>
    <div class="nv-metric"><b>4</b><span>类 AI 员工（需求设计/应用研发/质量测试/研发治理）</span></div>
    <div class="nv-metric"><b>{_c(total_issues)}</b><span>问题单台账条目（全程记账）</span></div>
  </div>
</section>'''

    # ── ② 挑战与协同（意见1：真实案例 + 机制点出 harness + multi-agent）──
    cases = [
        (
            '挑战 A：分布式协作的成员一致性',
            f'推演中问题单台账实记 <b>{_c(n_invite)}</b> 次{_z(n_invite)}"派发者不在群"缺口——'
            '智能体@责任人派发任务时，对方尚未入群，消息发不出去（Matrix 403）。',
            '协同机制：监控程序模式检测缺口即刻补邀并记问题单，不静默丢失；随后根治为"建群即按 RACI 全量预邀 + G2 前补邀架构双账号"（overlay f8382131）。'
            '这正是 harness（场景编排器）+ multi-agent 的交界处：通信基建的语义缺口，靠台账暴露、靠流程根治。',
            _state_mark(state, 'room_analysis'),
        ),
        (
            '挑战 B：大模型"完成"幻觉',
            f'台账实记 <b>{_c(n_evidence)}</b> 次{_z(n_evidence, "——本轮无同期记入问题清单")}"无凭证报完成"被打回——'
            '智能体宣称任务完成，但提交号/卡号反向核验查无实据（RFD-001 两轮拒收实例）。',
            '协同机制：一切"完成"必须带代码提交号+任务卡号双凭证，系统反向核验，查不到打回限期重报，两轮不过记问题单中止。'
            '验证优先于生成：客观执行信号作准出，自我评价不作数。',
            (('<span class="nv-ok">✅</span> 记入问题清单 <code>kanban-registration-skipped·fanfan-agent</code>（issues.log 台账）')
             if counts.get('kanban-registration-skipped') else _state_mark(state, 'register_done')),
        ),
        (
            '挑战 C：审查不沦为橡皮图章',
            f'台账实记闸门相关缺口 <b>{_c(n_gate)}</b> 次（本轮；评审卡缺失/本地门禁缺件）{_z(n_gate)}。'
            'G2 架构评审 FAIL 即打回修订复评，历史偏差标红命中未回应即拦；G4 测试独立验证——测试的人不能是写代码的人。',
            '协同机制：生成-验证分离且对抗性设计，验证者的目标是"击穿实现"；每道闸未过不得流入下游（显式状态机熔断错误级联）。',
            _state_mark(state, 'g2_arch_pass'),
        ),
        (
            '挑战 D：模型通道拒绝服务形状（V4-run1 实录）',
            '开局 agent 首回合即被模型网关 HTTP 400 拒（Invalid request parameters），预检极简探针却全绿——'
            '预检探针与真实载荷形状不一致，"通道可用"被假阳性掩盖。',
            '协同机制：本地捕获代理截获 79KB 真实载荷逐项重放对照（原样 400 / 去掉 200 / 降档 200），'
            '实锤元凶为非标参数 reasoning_effort="max"（仅 gpt-5.6 层线上值接受）；配置改 high 后通道恢复、'
            'agent 回合全通。模型通道问题不猜不改盲试——载荷级实证定位，一修即愈。',
            '<span class="nv-ok">✅</span> 历轮证据档 <code>20260928-v4-run1</code>（2026-09-28 通道事故复盘，本案例为对照引用非本轮记入问题清单）',
        ),
    ]
    case_html = ''.join(
        f'''<div class="nv-case">
  <div class="nv-case-head">{ESC(t)}</div>
  <div class="nv-case-body">{body}</div>
  <div class="nv-case-mech">{mech}</div>
  <div class="nv-case-anchor">锚点：{anchor}</div>
</div>'''
        for t, body, mech, anchor in cases
    )
    challenge = f'''
<section class="nv-sec" id="nv-challenge">
  <h2>挑战与协同：三个本轮真实案例 + 一个历轮对照案例</h2>
  <p class="nv-lead">多智能体研发的关键问题出在人与智能体系统的交界处。案例 A/B/C 取自本轮问题单台账（issues.log 实测统计）；案例 D 为历轮（V4-run1）对照实录——均非假想场景。</p>
  <div class="nv-cases">{case_html}</div>
  <p class="nv-note">演进方向：RSI（递归自改进内核，见 2026-09-18-rsi-kernel-design）将把"纠错飞轮"从流程机制积累为运行时内核能力——本报告不作现态承诺。</p>
</section>'''

    # ── ③ 双 loop（意见3：skill loop 内循环 + swarm loop 外循环 + 左移）──
    skill_loop = _loop_diagram(
        ['认知地图', '规格先行', '代码纪律', '质量门禁', '知识池归档'],
        'skill loop<br/>单任务内循环',
        '缺陷回流：质量门禁不过 → 回到规格先行/编码，缺陷不出循环；知识池归档入跨轮记忆库，下轮同类任务自动回忆。',
        '编码五步内建于 swarm yuan 为仓库生成的 xxx-dev 技能——每个仓库有自己的定制化研发技能，流程随资产走。',
        '#059669',
    )
    swarm_loop = _loop_diagram(
        ['需求冻结 G1', '系统分析', '架构评审 G2', '排期', '编码 G3', '独立测试 G4', '发布准出 G5', 'UAT 验收', '复盘 G6', '记忆积累'],
        'swarm loop<br/>需求全流程外循环',
        '记忆反哺：复盘经验、问题处置、度量基线积累入 hindsight 跨轮记忆库（虚线回流），下轮需求分析自动命中历史偏差标红。',
        '左移：涉敏评估在需求期（G1④）、架构评审在排期前（G2）、测试要点在设计期（G2③）、安全扫描在编码门禁（G3）——"业务先行、技术债后补"模式全清，测试/架构/安全并入全流程迭代。',
        '#7c3aed',
    )
    loops = f'''
<section class="nv-sec" id="nv-loops">
  <h2>两个循环：技能内循环 × 全流程外循环</h2>
  <p class="nv-lead">开发角度与需求全流程角度各有一个 loop；两个 loop 通过知识池/记忆库咬合，构成可持续迭代的双轮。</p>
  <div class="nv-loops">{skill_loop}{swarm_loop}</div>
</section>'''

    # ── ④ 差异化亮点（意见2：对比行业通用方案）──
    highlights = [
        ('流程随资产走', 'swarm yuan skill 为每个仓库生成专属 xxx-dev 研发技能，五步能力内建：流程跟着资产走，不是一套通用 prompt 打天下。', '步骤 13/18'),
        ('六道强制关卡把守质量', '六道强制关卡脚本自动检查（G1-G6）：不过不流、不靠自觉；空话不上锁，"完成"必须带双凭证。', 'G1-G6 准出凭证'),
        ('产物可直接开工', '冻结需求、系分、概设、排期、开发分支、测试报告六样全齐：全带提交号+卡号双凭证，可反查可审计。', 'aipaydev 仓库全程'),
        ('评估精度到人日', '结合历史数据与评估标准逐任务评估，人日精度到任务；测试工作量按 0.3 系数独立成项。', '步骤 13/16/17'),
        ('26 步固定 SOP', '26 步固定标准流程，每步写明把关：开始前满足什么、做完拿什么交差、到什么程度算合格，脚本自动检查。', '方案全文+断言报告'),
        ('开头冻结即最终验收', '开头冻结的验收标准是最终验收的唯一依据，结尾 UAT 拿它逐条对账：需求到验收完整循环，多级翻译不失真。', '步骤 7 ↔ 21'),
    ]
    hl_html = ''.join(
        f'<div class="nv-hl"><div class="nv-hl-title">{ESC(t)}</div><div class="nv-hl-body">{b}</div><div class="nv-hl-anchor">{ESC(a)}</div></div>'
        for t, b, a in highlights
    )
    diff = f'''
<section class="nv-sec" id="nv-highlights">
  <h2>区别于行业通用方案的六个亮点</h2>
  <div class="nv-hls">{hl_html}</div>
</section>'''

    # ── ⑤ 四维协作质量（意见3）──
    dims = [
        ('统一标准', '语义、评估基准、质量门禁三统一', '金额统一"分"（int64）、字段命名 snake_case；SMART 任务清单+0.3 测试系数；六道闸全编制同构。', '#2563eb'),
        ('效率', 'AI 驱动的分布式人机组织与资产互联共享', '15 人编制 30 账号 42 profile 单 gateway 多路复用；中央仓、技能模板、记忆库全编制共享，档案按账号隔离。', '#059669'),
        ('风控', 'human-in-loop 控制责任和风险', '两道人工门（意图核对一致：G1/G2/分诊确认；不可逆决策：G5 发布批准）+ 审批收件箱风险分级 + 审计独立签名线 + 全程双凭证可追溯。', '#dc2626'),
        ('长期治理', '资产累积与全流程完整循环治理迭代', '模版库回写、知识池归档、跨轮记忆库、纠错飞轮（人工纠正→规范条目/评估用例→下轮验证复发）。', '#7c3aed'),
    ]
    dim_html = ''.join(
        f'<div class="nv-dim" style="--dim:{c}"><div class="nv-dim-title">{ESC(t)}</div><div class="nv-dim-sub">{ESC(s)}</div><div class="nv-dim-body">{b}</div></div>'
        for t, s, b, c in dims
    )
    quality = f'''
<section class="nv-sec" id="nv-quality">
  <h2>协作质量的四个维度</h2>
  <div class="nv-dims">{dim_html}</div>
</section>'''

    # 2026-10-10 token 化：色值改引 report-tokens.css 变量（机器报告 style 块顶部已注入
    # tokens，本层嵌入其 body 内 var() 全局可解析）；紫 note 撤专色统一 var(--accent-deep)，
    # 双 loop 图的语义区分色（绿/紫）作为数据传入保留，不进皮肤层。
    css = '''
<style>
.nv-hero{padding:34px 38px;background:var(--grad-hero);color:var(--surface);border-radius:14px;margin-bottom:26px}
.nv-hero-title{font-size:24px;font-weight:700;letter-spacing:.01em}
.nv-hero-sub{margin-top:10px;font-size:13.5px;opacity:.85;line-height:1.7}
.nv-hero-metrics{display:flex;gap:26px;margin-top:20px;flex-wrap:wrap}
.nv-metric{display:flex;flex-direction:column}
.nv-metric b{font-size:22px;color:#7dd3fc}
.nv-metric span{font-size:11.5px;opacity:.75;margin-top:2px}
.nv-sec{margin:26px 0}
.nv-sec h2{font-size:18px;margin:0 0 8px}
.nv-lead{color:#475569;font-size:13px;line-height:1.7;margin:0 0 14px}
.nv-cases{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.nv-case{border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--surface)}
.nv-case-head{font-weight:700;font-size:13.5px;margin-bottom:8px}
.nv-case-body{font-size:12.5px;line-height:1.7;color:#334155}
.nv-case-mech{font-size:12.5px;line-height:1.7;color:#0f766e;margin-top:8px;border-top:1px dashed var(--line);padding-top:8px}
.nv-case-anchor{font-size:11.5px;color:var(--muted);margin-top:8px}
.nv-note{font-size:12px;color:var(--accent-deep);background:var(--accent-soft);border-radius:8px;padding:8px 12px;margin-top:12px}
.nv-miss{color:#94a3b8}
.nv-ok{color:var(--ok)}
.nv-loops{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.nv-loop-wrap{display:flex;gap:16px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:16px;background:var(--surface)}
.nv-loop{position:relative;flex-shrink:0}
.nv-loop-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;font-size:12px;font-weight:700;color:var(--accent);width:110px;line-height:1.5}
.nv-loop-node{position:absolute;transform:translate(-50%,-50%);background:var(--surface);border:1.5px solid var(--accent);color:var(--ink-strong);border-radius:999px;padding:4px 10px;font-size:11.5px;white-space:nowrap;display:flex;align-items:center;gap:5px}
.nv-loop-idx{display:inline-flex;width:15px;height:15px;border-radius:50%;background:var(--accent);color:var(--surface);font-size:11px;align-items:center;justify-content:center}
.nv-loop-side{min-width:0}
.nv-loop-back{font-size:12px;color:var(--warn);background:#fffbeb;border:1px dashed #f59e0b;border-radius:8px;padding:7px 10px;line-height:1.6}
.nv-loop-caption{font-size:12px;color:#475569;line-height:1.7;margin-top:10px}
.nv-hls{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.nv-hl{border:1px solid var(--line);border-radius:10px;padding:14px;background:linear-gradient(180deg,var(--surface),var(--surface-2))}
.nv-hl-title{font-weight:700;font-size:13.5px;color:#1e40af}
.nv-hl-body{font-size:12.5px;line-height:1.7;color:#334155;margin-top:6px}
.nv-hl-anchor{font-size:11px;color:var(--muted);margin-top:8px}
.nv-dims{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.nv-dim{border-left:4px solid var(--dim);border-radius:8px;padding:12px 14px;background:var(--surface);border-top:1px solid var(--line);border-right:1px solid var(--line);border-bottom:1px solid var(--line)}
.nv-dim-title{font-weight:700;font-size:14px;color:var(--dim)}
.nv-dim-sub{font-size:12px;color:var(--muted);margin-top:2px}
.nv-dim-body{font-size:12.5px;line-height:1.7;color:#334155;margin-top:6px}
@media(max-width:1100px){.nv-cases,.nv-hls{grid-template-columns:1fr}.nv-loops,.nv-dims{grid-template-columns:1fr}}
</style>'''
    return css + hero + challenge + loops + diff + quality


if __name__ == '__main__':
    # 自检：对当前 evidence 直接渲染一次，输出到 stdout 供人工核稿
    import sys
    sim = Path('/Users/cuishi/lab/ncwk-sim-mux')
    st = {}
    se = sim / 'state.env'
    if se.exists():
        for line in se.read_text().splitlines():
            if '=' in line and not line.startswith('jwt_'):
                k, v = line.split('=', 1)
                st[k.strip()] = v.strip()
    html = render_narrative(st, sim / 'evidence')
    sys.stdout.write(html)
    print(f'\n<!-- narrative bytes={len(html)} -->', file=sys.stderr)


# ── 意图通路可视化（V4.1 §三 需求保真域缺口闭合：报告侧连线）──
# 从中央仓真实工件解析：G1 冻结 AC → 系分稿（AN-*）→ 开发分支测试日志（G3）→
# 独立测试报告（G4）→ UAT 逐条对账（acceptance）。取不到的环节显式 ⬜，不虚构。
def render_intent_chain(sim) -> str:
    import re as _re
    from pathlib import Path as _Path
    central = _Path(sim) / 'central' / 'aipaydev'
    ESC_ = ESC

    # 应用映射（冻结条款关键词 → AN/DEV 工件后缀与应用目录）
    APP_KEYS = [
        ('PAYCORE', 'csw-pay-core', ('csw-pay-core', '幂等', '状态机', '金额', '回调幂等', '超时关单')),
        ('MP', 'csw-cashier-mp', ('收银台三态', '前端', '小程序', 'csw-cashier-mp')),
        ('CHWX', 'csw-channel-wechat', ('微信', 'csw-channel-wechat', '双渠道')),
        ('CHALI', 'csw-channel-alipay', ('支付宝', 'csw-channel-alipay', '双渠道')),
    ]

    def _read(path):
        try:
            return path.read_text(encoding='utf-8')
        except Exception:
            return ''

    # run13 复盘 A8/F18：链上工件改「git 引实取」——本地 clone 的 HEAD 常驻集成分支，
    # main 侧新件（acceptance 等）不在工作树，原文件读=链路恒 ⬜；fetch 后按
    # origin/main（+integration 兜底）读 blob，不依赖任何 checkout 状态。
    import subprocess as _sp
    def _git(*args):
        try:
            r = _sp.run(['git', '-C', str(central), *args], capture_output=True, text=True, timeout=20)
            return r.stdout if r.returncode == 0 else ''
        except Exception:
            return ''
    _git('fetch', '-q', 'origin')
    def _ref_files(ref, pathspec):
        return sorted(l for l in _git('ls-tree', '-r', '--name-only', ref, pathspec).splitlines() if l.strip())
    def _ref_show(ref, path):
        return _git('show', f'{ref}:{path}')
    _MAINS = ('origin/main', f'origin/integration/RFD-001', 'HEAD')
    def _ref_first(pattern_fun):
        # pattern_fun(ref) -> 匹配文件列表；按 MAINS 优先级取第一个命中 ref 的首件
        for ref in _MAINS:
            hits = pattern_fun(ref)
            if hits:
                return ref, hits
        return None, []
    def _read_repo(rel_glob_dir, prefix='docs/requirements/'):
        ref, hits = _ref_first(lambda r: _ref_files(r, rel_glob_dir))
        return [(ref, h) for h in hits]

    # 1) G1 冻结 AC 清单（origin/main 真值）
    acs = []
    for ref, fz in _read_repo('docs/requirements/'):
        if not fz.endswith('.freeze.md'):
            continue
        for ln in _ref_show(ref, fz).splitlines():
            m = _re.match(r'^- \*\*(AC-\d+)\s*([^*]+)\*\*[：:](.+)$', ln.strip())
            if m:
                acs.append({'id': m.group(1), 'title': m.group(2).strip(), 'text': m.group(3).strip()})
    # 2) UAT 逐条判定（acceptance 报告——origin/main 新件不再依赖工作树）
    verdicts = {}
    for ref, acp in _read_repo('docs/acceptance/'):
        if not acp.endswith('-acceptance.md'):
            continue
        for ln in _ref_show(ref, acp).splitlines():
            m = _re.match(r'^- \*\*(AC-\d+)[^*]+\*\*[：:].*?→\s*判词[：:]\s*(通过|不通过|有条件通过|部分通过|待验收)', ln.strip())
            if m:
                verdicts[m.group(1)] = m.group(2)
    # 3) 链上工件（存在性 + 摘要）——DEV testlog 模式含子件后缀（run13 实锤：
    #    实件名 DEV-PAYCORE-S-testlog.txt，原模式 DEV-PAYCORE-testlog.txt 恒落空）
    def artifact(suffix_dir, pattern, summarizer=None):
        # glob（可含多个 *，* = 段内任意串）→ regex；ls-tree 的 pathspec 是字面路径非
        # 前缀通配（run13 复盘 A8 实锤），取首星前最后目录段整列、Python 侧全模式匹配
        if '*' not in pattern:
            return None
        d = pattern[:pattern.rindex('/', 0, pattern.index('*')) + 1]
        rx = _re.compile('^' + '[^/]*'.join(_re.escape(seg) for seg in pattern.split('*')) + '$')
        for ref in _MAINS:
            cand = sorted(f for f in _ref_files(ref, d) if rx.match(f))
            if cand:
                note = summarizer((ref, cand[0])) if summarizer else ''
                return (cand[0].rsplit('/', 1)[-1], note)
        return None

    def testlog_summary(rt):
        ref, path = rt
        txt = _ref_show(ref, path)
        m = _re.search(r'Tests\s+(\d+) passed', txt)
        return f'{m.group(1)} 用例全绿' if m else '已保存'

    rows = []
    for ac in acs:
        apps = [sfx for sfx, _d, keys in APP_KEYS if any(k in ac['text'] or k in ac['title'] for k in keys)]
        if not apps:
            apps = ['PAYCORE', 'MP', 'CHWX', 'CHALI']  # 条款未点名应用=全链涉及（如实标注全量）
        chips = []
        # 系分（F18：ref 实取，不依赖工作树 checkout 状态）
        _an_files = {f for _r in _MAINS for f in _ref_files(_r, 'docs/analysis/')}
        an_ok = [a for a in apps if f'docs/analysis/AN-{a}-analysis.md' in _an_files]
        chips.append(('系分', f"AN-{'/'.join(an_ok) if an_ok else ''}" if an_ok else None,
                      f"docs/analysis/AN-{'、'.join(an_ok)}" if an_ok else ''))
        # 开发测试日志（G3）
        dev_ok, dev_note = [], ''
        for a in apps:
            hit = artifact(None, f'docs/evidence/DEV-{a}*-testlog.txt', testlog_summary)
            if hit:
                dev_ok.append(a)
                dev_note = hit[1]
        chips.append(('编码门禁', '/'.join(dev_ok) if dev_ok else None, dev_note))
        # 独立测试报告（G4）
        tr = artifact(None, 'docs/test/*test-report*.md')
        chips.append(('独立测试', tr[0] if tr else None, ''))
        # UAT
        v = verdicts.get(ac['id'])
        chips.append(('UAT 对账', v if v else None, ''))
        rows.append((ac, chips))

    if not rows:
        return ''

    def chip(label, value, note):
        if value:
            n = f'<span class="nv-ic-note">{ESC_(note)}</span>' if note else ''
            return (f'<div class="nv-ic-chip nv-ic-chip--ok"><b>{ESC_(label)}</b>'
                    f'<span>{ESC_(str(value))}</span>{n}</div>')
        return f'<div class="nv-ic-chip nv-ic-chip--miss"><b>{ESC_(label)}</b><span>⬜</span></div>'

    rows_html = ''
    for ac, chips in rows:
        chain = '<span class="nv-ic-arrow">→</span>'.join(chip(*c) for c in chips)
        rows_html += (
            f'<div class="nv-ic-row"><div class="nv-ic-ac"><b>{ESC_(ac["id"])}</b>'
            f'<span class="nv-ic-title">{ESC_(ac["title"])}</span>'
            f'<div class="nv-ic-text">{ESC_(ac["text"][:120])}{"…" if len(ac["text"]) > 120 else ""}</div></div>'
            f'<div class="nv-ic-chain">{chain}</div></div>'
        )

    return """
<section class="nv-sec" id="nv-intent-chain">
  <h2 class="section-hd">第 3 章 · 意图通路：一条验收标准从冻结到对账的全程连线</h2>
  <p class="nv-lead">需求保真的证据不在"某人说过"，而在链上每个环节都留下可反查的工件。下图逐条连线 G1 冻结的验收标准（AC）→ 系分稿 → 编码门禁测试日志 → 独立测试报告 → UAT 对账判定；全部取自中央仓真实文件，缺失环节如实标 ⬜。</p>
  <div class="nv-ic-rows">""" + rows_html + """</div>
  <p class="nv-note">数据源：docs/requirements/*.freeze.md（G1 冻结）、docs/analysis/AN-*-analysis.md（系分）、docs/evidence/DEV-*-testlog.txt（G3 分支测试日志）、docs/test/*test-report*.md（G4 独立测试）、docs/acceptance/*-acceptance.md（UAT 逐条判定）——生成时程序化解析，非人工誊写。</p>
</section>
<style>
.nv-ic-rows{display:flex;flex-direction:column;gap:10px}
.nv-ic-row{display:grid;grid-template-columns:300px 1fr;gap:14px;border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:var(--surface);align-items:center}
.nv-ic-ac b{color:#1e40af;font-size:13px;margin-right:8px}
.nv-ic-title{font-weight:600;font-size:13px}
.nv-ic-text{font-size:11.5px;color:var(--muted);margin-top:4px;line-height:1.6}
.nv-ic-chain{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.nv-ic-chip{display:flex;flex-direction:column;border:1px solid #bbf7d0;background:#f0fdf4;border-radius:8px;padding:5px 10px;min-width:86px}
.nv-ic-chip b{font-size:11px;color:#166534;text-transform:uppercase;letter-spacing:.03em}
.nv-ic-chip span{font-size:12px;color:var(--ink-strong);font-weight:600}
.nv-ic-chip--miss{border-color:var(--line);background:var(--surface-2)}
.nv-ic-chip--miss b,.nv-ic-chip--miss span{color:#94a3b8}
.nv-ic-note{font-size:11px;color:var(--muted);font-weight:400}
.nv-ic-arrow{color:#94a3b8;font-size:14px}
</style>
"""


# ══════════════════════════════════════════════════════════════════════
# 第 0 章 推演逻辑与协作顺序总述（V5 §8.2 第 0 章 / 8.3 R15，补遗⑫并入）
# 单一事实源：unified-report-gen.py 的内联实现自本函数起为历史副本；
# final-report-merge.py（双层正本）消费本函数。一切数字实测统计，取不到标 ⬜。
# ══════════════════════════════════════════════════════════════════════

_CH0_ACTS = [
    ('一 环境准备', '1-4', '账号分配 · 配置初始化 · 登录 · 冒烟', 'admin+各用户', '—', ''),
    ('二 需求管理', '5-7', '应用登记 · 人员管理 · 需求上锁', 'admin+需求分析师A+人审', 'G1（步7）', 'G1'),
    ('三 需求分析', '8-14', '建群 · 派发 · 系统分析 · 四路并行分析 · 复核定稿', '产品经理A+系统分析 agent+各域牵头人', '—', ''),
    ('四 设计评审与编码', '15-18', 'G2 评审 · 归档 · 排期 · G3 编码', '系统架构师A 治理组+研发 agent', 'G2（步15）G3（步18）', 'G2'),
    ('五 测试与交付', '19-21', 'G4 测试 · G5 准出 · 发版 UAT', '测试工程师A/测试工程师B 独立测试+产品经理+评审卡+需求分析师A', 'G4（步19）G5（步20）', 'G4'),
    ('六 治理与复盘', '22-26', '台账 · 审计 · G6 复盘 · IDE · 报告', '全员+治理 AI+审计师A', 'G6（步24）', 'G6'),
]

_CH0_GATE_KEYS = {'G1': 'g1_frozen', 'G2': 'g2_arch_pass', 'G3': 'g3_code_pass',
                  'G4': 'g4_pass', 'G5': 'g5_ready', 'G6': 'retro_done'}


def parse_collab_events(evid):
    """scenario.log 实抽协作时序：(HH:MM:SS, 主体, 事件行) 正序。R15 数据源，禁手编。"""
    evts = []
    scen = Path(evid) / 'scenario.log'
    if not scen.exists():
        return evts
    for line in scen.read_text(encoding='utf-8', errors='replace').splitlines():
        m = re.match(r'^\[mux (\d{2}:\d{2}:\d{2})\] (.+)$', line.strip())
        if not m:
            continue
        ts, body = m.group(1), m.group(2)
        am = re.match(r'^\[([^\]]+)\]\s*(.*)$', body)
        if am and not am.group(1).startswith('mux'):
            actor, rest = am.group(1), am.group(2)
        else:
            actor, rest = '', body
        if body.startswith('──') or body.startswith('====='):
            actor, rest = '阶段', body
        evts.append((ts, actor, rest or body))
    return evts


def spec_params_html():
    """关键技术规范参数卡（报告三要素之一，2026-10-10）：单一事实源=mux/spec-params.env，
    与方案 §4.4 技术规范总表同源维护。缺文件=如实缺位声明，禁静默跳过。"""
    f = Path(__file__).resolve().parent / 'spec-params.env'
    if not f.exists():
        return '<div class="gap" style="padding:10px 14px;font-size:13px">关键技术规范参数卡缺位（mux/spec-params.env 不存在——如实标注，禁编造）。</div>'
    rows = []
    for ln in f.read_text(encoding='utf-8').splitlines():
        ln = ln.strip()
        if not ln or ln.startswith('#'):
            continue
        p = ln.split('|')
        if len(p) != 4:
            continue
        grp, name, val, note = (x.strip() for x in p)
        rows.append(f'<tr><td style="white-space:nowrap">{ESC(grp)}</td><td><b>{ESC(name)}</b></td>'
                    f'<td style="white-space:nowrap"><code>{ESC(val)}</code></td>'
                    f'<td style="font-size:12px">{ESC(note)}</td></tr>')
    return ('<div class="gatebox" id="spec-params"><b style="font-size:14px">关键技术规范（参数速查）</b>'
            '<p style="margin:6px 0 4px;font-size:12.5px;color:#57606a">'
            '运行参数集中呈现：端口、等待窗口、门禁阈值、容量预算、采集判定。正本=方案 §4.4 技术规范总表，本卡与其同源维护。</p>'
            '<table class="idx"><tr><th>组</th><th>参数</th><th>值</th><th>说明</th></tr>'
            + ''.join(rows) + '</table></div>')


def render_chapter0(state, evid, journey_html=None, steps_dir=None, zone_hits=None, compact=False):
    """R15 第 0 章 HTML 片段：产品定位一页 → 演示动线 → 六幕分幕总览 → RACI 协作时序线。
    compact=True 供人读层（PART1）精简用：时序线只保留开头一段并指向机器报告全表——
    run12 报告里同一段 899 行时序在 PART1/PART2 双份完整呈现（约 55% 篇幅），2026-10-10 去重。"""
    evid = Path(evid)
    out = []
    gate_ok = {}
    if journey_html and Path(journey_html).exists():
        jh = Path(journey_html).read_text(encoding='utf-8', errors='replace')
        for gr in re.finditer(r'<tr><td><b>(G[1-6])</b></td>(.*?)</tr>', jh, re.S):
            cells = re.findall(r'<td[^>]*>(.*?)</td>', '<tr>' + gr.group(2) + '</tr>', re.S)
            plain = re.sub(r'<[^>]+>', ' ', cells[1] if len(cells) > 1 else '')
            gate_ok[gr.group(1)] = ('✓' in plain) or ('PASS' in plain.upper()) or ('✅' in plain)
    for g, k in _CH0_GATE_KEYS.items():
        gate_ok.setdefault(g, bool(state.get(k)))

    out.append('<h2 id="ch0-collab">第 0 章 · 推演逻辑与协作顺序总述（R15）</h2>')
    out.append('<div class="gatebox"><b style="font-size:14px">产品定位（一页）</b>'
               '<p style="margin:6px 0;font-size:13.5px;line-height:1.8">Swarm Studio 是 AI 员工驱动的研发交付系统：'
               '15 人编制（人+AI 助理 30 个 matrix 账号）在"每人一套 hermes agent + swarm studio、共用 matrix 后台"的形态下，'
               '完整跑通"需求冻结→系统分析→架构评审→排期→编码→独立测试→发布准出→UAT→治理复盘"。'
               '人的角色=<b>意图持有者、仲裁者、最终验证者</b>；AI 员工（需求设计/应用研发/质量测试/研发治理四类）主理执行；'
               '六道强制关卡守住意图核对一致与不可逆决策；一切"完成"必须带代码提交号+任务卡号双凭证并经系统反向核验。'
               '产品面=工作台单面（旅程首页＋时序六阶段一级导航；工具舱：看板/IDE 工作区/审批收件箱/治理中心/仿真中心/账户），'
               '双 loop=skill 内循环 × swarm 外循环。</p></div>')

    # run13 复盘 A7：三功能区证据改按「当轮帧注册表实查」——原逻辑查三个写死帧名
    # （ui-03-cockpit 等），run13 实拍帧名不同即三面全误标「本轮未拍」。命中集由调用方
    # （mx-report-gen）自 STEPS imgs（ui 帧图注）+ r18 ops 路由双源算得传入：
    # zone_hits = {'cockpit': '…', 'kanban': '…', 'ide': '…'}（值=帧位描述；空=未拍）。
    import re as _re
    tri = [('旅程首页/工作台（#/app）', 'cockpit', _re.compile(r'工作台|驾驶舱|旅程|#/app(?!/)')), ('看板（#/app/board）', 'kanban', _re.compile(r'看板|任务协同|/app/board')), ('IDE 工作区（/app/ide）', 'ide', _re.compile(r'IDE|工作区|画布|/app/ide'))]
    _zh = zone_hits or {}
    tri_html = ' ｜ '.join(
        (f'<b>{n}</b> <code>{H.escape(_zh.get(k, ""))}</code>' if _zh.get(k) else f'{n}（本轮未拍——如实标注）')
        for n, k, _rx in tri)
    out.append('<div class="gatebox"><b style="font-size:14px">演示动线（工作台单面）</b>'
               '<p style="margin:6px 0;font-size:13.5px;line-height:1.8">登录 → 旅程首页（/app：注意力条置顶·页头六阶段·搭建五步与交付五阶段总览）'
               ' → 审批收件箱（三档分区·抽检回看） → swarm kanban 看板（RACI 徽章·状态流转·任务协同页签） → IDE 工作区（任务简报·交互编码）'
               ' → 治理中心（质量门工件·应用资产·组织）——全流程不出 /app 路由树。</p>'
               f'<p style="margin:4px 0;font-size:12.5px;color:#57606a">三功能区证据（R7 核验口径）：{tri_html}</p></div>')

    out.append('<h3>26 步六阶段分幕总览</h3>'
               '<div class="meta">每幕一行：目标 · 主角（RACI 摘要）· 闸门位置；先读此表建立全局，再走下方 26 步实录。'
               '闸门状态列自本轮闸门表/写入通过标记实抽。</div>'
               '<table><tr><th>幕</th><th>步骤</th><th>目标</th><th>主角（谁在做什么）</th><th>闸门</th><th>本轮</th></tr>')
    for act, rng, goal, who, gates, gk in _CH0_ACTS:
        st = ''
        if gk:
            if gate_ok.get(gk):
                st = '<span style="color:var(--ok);font-weight:700">✓ 已过</span>'
            else:
                st = '<span style="color:var(--warn)">未过/未写入通过标记（见审计叠加层）</span>'
        out.append(f'<tr><td><b>{act}</b></td><td>步 {rng}</td><td>{goal}</td>'
                   f'<td style="font-size:12px">{who}</td><td>{gates}</td><td>{st}</td></tr>')
    out.append('</table>')

    evts = parse_collab_events(evid)
    out.append(f'<h3>RACI 协作时序线（scenario.log 实抽，{len(evts)} 条）</h3>'
               '<div class="meta">数据源=监控侧断言留痕（每行本身即 matrix 事件/kanban 流转/git 提交三源核验的结果记录）——'
               '谁在何时发起、谁执行、谁把关、何处打回，时间线自明；锚点（event_id $xxx／t_ 卡号）可反查。</div>')
    if evts:
        if compact:
            # 人读层精简视图：同源全量在 PART 2 第 0 章（R15-a/b 断言由 PART2 副本承载）
            head_n = min(40, len(evts))
            rows = ''.join(
                f'<tr><td style="white-space:nowrap">{ESC(ts)}</td>'
                f'<td style="white-space:nowrap">{ESC(actor)}</td>'
                f'<td style="font-size:11.5px">{ESC(body[:220])}</td></tr>'
                for ts, actor, body in evts[:head_n])
            out.append(f'<p class="meta">人读层精简视图：此处只列前 {head_n} 条；'
                       f'全部 {len(evts)} 条时序见 PART 2 第 0 章全表（同一数据源，不双份长表）。</p>'
                       '<table class="idx" style="max-height:420px;overflow:auto;display:block">'
                       '<tr><th>时间</th><th>主体</th><th>协作事件（含锚点）</th></tr>' + rows + '</table>')
        else:
            out.append('<details open><summary style="cursor:pointer;font-size:13px;color:#1e40af">展开协作时序全表（按推演时间正序）</summary>'
                       '<table class="idx" style="max-height:520px;overflow:auto;display:block">'
                       '<tr><th>时间</th><th>主体</th><th>协作事件（含锚点）</th></tr>')
            for ts, actor, body in evts:
                out.append(f'<tr><td style="white-space:nowrap">{ESC(ts)}</td>'
                           f'<td style="white-space:nowrap">{ESC(actor)}</td>'
                           f'<td style="font-size:11.5px">{ESC(body[:220])}</td></tr>')
            out.append('</table></details>')
    else:
        out.append('<div class="gap" style="padding:10px 14px;font-size:13px">本轮 scenario.log 无可解析协作事件（如实标注，禁编造）。</div>')
    return '\n'.join(out)
