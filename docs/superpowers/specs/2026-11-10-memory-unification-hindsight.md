# 记忆统一：Hermes 单链＋Hindsight 唯一 provider（2026-11-10）

> 挂靠批：执行父 spec `2026-11-10-execution-kernel-unification.md`（下称父 spec）D1 裁决的记忆维度。
> 回答的问题：Ekko 与 Hermes 各自的记忆模块能否统一在 Hindsight 中。答案：能，且 Hermes 侧已经在生产统一——本批立法收口，剩余工作是 Ekko 双记忆面的退役与存量迁移。

## 变更

### 1. 现状定谳：长期记忆面有三处，加一处不同定位的文件记忆（2026-11-10 源码级实测）

| 记忆面 | 宿主 | 存储 | 检索/质控 | 实测锚点 |
|---|---|---|---|---|
| Hermes MemoryProvider 链 | hermes-agent（Python gateway） | 外部服务（provider 决定） | provider 各自实现 | `vendor/hermes-agent/agent/memory_provider.py:84`（ABC 契约）；`agent/memory_manager.py:277-279`（**一次只允许激活一个外部 provider**，第二个被拒） |
| Ekko runtime 记忆 | ekko-agent（studio 内嵌 TS 运行时） | 本地 SQLite `.ekko/ekko.db`（memory_nodes＋FTS5＋embeddings 表） | 20 种 kind 类型卡＋active/superseded/expired 状态机；JEV 写审/重排/路由（LLM 判＋置信度阈值） | `vendor/hermes-studio/packages/ekko-agent/src/memory/types.ts:1-35`；`store.ts:15-77`；`jev/config.ts:1-25`；工具面 `tools.ts:23-33` |
| Person 数字人记忆 | studio server（Person 入口） | 每账号 SQLite `webUiHome/person/<userId>/memory.db` | 复用 ekko MemoryService 全套 | `vendor/hermes-studio/packages/server/src/modules/studio/services/person/memory.ts:19-30` |
| 工作区文件记忆（**不入统一面**） | client 查看器 | `AGENTS.md`/`MEMORY.md`/`memory/` 目录纯文本 | 人工编辑；只读浏览＋memorytax 分类 | `custom/client/ide/views/IdeMemoryPane.vue:2-3` |

链上 provider 共三家：bundled 的 retaindb（云 API＋SQLite write-behind，`plugins/memory/retaindb/__init__.py:1-7`）与 byterover（brv CLI），用户目录的 hindsight（`team/profiles/*/plugins/hindsight/__init__.py`，1634 行）。

**Hermes 侧已在生产统一**：team 部署 31 个 profile 目录中 30 个实 profile 全部 `memory.provider: hindsight`（各 `config.yaml:52-54`，唯一缺席是 `_shared` 模板）；运行模式 `local_external` 单守护 `http://localhost:8888`（`team/profiles/product-manager/hindsight/config.json:2-3`）；bank 按「机器 MAC-profile」分区（`hermes-b24d7ac5d9c4-product`，`team/shared/setup-hindsight-banks.py` 自动检测 MAC 写入各 profile config.json）——记忆内容不出本机，跨机器天然隔离。

Hindsight provider 能力面（对齐 Ekko 场景）：自动 retain 每回合（单写者队列＋append 水位线，`__init__.py:1395-1460`）、自动 recall 预取注入、显式工具 retain/recall/reflect（`:238-293`）、跨会话去重（update_mode=append＋服务端 observation 合并层）、bank 模板＋别名折叠＋scoped secret 三重 profile 隔离（`:1008-1045`）。

### 2. 目标架构

长期记忆唯一通道＝Hermes MemoryProvider 链，链上唯一 provider＝Hindsight（local_external 单守护）。Ekko 双记忆面随父 spec P3（Ekko 下线）退役，存量经一次性脚本迁入 Hindsight bank。工作区文件记忆保持独立定位。

数字总账：长期记忆面 3→1；provider 三选一定谳（retaindb/byterover 保持 vendor 上游自带、不启用不删）。

### 3. 分阶段

**M0 立法（本批，零行为变化）**
- 本 spec＋三处登记（附录 A／design index／scope.yaml）＋decisions 落账＋DESIGN.md 同批修订。
- 退出条件：docs 门禁绿；不触碰任何运行态配置。

**M1 Ekko 存量迁移（一次性脚本，独立于父 spec 进度可先行）**
- 新增迁移脚本（落 `scripts/`，按仓库机制预算规则登记 sunset：迁移验收后退役）：读 `.ekko/ekko.db` 与 `webUiHome/person/*/memory.db` 的 memory_nodes → `aretain_batch` 写入本机 :8888 的迁移专用 bank（默认 `hermes-<MAC>-studio-legacy`，与 team 30 个 profile bank 隔离，便于溯源与整体回滚）。
- 映射规则：kind→tags（`ekko:<kind>`）＋origin 标注；状态只迁 active（superseded/expired 是 Ekko 状态机语义，Hindsight observation 层自会合并去重，不迁移避免双写污染）。
- 判据：dry-run 对账报告（源节点数/状态分布/kind 分布 vs 目标写入条数）→ 执行 → recall 抽查 N 条可命中。
- 前置核验（实施前复核）：本机 :8888 daemon 存活性与归属（launchd/手工）；两处 DB 实际数据量级。
- **实施判定（2026-11-10 回填）：空集收口，脚本不建**——前置核验实测源库零数据，详见 §验证实施进度；MD7 随之失效（无脚本可登记机制预算）。

**M2 随父 spec P3 断装配（不新增独立工作）**
- 父 spec §5 下线清单已含 Ekko `AgentRuntime` 装配点（`chat-run.ts:2070`、群聊映射、工作流／**Person 入口**）——两处 Ekko 记忆面随之不可达。
- 本 spec 给父 spec P3 退出条件补一条记忆维度验收：Ekko 记忆面不可达后，无进程再写 `.ekko/ekko.db` 与 `person/*/memory.db`（文件 mtime/句柄核查）；迁移已完成或用户明示弃置。

### 4. 能力等价与降级清单（验收装置）

| Ekko 记忆能力 | Hindsight 侧对应 | 裁定 |
|---|---|---|
| 自动每回合 retain | auto_retain＋单写者队列 | 等价 |
| 相关性召回＋注入 | auto_recall 预取＋hybrid 注入 | 等价（检索更强：语义＋关键词＋实体图＋重排 vs FTS＋打分） |
| 显式记忆工具 | hindsight_retain/recall/reflect | 等价 |
| 20 kind 类型卡 | tags 映射（`ekko:<kind>`） | **降级**：失去类型化 schema 约束，检索按 tag 过滤 |
| supersede/expire 状态机 | observation 合并层自动去重 | **降级**：显式失效改隐式合并，无「过期」语义 |
| JEV 写审/重排/路由（LLM 质控） | 服务端抽取合并（无独立写审门） | **降级**：写入质量门由 Hindsight 抽取质量替代 |
| 本地零依赖 SQLite | local_external 守护（:8888，PG 后端） | 等价性成立的前提＝该守护常驻；M1 前置核验必做 |

三项降级经用户本批批准接受（「推进吧」指令）；若后续观测到写入质量退化，回滚面＝迁回 Ekko 记忆不可行（已退役），补救面＝Hindsight bank_retain_mission 自定义抽取提示词（`team/profiles/product-manager/plugins/hindsight/__init__.py:568-569` 已有配置口）。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| MD1 | 长期记忆唯一通道＝Hermes MemoryProvider 链 | 父 spec D1 已裁决 Hermes 唯一记忆所有者；`docs/DESIGN.md:782`「不得另起绕过 gateway 的执行链」 | Ekko 侧新建 Hindsight TS 客户端（否决：为退役运行时写弃子代码，制造第二条通道） |
| MD2 | 链上唯一 provider＝Hindsight | team 30/30 已部署运行（既成事实立法防回退）；三重 profile 隔离唯一完整；能力覆盖 Ekko 全场景 | retaindb（否决：云 API 记忆出本地＋无 bank 模板）；byterover（否决：外置 CLI 依赖＋分层检索弱） |
| MD3 | 运行模式定谳 local_external 单守护 :8888；cloud 模式禁用于 team fleet | 记忆内容不出本机（敏感材料本地处理红线）；现状即此模式 | cloud（否决：新增 vectorize.io 第三方出口）；local_embedded（否决：每 home 起 PG＋嵌入模型 ~958MB，30 profile 不可扩展；单守护已覆盖） |
| MD4 | Ekko 双记忆面不双写、不桥接，随父 spec P3 退役；M1 一次性迁移 | 双写违反单写者原则（父 spec D5 同构）；Person 入口已在父 spec §5 下线清单 | 过渡期桥接层（否决：P3 前窗口短，桥接成本＞迁移成本） |
| MD5 | 三项能力降级（类型卡/状态机/JEV 写审）接受，映射规则如 §4 | 统一后检索与去重能力净增；降级面有补救配置口 | 保 JEV 语义在 Hindsight 前置复刻（否决：改 vendor 插件面，维护负担留在钉版基线外） |
| MD6 | 工作区文件记忆（AGENTS.md/MEMORY.md/memory 目录）不入统一面 | 定位不同：人可编辑的工作区上下文 vs 跨会话自动长期记忆；与 ZCode 家族 MEMORY.md 模式对齐 | 一并迁入（否决：破坏人可读可编辑性，且该面无跨会话召回诉求） |
| MD7 | M1 迁移脚本入机制预算登记 sunset（迁移验收后退役） | 仓库规则：新增脚本必须配退役条件 | 常驻脚本（否决：一次性工具常驻＝机制通胀） |
| MD8 | M1 空集收口（2026-11-10 实测改判）：迁移脚本不建、机制预算不登记 | 前置核验实测：4 个源库 memory_nodes 与 memory_messages 全 0 行（证据见实施进度）；为零行数据建一次性脚本＝机制通胀 | 照建脚本迁 0 行（否决：无验收对象，纯机制噪音）；等 P3 连库弃置（否决：核验已做完，判定即收口） |

以上落 `.swarm-yuan/decisions.jsonl` 一条总账（MD2/MD3 属架构级）；MD8 判定随批追加一条。

## 验证

### 1. M0 本批
`npx vitest run <docs 门禁相关测试>` 绿；`node scripts/governance-lint.mjs` 通过；`node scripts/merge-invariants.mjs --check` 通过；附录 A 标题计数 607→608 同步。

### 2. M1 迁移
~~dry-run 对账报告数字吻合~~（空集收口，判据不适用）；核验证据见 §5 实施进度。

### 3. M2 随父 spec P3
父 spec §6 P3 退出条件全过＋本 spec §3 M2 记忆维度验收项（「迁移已完成」由 M1 空集判定平凡满足——0 行无可迁）。

### 4. 实施前须复核的锚点
- 本 spec 现状读数为 2026-11-10 主树源码级静态核对（子代理配额受限，全部由主会话直读完成）。
- ~~未采集~~ 三项已全部采集（2026-11-10，见 §5）。

### 5. 实施进度（随批回填）

- **M0 已落地（2026-11-10，main 70aefd3f7）**：spec＋DESIGN.md 三处＋三处登记＋decisions 总账；门禁 docs-ssot-guard 7/7、taxonomy 6/6、governance-lint 0、merge-invariants pass、pre-push ok=5 fail=0。
- **M1 已空集收口（2026-11-10，本批回填）**：三项前置核验全部完成，实测证据——
  1. `:8888` daemon 存活（`GET /version` → api_version 0.8.2，features 含 observations/append 所需能力）；归属＝uv-tool `~/.hermes/uv-tools/hindsight-api-slim`（外部托管单守护，非 launchd、非 per-profile embedded），cwd=`~/.hermes/profiles/orchestrator/hindsight`。
  2. 源库量级：`~/.hermes-web-ui/.ekko/ekko.db`（136K）＋`person/{1,2,3}/memory.db`（各 104K）共 4 库，`memory_nodes` 与 `memory_messages` **全部 0 行**（SQLite 只读 URI 实测；另有 stray 空文件 `~/.hermes-web-ui/ekko.db` 零表）——Ekko 记忆面接线在位但从未积累数据，无任何可迁移内容。
  3. SIM fleet：`SIM_ROOT/hermes/profiles` 42/42 config.yaml 全配 `provider: hindsight`，与 team 30/30 同口径，记忆统一覆盖面＝72/72，无差异清单。
  - 判定：MD8 空集收口，脚本不建、机制预算不登记；M2 的「迁移已完成」由本判定平凡满足。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md` §4.2 执行面统一契约段（:785 后）：补记忆统一口径一行（Hindsight 唯一 provider、Ekko 记忆面随 P3 退役），随本批修订。
- `docs/DESIGN.md` §4.8（:1194-1197）：记忆三层表述补「团队长期记忆（Hindsight）＝唯一长期记忆通道，Ekko 双记忆面随执行内核统一 P3 退役」，随本批修订。
- `docs/DESIGN.md` 数字总账表「长期记忆」行（:1577）：补 M1/M2 计划锚，口径保持「未验证」不提前记账，随本批修订。
- 待登记（本批执行）：`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md` 附录 A（标题计数 607→608）；`docs/manuals/aistudio-design-document-index.md`；`.qgate/scope.yaml`；`.swarm-yuan/decisions.jsonl` 一条。

## 不做的事

- 不在本批改任何运行态配置（team profile 的 hindsight config.json 一行不动——立法基于既成部署态）。
- 不删 retaindb/byterover（vendor 上游自带，退出方式是「不启用」）。
- 不为过渡期写 Ekko→Hindsight TS 客户端或桥接层（MD1/MD4）。
- 不动工作区文件记忆（MD6）。
- M1 不等父 spec P0/P1 进度——迁移与内核统一正交，可并行；但 M2 严格挂 P3。
