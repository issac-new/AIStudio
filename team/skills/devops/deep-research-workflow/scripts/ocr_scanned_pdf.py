#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Resumable per-chapter OCR of a large image-only scanned PDF via Apple Vision (ocrmac).

Use for 全书精读 of scanned books (Pdg2Pic / FreePic2Pdf, no text layer, >50MB).
- Incremental / resumable: each page's OCR result is appended to a per-chapter .md;
  already-done pages are skipped on re-run (state tracked in _state.json).
- Splits output by chapter using the PDF TOC (doc.get_toc()).
- Tags every page with a `<!-- pN -->` anchor so downstream notes can cite pN.

Deps (macOS): pymupdf (fitz), ocrmac.  Run in background for hundreds of pages.

Usage:
  python ocr_scanned_pdf.py --pdf book.pdf --out ./book [--dpi 200] [--start N] [--end M]
"""
import os, json, argparse, time, re
import fitz  # pymupdf
from ocrmac import ocrmac


def load_toc_chapters(doc):
    """Return [(title, start, end)] 1-indexed page ranges from TOC level<=2."""
    toc = doc.get_toc()
    anchors = [(t, p) for (l, t, p) in toc if l <= 2]
    ranges = []
    for i, (title, start) in enumerate(anchors):
        end = anchors[i + 1][1] - 1 if i + 1 < len(anchors) else doc.page_count
        ranges.append((title, start, end))
    return ranges


def slugify(title):
    s = re.sub(r"\s+", "", title)
    s = re.sub(r'[\\/:*?"<>|]', "", s)
    return s[:40]


def ocr_page(page, dpi, tmpdir):
    pix = page.get_pixmap(dpi=dpi)
    img = os.path.join(tmpdir, f"_p{page.number + 1}.png")
    pix.save(img)
    try:
        ann = ocrmac.OCR(img, language_preference=["zh-Hans", "en-US"]).recognize()
        return "\n".join(a[0] for a in ann)
    finally:
        try:
            os.remove(img)
        except OSError:
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--out", default="./book_ocr")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--end", type=int, default=10 ** 9)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    tmpdir = os.path.join(args.out, "_tmp")
    os.makedirs(tmpdir, exist_ok=True)
    doc = fitz.open(args.pdf)
    ranges = load_toc_chapters(doc)

    def chap_for(p1):
        for (title, s, e) in ranges:
            if s <= p1 <= e:
                return title
        return "front"

    state_path = os.path.join(args.out, "_state.json")
    done = set(json.load(open(state_path))) if os.path.exists(state_path) else set()

    total = min(args.end, doc.page_count)
    t0, n_run = time.time(), 0
    for p1 in range(max(1, args.start), total + 1):
        if p1 in done:
            continue
        try:
            text = ocr_page(doc[p1 - 1], args.dpi, tmpdir)
        except Exception as ex:
            text = f"[OCR ERROR p{p1}: {ex}]"
        chap = chap_for(p1)
        fn = os.path.join(args.out, f"{slugify(chap)}.md")
        header = (f"\n\n<!-- p{p1} -->\n\n" if os.path.exists(fn)
                  else f"# {chap}\n\n<!-- p{p1} -->\n\n")
        with open(fn, "a", encoding="utf-8") as f:
            f.write(header + text + "\n")
        done.add(p1)
        n_run += 1
        if n_run % 10 == 0:
            json.dump(sorted(done), open(state_path, "w"))
            el = time.time() - t0
            rate = n_run / el if el else 0
            eta = (total - p1) / rate if rate else 0
            print(f"[{p1}/{total}] {rate * 60:.1f} pg/min ETA {eta / 60:.1f}min -> {os.path.basename(fn)}", flush=True)
    json.dump(sorted(done), open(state_path, "w"))
    print(f"DONE. this_run={n_run} pages, total_done={len(done)}/{doc.page_count}")


if __name__ == "__main__":
    main()
