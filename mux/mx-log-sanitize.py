#!/usr/bin/env python3
"""mx-log-sanitize.py —— 台账/状态文件 UTF-8 净化器（run16 复盘，fix/run16-report-truth）。

run16 实锤：issues.log 混入 1 个非 UTF-8 字节（0xbc@2706），mx-report-gen 的
issues_stats()/gov_archive 等消费方逐一崩溃 → 驱动 rc=1 → 监督器 30s 重启 →
20 轮循环 67 分钟（00:48-01:52），直到热修 read_text 容错才渡过。本件把该防线
从「读取侧各点容错」收敛为「报告链头部一次性净化」：

- 逐文件（缺省 issues.log + state.env）做严格 UTF-8 校验；
- 全部合法 → rc=0 零动作（常态零开销）；
- 含坏字节 → 坏行原文按字节 quarantine 到 <file>.badbytes（追加，带时间戳头），
  正文行内坏字节替换为 U+FFFD 重写文件（行数与行序不变），stdout 报告
  「SANITIZED n 行（隔离档 <file>.badbytes）」供驱动 note 留痕。

净化不删内容：DISP/ISSUE 计数不受影响（坏字节几乎总在中文描述段，不在
结构化前四段）。用法：python3 mux/mx-log-sanitize.py --run <RUN_ID> [--files a.log]
"""
import argparse
import os
import sys
import time
from pathlib import Path

# SIM 根必须走 AIPAY_SIM_ROOT（与本仓同族工具 r18-collect.py/tri-disp-backfill.py/
# mx-report-gen.py 同一解析链）：本件部署位在仓内 mux/ 下，__file__ 上溯三级得到
# 的是仓父目录（~/lab/ncwk），与真 SIM 根恒不相等——缺省目标不存在时 sanitize
# 静默返回 -1、rc=0，防线空转（run16 崩溃环根治件形同虚设）。
SIM = Path(os.environ.get('AIPAY_SIM_ROOT', '/Volumes/nvme2230/lab/ncwk-sim-mux'))


def sanitize(f: Path) -> int:
    """返回净化的行数（0=文件本就合法）；文件缺席返回 -1。"""
    if not f.exists():
        return -1
    raw = f.read_bytes()
    try:
        raw.decode('utf-8')
        return 0
    except UnicodeDecodeError:
        pass
    lines = raw.split(b'\n')
    bad_idx, fixed = [], []
    for i, ln in enumerate(lines):
        try:
            ln.decode('utf-8')
            fixed.append(ln)
        except UnicodeDecodeError:
            bad_idx.append(i)
            fixed.append(ln.decode('utf-8', errors='replace').encode('utf-8'))
    q = f.with_suffix(f.suffix + '.badbytes')
    with q.open('ab') as qh:
        qh.write(f"# quarantine {time.strftime('%F %T')} run-sanitize 坏字节行原文（{len(bad_idx)} 行：{bad_idx[:10]}）\n".encode())
        for i in bad_idx:
            qh.write(lines[i] + b'\n')
    f.write_bytes(b'\n'.join(fixed))
    return len(bad_idx)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', required=True)
    ap.add_argument('--files', nargs='*', default=None,
                    help='缺省=evidence/issues.log+runs/<run>/state.env 相对 SIM 根')
    a = ap.parse_args()
    ev = SIM / 'runs' / a.run / 'evidence'
    targets = [Path(x) for x in a.files] if a.files else [ev / 'issues.log',
                                                           SIM / 'runs' / a.run / 'state.env']
    n_bad = 0
    for t in targets:
        n = sanitize(t)
        if n > 0:
            print(f'SANITIZED {t.name}: {n} 行坏字节已替换 U+FFFD，原文隔离档={t.name}.badbytes')
            n_bad += n
        elif n == 0:
            print(f'OK {t.name}: UTF-8 合法（零动作）')
    sys.exit(0 if n_bad == 0 else 0)  # 净化成功即 0；文件缺席/不可读由调用方 || true 兜底


if __name__ == '__main__':
    main()
