# 读前对账回执 使用记录（usage log）

机制首条真实使用记录。红线依据：机制存在 ≠ 机制被使用，禁预建样板货。

## 2026-10-13 · task t_eb12b4a8（worker-researcher）

**重要更正**：`verify-receipt` 子命令在本机所有 grounded-citations 副本里原本**不存在**
（上游 t_336584e9 的完成自述与磁盘矛盾，其 patch 产物无法复现）。本次使用前先补齐了
`verify_receipt_against_source()` 实现（复用 `quote_in_evidence` 匹配器，新增 ~46 行），
备份 `sources.py.bak-t_eb12b4a8`。**机制系本次补建，非上游遗留。**

- 源文件：`t_eb12b4a8_receipt/src.txt`（SoL-Pi 开源仓 docs/compatibility.md 前 11030 字节）
  - 源 sha256: `d96a2d4bcf0c3997f7cbff7d49cd8b3b2eec97726bc1eebc078f417b9c9234e4`
- 回执：`t_eb12b4a8_receipt/receipt_llm.txt`（1 结论行 + 5 引用行）
  - 回执 sha256: `23f6b2ce167c7acb61b359901cd419efca0ae0a30d9f0077fc8adfd651bfc3fe`
- 委派：ACP provider=claude, session_id=e6844407-1496-4848-b13f-e7f87eba872c（首轮超时，续跑完成）
- 机检：`verify-receipt --receipt receipt_llm.txt --source src.txt`
  - **rc=0 / lines checked=5 / receipt verified / elapsed ~0.10s**
- 拒收路径：混入篡改数字的伪造引用 → `receipt rejected` / **rc=1**（整份拒收，未只剔坏行）

### 踩到的坑（格式坑 + 工程坑）
1. **`< ` 行才是被校验行**：回执只有 `< `（小于号+空格）开头的行逐字校验；`> ` 结论行
   和其他形状全部跳过。`lines checked: 0` 也 rc=0，但是「什么都没验」，不是通过——
   空回执不算证据。格式必须严格 `< ` 开头。
2. **`< ` 后须有空格再跟原文**：`<原文`（无空格）不匹配 `^<\s+`，会被当成非引用行跳过，
   静默计入「未校验」。
3. **委派廉价模型首轮超时**：廉价模型读长文件时容易在工具循环里耗尽超时预算。
   对策：session_id 续跑 + 把任务收窄成「只写文件」，别让它边读边推理边写。
4. **路径解析**：`~/.hermes/skills/research/grounded-citations` 是指向
   `~/.hermes/hermes-agent/skills/...` 的符号链接；patch 工具 resolve 到真实路径写入，
   两处是同一文件。
5. **`.bak` 备份命名**：沿用 `sources.py.bak-<taskid>` 存到 scripts/ 同级，别覆盖上游
   声称的 `SKILL.md.bak-<date>`（该文件实际不存在，已重新核实）。

### 结论
读前对账回执机制第 1 次真实使用落痕：真实引用 5/5 逐字通过（rc=0），伪造引用整份拒收
（rc=1），源文件 sha256 存档可复现。机制可用。
