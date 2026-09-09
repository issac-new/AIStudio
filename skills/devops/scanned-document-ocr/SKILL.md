---
name: scanned-document-ocr
description: Use when a scanned or image-only PDF needs deep reading.
---

# Scanned Document OCR（扫描书/文档 → 可读语料）

把纯图像扫描 PDF（无文本层）转成按章切分、带页码锚点的 Markdown 语料，供精读/调研/看板 fan-out 使用。已在 527 页中文扫描书（《社会研究方法》14版，Pdg2Pic 扫描）全流程验证：527/527 页零错误，671K 字符，~50 页/分钟。批量书库模式（第一推动丛书 32 本/9,793 页，tesseract）于 2026-08-27 验证。

## 何时触发

- 用户丢来扫描书/扫描件要求"深入学习/精读/做笔记"
- **批量书库整理/去重/补文本层**（epub↔PDF 重叠比对、扫描版 OCR 入库）
- `read_file` 报 PDF 超过 50MB 上限，或 pymupdf 抽样 `page.get_text()` 返回 0 字符（= 纯图像扫描，必须 OCR）

## 引擎选型（macOS）

- **单本精读 → ocrmac（Apple Vision）**：免模型下载、原生加速、中文印刷体近完美（连脚注①、页边引用都能抓到）。实测单页 200DPI ~6.2s，~50 页/分钟。
- **批量多本 → tesseract 5.x**：进程隔离、内存可预算、nice 可让路。中文需 chi_sim + chi_sim_vert 两个 tessdata_best 模型，且沙箱下必须 stdin 管道调用 → 详见 `references/tesseract-batch-notes.md`（安装、坑、资源红线全在里头）。

回退顺序：rapidocr（onnxruntime）→ easyocr。**用任何引擎前先 import 冒烟测一页**——环境里装的 OCR 包可能因依赖漂移坏掉（本集群见过 paddleocr 被 NumPy 2.0 击毁：`np.sctypes` removed）。坏了就换引擎，别在现场修环境。

## 流程

### 1. 检测（先确认是否真要 OCR）

```python
import fitz
doc = fitz.open(path)
# 抽样多个内容页；全部 0 字符 = 纯图像扫描
for p in [40, 100, 250, 400]:
    print(p, len(doc[p].get_text().strip()))
# 结构：doc.get_toc() 拿章节锚点（用于按章切分 + 页码范围）
```

同时看 metadata：`creator: Pdg2Pic` / `FreePic2Pdf` 基本是零文本层扫描书，直接进 OCR 流程，别再试文本提取。

### 2. 跑流水线（后台，别在前台硬等）

**单本**：`scripts/ocr_scanned_pdf.py`——增量/断点续跑（`_state.json` 记录已完成页）、按章切分（TOC level≤2 → per-chapter `.md`，每页 `<!-- pN -->` 锚点）、无 TOC 退化单文件。

**批量书库**：`scripts/ocr_batch_books.py <书目录>`——每本一个任务、`_ocr/<书名>.txt` 产出（每页 `【第N页】` 前缀）、输出 >1KB 自动跳过（断点续跑）。

```bash
# 终端后台跑 + notify_on_complete=true，期间去干编排等别的活
python3 scripts/ocr_scanned_pdf.py --pdf /path/book.pdf --out <持久目录> --dpi 200   # 单本
python3 scripts/ocr_batch_books.py "/Volumes/.../书库目录"                           # 批量
```

### 3. 批量书库整理模式（去重 + 归档，2026-08-27 实战）

多来源书库（PDF 单册 vs epub 合集）先做重叠比对再动手：

1. **文本层普查**：逐本 `pdftotext <pdf> - | wc -m`，<500 字 = 扫描版（空壳）
2. **epub 书目解析**：zipfile 解包 → `toc.ncx` navPoint 层级 → 书名 = 首个子节点为版权信息/序言类的节点；**按每书归属 xhtml 统计中文字数（>200 字判有效书）**，纯 navLabel 顺序解析会被"再版序/致谢/第N章"噪点污染
3. **书名 norm 比对**：`re.split(r"[-—(（]",s)[0]` 去副标题 + 去标点 + lower，再求交集/差集
4. **删除走可逆路径**：重叠文件移 `_trash_重叠待确认/` + `_manifest.json`，不直接 rm；混入的非丛书书归档 `非丛书/` 子目录
5. **产物入库**：去重后权威书目写共享索引（如 knowledge-index.md），标注来源/路径/教师用法

### 4. 验收（OCR 完成 ≠ 可用，必须机械验证）

- 页数：单本 `_state.json` done == doc.page_count；批量 = txt 数 / PDF 数 + 每本头两行注释的页数与空页数
- 体量：各章 .md 大小符合预期（正文 30-50KB/章）；批量基线 ~1,060 字/页（中文科普印刷体）
- 抽查：grep 核心术语确认识别准确（专业词汇），抽 1-2 页人读确认连贯
- 批量跑完跑一次资源回查：`ps aux | grep tesseract` 应无残留进程

⚠️ 验收命令保持简单：terminal 工具对 for 循环内嵌命令替换等复杂 one-liner 会触发 hardline parser 拦截（fail-closed，不可绕过）。复杂验证写成脚本文件再 `bash <path>`，或拆成多条简单命令。

### 5. 书级精读 = OCR + 看板 fan-out（编排模式）

全书精读不是一个人啃，是流水线：

```
orchestrator 卡（OCR + 编排）
 ├─ worker-researcher × N  按篇/章并行精读  parents=[orchestrator卡]
 │    各自产出 notes/partK-*.md（核心概念带 pN 锚点 + 迁移建议，双层组织）
 └─ worker-coder 综合落地  parents=[全部精读卡]
      设计文档 + 沉淀到 skill + 蓝军对抗审查
```

- 子卡 `parents=[OCR卡]` → OCR 没完工人无法开工；**完成 orchestrator 卡即自动释放全部精读 worker**
- 精读卡 body 必须写清：源文件路径、锚点格式、产出路径、行数下限、"每条带 pN 锚点、禁编造"

## Pitfalls

- **read_file 的 PDF 上限 50MB**：大扫描书直接走 pymupdf，别试 read_file
- **别在前台同步 OCR 整本书**：后台 + notify_on_complete，主线程去做看板编排
- **🔴 批量并行按内存预算，不按 CPU 核数**（用户强制规则）：tesseract best 模型每进程 300-430MB RSS + 300dpi 位图，6 进程曾把 32GB 机器打崩（外置盘 I/O 卡死报 PermissionError → 整机崩溃）。默认 Pool(2) + nice +10 + 灰度渲染；启动 90 秒后回查进程 RSS 与 `memory_pressure -Q`。详见 `references/tesseract-batch-notes.md`
- **沙箱下 tesseract 只认 stdin 管道**：传文件路径会报 Leptonica `image file not found`（文件明明存在），别去修文件/xattr，换 stdin
- **`-l chi_sim+eng` 隐式依赖 `chi_sim_vert`**：缺它输出 0 字节 + rc=1，先装齐两个 traineddata
- **OCR 引擎先用一页冒烟测**，别批量跑完才发现输出是空的/乱码
- **页码锚点不可省**：下游精读/引用/追溯全依赖 `<!-- pN -->` / `【第N页】`
- **ocrmac 输出开头的 conda 报错噪音无害**（环境探针），只要分页进度行在刷就是健康
- **200 DPI 足够（ocrmac）**：印刷体再高 DPI 只加耗时不提质量；tesseract 批量用 300+灰度
- **批量任务 stdout 里的 conda traceback 无害**：子进程环境探针噪音，看 `_progress.log` 和 DONE 行判健康

## Files

- `scripts/ocr_scanned_pdf.py` — 单本增量 OCR 流水线（argparse: --pdf/--out/--dpi/--start/--end）
- `scripts/ocr_batch_books.py` — 批量书库 OCR（资源安全：Pool(2)+nice+灰度+断点续跑）
- `references/engine-notes.md` — 各 OCR 引擎实测数据与选型细节
- `references/tesseract-batch-notes.md` — tesseract 批量模式：安装、stdin 管道、chi_sim_vert 依赖、资源红线（2026-08-27 实战）
