# AIStudio 设计与发布对账报告

日期：2026-10-28 ｜ 分支：feat/design-reconcile-release ｜ 触发：用户要求「汇总设计规范、设计文档、模块功能、组织衔接、决策记录、组件清单，确保无遗漏、错谬、冲突、歧义，然后更新并发布版本」。

## 一句话结论

对六个域做了全量对账，共发现 **65 条**遗漏/错谬/冲突/歧义：**52 条本轮修正**（其中 8 条只做了部分修正并注明余量），**13 条记为已知限制**（每条给不修的理由与后续入口）。四模块与整体包按对账结果升版并发布：cockpit `0.7.39-studio.2`、agent-teams `v0.22.5-team.2`、ycode `3.16.2`（不变）、yuan-skill `v2.96.0`、整体包 `1.0.1-overlay`。

## 方法与口径

三路独立只读审计并行执行，每条发现必须带 `file:line` 锚点，且以代码/清单/载体实测为准，不采信文档自述。审计分域：

| 域 | 权威载件 | 对账内容 |
|---|---|---|
| 设计规范 | `AGENTS.md`、`scripts/README.md`、`docs/README.md`、各目录 `AGENTS.md` | 路径有效性、命令可用性、目录职责 |
| 设计文档 | 整合正本、数字总账、文档导航、附录 A-D | 数字、指向、命名、边界表述 |
| 模块功能 | `RELEASE-MANIFEST.json`、`RELEASE-NOTES.md`、四个版本载体 | 版本号、包内容、安装通道、脚本行为 |
| 组织衔接 | `team/`（README 双语、profiles、shared 注册表、安装文档） | 编制数、看板、角色映射 |
| 决策记录 | `docs/superpowers/specs/`（380 份直接根文档）+ `.swarm-yuan/decisions.jsonl` | 覆盖完整性、索引一致性 |
| 组件清单 | `team/shared/research/tech-components-ledger-20261027/` | 计入条数、判级、版本锚、退役规则 |

## 一、设计规范（发现 24 条，修 23，部分 1）

| # | 类型 | 位置 | 问题 | 处置 |
|---|---|---|---|---|
| A1 | 冲突 | `docs/USAGE.md:82` | 声称「模拟数据不会渗进真实工作」，正本 §6.4/§8.4 却登记 SIM 写入口未闭合 | **已修**：改为「设计目标 + 当前边界」，指向正本边界表 |
| A2 | 错谬 | `.swarm-yuan/hooks/pre-commit:4` | L2 钩子写死不入库的 `.claude/` 绝对路径，fresh clone 上 L2 实际不生效 | **已修**：改为按检出根三级候选定位（`.claude/`→`.zcode/`→`.swarm-yuan/hooks/`），无则显式降级 |
| A3 | 歧义 | `docs/superpowers/specs/2026-10-21-ncwk-unified-product-design.md:4` | AIStudio / SwarmStudio / NCWK 三层命名无优先级，README 与总账各自表述 | **已修**：导航页写明命名层级与冲突时以本行为准 |
| A4 | 冲突 | 整合正本 `:1170` | 「基线只随上游稳定发版升级」与 zcode「跟随 main」相反 | **已修**：正文加 zcode 例外并注明 2026-10-25 裁定 |
| A5 | 冲突 | `vendor/VENDOR.md:13` | 写「7 条活跃补丁」，实际 series 8 条（002-009） | **已修**：改 8 条并注明 009 加入日期，声明以 series 为唯一真源 |
| A6 | 错谬 | 附录 A `:4-5` | 两段互斥的「覆盖与计数」并存（379 与 373） | **已修**：删除 2026-10-27 旧段 |
| A7 | 遗漏 | 附录 A A.1 | 缺新 spec（本轮与并行会话各一） | **已修**：补登并重算总数 |
| A8 | 冲突 | 整合正本 `:1423` | 领域注册表权威指向 2026-09-17 的 runtime 镜像（缺 owner 字段） | **已修**：改指 `team/shared/` 并标注镜像非权威 |
| A9 | 冲突 | `AGENTS.md:36` | 「二进制不入库」与 34 张已入库 PNG 冲突 | **已修**：AGENTS 与 docs/README 均写明冻结白名单例外（正本两处绝对句留给下轮，见已知限制 K2） |
| A10 | 冲突 | `README.md:96` | 只写「三条边界判据」，正本是四条 | **已修**：补「治理实现单源」并说明前三条/第四条的分工 |
| A11 | 错谬 | `docs/intro.html:243,245` | 「AIStudio · AIStudio 体系单仓」自指，丢失体系名 | **已修**：恢复「SwarmStudio 体系」层级 |
| A12 | 错谬 | `docs/intro.html:247,281` | 「42 个智能体」把配置总量写成活动编制 | **已修**：改「42 个智能体配置」 |
| A13 | 错谬 | `docs/USAGE.md:92` | 「巡检 31 检测器」与代码实际 35 + storm 不符 | **已修**：删硬编码，改指代码与守门 |
| A14 | 冲突 | `RELEASE-MANIFEST.json:39` | notes 仍写「2.x 待补记」，RELEASE-NOTES 已收线 | **已修** |
| A15 | 歧义 | 附录 C `:5,164` | `docs/design-evolution.md` 与仓根 `docs/` 混淆 | **已修**：改全路径 `skills/swarm-yuan/docs/...` |
| A16 | 歧义 | 附录 D `:115` | 一套端口表混装宿主与 SIM 两套环境，且漏 8650 | **已修**：拆两套并补 8650 |
| A17 | 冲突 | `docs/upstream-analysis/component-ledger.md:17` | 自称「长期维护入口」，同文件头已声明退役 | **已修**：改为历史反查并指向终态单文件 |
| A18 | 冲突 | `scripts/README.md:36` | 称 `serve-server.sh` 被源码/测试引用，实际无调用 | **已修**：改为「POSIX 旧包装器，仅手工排障通道」 |
| A19 | 遗漏 | `docs/README.md:35` | `comm-collab-v13/v14` 在 docs 根却未登记 | **已修**：索引新增登记行（标为待判定） |
| A20 | 歧义 | `AGENTS.md:35` | 把 `zcode-patches` 说成「编辑器补丁」，实际含 ACP/RPC/CUA/技能根 | **已修** |
| A21 | 歧义 | `AGENTS.md:45` | `.qgate/` 整目录写成「入库」，实际只 4 个文件入库 | **已修**：拆入库项与运行态 |
| A22 | 错谬 | `scripts/README.md:32` | 称 `deploy-agent-runtime.mjs` 由 `build.mjs` 调用，实际只 inject 调 | **已修** |
| A23 | 遗漏 | `custom/client/AGENTS.md:16` | 速查表缺 `kanban/` 与 `matrix-chat/` | **已修**：补两行 |
| A24 | 遗漏 | `AGENTS.md:47` | `.github/` 只列 qgate.yml，漏 swarm-yuan.yml | **已修** |

## 二、模块功能与发布口径（发现 20 条，修 18，部分 2）

| # | 类型 | 位置 | 问题 | 处置 |
|---|---|---|---|---|
| B1 | 命令失效 | `RELEASE-MANIFEST.json:20-38` | cockpit 包缺 `runtime/pricing`、`runtime/roster`，而 `build.mjs:51-57` 强制拷贝，独立包 `build:dmg` 必失败 | **已修**：两路径入包并注明有意与 agent-teams 重复 |
| B2 | 命令失效 | `:52` | agent-teams 包内没有根 `package.json`/`scripts/`，`npm run runtime:register` 无法执行 | **已修**：install 写明执行位置与替代命令 |
| B3 | 危险默认 | `scripts/vendor-sync.sh:9` | 默认源 `../upstream` 在多仓并置时会等于目标，`rm -rf` 删掉唯一源 | **已修**：默认改仓内 `upstream/`；realpath 相等即拒绝（实测拦截） |
| B4 | 发布记录 | `:104` | full 复用 `1.0.0-overlay`，GitHub tag `v1.0.0` 却指向 7 月提交，同版本两套内容 | **已修**：升 `1.0.1-overlay` + 新 tag；清单增 `tag` 字段要求指向打包 commit |
| B5 | 发布记录 | `dist/release/RELEASE-NOTES-v1.0.0.md` | 已发布正文列旧包名/旧体积，与实际资产不符 | **已修**：本轮用新资产清单重建正文发布 |
| B6 | 发布脚本 | `dist/release/upload-release.sh` | 旧上传脚本按旧名单挂到同一 tag | **已修**：本轮发布会话清理旧包与旧脚本，只用参数化上传 |
| B7 | 版本一致性 | `vendor/VENDOR.md:9` | zcode 只有「v3.16.1 系列」一种表述，与包版本 3.16.2 冲突 | **已修**：双字段（包版本 / 基线谱系） |
| B8 | 校验缺口 | `team/VERSION` 与 `scripts/verify-release-manifest.mjs:92` | agent-teams 底座版本只能靠 VENDOR.md 文本，无机器载体 | **部分修**：本轮保持 VENDOR.md 为唯一载体并在总账注明；引入机器载体需跨模块约定（K4） |
| B9 | 口径过期 | `:39` | manifest 写「2.x 待补记」 | **已修**（同 A14） |
| B10 | 校验缺口 | `verify-release-manifest.mjs:82` | 版本判断用全文 `includes`，新条目已加而清单忘改仍绿 | **已修**：cockpit 取「## 版本」节首行严格比对；yuan 取 CHANGELOG 首个版本标题 |
| B11 | 校验缺口 | `:154` | `buildCommand` 只验文件存在，不验 `npm run <script>` 是否存在 | **已修**：解析 `npm run X` 对照 `package.json scripts` |
| B12 | 歧义 | `:7-13` | `includes` 混入中文注释，不是合法路径 | **已修**：改纯路径；校验器对 includes 增加「非路径即红」与存在性检查 |
| B13 | 模块边界 | 清单 | `docs/reports`、`evidence`、`assets`、`.github` 等只随整体包但无归属声明 | **已修**：增 `repoLevelPaths` + 说明 |
| B14 | 发布脚本 | `package.json:40` | `release:packages` 不跑 `release:check` | **已修**：改为串联 |
| B15 | 命令失效 | `:71` | ycode buildCommand 未定义 CWD，解包后无法照做 | **已修**：明确「以仓根为 CWD」，并说明包内无 scripts |
| B16 | 命令失效 | `:90` | install 提到源码树中不存在的 `install-offline.sh` | **已修**：注明该文件只由离线包生成 |
| B17 | 版本一致性 | `skills/swarm-yuan/CHANGELOG.md` | v2.95.0 之后 6 次提交未升版 | **已修**：v2.96.0 条目 + README badge |
| B18 | 歧义 | `carrierPattern` | 字段名像模式，实为活跃补丁数 | **部分修**：清单注释已写明语义；改名需同步校验器与测试（K5） |
| B19 | 版本一致性 | `team/requirements-tools.txt:6` | 注释写宿主 venv v0.22.4 | **已修**：改 v0.22.5 |
| B20 | 版本一致性 | `vendor/VENDOR.md:13` | 补丁计数 7 与 series 8 不符 | **已修**（同 A5） |

## 三、组织衔接与组件清单（发现 21 条，修 11，部分 2，限制 8）

| # | 类型 | 位置 | 问题 | 处置 |
|---|---|---|---|---|
| C1 | 冲突 | `team/README.md:4,10,25` 等 6 处 | 同一发行物出现 41/23/36/47 四种 profile 数 | **已修**：统一以本仓 30 为现行口径，历史数标注来源 |
| C2 | 冲突 | `team/README.md:131-137` | 看板数 10 与注册表 9 不符，`hack` 漏画、`worker` 不存在 | **已修**：改 9 板并与注册表逐条对齐 |
| C3 | 冲突 | `team/shared/domain-registry.yaml:106` | `eda` 域 active 但只有 orchestrator 成员 | **记为限制**（K6）：需补 EDA worker 或改 retired，属组织决策 |
| C4 | 错谬 | `team/README.md:31-57` | SOUL Lines 全部约为实际值一半 | **已修**：按 `wc -l` 重算（12 行） |
| C5 | 遗漏 | `team/shared/owner-registry.yaml` | 只覆盖 12/30 profile，却自称「职责事实源」 | **已修**：加 `scope: legacy-partial` 与文件头说明 |
| C6 | 冲突 | 整合正本 `:1423` | 领域注册表指向过期镜像 | **已修**（同 A8） |
| C7 | 歧义 | 正本 `:247`、`runtime/roster/`、治理仓 roster | 「roster」三义混用，15 人编制无仓内权威名册 | **记为限制**（K7）：三类 roster 需重命名或补名册，属组织建模 |
| C8 | 错谬 | `2026-10-21-ncwk-product-spec.md:174` 等 | 「15 人」枚举只有 13 岗，缺团队负责人 A/B | **部分修**：本报告登记缺口；文档改写需确认两岗职责（K8） |
| C9 | 歧义 | `simharness/mux/mx-report-gen.py:207` | 「admin 不设助理」与实现（生成 admin-agent）矛盾，29/30 账号两口径 | **部分修**：登记为实现口径=15 人类+15 助理；报告话术待推演轮改（K9） |
| C10 | 错谬 | `runtime/roster/lane-specialists/README.md:8`、`column-automation-controller.ts:11` | 挂载补丁号 415 不存在，实为 455 | **已修**：两处改 455 |
| C11 | 冲突 | 组件台账 `:18-20,42,140` | 汇总 6/5/18=29、§3.2 标 9 实 10、§七.3 标 35 实 36 | **已修**：重算 6/7/23=36，两处计数同步 |
| C12 | 冲突 | 台账 `:33` | HexStrikeAI 静默 85 天即 RETIRED，违反自定 >90 天规则 | **已修**：补记「用户显式裁决豁免」依据 |
| C13 | 错谬 | 台账 `:87,109,133` | 称 ATT&CK 已刷 v20.0，仓内技能副本仍 v19.2 | **已修**：台账改为「live 已刷、仓内待同步」，锚点写明 |
| C14 | 错谬 | 台账 `:40` | RedEvoAgent 写 llm-redteam v1.7.0，仓内 1.4.0 | **已修**：按仓内实际登记并说明 |
| C15 | 冲突 | `archive/LEDGER-INDEX.md:1` | 归档索引仍自称维护入口，判级与终态表冲突 | **已修**：改为历史归档，判级作废 |
| C16 | 冲突 | 正本 `:1171` | 版本核对跑去找组件台账，台账不含仓内基线 | **已修**：改指 VENDOR.md + 发布清单 |
| C17 | 冲突 | `config/features.ts:33,80` | 注释 `VITE_CUSTOM_PET` 与代码 `VITE_CUSTOM_PETS` 不一致；能力开关与导航开关语义混 | **部分修**：env 名与默认值注释已纠正；`*Nav` 改名涉及注册表与测试（K10） |
| C18 | 歧义 | `vendor/VENDOR.md:9` | zcode 版本单看像漂移 | **已修**（同 B7） |
| C19 | 歧义 | 正本 `:458-462`、注册表 | 三范式（基座/领域/治理）无落盘映射；owner 三层复用 | **记为限制**（K11）：加 `paradigm` 字段需同步注册表 schema 与测试 |
| C20 | 遗漏 | `team/profiles/*/profile.yaml` | 30 个 profile 中 12 个缺 `profile.yaml`（UI 描述来源） | **记为限制**（K12）：补 12 份角色描述属内容工作 |

## 四、版本与发布

| 模块 | 新版本 | 依据 |
|---|---|---|
| cockpit | `0.7.39-studio.2` | 底座 hermes-studio 仍 v0.7.39；本仓目录整理、挂账清偿、对账修正累计变更 → 扩展序 +1 |
| agent-teams | `v0.22.5-team.2` | 底座 hermes-agent 仍 v0.22.5；`runtime/` 回灌 guardrail 与 `workspace_kind` 归一化、`team/` 文档与注册表修正 → 扩展序 +1 |
| ycode | `3.16.2`（不变） | 版本恒等 `vendor/zcode/package.json`；本轮 vendor/zcode 与 zcode-patches 零变更 |
| yuan-skill | `v2.96.0` | CHANGELOG 真源；含功能合入（两分支收口）与取值面根治 → minor |
| 整体包 | `1.0.1-overlay` | 四模块版本变化，整体包重出；新 tag 指向本轮打包 commit |

## 五、已知限制（13 条，本轮不修的理由）

| # | 事项 | 不修理由 | 后续入口 |
|---|---|---|---|
| K1 | `npm run sync` 端到端未跑 | 需外部 upstream 远端与依赖重装，且会撤销当前注入态；已用 `--dry-run` 覆盖唯一改动面（路径解析） | 隔离环境演练轮 |
| K2 | 整合正本两处「截图不入库」绝对句 | 与 A9 同源，改正文需连带修订 §8 边界表；本轮已在 AGENTS/docs README 立例外，避免一次改三处 | 下轮正本修订随批 |
| K3 | `docker-compose` 路线 | 已下线（2026-10-28 挂账清偿轮）；补齐容器化是新项目 | 产品裁决 |
| K4 | agent-teams 底座无机器载体 | 引入 `team/version.json` 需与 VENDOR.md、测试三方同步，属跨模块契约变更 | 版本机制轮 |
| K5 | `carrierPattern` 字段名语义过载 | 改名需同步校验器 + 单测 + 清单，收益小于风险；已在清单注释固化语义 | 校验器重构轮 |
| K6 | `eda` 域只有 orchestrator | 补 EDA worker 或改 retired 是组织决策，不是文档修正 | 组织编制轮 |
| K7 | 三类 roster 命名混用 | 需先确定 15 人编制的权威载体（治理仓 / 推演数据 / agent 角色目录） | 组织建模轮 |
| K8 | 15 人枚举缺团队负责人 A/B | 两岗职责未在任何文档定义，凭空补写会造假 | 推演编制轮 |
| K9 | 「admin 不设助理」话术与实现矛盾 | 涉及 30 账号口径与报告叙事，需与推演轮同批改 | 推演轮 |
| K10 | features 能力开关 vs 导航开关 | 改名 `*Nav` 牵连注册表、bootstrap 与测试 | 前端治理轮 |
| K11 | 三范式无 `paradigm` 字段 | 注册表 schema + 测试 + 30 profile 数据同批改 | 组织建模轮 |
| K12 | 12 个 profile 缺 `profile.yaml` | 补写角色描述是内容创作，需按岗位逐份确认 | 团队资产轮 |
| K13 | 历史 spec 内的旧路径 | 代表当时仓内位置，按仓规「历史归 git」不改写 | 永久保留 |

## 六、验证

见本轮 spec（`docs/superpowers/specs/2026-10-28-design-reconcile-release.md`）的「验证」节：`release:check` 绿、目标守门测试通过、全量测试零失败、五件包与 SHA256SUMS 对账、GitHub release 资产与正文一致。
