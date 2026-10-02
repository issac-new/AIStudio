#!/usr/bin/env python3
# final-report-merge.py — 最终报告双层正本合并器（报告双正本制，V5 补遗⑩/R15）
#
# 职责：把「说人话导读（PART 1）+ 第 0 章推演逻辑与协作顺序（R15）+ 机器逐步报告
# 全文（PART 2）」合并为单一 final-report.html。上轮（run6 收官轮）此合并逻辑为
# 一次性内联脚本，本工具为其正式固化——final-report.html 的生成从此可复现。
#
# 用法：python3 scripts/aipay/mux/final-report-merge.py --run 20261001-v5-run6
# 前置：先跑 mx-report-gen.py 生成 evidence/simulation-report.html（机器报告正文）。
# 红线：一切数字自 issues.log / state.env 实算注入占位标记（{{...}}），取不到留 ⬜
# 不编造；PART 1 措辞与处置终态对齐（已修项不得写"待修"）。
import argparse
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from report_narrative import render_chapter0  # noqa: E402

SIM_ROOT = Path(os.environ.get('AIPAY_SIM_ROOT', '/Volumes/nvme2230/lab/ncwk-sim-mux'))

# ── 第 0 章宿主样式（gatebox/meta/idx/gap 与 unified-report-gen 同源，机器报告无此类名不冲突）──
CH0_CSS = '''<style>
.meta{color:#57606a;font-size:13px;line-height:1.8}
.gap{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;margin:8px 0}
.gatebox{background:#fff;border:1px solid #c7d2fe;border-radius:10px;padding:14px 16px;margin:12px 0}
.gatebox p{margin:6px 0;font-size:13.5px;line-height:1.8}
.idx{font-size:12px}
.idx th{background:#eef2ff;font-weight:600}
.idx td,.idx th{border:1px solid #e0e7ff;padding:6px 10px;text-align:left;font-size:12px;line-height:1.7}
.guide table.idx{font-size:12px}
</style>'''

GUIDE_CSS = '''<style>.guide{font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:960px;margin:0 auto;padding:36px 26px;color:#222;background:#fbfbfa;line-height:1.75}
.guide h1{font-size:25px;line-height:1.4;border-bottom:3px solid #0a7d43;padding-bottom:12px;margin-bottom:6px}
.guide h2{font-size:19px;margin-top:40px;color:#0a7d43;border-left:5px solid #0a7d43;padding-left:10px}
.guide h3{font-size:16px;margin:22px 0 8px}
.guide .sub{color:#678;font-size:13.5px}
.guide table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13.5px;background:#fff}
.guide th, .guide td{border:1px solid #ddd;padding:7px 10px;text-align:left;vertical-align:top}
.guide th{background:#eef6ef}
.guide .ok{color:#0a7d43;font-weight:600}
.guide .bad{color:#c0392b;font-weight:600}
.guide .mid{color:#b9770e;font-weight:600}
.guide .card{background:#fff;border:1px solid #e3e3e0;border-radius:8px;padding:14px 18px;margin:14px 0;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.guide .card.good{border-left:5px solid #0a7d43}
.guide .card.warn{border-left:5px solid #b9770e}
.guide .card.bad{border-left:5px solid #c0392b}
.guide .card.info{border-left:5px solid #2563a8}
.guide .tl{list-style:none;padding-left:0}
.guide .tl li{position:relative;padding:4px 0 4px 18px;border-left:2px solid #cde;margin-left:8px}
.guide .tl li::before{content:"";position:absolute;left:-6px;top:12px;width:10px;height:10px;border-radius:50%;background:#0a7d43}
.guide .tl li.warn::before{background:#b9770e}
.guide code{background:#f1f1ee;padding:1px 6px;border-radius:4px;font-size:12.5px}
.guide .note{font-size:12.5px;color:#889}</style>'''

# ── PART 1 说人话导读（八章）──按轮注册（R17 按轮真值）────────────────────
# 说人话叙事是逐轮人工正本（时间线/故事/提交锚皆该轮真值），禁旧轮顶包；
# 占位标记 {{n_*}} 由 main() 实算替换；正文为普通字符串（非 f-string），CSS 花括号安全。
# run6 正本（处置口径与 2026-10-02 处置轮终态对齐）：
PART1_RUN6 = '''<div class="guide" style="background:#fbfbfa;padding:6px 0 20px">

<h1 style="font-size:24px"> PART 1 · 一页读懂（说人话版）Swarm Studio 多智能体研发推演 · 最终报告<br><span class="sub">RUN={{run_id}} ｜ 任务：RFD-001 支付收银台 ｜ 2026-10-01 08:20 → 10-02 14:02（含一夜停摆 8 小时）</span></h1>

<div class="card info"><b>这场推演在验证什么：</b>让 14 个 AI 角色（产品经理、架构师、四名开发、两名测试、安全、审计、运维等）像一个真实研发团队那样，用真实的聊天群（Matrix）、真实的看板、真实的 Git 仓库，从需求一路做到上线验收——全程不许谎报进度，所有"做完了"都要拿出可查的证据。一条导演脚本负责派活和验收，人类（bella）扮演需求方和最终拍板人。</div>

{{ch0}}

<h2>一、结果怎么样</h2>
<table>
<tr><th>事项</th><th>结果</th><th>证据（可点开查）</th></tr>
<tr><td>流程 26 步（需求→分析→设计评审→排期→开发→测试→发布→验收→审计→复盘→报告）</td><td class="ok">全部走完</td><td>scenario.log 末行"全部 gates 执行完毕"（10-02 12:20）</td></tr>
<tr><td>四名开发的代码</td><td class="ok">全部真实提交并推送</td><td>Git 提交：chen 28c3517、lin（10:15）、hu（11:38）、xiao 8c0207f（14:00），全部带自动化测试记录</td></tr>
<tr><td>测试</td><td class="ok">194 项全过、零缺陷；前端测试全绿</td><td>测试报告 8dbf5bf；TEST-PASS-TEST-FE（10-02 13:50）</td></tr>
<tr><td>发布评审（G5）</td><td class="ok">七项检查全过</td><td>评审卡 t_3aaacf2d，含复测回执</td></tr>
<tr><td>客户验收（UAT）</td><td class="ok">七条验收标准逐条给了证据，7/7 通过</td><td>验收书（勘误版 v2）已入仓；证据行在群消息 $V_jLqhvn</td></tr>
<tr><td>问题记录与处置</td><td class="ok">{{n_issue}} 条记录（{{n_key}} 个唯一问题）全部处置闭环</td><td>evidence/issues.log（DISP {{n_disp}} 条）+ ISSUES-LOG.md 回灌</td></tr>
</table>

<h2>二、交付旅程（按时间讲故事）</h2>
<ul class="tl">
<li><b>10-01 早上 · 组队与需求（1 小时）</b>：30 个账号核验通过，4 个应用模块登记，组织架构和汇报关系入仓。需求文档由 bella 发给产品经理 fanfan，验收标准（7 条）当场"上锁"——之后谁想改需求都得走流程。</li>
<li class="warn"><b>10-01 白天 · 系统分析（拖了 20 小时）</b>：fanfan 把需求拆成任务清单和四份模块分析，这一步反复超时三次。原因不是不会做，而是模型通道当天被限流+工具链出问题（见第三节故事 1）。最终任务清单 v10 和两份分析稿（支付核心、小程序端）在 16:03 前陆续入库，另外两份（微信、支付宝渠道）超时记了问题单。</li>
<li><b>10-01 傍晚 · 设计评审</b>：概设文档评审通过。后来复盘发现这次评审 10 秒就过了——系统读到的是前一天的旧评审记录，不是本轮新评的。文档本身在，评审记录是旧的，如实记档。</li>
<li class="warn"><b>10-01 深夜 · 排期卡死 7 次（本轮最有价值的故障）</b>：fanfan 编排开发计划，连续七个 40 分钟窗口全部超时。逐层排查发现是四个问题叠加（详见故事 1）。当晚修复其中两层后收工。</li>
<li class="warn"><b>10-01 夜间 · 整个环境停摆 8 小时</b>：凌晨 00:01 后所有进程静默——机器睡眠导致 Docker 和聊天服务器停了，macOS 夜间清理还删掉了放在临时目录的自动重启脚本（详见故事 4）。</li>
<li><b>10-02 早上 8 点 · 恢复与排期交卷</b>：环境逐层拉起。修复后的排期任务 30 分钟交卷：121 行开发计划，包含每个任务的子任务拆分（单项不超过 1 人日）、六条派发和回执。</li>
<li><b>10-02 上午 · 开发与测试</b>：四名开发各自领任务开工。chen 的支付核心 47 分钟完成（5 个子任务全闭环）；测试 qi 独立跑出 194 项全过、零缺陷。中途发现一个"作弊"漏洞并当场堵上（详见故事 2）。</li>
<li><b>10-02 中午 · 发布与验收</b>：发布评审七项全过；代码合入主干；bella 按七条验收标准逐条核对证据，7/7 通过，验收书入仓。审计和复盘文档随后生成。</li>
<li><b>10-02 下午 · 补齐两条慢线</b>：xiao 的收银台前端（中午撞上单次任务轮次上限，续派后完成）和 fei 的前端测试（一度卡在权限审批没人批，补了自动审批后完成）在 14:02 前交付，至此六条交付线全部闭环。</li>
</ul>

<h2>二点五、值得记住的五个故事</h2>

<div class="card bad"><h3>故事 1 · 排期为什么失败七次才成功</h3>
四个原因像洋葱一样一层层剥：<b>①给的时间装不下活</b>——编排任务实际要 40-60 分钟，脚本只给 40 分钟，超时就重派新人从头再来，所以永远做不完；<b>②任务单没写交卷地址</b>——验收盯着主仓 main 分支，任务单却没说清楚，AI 把成果交到别处也白搭；<b>③模型通道限流</b>——检查通道的探针选错了检测口，把好通道误判成"额度耗尽"，整晚拒绝开工；<b>④深夜网关被换掉</b>——正在干活的会话被腰斩。<br>修复：时间上限改成"只要还在动就不掐表，连续 30 分钟没动静才算死循环"；任务单写明交卷地址；探针改双通道检测。修复后同一任务 30 分钟交卷。</div>

<div class="card good"><h3>故事 2 · AI 两次拒绝谎报进度</h3>
<b>第一次</b>（10-01 23:08）：fanfan 发现填任务卡所需的命令行工具被系统自动更新弄丢了。它完全可以绕过工具直接改数据库蒙混过关——它选择写长文如实上报"未完成，不发完成信号"，并列出四项阻塞和修复建议。正是这份报告让最深层的故障被挖出来。<b>第二次</b>（10-02 12:08）：xiao 写代码写到一半撞上单任务轮次上限，同样如实停手："未完成，不发完成信号"。续派后交出完整成果。</div>

<div class="card warn"><h3>故事 3 · 系统三次差点被骗过（都拦住了）</h3>
<b>骗术一</b>：上一轮留下的旧排期文件标题里也有"排期"二字，按"文件存在"检查差点算本轮完成——改成"文件提交时间必须晚于本轮开始"后识破。<b>骗术二</b>：开发分支检查只看"分支存在"，上一轮的旧分支让它 5 秒内连过四关——好在四名开发接到的仍是本轮新任务、真实代码照常交付；检查规则已改成"分支最新提交必须是本轮的"。<b>骗术三</b>：设计评审记录 10 秒速过，吃的是前一天旧评审——已记档，判据补新鲜度列入待办。</div>

<div class="card warn"><h3>故事 4 · 一夜全挂 8 小时</h3>
凌晨停机改脚本时，AI 会话静默，自动重启脚本已停没人接替；macOS 夜间清理又删掉了放在 /tmp 的重启和看护脚本（这个坑当晚第二次踩）；机器睡眠连带聊天服务器全停。早上逐层手工拉起，并把所有常驻脚本迁到数据盘永久目录——同类故障不会再发生。</div>

<div class="card warn"><h3>故事 5 · 四封任务单寄丢了</h3>
群里的任务派发消息对 14 个账号中的 4 个（hu、lin、qi、fei）静默丢失。导演改用私聊把任务单原文逐一送到，加上对撞上"同时干活人数上限"被弹回的员工稍后重发，最终 14 人全部在场。期间 fei 还一度卡在权限审批没人批（自动审批器随主流程结束而停止）——补了一个独立审批器解决。</div>

<h2>三、导演的三笔代操作（全部留痕）</h2>
<div class="card info">导演（脚本运维方）本轮替 AI 做了三件事，均在代码提交说明或消息注记里写明缘由，可反查：<br>① <b>代码合入主干</b>（f7b1cbc）——原派给 chen 的合并任务单被寄丢（见故事 5），导演代做；<br>② <b>需求冻结文件重推</b>（18c9d77）——补早上一次推送失败的欠账；<br>③ <b>验收结论行代投</b>（$V_jLqhvn）——fanfan 把结论发进了私聊线程，验收脚本只认群消息，导演把原文一字未改转发进群并注明代投。<br><span class="note">原则：内容都是 AI 的真实产出，导演只修"投递"，不改"作业"。</span></div>

<h2>四、问题清单（{{n_issue}} 条记录 · {{n_key}} 个唯一问题 · 全部处置）</h2>
<table>
<tr><th>问题</th><th>条数</th><th>实际情况</th><th>处置终态</th></tr>
<tr><td>分析稿/回执超时</td><td>7</td><td>限流日午后通道受阻，四份模块分析两份按时入库、两份超时</td><td class="ok">四份分析文档现均在仓（超时两份后补齐）</td></tr>
<tr><td>完成凭证核查不通过后重报</td><td>2</td><td>打回后重报，第三轮通过</td><td class="ok">已解决</td></tr>
<tr><td>需求冻结文件推送失败</td><td>1</td><td>本地仓库落后导致推送被拒</td><td class="ok">当日补推解决（18c9d77）</td></tr>
<tr><td>验收证据超时/核对失败</td><td>3</td><td>证据确实在产出只是慢；核对失败是"查错了仓库位置"</td><td class="ok">补账后全部通过（结构性根治见第六节）</td></tr>
<tr><td>验收书里七条判"未见"</td><td>1</td><td>判词模板解析口径问题——证据行本身 7/7 通过在案</td><td class="ok">已修：判词器括号注耐受根治+守门用例固化；勘误版验收书 7/7 通过入仓（初版判词存档留痕）</td></tr>
<tr><td>完备性检查推送失败</td><td>1</td><td>留存本地</td><td class="ok">已入仓 docs/delivery/RFD-001-completeness-check.md</td></tr>
<tr><td>复盘时问题无处置记录</td><td>1</td><td>记账格式缺口</td><td class="ok">已修：15 条 DISP 补账+ISSUES-LOG.md 回灌（17/17 全处置）</td></tr>
<tr><td>IDE 跳转与自动简报"未见"</td><td>2</td><td>探针路径缺陷的假阴性（功能实存），并已顺手增强 UX</td><td class="ok">撤单（DISP 已记）</td></tr>
<tr><td>其他（分析稿入库相关）</td><td>1</td><td>—</td><td class="ok">随分析稿补齐闭环</td></tr>
</table>

<h2>五、诚实的遗留事项</h2>
<ul>
<li>本轮没有拍摄产品界面截图（推演主验证的是流程与协作，界面沿用既有版本）——第 0 章演示动线的三功能区证据位如实标注"本轮未拍"。</li>
<li>群线程派发路由丢失的<b>根因修复</b>（DM 补链是导演侧兜底）与 hermes 自更新擦工作区补丁的长效化（533/534 收编 runtime manifest）记为后续行动项——兜底机制在案，根治待做。</li>
</ul>

<h2>六、这轮沉淀下来的改进（已合入代码库主线）</h2>
<table>
<tr><th>改进</th><th>一句话说明</th></tr>
<tr><td>重活不限时（c84b7909）</td><td>只看"还在不在动"，连续 30 分钟零产出才算死循环，不再掐表</td></tr>
<tr><td>先拆分再开工（c84b7909）</td><td>超过 2 人日的任务必须拆成 ≤1 人日的子任务，逐项验收</td></tr>
<tr><td>分支新鲜度检查（c75cfdb8）</td><td>旧分支冒充新交付的路被堵死</td></tr>
<tr><td>通道双探针（b072c304）</td><td>模型通道检测不再选错口、误报"额度耗尽"</td></tr>
<tr><td>排期窗口与任务单修正（588928b6）</td><td>交卷地址写明白，窗口放宽</td></tr>
<tr><td>报告生成器本轮叙事（a0f86035）</td><td>本轮 26 步叙事注册，机器报告可复生成</td></tr>
<tr><td>UAT 判词器括号注耐受（本轮）</td><td>证据行"AC-N（注）通过"不再误判"未见"；run6 括号注格式入守门用例</td></tr>
<tr><td>报告按轮隔离渲染（本轮）</td><td>旧轮治理史（问题单占位符残留/run2 判回滚串场）不再泄进新轮；hero 卡按轮取值、缺省实算</td></tr>
</table>

<h2>七、想核验去哪看</h2>
<ul class="note" style="line-height:2">
<li>完整过程日志：runs/{{run_id}}/evidence/scenario.log（每一步的派发与验收原话）</li>
<li>机器生成的逐步报告全文已并入本页 PART 2（26 步叙事 × 闸门仪表盘 × 六域审计 × 问题单明细 × 交付物全景）</li>
<li>问题台账：同目录 issues.log（DISP 处置行） ｜ 治理报告：governance-report.md</li>
<li>验收书勘误版：aipaydev 仓 docs/acceptance/RFD-001-acceptance.md（七条 AC 7/7 通过，初版判词存档于文末）</li>
<li>全部交付文档：aipaydev 仓 origin/main（需求冻结→分析→概设→排期→测试报告→验收书→复盘→审计意见书）</li>
</ul>

<p class="note">报告口径：本报告 = 说人话导读+第 0 章推演逻辑与协作顺序（PART 1，自演示叙事版改写，处置口径已更新至 2026-10-02 处置轮终态）+ 机器逐步报告全文（PART 2，经按轮隔离/占位符/判词器三类缺陷根治后嵌入，样式隔离）。数据截至 2026-10-02 {{gen_time}}。</p>

</div>'''


# R17 硬闸（与 mx-report-gen._NARR 同款）：未注册说人话叙事的轮次拒绝合并，
# 防旧轮叙事顶包新轮报告。新轮正本=人工按该轮实锚编写后注册。
PART1_BY_RUN = {
    '20261001-v5-run6': PART1_RUN6,
}


def load_state(run_dir: Path) -> dict:
    state = {}
    f = run_dir / 'state.env'
    if f.exists():
        for line in f.read_text(encoding='utf-8', errors='replace').splitlines():
            if '=' in line and not line.strip().startswith('#'):
                k, _, v = line.partition('=')
                state[k.strip()] = v.strip()
    return state


def count_issues(evid: Path):
    n_issue = n_disp = 0
    keys = []
    f = evid / 'issues.log'
    if f.exists():
        for line in f.read_text(encoding='utf-8', errors='replace').splitlines():
            if line.startswith('ISSUE|'):
                n_issue += 1
                p = line.split('|')
                if len(p) >= 3:
                    keys.append(f'{p[1]}·{p[2]}')
            elif line.startswith('DISP|'):
                n_disp += 1
    return n_issue, len(set(keys)), n_disp


def extract_machine_parts(sim_html: str):
    """机器报告 → (styles_html, body_inner)。body 级标签不带入（防布局劫持）。"""
    styles = '\n'.join(re.findall(r'<style>.*?</style>', sim_html, re.S))
    m = re.search(r'<body[^>]*>(.*)</body>', sim_html, re.S)
    if not m:
        raise SystemExit('机器报告无 <body> —— 先跑 mx-report-gen.py')
    return styles, m.group(1)


def main():
    ap = argparse.ArgumentParser(description='最终报告双层正本合并器')
    ap.add_argument('--run', required=True, help='RUN_ID（runs/ 目录名）')
    args = ap.parse_args()

    run_dir = SIM_ROOT / 'runs' / args.run
    evid = run_dir / 'evidence'
    sim_html_path = evid / 'simulation-report.html'
    if not sim_html_path.exists():
        raise SystemExit(f'机器报告不存在：{sim_html_path}（先跑 mx-report-gen.py --run {args.run}）')

    state = load_state(run_dir)
    n_issue, n_key, n_disp = count_issues(evid)
    machine_styles, machine_body = extract_machine_parts(sim_html_path.read_text(encoding='utf-8'))

    # 第 0 章（R15）：state 落键实算闸门态；协作时序自 scenario.log 实抽
    ch0 = render_chapter0(state, evid, journey_html=None, steps_dir=evid / 'screenshots' / 'steps')

    import datetime
    gen_time = datetime.datetime.now().strftime('%H:%M')
    part1_tmpl = PART1_BY_RUN.get(args.run)
    if part1_tmpl is None:
        raise SystemExit(
            '[final-report-merge] 无该轮说人话叙事: ' + args.run
            + '（已知: ' + ', '.join(sorted(PART1_BY_RUN))
            + '）——PART 1 为逐轮人工正本，禁旧轮顶包；请按本轮实锚编写后注册 PART1_BY_RUN')
    part1 = (part1_tmpl
             .replace('{{run_id}}', args.run)
             .replace('{{gen_time}}', gen_time)
             .replace('{{n_issue}}', str(n_issue))
             .replace('{{n_key}}', str(n_key))
             .replace('{{n_disp}}', str(n_disp))
             .replace('{{ch0}}', ch0))

    out = f'''<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Swarm Studio 多智能体研发推演 · 最终报告（{args.run} · 合并版）</title>
{machine_styles}
{GUIDE_CSS}
{CH0_CSS}
</head><body>
{part1}
<div style="margin:56px 0 8px;padding:18px 22px;background:#0a7d43;color:#fff;border-radius:8px 8px 0 0">
<h1 style="font-size:20px;margin:0">PART 2 · 26 步明细与全部证据（机器逐步报告全文）</h1>
<p style="font-size:12.5px;margin:6px 0 0;opacity:.85">由 mx-report-gen.py 生成于本处置轮（三类渲染缺陷根治后），此处原文嵌入——逐步把关行、闸门仪表盘、六域审计、问题单明细（DISP {n_disp} 条全处置）、交付物真容核对本章自明。</p>
</div>
{machine_body}
</body></html>'''

    out_path = evid / 'final-report.html'
    out_path.write_text(out, encoding='utf-8')
    print(f'final report written: {out_path} ({len(out)} bytes; PART1 issues {n_issue} records/{n_key} keys, DISP {n_disp})')


if __name__ == '__main__':
    main()
