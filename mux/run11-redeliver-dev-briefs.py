#!/usr/bin/env python3
"""run11 修复：重递被容量队列丢弃的开发任务书（chen/lin/xiao；hu 已由催办拉起，不重发）。

背景（2026-10-08 13:5x 查实）：容量重试队列 09:25:43 起满 64（第三次容量僵尸），
11:12 devimpl d1 派发与 12:47 渠道批派发的消息本体均已入房（驱动持 event id），但
网关侧 agent 拉起被容量拒绝→队列溢出丢弃。chen/xiao/lin 全程沉睡。13:20:31
affinity 重启已清账（此后零丢弃）。本脚本从 aipay-scenario.sh 逐字提取三份任务书
原文重发（含 dispatch_in_room 标准尾标），并往 issues.log 记 ISSUE+DISP。

幂等：issues.log 已含 capacity-queue-drop-devimpl 键则直接退出。
不动：aipay-scenario.sh / mx-lib.sh / state.env / hu 在飞会话 / 网关进程。
"""
import hashlib
import json
import os
import pathlib
import re
import sys
import time
import urllib.request

SIM = pathlib.Path('/Volumes/nvme2230/lab/ncwk-sim-mux')
SRC = pathlib.Path('/Users/cuishi/lab/ncwk/simharness/aipay-scenario.sh')
LIB = pathlib.Path('/Users/cuishi/lab/ncwk/simharness/mux/mx-scenario-lib.sh')
ROOM = '!HmQhMNMivoYKiKtTcV:matrix.test'  # state.env room_analysis
HS = 'http://127.0.0.1:8008'
RUN_ID = '20261007-v8-run11'
ISSUES = SIM / 'runs' / RUN_ID / 'evidence' / 'issues.log'
ISSUE_KEY = 'capacity-queue-drop-devimpl'

CHAN_SPEC = {
    'task': 'DEV-CHALI',
    'app': 'csw-channel-alipay',
    'chan': '支付宝(alipay.trade.create my.tradePay tradeNO RSA2 验签 查单 关单)',
}


def resolve(t: str) -> str:
    t = t.replace('${RFD_ID}', 'RFD-001')
    t = t.replace('${PYTEST_NOTE}',
                  '测试用 vitest（npx vitest run）；渠道端点一律本地 mock，禁止真实请求。')
    t = t.replace('${task}', CHAN_SPEC['task']).replace('${app}', CHAN_SPEC['app'])
    t = t.replace('${chan}', CHAN_SPEC['chan'])
    t = t.replace('"$who"', 'lin').replace('$who', 'lin')
    t = re.sub(r'\$\(workspace (\w+)\)',
               lambda m: str(SIM / 'workspaces' / m.group(1) / 'aipaydev'), t)
    t = re.sub(r'\$\(agent_mxid (\w+)\)',
               lambda m: '@%s-agent:matrix.test' % m.group(1), t)
    t = t.replace('${RUN_ID:-default}', RUN_ID)
    return t


def extract(text: str, start: str, end: str) -> str:
    m = re.search(re.escape(start) + '(.*?)' + re.escape(end), text, re.S)
    if not m:
        sys.exit('extract failed: %s ... %s' % (start[:40], end[:40]))
    return m.group(1)


def send(sender: str, body: str, mentions) -> str:
    tok = (SIM / 'creds' / (sender + '.token')).read_text().strip()
    payload = {'msgtype': 'm.text', 'body': body, 'm.mentions': {'user_ids': mentions}}
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    url = '%s/_matrix/client/v3/rooms/%s/send/m.room.message?access_token=%s' % (HS, ROOM, tok)
    for i in (1, 2, 3):
        try:
            req = urllib.request.Request(url, data=data,
                                         headers={'Content-Type': 'application/json'},
                                         method='POST')
            with urllib.request.urlopen(req, timeout=20) as r:
                eid = json.load(r).get('event_id', '')
            if eid:
                return eid
        except Exception as e:  # noqa: BLE001 - 重试后仍败则大声退出
            print('  send attempt %d failed: %s' % (i, e), file=sys.stderr)
            if i == 3:
                return 'SEND-FAILED'
            time.sleep(i * 2)
    return 'SEND-FAILED'


def main() -> None:
    if ISSUE_KEY in ISSUES.read_text(encoding='utf-8'):
        print('already-done: %s 已在 issues.log，跳过' % ISSUE_KEY)
        return

    src = SRC.read_text(encoding='utf-8')
    lib = LIB.read_text(encoding='utf-8')

    chen_raw = extract(src, 'dispatch_in_room chen "@chen-agent:matrix.test 执行开发任务 DEV-PAYCORE',
                       '" "$(agent_mxid chen),$(agent_mxid wei)"')
    xiao_raw = extract(src, 'dispatch_in_room xiao "@xiao-agent:matrix.test 执行开发任务 DEV-MP',
                       '" "$(agent_mxid xiao),$(agent_mxid mei)"')
    lin_raw = extract(src, 'dispatch_in_room "$who" "@$who-agent:matrix.test 执行开发任务 ${task}',
                      '" "$(agent_mxid $who),$(agent_mxid wei)"')
    # 起始锚剥离：把任务书首行的锚定前缀补回去（extract 起点之后的正文才是任务书本体，
    # 起点串本身属于任务书开头，不能丢）
    chen_raw = '@chen-agent:matrix.test 执行开发任务 DEV-PAYCORE' + chen_raw
    xiao_raw = '@xiao-agent:matrix.test 执行开发任务 DEV-MP' + xiao_raw
    lin_raw = '@$who-agent:matrix.test 执行开发任务 ${task}' + lin_raw
    footer_raw = extract(lib, '"$2\n', '" "$3")')

    legs = [
        ('chen', resolve(chen_raw), ['@chen-agent:matrix.test', '@wei-agent:matrix.test'],
         'DEV-DONE-DEV-PAYCORE。不许谎报。'),
        ('xiao', resolve(xiao_raw), ['@xiao-agent:matrix.test', '@mei-agent:matrix.test'],
         'DEV-DONE-DEV-MP。不许谎报。'),
        ('lin', resolve(lin_raw), ['@lin-agent:matrix.test', '@wei-agent:matrix.test'],
         'DEV-DONE-DEV-CHALI。不许谎报。'),
    ]
    footer = resolve(footer_raw)

    for sender, brief, mentions, marker in legs:
        assert marker in brief, 'brief marker missing for %s: %s' % (sender, marker)
        assert ('workspaces/%s/aipaydev' % sender) in brief, 'workspace path missing for %s' % sender
    assert ('[派发标识 RUN=%s]' % RUN_ID) in footer, 'footer RUN tag missing'

    results = {}
    dry = bool(os.environ.get('DRY'))
    for sender, brief, mentions, _ in legs:
        body = brief + '\n' + footer
        h = hashlib.sha256(body.encode('utf-8')).hexdigest()[:12]
        eid = 'DRY-RUN' if dry else send(sender, body, mentions)
        results[sender] = eid
        print('%s -> %s (body sha256:%s)' % (sender, eid, h))

    addendum = ('导演补记（基座容错，覆盖 hu/lin 渠道双路）：若 origin/feat/DEV-PAYCORE '
                '尚未落地，feat/DEV-CHWX / feat/DEV-CHALI 允许先基于 origin/main 起建'
                '（pay-core 契约一律以 docs/design/RFD-001-architecture-design.md 为准）；'
                'PAYCORE 后落地不构成渠道任务返工义务。'
                '[RUN=%s]' % RUN_ID)
    results['addendum'] = 'DRY-RUN' if dry else send(
        'fanfan', addendum, ['@lin-agent:matrix.test', '@hu-agent:matrix.test'])
    print('addendum -> %s' % results['addendum'])
    if dry:
        print('DRY: 摘要校验——')
        for sender, brief, _, marker in legs:
            print('  %s marker=%s head=%s' % (sender, marker in brief, brief[:60].replace('\n', ' | ')))
        return

    stamp = time.strftime('%H:%M:%S')
    lines = [
        ('ISSUE|%s|网关容量记账|09:25 起容量重试队列满 64（第三次容量僵尸，09:09 重启未清净），'
         '11:12 d1 派发与 12:47 渠道批派发的 agent 拉起被容量拒绝后队列溢出丢弃'
         '（消息本体在房：chen=$7RQBmyBlsUqsV8cvC0t_AEBCTUBglNxC8jJ6WzTTlRQ '
         'xiao=$0lMBx84ddphRJ9fFWoyf_6bz_xpMEh2cGe_96NK0tKQ '
         'hu=$7BrdKZWNdJEOmhobJifvhRJ75-DfVDDoems0a9QJckQ '
         'lin=$78kYJWh3PQP_13dZBTdYLpsNzKXrKzkjyMIkLbOuQF4）；'
         'chen/xiao/lin 全程沉睡，驱动 12:47 判 DEV-PAYCORE 死（dev-branch-missing）；'
         '13:20:31 affinity 重启清账后零丢弃' % ISSUE_KEY),
        ('DISP|%s|导演补记|已修（13:%s 重递）：chen/lin/xiao 三份任务书原文重发'
         '（aipay-scenario.sh 逐字提取+标准尾标；hu 已由 13:35:54 idle-nudge 拉起不重发）；'
         '渠道基座容错口径已随补记发出（PAYCORE 未落地时渠道可基于 origin/main 起建）；'
         '根因（槽位释放缺口，533 补丁面）维持挂 run11 复盘' % (ISSUE_KEY, stamp[:5])),
    ]
    with ISSUES.open('a', encoding='utf-8') as f:
        for ln in lines:
            f.write(ln + '\n')
    print('issues.log appended (%d lines)' % len(lines))
    if any(v == 'SEND-FAILED' for v in results.values()):
        sys.exit('SEND-FAILED present — 检查上方 event id 后手工补发')


if __name__ == '__main__':
    main()
