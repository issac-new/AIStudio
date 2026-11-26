# 2026-11-26 ModelScope 补发 full 包（双通道口径变更）

> 状态：已收口（2026-11-26）。用户裁决原话「modelscope也要发full包」。这是对 N34-11（ModelScope 发布口径四方不一致，2026-11-24 曾按「只传 everything」对齐）的再收敛：自本裁决起 ModelScope 每版补发整体源码包，双通道同件。

写给谁看：本仓 AI 会话与后续接手者，用来判断 ModelScope 通道每版该传什么、本版补发的凭证在哪。

## 变更

1. **口径变更**：ModelScope `swarm-yuan/` 目录每版放三件——everything 离线包、整体源码包、单条 `SHA256SUMS-v<版本>.txt`（此前 1.0.17～1.0.20 只传后两件中的 everything＋SUMS，full 只走 GitHub）。`aistudio/` 目录 1.0.15/1.0.16 历史件维持不更新。
2. **v1.0.21 补发**：`aistudio-full-1.0.21-overlay-src.tar.gz`（347,540,372 字节，sha256 `8f2c82c9ff8bbfa6…`）入本地 ModelScope 仓 `swarm-yuan/`，提交 `61ed4ce`（LFS 通道），推送 master 成功（`6aca259..61ed4ce`，远端扫描 hook 完成）。
3. **政策载体同步**：`docs/DESIGN.md` §5.5（ModelScope 段改三件）；`RELEASE-MANIFEST.json` 的 `packaging.artifactDistribution`（分工条款改双通道同件）与 `releaseBatches` v1.0.21 note（补发记录）；发版规格（`2026-11-26-release-v1.0.21-overlay.md`）发布后补记；数字总账 2026-11-26 核对段；N34-11 状态再收敛（`2026-11-24-zcode-400-pending-batch.md`，该文件声明 DESIGN_SYNC: none）。`docs/manuals/aistudio-operations-reference.md` 分发段原文即写「双通道都发布 full 与 everything」，本裁决后转为准，无需修改。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | ModelScope 每版补发整体源码包，双通道同件 | 用户明示「modelscope也要发full包」；v1.0.16 及更早本就双件在 MS，1.0.17 起收窄为单件，本次回到并立法固化 | 维持单件（否决：用户明示） |
| D2 | 只补发本版，不回补 1.0.17～1.0.20 的 full | 旧版本资产仍可从 GitHub Release 获取；回补属额外上传量无新增可达性 | 回补历史版本（否决：无用户指示，成本无收益） |

## 验证

1. 推送：`6aca259..61ed4ce master -> master`，远端 scan hook 完成。【已过】
2. 远端回验：models 端点下载 full 包 347MB，SHA-256 与本地及 GitHub 资产同值（`8f2c82c9ff8bbfa6…`）并逐字节 cmp 相同。【已过：下载回验完成】

## 设计文档影响

DESIGN_SYNC: touched
DESIGN_DOCS: docs/DESIGN.md

- `docs/DESIGN.md` §5.5「发布与版本」ModelScope 段：由「只更新 swarm-yuan/（everything＋SUMS），full 只在 GitHub」改为「swarm-yuan/ 放 everything＋整体源码包＋SUMS 三件」，注明 2026-11-26 用户裁决与 N34-11 收敛（本批同批修订）。
- 其余设计文档不触及；发布清单 `artifactDistribution` 属清单载体随批（非设计文档）。
