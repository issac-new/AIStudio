# AIStudio 文档索引

本目录存放设计、报告、手册与调研材料。本文件是 `docs/` 的入口，说明每类文档该放哪里、怎么命名。

## 现行入口

| 用途 | 文档 |
|---|---|
| 上手与日常使用 | [USAGE.md](USAGE.md) |
| Windows x64 排查 | [windows-x64-setup.md](windows-x64-setup.md) |
| 一页看懂产品（离线单文件） | [intro.html](intro.html) |
| 唯一设计正本 | [2026-10-23-swarmstudio-integrated-design.md](superpowers/specs/2026-10-23-swarmstudio-integrated-design.md) |
| 设计事实与容量基线（数字总账） | [2026-10-23-swarmstudio-design-ledger.md](superpowers/specs/2026-10-23-swarmstudio-design-ledger.md) |
| 文档导航（正本、附件、历史档案入口） | [2026-10-21-ncwk-unified-product-design.md](superpowers/specs/2026-10-21-ncwk-unified-product-design.md) |
| 历史 spec 全量索引 | [2026-10-21-swarmstudio-appendix-a-spec-index.md](superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md) |
| 上游吸收域单页索引 | [absorption-domain-README.md](absorption-domain-README.md) |

## 目录职责

| 路径 | 放什么 |
|---|---|
| `superpowers/specs/` | 设计正本、专题规格、实施决策档案。**新增 spec 一律落这里**，命名 `YYYY-MM-DD-<slug>.md` |
| `superpowers/plans/` | 实施计划与分步方案 |
| `superpowers/assets/` | 文档引用的截图与配图（按批次建子目录）；另有 `superpowers/specs/assets/` 是 spec 专属资产位（服务端 eval 等代码按路径引用，两者不合一） |
| `superpowers/specs/archive/` | 历史 spec 归档（不作为现行事实源；入口见附录 A） |
| `superpowers/notes/` | 版本快照与工作笔记；其中 `zcode-3123/3140/3162` 被测试与目录检查脚本按路径读取，**不可移动** |
| `reports/` | 历史报告归档位：复盘、回归、审计、安全与调研报告（2026-10-28 起） |
| `manuals/` | 面向人的手册与规范 |
| `reviews/` | 终态评审记录 |
| `upstream-analysis/` | 上游组件分析；`component-ledger.md` 已降级为历史指针，现行台账见 `team/shared/research/` |
| `wx-research-20261021-digests/` | 三公众号调研的逐篇精读笔记（语料） |
| `2026-10-02-4articles-sources/`、`2026-10-04-nine-sources-sources/` | 调研原文语料 |
| `comm-collab-v13-research.md`、`comm-collab-v14-unified-chat.md` | 协作/统一聊天专题调研（未判定是否现行入口，按规则 5 留在 `docs/` 根并在此登记；确认过期后移入 `reports/`） |

## 归档与命名规则

1. **新文档只进 `superpowers/specs/`**（带日期前缀），不再直接放在 `docs/` 根。`docs/` 根只保留本索引与现行入口。
2. **历史报告进 `reports/`**：文件名保持 `YYYY-MM-DD-<主题>.md`；同一报告的多格式产物（如 docx、pdf）与 md 同目录同批存放。
3. **历史文档里的旧路径按当时事实保留**：`reports/` 与 `specs/` 中出现的 `docs/2026-*`、`scripts/xxx` 等字样代表当时的仓内位置，不随目录调整回写。
4. **活体入口必须同步**：本文件、根 `README.md`、根 `AGENTS.md` 中指向文档的链接，在文件迁移时必须同批更新。
5. **判定不了的不搬**：来源或用途不明确的文档留在原位并在本文件登记，不按猜测归档。

## 证据与档案分轨（禁止合并）

仓内有五类「证据/档案」目录，各自服务不同契约，合并会打断可追溯性或打包边界：

| 轨 | 位置 | 契约 |
|---|---|---|
| 交付证据（本仓走查） | `evidence/` | 2026-10-28 起冻结存量截图，**禁新增二进制**（守门 `custom/__tests__/evidence-binary-freeze.test.ts`）；新截图落本地不入库 |
| 门禁框架自证 | `custom/qgate/evidence/` | qgate 子项目自己的实证材料，随该子项目打包与发布 |
| 门禁运行态 | `.qgate/` | 可再生（junit、hooks.log、cache），不入库 |
| 退役与移存补丁 | `.archived-patches/`（整族退役）、`patches/_skip-*`（升级轮移存） | 只作历史锚，inject 不消费 |
| 记录镜像 | `runtime/hermes-records/research/retired-docs/` | 脱敏同步副本，可能与现行 specs 同名，**不得按 docs 去重** |

## 2026-10-28 目录整理说明

- `docs/` 根 30 个日期前缀文件（28 篇 md 与 1 份 docx、1 份 pdf）迁入 `reports/`；`docs/` 根只余现行入口与本索引。
- 相关走查脚本同步归入 `scripts/regression/`，迁移脚本归入 `scripts/maintenance/`。历史文档正文中的旧脚本路径按上一条规则保留。
- 决策与验证记录见 [2026-10-28-repo-structure-tidy.md](superpowers/specs/2026-10-28-repo-structure-tidy.md)。
