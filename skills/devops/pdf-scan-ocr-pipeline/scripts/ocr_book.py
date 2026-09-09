#!/usr/bin/env python3
"""扫描版 PDF 全书 OCR → 分章 Markdown（ocrmac/Apple Vision, 断点续跑）。

用法:
  ~/.hermes/hermes-agent/venv/bin/python3 ocr_king.py \
      --pdf sources/金观涛-控制论与科学方法论-2005.pdf \
      --out ocr-fulltext [--start 0] [--limit N] [--dpi 200]

输出: ocr-fulltext/book.md（连续文本, <!-- pN --> 页锚点）+ _state.json（断点）
"""
import argparse
import json
import os
import sys
import time

import fitz


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--limit", type=int, default=0, help="0 = 到结尾")
    ap.add_argument("--dpi", type=int, default=200)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    md_path = os.path.join(args.out, "book.md")
    st_path = os.path.join(args.out, "_state.json")

    state = {"done": []}
    if os.path.exists(st_path):
        state = json.load(open(st_path))
    done = set(state.get("done", []))

    doc = fitz.open(args.pdf)
    n = doc.page_count
    end = n if args.limit <= 0 else min(n, args.start + args.limit)

    from ocrmac.ocrmac import OCR

    mode = "a" if (os.path.exists(md_path) and done) else "w"
    t0 = time.time()
    with open(md_path, mode) as f:
        for p in range(args.start, end):
            if p in done:
                continue
            pix = doc[p].get_pixmap(dpi=args.dpi)
            img_path = os.path.join(args.out, "_page.png")
            pix.save(img_path)
            try:
                results = OCR(
                    img_path, language_preference=["zh-Hans", "en-US"]
                ).recognize()
                # ocrmac v1.0.1 返回 (text, confidence, [x,y,w,h])；y 原点左下
                # → 按 y 降序 = 自上而下阅读顺序
                lines = sorted(
                    (r for r in results if isinstance(r, (tuple, list)) and r),
                    key=lambda r: r[2][1] if len(r) > 2 and isinstance(r[2], (list, tuple)) else 0,
                    reverse=True,
                )
                text = "\n".join(str(r[0]) for r in lines)
            except Exception as e:  # noqa: BLE001
                text = f"<!-- OCR ERROR p{p + 1}: {e} -->"
            f.write(f"\n<!-- p{p + 1} -->\n{text}\n")
            f.flush()
            done.add(p)
            state["done"] = sorted(done)
            json.dump(state, open(st_path, "w"))
            rate = (len(done) / max(time.time() - t0, 1)) * 60
            print(f"[{len(done)}/{n}] p{p + 1} {rate:.0f}pg/min", flush=True)
    print("ALL DONE", len(done), "pages")


if __name__ == "__main__":
    sys.exit(main())
