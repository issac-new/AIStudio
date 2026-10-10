#!/usr/bin/env python3
"""公文技法渲染增强（呈现层，不改正本内容）：
① 导读卡（结论先行：主旨三句话+关键数字）——插在标题横幅后
② 术语速览卡（黑话一句话人话，先扫一遍再读正文）
③ 纯中文术语首现悬停释义（span.term + title；英文术语不注入避免碰 code/属性）
④ 第五部分"唯一事实源"徽标
幂等：标记在位即跳过。"""
import re
import sys
from pathlib import Path

import os
F = Path(os.environ.get('PLAN_VIEW_DIR', '/tmp/plan-view')) / 'mux-v8-plan.html'
s = F.read_text(encoding='utf-8')
if 'id="daodu-card"' in s:
    print('已在位，跳过')
    sys.exit(0)

# ── ① 导读卡 + ② 术语速览卡 ──
CARDS = '''
<aside class="gw-daodu" id="daodu-card">
  <div class="gw-daodu-hd">一页导读（先读这里）</div>
  <div class="gw-daodu-body">
    <p><b>这份方案回答一个问题：</b>15 人编制的人机团队，如何用 26 个标准步骤和六道硬闸，把一条需求从冻结一路做到验收——人的角色是意图持有者与仲裁者，AI 员工主理执行，一切"完成"必须带可反查的凭证。</p>
    <p><b>你是谁就怎么读：</b>执行组织者先读第四部分（运行手册与执行纪律）再起跑；评审者直接看第五部分（验收唯一事实源）；机制设计者读第二部分——契约层自本方案确立起冻结，改契约须整轮推演验证。</p>
    <p><b>读完做什么：</b>起跑前对照 §4.1 前置九条与零污染清场（§4.3-25c）；收官对照 §5.6 收尾判据八条逐项销账；历轮事故细节查《推演历史与工程档案》。</p>
  </div>
  <div class="gw-kpis">
    <div class="gw-kpi"><b>26</b><span>标准流程步</span></div>
    <div class="gw-kpi"><b>6</b><span>道硬闸 G1-G6</span></div>
    <div class="gw-kpi"><b>15×2</b><span>人编制 ×（人+AI）账号</span></div>
    <div class="gw-kpi"><b>31</b><span>条执行纪律（含 3 附条）</span></div>
    <div class="gw-kpi"><b>§5</b><span>验收唯一事实源</span></div>
  </div>
</aside>

<details class="gw-terms" id="terms-card">
  <summary>术语速览（正文黑话的一句话人话，先扫一遍）</summary>
  <div class="gw-terms-grid">
    <dl>
      <dt>六道硬闸 G1-G6</dt><dd>需求上锁、架构评审、编码门禁、独立测试、发布准出、复盘六道关卡，不过不放行。</dd>
      <dt>首过率</dt><dd>六道闸里一次通过的比例；打回复补后再过的不算首过。</dd>
      <dt>问题单 / 台账</dt><dd>推演中每个问题记一笔账（issues.log），全程唯一事实源。</dd>
      <dt>DISP</dt><dd>问题单的处置结论，只许三个词：已修、观察、延后。</dd>
      <dt>落键（state.env）</dt><dd>每步完成时向状态文件写一个键，作为"这步真做完了"的机器证据。</dd>
      <dt>正本</dt><dd>唯一权威版本文件，其余一切是引用；换代须同步切换解析源。</dd>
    </dl>
    <dl>
      <dt>守门（gate test）</dt><dd>simharness 的自动化断言测试，谁改坏机制测试当场红。</dd>
      <dt>全量呈现（R18）</dt><dd>对话全文、操作前后帧、环节效果三类证据，须当轮实时采集。</dd>
      <dt>零污染</dt><dd>每轮全量清场重建，禁止引用上轮凭据、分支、工件、记忆冒充本轮产出。</dd>
      <dt>复跑锚定轮</dt><dd>代码零变更、只为出当轮测试证据而重跑的轮次。</dd>
      <dt>双正本</dt><dd>final-report.html（人读版）与 simulation-report.html（机器档案）缺一即违规。</dd>
      <dt>导演</dt><dd>驱动推演脚本的会话/操作者，负责编排、兜底与记账。</dd>
    </dl>
  </div>
</details>
'''

anchor = '</header>'
assert anchor in s, 'header 结束锚未命中'
s = s.replace(anchor, anchor + CARDS, 1)

# ── ③ 纯中文术语首现悬停释义 ──
TERMS = [
    ('零污染', '每轮全量清场重建，不引用上轮产物冒充本轮'),
    ('首过率', '六道闸一次通过的比例，打回复补不算'),
    ('问题单', '每个问题记一笔账，台账是唯一事实源'),
    ('守门', '自动化断言测试，改坏机制测试当场红'),
    ('双正本', '人读版与机器档案两份报告缺一即违规'),
    ('复跑锚定轮', '代码零变更、只重跑出证据的轮次'),
    ('落键', '向 state.env 写键，作为步骤完成的机器证据'),
    ('全量呈现', '对话全文+操作前后帧+环节效果三类实时证据'),
]
body_start = s.find('</nav>')
head, body = s[:body_start], s[body_start:]
for term, tip in TERMS:
    m = re.search(term, body)
    if not m:
        continue
    i = m.start()
    body = body[:i] + f'<span class="term" title="{tip}">{term}</span>' + body[i + len(term):]
s = head + body

# ── ④ 第五部分唯一事实源徽标 ──
# 按 id 前缀锚定（旧版按标题全文匹配，pandoc 对 CJK 标题生成的 id 与标题内
# 嵌套标记会让正则失配，徽标从未渲染——2026-10-10 排查实锤）
m5 = re.search(r'<h2 id="第五部分[^"]*">', s)
if m5:
    s = s[:m5.end()] + '<span class="gw-badge">验收以本部分为准 · 与本部分不一致即记勘误</span>' + s[m5.end():]

F.write_text(s, encoding='utf-8')
print('公文增强注入完成：导读卡+术语卡+首现释义 '
      + str(sum(1 for t, _ in TERMS if t in s)) + ' 项'
      + ('+事实源徽标' if 'gw-badge' in s else '+事实源徽标未命中（检查 h2 id）'))
