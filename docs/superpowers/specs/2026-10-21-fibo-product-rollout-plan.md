# FIBO 产品化落地方案：从本体页签走向全产品语义底座

- 日期：2026-10-21
- 分支：`feat/fibo-product-rollout`
- 基线：集成 main（37 概念映射层）与 origin/main（qgate 37 概念索引）后的 `1303328f`
- 触发：用户要求根据 FIBO 调研结果制定全面落地方案，并完善到 SwarmStudio 产品

## 结论

FIBO 的数据层已经够用。下一步的价值不在继续扩包，而在三个产品消费面。治理面看到覆盖度，IDE 与 agent 能查术语，门禁与报告使用同一套 IRI。本方案分四阶段推进。P0 到 P4 已在本分支落地。

P0 四项：治理语义体检的 FIBO 覆盖卡、agent 术语查询端点、IDE `@fibo` 提及、qgate 索引与 37 概念包的一致性守门。四项都不改 FIBO 页签与 `ontology-fibo.ts`，避开并行会话正在做的官方参照内容。

## 现状盘点

| 产品面 | 现状 | 缺口 | 阶段 |
|---|---|---|---|
| 本体工作台 | 37 概念映射包、增量导入、三格式导出 | 官方域导航与场景参照由并行会话补齐 | 并行 |
| 治理语义体检 | P0 覆盖卡：发布版本、已导入/总数、来源分档、导入按钮 | 报告级覆盖证据 | P0 已落地 |
| IDE 提及 | P0 第九源 `@fibo:Payment` | 前端候选项与术语联想 | P0 已落地 |
| agent 桥 | P0 `GET /api/ontology/agent-bridge/fibo` | 批量查询与缓存 | P0 已落地 |
| qgate 语义门 | 37 概念索引，35 个 FIBO/Commons 锚点 | 与 37 概念包的一致性守门 | P0 已落地 |
| 报告证据 | `GET /fibo/evidence` + markdown 已落地 | simharness 报告生成器消费待其仓另开 | P1 已落地 |
| 术语表 | 37 概念术语表 + 5 条报告金融词条（2 关联/3 未映射） | 全量词表映射需逐条裁定 | P1 已落地 |
| 数据源映射 | 37 行注册表（20 mapped/17 unmapped） | 未映射概念随场景落地再补 | P1 已落地 |
| 实例摄取 | 支付样例 20 实例，校验零 error，幂等 | 真实 AIPay 产物接入需场景适配 | P2 已落地 |
| 证券、衍生品、贷款域 | 只读域目录 18 概念，锚点已核验 | 可导入包待依赖闭包核验 | P3 已落地试点 |
| 属性级权限 | 两字段试点：Account.accountNumber / Payer.partyRef | 扩展到更多角色与字段 | P3 已落地试点 |
| 运营化 | ops 快照、治理卡运营条、漂移脚本、导出 CLI、运营手册 | 季度执行靠值班 | P4 已落地 |

## P0：本分支已落地

### P0-1 治理覆盖卡

治理语义体检页新增 FIBO 覆盖卡，显示发布版本、已导入数/总数、FIBO 术语数、Commons 术语数、工程扩展数。导入按钮调用既有增量导入端点，成功后自动刷新统计与全量校验。FIBO 目录不可用时显示不可用提示，看板摄取面不受影响。

验收：治理卡在 `/app/board` 的语义体检页签可见。导入后覆盖度从 0/37 变为 37/37。目录不可用时看板摄取按钮仍可用。

### P0-2 agent 术语查询

公开 agent 桥新增只读端点：

```text
GET /api/ontology/agent-bridge/fibo?q=Payment
```

无查询参数时返回覆盖度（37 概念、已导入数、来源分档、发布版本）。有查询参数时返回最多 10 个命中概念，每条带真实 IRI、中英文定义、模块、versionIRI、成熟度与是否已导入。沿用回环限制与可选 `ONTOLOGY_BRIDGE_TOKEN`，与 `validate-task` 同一安全姿态。

验收：无令牌时本机 200。设置令牌后缺令牌 401。查询 `Payment` 返回 PaymentsAndSchedules 的真实 IRI。导入后 `applied` 翻转为 true。

### P0-3 IDE `@fibo` 提及

IDE 提及面板新增第九源 FIBO。输入 `@fibo:Payment` 生成字面量引用。代理收到后经 P0-2 端点解析术语，不再依赖前端缓存。面板给出提示：代理会取真实 IRI、定义与模块版本。

验收：`@fibo:Payment` 与 `@fibo/SettlementEvent` 解析为 `fibo` kind 且计入引用源。既有 file/wiki/ontology 解析不变。

### P0-4 qgate 一致性守门

新增只读测试，校验 qgate 的 37 概念索引与 37 概念包是否同锚。35 个 FIBO/Commons 锚点必须逐 IRI 匹配。Authorization 与 Capture 两端都必须是工程近似。`TransactionEvent` 已并入正本，原登记例外关闭。任一侧漂移，测试亮红。

验收：测试 4 个用例通过。例外表写明原因与后续二选一（补入 TransactionEvent，或把 qgate 改为 MarketTransaction）。

## P1：报告、术语与映射（已落地）

### P1-1 报告证据面

报告生成器消费 P0-2 的覆盖度，在报告增加「FIBO 覆盖」小节。小节列出发布版本、已导入/总数、校验错误数。未导入时如实写「未导入」。报告只显示端点返回值，不自算覆盖率。

验收：报告出现发布版本与覆盖度。未导入时写「未导入」而不是 0。数字与端点返回一致。

### P1-2 术语表映射

把报告词表的 59 条术语逐条映射到 FIBO 概念 ID，支付、账户、结算三域优先。映射不上的术语显式列为「未映射」，不猜。词表增加 `fiboConcept` 与 `iri` 两列，报告术语卡片显示对应 IRI。

验收：支付、账户、结算三域术语映射率不低于 90%。未映射清单可查。同一术语不再出现两种写法。

### P1-3 数据源映射注册表

新增注册表，四列：FIBO 概念、看板字段或任务属性、推演状态键或产物文件、REST 端点或报告章节。治理卡显示已映射概念数。没有映射的概念显式列为「未映射」，不默认有映射。

验收：每个已导入 FIBO 类型至少有 1 条映射或 1 条未映射登记。报告生成器可读取注册表。

## P2：实例与门禁（已落地）

### P2-1 支付流水实例摄取

把 AIPay 支付场景的流水摄取为本体实例：Payment、PaymentObligation、Payer、Payee、Account、IndividualTransaction、SettlementEvent，以及本地扩展 Authorization 与 Capture。写入即校验，错误实例拒写并给出原因。删除与重跑幂等。

验收：跑一轮支付场景后实例数与场景产物对得上。全量校验 0 error。`captured` 与 `settled` 的金额、时间、状态在实例层可区分。

### P2-2 门禁执行面

qgate 语义门使用 37 概念索引，在金融任务中对 `captured` 与 `settled` 混用给出 finding。严重度先 warning，稳定后再评估 error。证据写入 gate 输出，报告可引用。

验收：语义错配演示用例可检出。非金融任务零误报。finding 带 IRI 与定义锚。

### P2-3 漂移与升级

FIBO 每季度发布。建立升级清单：固定 tag 与提交号、逐模块 versionIRI、概念 IRI 清单、升级前后 diff。升级脚本只做只读比对，不改包。人工确认后再更新包与测试。

验收：对下一季度 release 跑一次 dry-run，输出新增、删除、改义的术语清单，没有静默变更。

## P3：域扩展与治理深化（本轮已落地试点）

- P3-1 证券、衍生品、贷款三个域的只读目录，共 18 个概念，带真实 IRI、英文原定义、模块 versionIRI 与成熟度。可导入包待依赖闭包核验后另开，不把未核验的类塞进工作台 T-Box。
- P3-2 属性级权限：角色 × 实体 × 属性 × 可见性，先选两个字段试点（Account.accountNumber、Payer.partyRef），读时脱敏，不改存储。
- P3-3 外部消费：提供 JSON-LD、SHACL、Turtle 三格式导出 CLI。OWL/XML 未做，不内嵌推理机。

## P4：运营化（本轮已落地）

- 运营快照 `GET /api/hermes/ontology/fibo/ops`：报告证据、术语表/映射/域目录计数、版本锁、门禁就绪、脱敏字段一次取齐。
- 治理卡新增运营条与两个动作：复制报告证据、摄取支付样例。
- 季度漂移比对脚本 `scripts/fibo/check-upstream.mjs`；导出 CLI `scripts/fibo/export.mjs`。
- 运营手册《2026-10-21-fibo-operations-runbook.md》，覆盖升级、巡检、证据导出、回滚与部署。
- 验收：ops 快照字段齐全；治理卡显示锁/映射/域/门禁/脱敏；两个脚本 `node --check` 通过。

## 验收与指标

- 覆盖度：导入后 37/37。治理卡显示发布版本与来源分档。
- 门禁一致性：35 个 FIBO/Commons 锚点逐 IRI 匹配。0 个登记例外（TransactionEvent 已并入）。2 个工程近似两端一致。
- agent 查询：本机 200、真实 IRI、令牌闸生效。
- IDE 提及：`@fibo` 解析与既有源不冲突。
- 回归：本体域、治理、IA2 治理卡、IDE 提及、qgate 目标测试全绿。
- 本轮实测：所跑测试面 20 个测试文件、153 个用例全部通过，其中新增 32 个。
- 类型校验：8 个新服务端模块 `tsc --noEmit` 零错误。两个脚本 `node --check` 通过。
- P0 批次曾跑全仓 791 个用例，790 通过、1 个既有红（`unified-nav-guard.test.ts` 对 `IaShell.vue` 的 Escape 断言，与本批无关）。本轮未重跑全仓。

## 风险与对策

- 并行会话：`feat/ontology-fibo-reference` 在改 FIBO 页签、`ontology-fibo.ts` 与 `GET /fibo`；`feat/fibo-ssot` 在做单事实源，同样改 `ontology-fibo.ts` 与 `scripts/fibo/`。本分支不改这两个文件，合并时以其最新提交为准。
- 双主线：本地 main 已合并 37 概念映射层与 qgate 37 概念索引。origin/main 尚无本批，发布需要 push，否则远端看不到 P0-P4。
- FIBO 季度变更：包固定 `master_2026Q3` 与各模块 versionIRI。升级必须重跑 IRI 实锚测试、qgate 一致性测试与版本锁测试。
- 包是子集：37 个概念覆盖支付、账户、结算，不代表全量 FIBO。未收录概念不声称存在。
- 域目录边界：SEC/DER/LOAN 只做只读目录，不进入可导入包。依赖闭包未核验前不扩 T-Box。
- 报告消费边界：simharness 未改。本轮交付证据端点与 markdown，报告生成器接入由其仓另开。
- qgate 例外：`TransactionEvent` 不在包内。补包或改 qgate 二选一，改任一侧都要更新例外表。
- 服务未部署：overlay 主工作树不在 main，服务进程也未换装。要用浏览器看治理卡，需把服务载体切到集成 main 后重启。
- 既有红：`unified-nav-guard` 的 Escape 断言与 FIBO 无关，单独开一轮处理，不混入本方案。

## 决策记录

1. **产品化从消费面入手，不再扩包。** 37 概念已覆盖支付、账户、结算。继续扩包不如让治理、IDE、agent、门禁先用起来。
2. **治理面复用既有 `GET /fibo`。** 该端点已返回包目录与已导入数。治理卡不需要新端点，减少接线面。
3. **agent 查询走公开桥。** 复用 `validate-task` 的回环与令牌姿态，不新开鉴权面。报告生成器也可复用。
4. **`@fibo` 是字面量通道。** 前端不做 FIBO 索引缓存。代理按需查 agent 桥，避免客户端与包版本漂移。
5. **qgate 只加一致性测试，不改索引。** 索引校准由已完成的分支负责。本分支只守两端同锚，冲突面最小。
6. **报告证据复用覆盖度端点。** 报告不自算覆盖率，避免第二套口径。
7. **术语映射与数据源映射分开。** 术语表解决「词同义」，映射注册表解决「概念落在哪个物理载体」，两件事不混表。
8. **实例摄取放 P2。** 先让 T-Box 与消费面稳定，再引入 A-Box。否则校验噪音会淹没覆盖度信号。
9. **simharness 不做变更。** overlay 对 simharness 只读。本轮只提供端点契约，报告侧改动由 simharness 仓另开。
10. **并行参照会话边界。** FIBO 页签、`ontology-fibo.ts`、`GET /fibo` 的参照内容由 `feat/ontology-fibo-reference` 负责。本分支不碰，避免同域撞车。
11. **既有红不混入。** `unified-nav-guard` 的 Escape 断言与本方案无关，如实登记，单独处理。
12. **证据以 markdown 字段输出。** 报告生成器直接嵌入返回值，不自算覆盖率，避免第二套口径。
13. **术语表只收金融域报告词条。** 报告词表多为流程词，硬映射会制造假锚点。幂等与 int64 标 related，mock/回执/涉敏标 unmapped。
14. **映射表 37 行全覆盖。** 有载体的标 mapped 并列出四类载体；无载体的显式 unmapped 并写原因，不默认有映射。
15. **支付样例用 `fibo:` 前缀 + 整批校验。** error 级违规整批不写，不写半套；重复执行按前缀替换，幂等。
16. **SEC/DER/LOAN 只做只读目录。** 18 个概念锚点已核验，但依赖闭包未做，不进入可导入包。
17. **脱敏读时做，两字段试点。** 只对 Account.accountNumber 与 Payer.partyRef 生效，管理角色可见，其余角色读 `***`，不改存储。
18. **版本锁独立文件。** `ontology-fibo-lock.ts` 记录 tag/commit/逐模块 versionIRI，季度脚本只读比对，不改包。
19. **运营快照是产品读模型。** 治理卡与 agent 都消费 `fiboOpsSnapshot`，不各自拼计数。

## 本轮改动清单

| 文件 | 变更 |
|---|---|
| `custom/client/ia2/views/gov/GovOntologySection.vue` | FIBO 覆盖卡、导入按钮、FIBO 目录深链、fail-soft |
| `custom/client/ontology/i18n.ts` | 治理面 FIBO 中英文案，键路径齐平 |
| `custom/client/ide/utils/mention-resolution.ts` | 第九源 `fibo` |
| `custom/client/ide/components/IdeMentionPicker.vue` | FIBO 源、提示与标题 |
| `custom/server/ontology/ontology-agent-bridge.ts` | `GET /api/ontology/agent-bridge/fibo`，回环与令牌闸复用 |
| `custom/server/ontology/__tests__/ontology-agent-bridge.test.ts` | 覆盖度、查询、导入翻转、令牌闸 |
| `custom/server/ontology/__tests__/ontology-fibo-gate-consistency.test.ts` | qgate 37 概念与正本包同锚 |
| `custom/client/ia2/__tests__/gov-ontology-fibo.test.ts` | 治理卡渲染、导入、fail-soft |
| `custom/client/ide/__tests__/mention-resolution.test.ts` | `@fibo` 解析 |

## 验证

已跑：

```bash
npx vitest run custom/server/ontology custom/client/ontology \
  custom/server/governance/__tests__/governance-ontology.test.ts \
  custom/client/ia2/__tests__ custom/client/ide/__tests__/mention-resolution.test.ts \
  custom/client/ide/__tests__/context-six-source.test.ts \
  custom/qgate/__tests__/qgate-p5-p9.test.ts
```

结果：108 个测试文件、791 个用例，790 通过、1 失败。失败项见上节「既有红」。四组 P0 目标用例共 16 个通过，其中新增 11 个。

未做：浏览器走查。本分支的改动需要注入共享 upstream 树才能热更新。服务载体当前不在集成 main。治理卡与提及面板由 jsdom 挂载测试覆盖。agent 桥由真 Koa HTTP 测试覆盖。

## 非目标

- 不做完整 RDF/XML 导包、`owl:imports` 闭包计算、OWL DL 推理或 SPARQL。
- 不把 37 概念扩展成全量 FIBO。
- 不改 simharness 报告生成器。只提供端点契约。
- 不在本轮做实例摄取、属性级权限、证券/衍生品/贷款域。
- 不修复 `unified-nav-guard` 的既有红。
