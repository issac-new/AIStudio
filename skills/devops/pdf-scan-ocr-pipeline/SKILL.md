---
name: pdf-scan-ocr-pipeline
description: Use when OCR-ing a scanned PDF with no text layer on macOS.
version: 1.0.0
platforms: [macos]
environments: []
metadata:
  hermes:
    tags: [ocr, pdf, scanned-book, research-ingest, apple-vision]
    related_skills: [deep-research-workflow, kanban-workspace-durability, research-methodology]
---

# PDF Scan OCR Pipeline（扫描版 PDF 全文 OCR）

> 实战验证（2026-08-25）：527 页纯图像扫描《社会研究方法》→ 10 分钟全书 OCR，中文印刷体近完美。
> 适用：把无文本层的扫描书/PDF 转成可检索、可精读、带页码锚点的 Markdown 语料。

## When to Use

- PDF 打开后 `page.get_text()` 返回空 / 0 字符（纯图像扫描，无文本层）
- 需要"深入学习"一本扫描书：OCR 成文本后才能精读、做笔记、提炼方法论
- 中文印刷体（也支持英文）扫描件批量转 Markdown

## 引擎选型（macOS 首选 ocrmac / Apple Vision）

| 引擎 | 实测 | 结论 |
|---|---|---|
| **ocrmac (Apple Vision)** | 6.2s/页，中文印刷体近完美，免 GPU/免下载模型 | ✅ **首选** |
| paddleocr 2.9.1 | `np.sctypes` 在 NumPy 2.0 被移除 → import 崩溃 | ❌ 环境冲突 |
| easyocr / tesseract | 未装/质量一般 | 备选 |

**判定无文本层**（先做，别盲目 OCR）：

```bash
python3 -c "
import fitz
doc = fitz.open('<file.pdf>')
print('pages:', doc.page_count)
for p in [10, 50, 100, 200]:
    t = doc[p].get_text().strip()
    print(p+1, len(t), 'chars', '(image-only)' if not t else '')
"
# 大文件 read_file 会拒（>50MB）；用 pymupdf 直接查，不要先尝试读
```

## 流水线（增量/断点续跑）

脚本已补齐: `scripts/ocr_book.py`（2026-09-07 实测 243 页中文书 ~3 分钟，0 错误页，含 ocrmac v1.0.1 三个坑的修复）。核心模式：

1. **断点续跑**：每页 OCR 完立即 append + 记录 `_state.json`，重启跳过已完成页。
2. **逐页渲染**：`page.get_pixmap(dpi=200)` → `ocrmac.OCR(...).recognize()`，按 bbox y 降序恢复阅读顺序。
3. **后台跑**：~80 pg/min，用 `terminal(background=True)`。
4. **输出页锚**：`<!-- pN -->` 供精读笔记回查；分章切分在精读阶段做（本脚本输出连续全文）。

前置（一次性，装进 Hermes venv，非系统 python——PEP 668 拦截系统 pip）：
```bash
~/.hermes/hermes-agent/venv/bin/python3 -m pip install ocrmac pymupdf
```

```bash
~/.hermes/hermes-agent/venv/bin/python3 scripts/ocr_book.py --pdf <书.pdf> --out <持久目录> --dpi 200
```

## 验收（不信自报）

```bash
# 页数全 + 无 OCR 错误标记 + 各章非空
python3 -c "import json;d=json.load(open('<out>/_state.json'));print(len(d),'/',527)"
grep -l 'OCR ERROR' <out>/*.md || echo 'none-ok'
wc -l <out>/*.md | sort -n   # 章体量健康（~30-50KB/章），异常小文件重点查
grep -c '<!-- p' <out>/<某章>.md   # 锚点完整性
```

## Pitfalls

1. **⚠️ 输出目录禁 /tmp**：OCR 全书产物是后续精读/回查的原证，放 `/tmp` 会被系统清理（见 `kanban-workspace-durability`）。`--out` 一律指向 default_workdir 持久子目录。
2. **先查文本层再 OCR**：有文本层的 PDF 直接 `get_text()` 即可，OCR 是浪费。无文本层才走本流水线。
3. **页码换算**：OCR `<!-- pN -->` 是 PDF 扫描页序，与书印刷页码常有固定偏移（本书约 +28-29），引用原书页码时需换算并在文档声明。
4. **conda 探针噪音**：ocrmac 触发 conda 环境探针可能打印无害报错，只要 `[N/M] pg/min` 进度在涨即正常，别误判失败。
5. **超大 PDF**：>50MB read_file 工具会拒，用 pymupdf；OCR 中途 dpi=200 足够（300 无显著增益但更慢）。
