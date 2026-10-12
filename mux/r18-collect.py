#!/usr/bin/env python3
"""r18-collect.py — R18 全量呈现载荷采集器（V7.2 §9.3 R18 配套）

把"不可缩略"素材登记进 runs/<RUN>/evidence/r18-steps.json（生成器
mx-report-gen.py 与审计器 mx-report-audit.py 查 8 的共同数据源）：

  dialog  对话全文——按锚事件从 matrix 拉取上下文消息（/context API），
          收全文不截首尾；sender/ts/body 逐条入载荷，anchor=事件锚可反查。
  op      操作序列——登记"操作入口（路由/点击序列）+前后帧文件名"
          （帧由 r18-frames.mjs 拍摄：`<step>-op<k>-{before,action,after}.png`）。
  effect  环节效果——一句话效果陈述+证据锚列表（commit/event/卡号）。
  skill   skill 过程帧（正本§5.6 必采矩阵，步 13 承诺入必采矩阵）——
          gen=xxx-dev 生成过程帧（≥3）、invoke=开发调用过程帧（≥2）。

用法（SIM 根与生成器同源：AIPAY_SIM_ROOT 可覆盖；--run 必带）：
  r18-collect.py --run <id> dialog  --step 9 --room '!x:matrix.test' \\
      --anchor '$ev' --title 'fanfan 群内派发' [--user fanfan] [--limit 60]
  r18-collect.py --run <id> op      --step 25 --title '任务跳转 IDE' \\
      --entry '#/app/board → 卡右栏 ⌨IDE' --frames 25-op1-before.png 25-op1-after.png
  r18-collect.py --run <id> effect  --step 20 --text 'G5 七项全过、REL 双卡登记' \\
      --ev '发布计划=docs/delivery/...@abc1234' --ev '批准事件=approved.events'
  r18-collect.py --run <id> skill   --step 13 \\
      --gen 13-sg1-after.png 13-sg2-after.png 13-sg3-after.png \\
      --invoke 18-si1-after.png 18-si2-after.png
  r18-collect.py --run <id> show [--step N]

幂等性：dialog/op 追加（同 anchor 去重）；skill 按 gen/invoke 追加去重；
effect 整体替换；坏 JSON 拒写不覆盖。
"""
import argparse
import json
import os
import sys
import time
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
    # run16 实锤防线（fix/run16-report-truth）：锚必须是 $ 开头的 matrix event_id。
    # 此前清扫循环裸传 marker 键名字面 → /context 404 逐轮刷单 103 张；锚形态前置
    # 校验把「参数错」与「服务 404」区分开，错误信息直接指出修复方向。
    if not anchor.startswith('$'):
        die(f'锚非 event_id 形态（收到 "{anchor[:40]}"）——须传 $… 开头的 matrix 事件号；'
            f'marker 值请经 marker_eventid 提取（调用方参数错，非服务端故障）')
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
    p_k = sub.add_parser('skill')
    p_k.add_argument('--step', type=int, required=True)
    p_k.add_argument('--gen', nargs='*', default=[], help='xxx-dev 生成过程帧（§5.6 必采矩阵：≥3）')
    p_k.add_argument('--invoke', nargs='*', default=[], help='开发调用过程帧（§5.6 必采矩阵：≥2）')
    p_k.add_argument('--note', default='')
    p_d = sub.add_parser('deliver')
    p_d.add_argument('--step', type=int, default=23, help='delivery 门禁灯帧见证位（默认 23=审计步）')
    p_d.add_argument('--frame', nargs='+', required=True, help='Delivery Cases 面板门禁灯帧（R29：≥1）')
    p_d.add_argument('--note', default='')
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
        if not msgs:
            _issue(a.run, a.step, '对话收集成功但 0 条消息（锚上下文空——anchor 指向/房间成员资格/时机核验；F2 空载荷记单）')
        dl = entry.setdefault('dialogs', [])
        if any(d.get('anchor') == a.anchor for d in dl):
            die(f'step {a.step} 已登记同锚对话（{a.anchor}）——幂等拒重，show 核对')
        dl.append({'title': a.title, 'room': a.room, 'anchor': a.anchor, 'messages': msgs})
        print(f'[r18-collect] step {a.step} 对话入载荷：{len(msgs)} 条消息（全文未截断）')
    elif a.mode == 'op':
        entry.setdefault('ops', []).append(
            {'title': a.title, 'entry': a.entry, 'frames': a.frames, 'note': a.note,
             'ts': int(time.time())})  # V8.4 §5.5 帧③时刻窗锚：采集时刻即真值（审计对 run 窗口核验）
        print(f'[r18-collect] step {a.step} 操作序列入载荷：{len(a.frames)} 帧')
    elif a.mode == 'effect':
        entry['effect'] = {'text': a.text,
                           'evidence': [dict(zip(('label', 'anchor'), ev.split('=', 1))) for ev in a.ev]}
        print(f'[r18-collect] step {a.step} 环节效果入载荷：{len(a.ev)} 证据锚')
    elif a.mode == 'skill':
        if not a.gen and not a.invoke:
            die('skill 登记须至少带一帧（--gen 生成过程 / --invoke 开发调用）')
        sk = entry.setdefault('skill', {'gen': [], 'invoke': []})
        sk['ts'] = int(time.time())  # V8.4 帧③时刻窗锚（同 op）
        for bucket, frames in (('gen', a.gen), ('invoke', a.invoke)):
            lst = sk.setdefault(bucket, [])
            for f in frames:
                if f not in lst:
                    lst.append(f)
        if a.note:
            sk['note'] = a.note
        print(f'[r18-collect] step {a.step} skill 过程帧入载荷：gen {len(sk.get("gen") or [])} 帧 / invoke {len(sk.get("invoke") or [])} 帧'
              f'（§5.6 必采矩阵 达标线 gen≥{3} invoke≥{2}）')
    elif a.mode == 'deliver':
        dlv = entry.setdefault('delivery', {'frames': []})
        dlv['ts'] = int(time.time())  # V8.4 帧③时刻窗锚（同 op）
        lst = dlv.setdefault('frames', [])
        for f in a.frame:
            if f not in lst:
                lst.append(f)
        if a.note:
            dlv['note'] = a.note
        print(f'[r18-collect] step {a.step} delivery 门禁灯帧入载荷：{len(lst)} 帧（R29 达标线 ≥1；MX_DELIVERY=1 面板实拍）')
    save_payload(a.run, data)


def _issue(run: str, step, msg: str):
    """F2（run15 复盘）：收集失败此前被调用方 `|| true` 全静默——9 步载荷全缺直到报告
    生成才暴露。中心化记单：任何 die()/异常/空载荷落 issues.log，监控与报告立即可见。
    run16 实锤修订（fix/run16-report-truth）：记单幂等——同 step 同错误指纹（msg 前 80
    字符）已登记即跳过，防驱动重启循环重放时每轮刷单（run16 刷 103 单实锤）。"""
    f = SIM / 'runs' / run / 'evidence' / 'issues.log'
    try:
        f.parent.mkdir(parents=True, exist_ok=True)
        _fp = f'ISSUE|r18-collect-failed|step-{step}|'
        _sig = msg[:80]
        if f.exists():
            for _ln in f.read_text(encoding='utf-8', errors='replace').splitlines():
                if _ln.startswith(_fp) and _sig in _ln:
                    return  # 同指纹已登记，幂等拒重
        with f.open('a', encoding='utf-8') as fh:
            fh.write(f"{_fp}{msg}\n")
    except OSError:
        pass


if __name__ == '__main__':
    try:
        main()
    except SystemExit as e:
        msg = str(e.args[0]) if e.args and isinstance(e.args[0], str) else f'exit={e.code}'
        if '幂等拒重' in msg:
            raise  # 预期行为（重放补采命中已登记锚），不是失败
        argv = sys.argv
        try:
            run = argv[argv.index('--run') + 1]
        except (ValueError, IndexError):
            run = 'unknown'
        step = next((argv[i + 1] for i, v in enumerate(argv)
                     if v == '--step' and i + 1 < len(argv)), '?')
        if run != 'unknown':
            _issue(run, step, f'收集失败：{msg}')
        raise
