# R35 运行时刷新（2026-09-17，用户 /goal 显式触发）

> 触发：用户 /goal 三目标指令之「自动更新 research 目录下运行时至最新稳定版本」——R31/R32/R34 同款先例（用户显式触发豁免「同日复核废止」节奏限制；本轮为 09-17 当日第二轮运行时刷新，晚于 R34 数小时）。
> 扫描面：GitHub Releases API + npm registry 全 16 行逐一实测。本轮 `swarm-yuan/research/` 克隆区缺席（前轮后已清理），未重建——版本判定以 API 通道为准；「checkout 前先过台账裁决列」纪律本轮无 checkout 动作可约束，graphify v1.0.0 异源 tag 甄别（npm 1.0.0 = 2026-04 旧异源）照旧不取。
> 结论：**1 行升基线**（ocr 1.12.4→1.12.5），15 行零稳定增量。薄轮：注记级吸收（review-methodology R35 段），无门禁增量，不改 SKILL.md，不发版。
> **预算门**：新增与瘦身对冲（R34「注记瘦身」先例沿用），认知面 303028B→**303101B ≤ 303104B**（裕量 3B），FACT_ARTIFACT_BYTES_BUDGET 未动。

## 一、升级 1 行

### ocr v1.12.4 → v1.12.5（2026-09-17 13:33 UTC 发布，viewer 重设计批）

上游 changelog 全量比对（v1.12.4...v1.12.5）：

- **Features**：①bot 自有过期 review 线程 opt-in 才处置（#567/#944）；②kimi code plugin（#1355）；③web crawler 策略标准化（#939）；④viewer 重设计六项——session detail 区块重构（#1358）、session compare 页重构（#1328/#1331）、Coverage/Token Usage 卡重构（#1346）、共享 SVG icon set（#1367）、design tokens 对齐 mockup 色板（#1365）、共享设计基座（#1338）、suggested change 缩进对齐 gutter（#1313/#1315）。
- **Fixes**：**运行中 group 内强制 --max-tokens-budget**（#1248）；增量评审重叠评论去重（#1359）；install.sh 资产下载超时（#1292）；全局 code search 结果上限（#1306）；截断 resume tail 容忍（#1312）；CRLF diff 尾随 CR 剥离（#1302）。
- **Docs/Other**：skill 安装预检查跳过常规路径（#1356）、LLM/tool span 遥测文档（#1348）、移除 MacPorts 安装通道（#1334）。

**吸收判定**：#1248 与 #567/#944 为两条主线（预算传播 / 自有产物处置同意面），注记级入 `references/review-methodology.md` R35 段；kimi plugin 登记平台面加宽；viewer 批与 docs 批无方法论原语。

## 二、零增量 15 行对账

| 运行时 | 基线 | 本轮实测 | 判定 |
|---|---|---|---|
| openspec | v1.13.1（R34） | GitHub Latest v1.13.1 | 零增量 |
| claude-code | v2.1.274（R34） | npm latest 2.1.274 | 零增量 |
| codex-cli | rust-v0.154.0（R22） | GitHub Latest rust-v0.154.0（0.155 仍全 alpha） | 零增量 |
| comet | 0.4.1（R29） | GitHub Latest 0.4.1 | 零增量 |
| GitNexus | npm 1.6.9 | GitHub v1.6.12 stable | license-risk 维持不追（R28 裁决） |
| gsd-core | v1.14.0（R28） | GitHub Latest v1.14.0 | 零增量 |
| claude-mem | v13.24.23（R26） | GitHub Latest v13.24.23；**npm 13.25.1** | npm 领先但 GitHub 未发版——oracle 以 GitHub tag 为准（R26 口径），watch 不动，13.25.1 待 GitHub 出线即核 |
| graphify | v0.9.63（R34） | GitHub Latest v0.9.63；npm 1.0.0 异源 | 零增量（异源不取） |
| superpowers | v6.3.0 | GitHub Latest v6.3.0 | 零增量 |
| gstack | v1.87.4.0（R31） | main commit subject 仍 v1.87.4.0 | 零增量 |
| ruflo | v3.42.3（R34） | GitHub Latest v3.42.3 | 零增量 |
| ECC | v2.2.1（R20） | GitHub Latest v2.2.1 | 零增量 |
| impeccable | v4.1.1（引用基线） | GitHub Latest skill-v4.3.1 | **已在案**——台账「最新版」列 R20 起即登记 4.3.1，候选级引用不升（R16 裁决沿用），非本轮增量 |
| codex-security | npm-v0.1.28（R32） | GitHub Latest npm-v0.1.28 | 零增量 |
| dsh | dsh-v0.1.5-rc.2（R24） | tags 新增 dsh-v0.1.6-alpha.1/.2 | alpha 线不取（R29 预警线延续：rc/stable 出线即深读） |

## 三、live 漂移对账

- claude：live 2.1.273（`~/.local/bin` native 通道）vs 基线 2.1.274——滞后 1 patch，native 自升级未及，合法 I2（R17 downloads.claude.ai 被墙先例同款口径）。
- codex：live 0.154.0 = 基线，零漂移。

## 四、账务

- 台账 `docs/upstream-baseline.md`：ocr 行三列更新（基线 v1.12.5 / 最新列 R35 核 / 状态列 R35 摘要）+ 重核口径注 R35 段（插 R34 注后）。
- references：`review-methodology.md` +R35 段，同文件八处旧注记瘦身对冲（R20/R22/R24/R26/R27/R29/R32 冗语压缩 + impeccable 4.2.1 行收紧），认知面 303028→303101B（预算 303104B，裕量 3B）——未动 FACT_ARTIFACT_BYTES_BUDGET。
- 池：docs-only 轻刷（cp 变更 references 文件进 `~/.cc-switch/skills/swarm-yuan` + marker 更新），不跑 install.sh。
