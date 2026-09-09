#!/usr/bin/env python3
"""批量扫描书库 OCR：N 本 PDF → <书名>.txt（资源安全模式）

实测来源：2026-08-27 第一推动丛书 32 本/9,793 页。
资源红线：并行度按内存预算（默认 2），nice +10 让路前台，灰度渲染省一半内存。
断点续跑：输出 txt 存在且 >1KB 自动跳过。
"""
import fitz, subprocess, os, sys, time
from multiprocessing import Pool

PDF_DIR = sys.argv[1] if len(sys.argv) > 1 else "."   # 书目录
OCR_DIR = os.path.join(PDF_DIR, "_ocr")
PARALLELISM = int(os.environ.get("OCR_POOL", "2"))    # 🔴 默认 2；按内存算，别按核数
os.makedirs(OCR_DIR, exist_ok=True)
LOG = os.path.join(OCR_DIR, "_progress.log")

def log(msg):
    with open(LOG, "a") as f:
        f.write(f"[{time.strftime('%H:%M:%S')}] {msg}\n")

def ocr_page(png_bytes):
    r = subprocess.run(
        ["tesseract", "stdin", "stdout", "-l", "chi_sim+eng", "--psm", "6"],
        input=png_bytes, capture_output=True,          # stdin 管道：沙箱下唯一可靠方式
        env={**os.environ, "OMP_THREAD_LIMIT": "1"},
        preexec_fn=lambda: os.nice(10),                # 低优先级，前台应用优先
    )
    return r.stdout.decode("utf-8", errors="ignore")

def ocr_book(pdf_path):
    name = os.path.splitext(os.path.basename(pdf_path))[0]
    out_path = os.path.join(OCR_DIR, name + ".txt")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 1000:
        return f"SKIP(已有): {name}"
    t0 = time.time()
    doc = fitz.open(pdf_path)
    parts, empty_pages, total_chars = [], 0, 0
    for i in range(len(doc)):
        pix = doc[i].get_pixmap(dpi=300, colorspace=fitz.csGRAY)  # 灰度省内存
        png = pix.tobytes("png")
        pix = None                                              # 立即释放位图
        text = ocr_page(png).strip()
        png = None
        if len(text) < 20:
            empty_pages += 1
        total_chars += len(text)
        parts.append(f"\n【第{i+1}页】\n{text}")
        if (i + 1) % 50 == 0:
            log(f"{name}: {i+1}/{len(doc)} 页, 累计{total_chars}字")
    with open(out_path, "w") as f:
        f.write(f"# OCR来源: {os.path.basename(pdf_path)}\n# 页数: {len(doc)} | 空白/无字页: {empty_pages}\n")
        f.write("".join(parts))
    log(f"DONE: {name} | {len(doc)}页 {total_chars}字 空页{empty_pages} | {time.time()-t0:.0f}s")
    return f"DONE: {name} ({len(doc)}页, {total_chars}字, {time.time()-t0:.0f}s)"

if __name__ == "__main__":
    pdfs = sorted(
        os.path.join(PDF_DIR, f)
        for f in os.listdir(PDF_DIR)
        if f.lower().endswith(".pdf")
    )
    log(f"==== 批量启动: {len(pdfs)} 本, 并行{PARALLELISM} ====")
    print(f"待OCR: {len(pdfs)} 本 (并行 {PARALLELISM})", flush=True)
    with Pool(PARALLELISM) as pool:
        for res in pool.imap_unordered(ocr_book, pdfs):
            print(res, flush=True)
    txts = [f for f in os.listdir(OCR_DIR) if f.endswith(".txt") and not f.startswith("_")]
    log(f"==== 全部完成: {len(txts)}/{len(pdfs)} 本 ====")
    print(f"\n完成: {len(txts)}/{len(pdfs)} 本 → {OCR_DIR}", flush=True)
