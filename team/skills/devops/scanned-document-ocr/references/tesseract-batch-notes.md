# Tesseract 批量 OCR（macOS）— 2026-08-27 第一推动丛书实战沉淀

场景：32 本扫描 PDF / 9,793 页批量补文本层。ocrmac（Apple Vision）适合单本精读；
**批量多本 + 多进程并行时 tesseract 更可控**（进程隔离、内存可预算、nice 可让路）。

## 安装（只装需要的，不装 tesseract-lang 全家桶）

```bash
brew install tesseract          # 只带 eng/osd/snum，很干净
# 中文高精度模型（tessdata_best，12MB/个，比 tesseract-lang 全包省 600MB）：
cd /opt/homebrew/share/tessdata
curl -L -o chi_sim.traineddata      https://github.com/tesseract-ocr/tessdata_best/raw/main/chi_sim.traineddata
curl -L -o chi_sim_vert.traineddata https://github.com/tesseract-ocr/tessdata_best/raw/main/chi_sim_vert.traineddata
```

⚠️ **`chi_sim_vert` 不是可选项**：`-l chi_sim+eng` 组合会隐式请求竖排模型，缺失时
returncode=1 且 stdout 为空——症状是"装了 chi_sim 但输出 0 字节"，极易误诊为图片问题。

## 沙箱调用：必须 stdin 管道，不能传文件路径

Hermes 终端沙箱下 tesseract **按路径读文件会失败**（Leptonica `fopenReadStream` /
`findFileFormat: image file not found`，即使文件存在、`file` 命令能读、xattr 已清）。
症状与"文件损坏"一模一样，真根因是沙箱读限制。**正确姿势**：

```python
r = subprocess.run(
    ["tesseract", "stdin", "stdout", "-l", "chi_sim+eng", "--psm", "6"],
    input=png_bytes, capture_output=True,          # PNG 字节从 stdin 进
    env={**os.environ, "OMP_THREAD_LIMIT": "1"},   # 每进程单线程，进程数=并行度
)
text = r.stdout.decode("utf-8", errors="ignore")
```

渲染：`page.get_pixmap(dpi=300, colorspace=fitz.csGRAY)` → `pix.tobytes("png")` → 立即
`pix = None` 释放位图。灰度比彩色省一半内存且识别更稳。

## 🔴 资源红线（用户强制）：并行度按内存预算，不按 CPU 核数

**教训（2026-08-27）**：10 核机器开 6 进程 → 6×(300-430MB best 模型 RSS) + 6×(300dpi
彩色位图 ~43MB/页，Python worker 持有) ≈ 峰值 4GB+，叠加系统负载 → 32GB 内存耗尽 →
外置盘 I/O 卡死（写文件报 `PermissionError: Operation not permitted`，**不是权限问题，
是资源枯竭的表象**）→ 整机崩溃，iTerm2 被拖死。

**安全配置（实测崩机后重启验证）**：
- 并行度 **2**：2×tesseract 各 ~230MB，峰值 <1GB，系统内存空闲 77%+
- `nice +10`（`preexec_fn=lambda: os.nice(10)`）：前台应用/iTerm 优先，OCR 让路
- 灰度渲染 + 逐页释放位图
- 吞吐代价：~14-15 页/分钟（6 进程约 45 页/分钟但会崩机）——**慢而活 > 快而死**
- 启动后 90 秒必须查一次：`ps aux | grep tesseract`（进程数、RSS）+ `memory_pressure -Q`
- 开工前先算内存账：进程数 × (模型 RSS + 位图峰值) < 物理内存的 1/8，别只看核数

## 批量脚本骨架（断点续跑：输出文件存在且 >1KB 即跳过）

实现在 `workspace/firstpush_ocr_batch.py`（Hermes workspace，可复制改造）。要点：
- `multiprocessing.Pool(2)` + `imap_unordered`，每本书一个任务，产出 `<书名>.txt`
- 每页前缀 `【第N页】` 便于回查；<20 字计为空页；每 50 页写进度日志
- 书库级 manifest（moved/remaining JSON）：重叠删除走可逆目录 + manifest，不直接 rm

## 质量验收基线

- 中文科普印刷体（正规出版扫描）：专业术语识别正确（实测"轻子(lepton)"等物理词无误）
- 单本输出量参考：157 页 ≈ 16.7 万字（~1,060 字/页），283 页 ≈ 29 万字
- 公式/星图/示意图标注识别会打折（OCR 通病），文字正文可靠
