#!/usr/bin/env python3
"""frame-diff.py — 操作前后帧的「变化标注」生成器（run23 用户指令：变化要在图上标出来）。

做三件事：
1. 对齐两张图（尺寸不同则按较小尺寸缩放）；
2. 逐像素求差（灰度差 > 阈值即视为变化），用网格聚类并合并成若干矩形；
3. 在「操作后」图上画红框+编号，另存为 `<after-stem>-diff.png`，并在右下角标注图例。

设计取舍（可反查）：
- 不做像素级连通域（慢且碎），改按 24px 网格打分→相邻格合并→取面积最大的前 N 个区域；
  这样一次点击造成的「局部高亮/弹窗/新增卡片」会成一个框，滚屏导致的整体位移会被
  面积阈值滤掉（整幅变化的帧不标框，改在图注里写「整幅位移」）。
- 阈值可调（--thr，默认 12/255）：低于此亮度差视为压缩噪声。

用法：
  python3 frame-diff.py <before.png> <after.png> <out.png> [--thr 12] [--max 6]
退出码：0=已生成；2=两帧无显著差异（不产图，调用方按「无变化」呈现）。
"""
from __future__ import annotations

import argparse
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont

GRID = 24          # 网格边长（px）
MIN_REGION = 16    # 区域最小网格数（240px² 起算，小到「一个按钮高亮」也能成框）
FULL_CHANGE_RATIO = 0.85  # 变化格占比超过此值视为「整幅变化」，不标框


def _font(size: int):
    # 中文字形：图例与横幅是中文，Arial/Helvetica 无 CJK 字形（实测渲染成方框）
    for cand in ("/System/Library/Fonts/PingFang.ttc",
                 "/System/Library/Fonts/Hiragino Sans GB.ttc",
                 "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                 "/System/Library/Fonts/Helvetica.ttc"):
        try:
            return ImageFont.truetype(cand, size)
        except Exception:
            continue
    return ImageFont.load_default()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("before")
    ap.add_argument("after")
    ap.add_argument("out")
    ap.add_argument("--thr", type=int, default=12)
    ap.add_argument("--max", type=int, default=6)
    a = ap.parse_args()

    try:
        import numpy as np
    except Exception:
        print("numpy 缺失，跳过变化标注", file=sys.stderr)
        return 2

    b = Image.open(a.before).convert("RGB")
    f = Image.open(a.after).convert("RGB")
    if b.size != f.size:
        b = b.resize(f.size, Image.LANCZOS)

    gb = np.asarray(b.convert("L"), dtype=np.int16)
    gf = np.asarray(f.convert("L"), dtype=np.int16)
    diff = np.abs(gf - gb)
    changed = diff > a.thr
    if not changed.any():
        return 2

    h, w = changed.shape
    gh, gw = h // GRID, w // GRID
    if gh == 0 or gw == 0:
        return 2
    # 网格打分：每格变化像素占比 > 15% 记为变化格
    grid = changed[: gh * GRID, : gw * GRID].reshape(gh, GRID, gw, GRID).mean(axis=(1, 3))
    cells = grid > 0.15
    if cells.sum() == 0:
        return 2
    if cells.mean() > FULL_CHANGE_RATIO:
        # 整幅变化（切页签/换视图）：框无意义，但必须「标出来」——画满格外框+顶部横幅，
        # 让读者一眼知道这张对比是整页切换，而不是局部改动。
        outimg = f.copy()
        dr = ImageDraw.Draw(outimg)
        lw = max(6, w // 300)
        dr.rectangle([lw, lw, w - lw, h - lw], outline=(255, 59, 48), width=lw)
        fs = max(26, w // 80)
        font = _font(fs)
        txt = "整幅变化：页面/视图切换（前后为两个不同视图）"
        tw = dr.textlength(txt, font=font)
        pad = fs // 2
        dr.rectangle([0, 0, min(w, tw + 2 * pad), fs + 2 * pad], fill=(255, 59, 48))
        dr.text((pad, pad), txt, fill=(255, 255, 255), font=font)
        outimg.save(a.out)
        print(f"diff=full-view-switch → {a.out}")
        return 0

    # 相邻变化格合并（并查集简化：按行列扫描贪心扩展矩形）
    visited = np.zeros_like(cells, dtype=bool)
    boxes = []
    for y in range(gh):
        for x in range(gw):
            if not cells[y, x] or visited[y, x]:
                continue
            x2, y2 = x, y
            # 向右扩
            while x2 + 1 < gw and cells[y, x2 + 1] and not visited[y, x2 + 1]:
                x2 += 1
            # 向下扩（整行都变化才扩）
            while y2 + 1 < gh and cells[y2 + 1, x:x2 + 1].all() and not visited[y2 + 1, x:x2 + 1].any():
                y2 += 1
            visited[y:y2 + 1, x:x2 + 1] = True
            area = (x2 - x + 1) * (y2 - y + 1)
            if area >= MIN_REGION:
                boxes.append((x * GRID, y * GRID, (x2 + 1) * GRID, (y2 + 1) * GRID, area))

    if not boxes:
        # 兜底：零散变化（切页签/表格换数据）合并成一个大框，宁可框大也不漏标
        ys, xs = np.where(cells)
        if len(xs) >= 3:
            boxes.append((int(xs.min()) * GRID, int(ys.min()) * GRID,
                          int(xs.max() + 1) * GRID, int(ys.max() + 1) * GRID,
                          (xs.max() - xs.min() + 1) * (ys.max() - ys.min() + 1)))
        else:
            return 2

    boxes.sort(key=lambda t: -t[4])
    boxes = boxes[: a.max]

    outimg = f.copy()
    dr = ImageDraw.Draw(outimg)
    lw = max(4, w // 480)
    fs = max(22, w // 90)
    font = _font(fs)
    for i, (x1, y1, x2, y2, _area) in enumerate(boxes, 1):
        dr.rectangle([x1, y1, x2, y2], outline=(255, 59, 48), width=lw)
        label = str(i)
        tw = dr.textlength(label, font=font)
        pad = fs // 3
        dr.rectangle([x1, max(0, y1 - fs - 2 * pad), x1 + tw + 2 * pad, max(fs + 2 * pad, y1)],
                     fill=(255, 59, 48))
        dr.text((x1 + pad, max(0, y1 - fs - pad)), label, fill=(255, 255, 255), font=font)

    # 图例（右下角）
    legend = f"变化处 {len(boxes)} 处（红框）"
    lw2 = dr.textlength(legend, font=font)
    lh = fs + 2 * (fs // 3)
    dr.rectangle([w - lw2 - 3 * (fs // 3) - 8, h - lh - 8, w - 8, h - 8], fill=(0, 0, 0))
    dr.text((w - lw2 - 2 * (fs // 3) - 4, h - lh - 8 + (fs // 3)), legend, fill=(255, 255, 255), font=font)

    outimg.save(a.out)
    print(f"diff boxes={len(boxes)} → {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
