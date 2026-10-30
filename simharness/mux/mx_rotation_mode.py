#!/usr/bin/env python3
"""mx_rotation_mode.py — SIM 网关会话轮换档位归一（705 run23 实证根治）。

背景：`session_rotation` 由 gateway 每回合经 `_load_gateway_config()` 读取，多路复用下
每个 profile 读到的是**自己 profile 家的 config.yaml**（`get_hermes_home_override()`），
不是 `$HERMES_ROOT/config.yaml`。run23 实录：档位只写在根 config 时各 profile 仍是默认
`report` 档——轮换只发建议不改会话，上下文继续涨到 126K/241K 才被上游流截断。

本脚本把 `session_rotation:\n  mode: <mode>` 幂等写进给定 config 列表（缺则插在首行，
有则改 mode 值），供 mx-setup 批量归一与现场单跑共用（单一事实源，禁两处各写一份）。

用法：
  python3 mx_rotation_mode.py --mode auto <config.yaml> [更多 config...]
  python3 mx_rotation_mode.py --mode auto --glob '/path/profiles/*/config.yaml'
退出码：0=有改动或本就一致；1=参数错误。
"""
import argparse
import glob
import pathlib
import re
import sys


def ensure_mode(text: str, mode: str) -> tuple[str, bool]:
    if re.search(r'^session_rotation:[ \t]*$', text, re.M):
        # 已有节：改/补其下的 mode 行（节内首个缩进行）
        def patched(m: re.Match) -> str:
            block = m.group(0)
            if re.search(r'^[ \t]+mode:[ \t]*\S+', block, re.M):
                return re.sub(r'(^[ \t]+mode:[ \t]*)\S+', lambda x: x.group(1) + mode, block, count=1, flags=re.M)
            return block.rstrip('\n') + f"\n  mode: {mode}\n"

        new = re.sub(r'^session_rotation:[ \t]*\n(?:[ \t]+\S.*\n)*', patched, text, count=1, flags=re.M)
        if new == text:
            return text, False
        return new, True
    # 无节：插在文件首（顶层键，位置无关）
    return f"session_rotation:\n  mode: {mode}\n" + text, True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="auto", choices=("off", "report", "auto"))
    ap.add_argument("--glob", action="append", default=[])
    ap.add_argument("paths", nargs="*")
    a = ap.parse_args()
    targets = list(a.paths)
    for g in a.glob:
        targets.extend(sorted(glob.glob(g)))
    if not targets:
        print("no config paths given", file=sys.stderr)
        return 1
    changed = same = skipped = 0
    for raw in targets:
        p = pathlib.Path(raw)
        if not p.is_file():
            skipped += 1
            continue
        text = p.read_text(encoding="utf-8")
        new, did = ensure_mode(text, a.mode)
        if did and new != text:
            p.write_text(new, encoding="utf-8")
            changed += 1
        else:
            same += 1
    print(f"session_rotation mode={a.mode}：改动 {changed} 份 / 已一致 {same} 份 / 跳过 {skipped} 份")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
