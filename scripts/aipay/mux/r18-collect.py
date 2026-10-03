#!/usr/bin/env python3
"""r18-collect.py — R18 全量呈现载荷采集器（V7.2 §9.3 R18 配套）

把三类"不可缩略"素材登记进 runs/<RUN>/evidence/r18-steps.json（生成器
mx-report-gen.py 与审计器 mx-report-audit.py 查 8 的共同数据源）：

  dialog  对话全文——按锚事件从 matrix 拉取上下文消息（/context API），
          收全文不截首尾；sender/ts/body 逐条入载荷，anchor=事件锚可反查。
  op      操作序列——登记"操作入口（路由/点击序列）+前后帧文件名"
          （帧由 r18-frames.mjs 拍摄：`<step>-op<k>-{before,action,after}.png`）。
  effect  环节效果——一句话效果陈述+证据锚列表（commit/event/卡号）。

用法（SIM 根与生成器同源：AIPAY_SIM_ROOT 可覆盖；--run 必带）：
  r18-collect.py --run <id> dialog  --step 9 --room '!x:matrix.test' \\
      --anchor '$ev' --title 'fanfan 群内派发' [--user fanfan] [--limit 60]
  r18-collect.py --run <id> op      --step 25 --title '任务跳转 IDE' \\
      --entry '#/app/board → 卡右栏 ⌨IDE' --frames 25-op1-before.png 25-op1-after.png
  r18-collect.py --run <id> effect  --step 20 --text 'G5 七项全过、REL 双卡登记' \\
      --ev '发布计划=docs/delivery/...@abc1234' --ev '批准事件=approved.events'
  r18-collect.py --run <id> show [--step N]

幂等性：dialog/op 追加（同 anchor 去重）；effect 整体替换；坏 JSON 拒写不覆盖。
"""
import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

SIM = Path(os.environ.get('AIPAY_SIM_ROOT', '/Volumes/nvme2230/lab/ncwk-sim-mux'))
HS = os.environ.get('MX_HOMESERVER', 'http://127.0.0.1:8008')


def die(msg):
    sys.exit(f'[r18-collect] {msg}')


def load_payload(run: str) -> dict:
    f = SIM / 'runs' / run / 'evidence' / 'r18-steps.json'
    if f.exists():
        try:
            data = json.loads(f.read_text(encoding='utf-8'))
        except json.JSONDecodeError as e:
            die(f'r18-steps.json 已存在但解析失败（拒写不覆盖，人工处置）：{e}')
        data.setdefault('steps', {})
        return data
    return {'_schema': 1, 'steps': {}}


def save_payload(run: str, data: dict):
    f = SIM / 'runs' / run / 'evidence' / 'r18-steps.json'
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'[r18-collect] 已写入 {f}')


def _localpart(sender: str) -> str:
    return sender[1:].split(':', 1)[0] if sender.startswith('@') else sender


def fetch_dialog(room: str, anchor: str, user: str, limit: int) -> list:
    tf = SIM / 'creds' / f'{user}.token'
    if not tf.exists():
        die(f'凭据缺失：{tf}（--user 指定持有该房 membership 的账号）')
    tok = tf.read_text().strip().splitlines()[0]
    url = (f'{HS}/_matrix/client/v3/rooms/{urllib.request.quote(room)}/context/'
           f'{urllib.request.quote(anchor)}?limit={max(limit, 1)}&access_token={tok}')
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            ctx = json.loads(r.read())
    except urllib.error.HTTPError as e:
        die(f'matrix /context 拉取失败 HTTP {e.code}：{e.read()[:200]!r}（anchor/room/token 是否匹配）')
    anchor_ev = ctx.get('event') or {}
    events = ctx.get('events_before', []) + ([anchor_ev] if anchor_ev else []) + ctx.get('events_after', [])
    msgs = []
    for ev in events:
        if not ev or ev.get('type') != 'm.room.message':
            continue
        c = ev.get('content', {})
        body = c.get('body', '')
        if c.get('m.relates_to', {}).get('m.in_reply_to'):
            body = '\n'.join(l for l in body.splitlines() if not l.startswith('> ')) or body
        import datetime
        ts = ev.get('origin_server_ts')
        tstr = datetime.datetime.fromtimestamp(ts / 1000).strftime('%m-%d %H:%M:%S') if ts else ''
        msgs.append({'sender': _localpart(ev.get('sender', '?')), 'ts': tstr, 'body': body,
                     'event_id': ev.get('event_id', '')})
    seen, uniq = set(), []
    for m in msgs:
        k = m['event_id'] or (m['sender'], m['ts'], m['body'])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(m)
    if not uniq:
        die('上下文窗口内零条 m.room.message（anchor 是否指到消息事件？limit 是否太小？）')
    return uniq


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument('--run', required=True, help='RUN_ID（载荷落 runs/<run>/evidence/）')
    sub = ap.add_subparsers(dest='mode', required=True)
    p_d = sub.add_parser('dialog')
    p_d.add_argument('--step', type=int, required=True)
    p_d.add_argument('--room', required=True)
    p_d.add_argument('--anchor', required=True, help='锚事件 id（$…；全文窗口以它为中心）')
    p_d.add_argument('--title', required=True)
    p_d.add_argument('--user', default='admin', help='取 creds/<user>.token 拉取（须为房间成员）')
    p_d.add_argument('--limit', type=int, default=60, help='上下文各侧事件数（默认 60）')
    p_o = sub.add_parser('op')
    p_o.add_argument('--step', type=int, required=True)
    p_o.add_argument('--title', required=True)
    p_o.add_argument('--entry', required=True, help='操作入口：路由/菜单路径/点击序列+登录身份')
    p_o.add_argument('--frames', nargs='+', required=True, help='帧文件名（r18-frames.mjs 产物）')
    p_o.add_argument('--note', default='')
    p_e = sub.add_parser('effect')
    p_e.add_argument('--step', type=int, required=True)
    p_e.add_argument('--text', required=True)
    p_e.add_argument('--ev', action='append', default=[], help='label=anchor（可多次）')
    p_s = sub.add_parser('show')
    p_s.add_argument('--step', type=int)
    a = ap.parse_args()

    data = load_payload(a.run)
    steps = data['steps']
    if a.mode == 'show':
        if a.step:
            print(json.dumps(steps.get(str(a.step), {}), ensure_ascii=False, indent=2))
        else:
            cov = [k for k, v in steps.items() if v.get('dialogs') or v.get('ops') or v.get('effect')]
            print(json.dumps({'coverage': f'{len(cov)}/26', 'steps': sorted(cov, key=int)},
                             ensure_ascii=False))
        return
    entry = steps.setdefault(str(a.step), {})
    if a.mode == 'dialog':
        msgs = fetch_dialog(a.room, a.anchor, a.user, a.limit)
        dl = entry.setdefault('dialogs', [])
        if any(d.get('anchor') == a.anchor for d in dl):
            die(f'step {a.step} 已登记同锚对话（{a.anchor}）——幂等拒重，show 核对')
        dl.append({'title': a.title, 'room': a.room, 'anchor': a.anchor, 'messages': msgs})
        print(f'[r18-collect] step {a.step} 对话入载荷：{len(msgs)} 条消息（全文未截断）')
    elif a.mode == 'op':
        entry.setdefault('ops', []).append(
            {'title': a.title, 'entry': a.entry, 'frames': a.frames, 'note': a.note})
        print(f'[r18-collect] step {a.step} 操作序列入载荷：{len(a.frames)} 帧')
    elif a.mode == 'effect':
        entry['effect'] = {'text': a.text,
                           'evidence': [dict(zip(('label', 'anchor'), ev.split('=', 1))) for ev in a.ev]}
        print(f'[r18-collect] step {a.step} 环节效果入载荷：{len(a.ev)} 证据锚')
    save_payload(a.run, data)


if __name__ == '__main__':
    main()
