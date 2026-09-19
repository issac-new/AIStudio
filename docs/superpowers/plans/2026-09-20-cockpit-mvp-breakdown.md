# Swarm Studio 智能研发驾驶舱——MVP 拆解计划

日期：2026-09-20
状态：v1——依据已批架构 spec v1.1（`docs/superpowers/specs/2026-09-19-swarm-cockpit-architecture-design.md`，三裁决 + 会签/甘特/催办入 v1）
受众：overlay 实施者（后续 agent 会话排期取材）、评审者
上游依据：需求整理稿（2026-09-19 会话版 §16 MVP 分期）、架构 spec v1.1、`2026-09-18-distributed-delivery-network-design.md`（里程碑被本文吸收重排，见 §6）

## 0. 三句话主旨

需求稿的七个 MVP 切片按建成现状重排为「R0 免建基线 + M-A..M-G 七轮」：协议先行（M-A），路由与 UI 双线并行（M-B/M-C），联动与 IDE 接线串行（M-D/M-E），测试统计催办收尾（M-F），全流程集成验证与发布封口（M-G）。每轮一个 feat 分支、一个验收门、一次合 main，验收门全部可测（事件断言/CDP 动线/测试绿），不设「看起来对」这类主观判据。读毕应能回答：下一轮开什么、验收卡在哪、与 09-18 spec 的 M2-M4 是什么关系。

## 1. 结论（第一屏）

1. 免建清单：账号与多用户沟通（MVP1）、任务投递骨架（assign→kanban→receipt）、交付协议三事件、v12 双视图壳层、/ide 与 ACP 链路——五件已建成且验收在档（§2）。
2. 七轮顺序：M-A 协议 v2 →（M-B 路由 ∥ M-C 评审中心）→ M-D 消息任务联动 → M-E IDE 接线 ∥ M-F 测试统计催办 → M-G 全流程集成与发布。M-A 阻塞全部，M-C/M-D 依赖 v12.1 壳层合 main。
3. 两处吸收：09-18 spec 的 M2（六场景面板+编排 YAML）拆进 M-B/M-C/M-D 并按 v12 重映射；其 M3（sim 第 4 轮）与 M4（双真机+发布）并入 M-G。架构裁定零推翻。

## 2. R0 免建基线（已建成，本轮零投入）

| 能力 | 验收锚点 |
|---|---|
| Matrix 登录/联系人/单聊群聊/身份展示（需求稿 MVP1） | 三用户 sim 验收 35/35 × 2 轮（`2026-09-17-multiuser-matrix-collab-sim-report.md`）；Fleet v2 共享运行时（`overlay/scripts/fleet/`） |
| 任务投递 assign → 本机 kanban → receipt | matrix-teams P1-P3（2.27 收口，见 09-18 spec §2 基线表） |
| 交付协议 case/stage/gate + 幂等投影 + HumanGate 校验 | `custom/client/matrix-teams/delivery-protocol.ts`（M1 合 main 6db7d4e，31/31） |
| v12 双视图壳层 + ⚙管理台五区 + IDE 维度条 | 2.30 发布（CDP 六动线）；v12.1 两修复在 `fix/ide-light-theme-blocks` 在途（3064878/284ce72） |
| /ide 工作台 + ACP 调 codex 端到端 | /ide 回归 21+ 项 CDP 全过（2.30 随发） |

## 3. 轮次总览与依赖

```text
R0 免建基线
     │
   M-A 协议 v2（纯 A 类，阻塞全部）
     ├── M-B 路由与拆分（协议消费端）
     │        └── M-F 测试、统计与催办
     └── M-C 评审中心（UI，前置：v12.1 合 main）
              └── M-D 消息任务联动（UI）
                       └── M-E IDE 接线
                                （M-C..M-F 齐）→ M-G 全流程集成与发布
```

并行规则：在途 worktree ≤ 3（用户规则）。推荐首波 M-B ∥ M-C，第二波 M-D ∥ M-F，M-E、M-G 串行。

## 4. 各轮范围与验收门

### M-A 协议 v2 轮

范围：`delivery-protocol.ts` schemaVersion 1 → 2；case 事件加 projectId；team.assign（matrix-teams protocol.ts）加 parentId / capability / phase / dueDate / dependsOn 五字段；注册房新增 `com.swarmstudio.agent.profile` state 事件（PL = 50，本机 bot 只写自己）；新增消息类型 `com.swarmstudio.agent.message`；gate 枚举扩 R1-R4、content 增 signoffs[]；新增 `com.swarmstudio.project` account data 两级索引。全部纯 A 类 custom 代码，不触 patches。

前置（提前项，原 09-18 M4 内容）：fleet 环境实测 Synapse bot 账号注册通道（注册开关 / 共享密钥），产出一份注册 runbook。

验收门：

1. 每个新增/扩展事件有容错解析负例：非法结构、未知 schemaVersion、超长字段（title/ref/summary 上限沿用既有常量）一律返回 null。
2. signoffs 投影三例测试：全员 pass → pass；任一 reject → reject；单判定人退化为 signoffs 长度 1。
3. R 门 sender 校验负例：bot 账号发 R 门 verdict，validateGateSender 报错（枚举扩进 HUMAN_GATES 语义，delivery-protocol.ts:25 先例）。
4. 事件类型字符串仍只出现在协议单文件（grep 守门测试，既有模式）。
5. `npm test` 全绿；i18n 门禁不涉及（协议层无 UI 文案）。

### M-B 路由与拆分轮

范围：Orchestrator 消费 assign 扩展字段，按 agent.profile 的 capability 标签匹配本机 Agent（含 maxParallel 负载判断），命中后走既有 dispatch 落 kanban；拆解 fan-out——子任务 assign 带 parentId 发出；执行轴回执扩展为 received / started / progress / waiting-human / done / failed（前三个沿用 stage outcome，delivery-protocol.ts:123）。

验收门：

1. 路由决策表单测：标签命中、无命中（挂起+回执 failed 并附原因）、超 maxParallel（排队）。
2. fan-out 后父任务投影状态 = 等待子任务，全部子任务 done 后父任务进待评审。
3. sim 断言扩展：一条需求拆 N 张子任务，事件链（assign × N + 回执 × N + 汇总）齐整。

依赖：M-A。

### M-C 评审中心轮（UI）

范围：R/G 门事件在沟通视图渲染为评审卡片（含 signoffs 逐人签核状态）；⚙管理台新增待审清单分区（需求稿「评审中心」）；评审卡操作：通过、驳回（必附原因，沿用 reject 必带 reason 纪律）、会签。

前置：v12.1（`fix/ide-light-theme-blocks`）合 main。

验收门：

1. CDP 动线：发起 R2 评审 → 两人会签 → 一人驳回附因 → 任务回处理中，全程事件断言与 UI 断言各一套。
2. i18n zh/en 成对（i18n-coverage 门禁，en-fallback 修复模式照旧例）。
3. VTU 组件测试覆盖卡片三态（待审/通过/驳回）。

依赖：M-A；v12.1 合 main。

### M-D 消息任务联动轮（UI）

范围：聊天消息一键转任务（发 task 创建事件 + 任务卡片落房间）；任务卡片渲染（状态/负责人/Agent 徽章）；卡片操作指派、转派、完成、阻塞、重开（写路径一律 = 发事件，UI 只投影）；甘特视图（dueDate / dependsOn 投影，挂任务决策栏，含依赖连线）。

验收门：

1. 回环 CDP：消息转任务 → 指派给集群 → 回执 → 卡片态变化 → 聊天通知，五步事件断言齐。
2. 越权操作被协议层拒（bot 发 HumanGate 类 verdict → 读端忽略并告警，既有纪律）。
3. 甘特渲染测试：逾期着色、依赖连线、无 dueDate 任务回落列表视图。

依赖：M-A；M-C 同壳层先行的顺序更稳。

### M-E IDE 接线轮

范围：/ide 任务面板（当前任务、关联需求/设计文档指针、聊天锚点）；ACP 会话与 taskId 绑定；diff 确认交互 = R3 代码评审门（人点通过即发 R3 gate 事件）；提交后回执回写看板。

验收门：

1. 端到端 CDP（真实 codex 会话）：任务进 /ide → codex 出 diff → 人工确认 → R3 gate 事件落房间 → 看板态变待评审。
2. 既有 /ide 回归 21+ 项全过（回归面 = 修复点 + 相邻路径，不新增破坏）。

依赖：M-D。

### M-F 测试、统计与催办轮

范围：测试 Agent 执行链（测试任务 → 用例执行 → 报告 artifactRef → 失败自动建缺陷任务，parentId 挂原任务）；回归重测；统计面（项目/阶段/人员/Agent 负载与阻塞，全部从事件投影计算，不落第二份聚合状态）；逾期催办（dueDate 判据 → 通知 + 卡片标记）。

验收门：

1. sim 断言：缺陷 → 修复 → 回归 pass → R4 验收，全链事件齐。
2. 统计口径对照表入库：每个指标一行（定义 + 事件源 + 计算式），评审通过后统计代码以此为单一事实源。
3. 催办正负例：逾期任务触发通知；未逾期、已完成任务不触发。

依赖：M-B。

### M-G 全流程集成与发布轮

范围：sim 第 4 轮扩为全链导演脚本——六阶段 × R1-R4 评审 × 会签 × 打回重试 × 催办触发一次跑齐；双真机（本机 + 第二台 mac）跑一个真实小需求 G1-G6；版本收口（协议 v2 + 全部 UI 增量）与发布走既有流水线。

验收门：

1. sim 断言全绿：六 stage 事件齐、六 G 门 + 四 R 门 verdict 齐、signoffs 齐、PRD 与 retro 工件在中央仓、metrics-log 有追加行（09-18 spec M3 验收项全数继承）。
2. 真机全程证据导出：房间消息 + git 图谱 + 工件三件套。
3. 发布按既有流水线（升级 recipe 全档沿用）。

依赖：M-C、M-D、M-E、M-F 全部完成。

## 5. 需求稿 MVP1-7 → 轮次重排

| 需求稿切片 | 原设想 | 重排落点 |
|---|---|---|
| MVP1 账号与消息基础 | 待建 | R0 已建成（sim 35/35） |
| MVP2 Agent 身份与消息协作 | 待建 | 协议 → M-A；徽章与混合聊天 UI → M-D |
| MVP3 任务看板基础 | 待建 | 协议底座 → R0（M1 已合）；联动与卡片 → M-D |
| MVP4 需求分析回路 | 待建 | 拆解与分发 → M-B；全链验证 → M-G |
| MVP5 设计与评审回路 | 待建 | 评审中心 → M-C；基线化（G2 + frozenAcceptance）→ R0 已有字段 + M-C 消费 |
| MVP6 开发与 IDE 工作台 | 待建 | 界面 R0 已有；任务接线 → M-E |
| MVP7 测试与驾驶舱统计 | 待建 | M-F + M-G |

## 6. 与 09-18 交付网络 spec 的吸收关系

本文不推翻其任何架构裁定（D1-D4、三层边界、事件 schema 纪律全部沿用），只重排里程碑：

| 09-18 里程碑 | 去向 |
|---|---|
| M1 协议扩展（已完成） | R0 基线 |
| M2 编排与 UI（六场景面板 + delivery-flow-distributed.yaml） | 编排 YAML → M-B；案例面板按 v12 重映射拆进 M-C/M-D（其 §7 六场景挂点已随 2.30 退役） |
| M3 sim 第 4 轮 | M-G 继承其全部验收断言并扩展 R 门/会签/催办 |
| M4 双真机 + 发布 + 注册策略验证 | 真机与发布 → M-G；注册策略验证提前到 M-A 前置 |

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| bot 注册通道不可用（策略未开） | M-A 前置项先验；不行则 Synapse 配置调整进 M-A 范围，阻塞窗口控制在一轮内 |
| v12.1 迟迟不合 main | M-B（协议消费端）与 M-F 不依赖壳层，先行动；UI 轮（M-C/M-D）顺延不空转 |
| 协议 v2 升级窗口新旧节点并存 | schemaVersion 降级只读（既有纪律）；sim 环境先行升级验证再铺 fleet |
| 索引上限 MAX_ROOMS = 50 | M-A 落两级索引（project → case），超额分页留到实测后 |
| 多轮在途致 main 漂移 | 每轮收口前 rebase main（workspace 规则）；并行会话历史劫持教训在案，合并前查 reflog |

## 8. 收口纪律

每轮：feat 分支 → 验收门逐条过 → `npm test` 全绿 → 合 overlay main（`--no-ff`）→ 分支保留。轮内产生的口径表、runbook 随轮入库，不留会话私有笔记。本文随裁决变更同步修订（架构 spec 升版则本文 §4 对应轮次同步升版）。
