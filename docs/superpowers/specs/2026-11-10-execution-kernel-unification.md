# 执行内核统一：Hermes 单内核与跨内核优势收编（2026-11-10）

> 用户指令：Ekko 与 Hermes 在 AIStudio 内存在两套独立执行面，要统一；追加——AIStudio 的群聊功能与 Ycode 的编程工具功能一并纳入，"不能割裂、分散、并行"。内核选择口径=吸收不同内核的优势，以一个为主，整合为统一内核。审批口径=保留自动放行，但在统一审批里记一条免审记录。
>
> 本 spec 是架构决策正本，不含实现。六段各自另立实施批次，逐阶段验收。**§12 已裁决：可选 app 只留 Ycode／Zcode／DeepSeek Harness 三个，权限统一为 ZCode 四挡；其余 13 家退役前须先完成能力吸收。**

## 变更

### 1. 现状：三类内核、十五个具名编码后端、八条入口（实测）

统一前先把分裂面数清。实测不是一个调度器加两条内核：

| 层 | 数量 | 说明 |
|---|---|---|
| 架构型内核 | 3 | Ekko（TS，Studio 进程内）、Hermes（Python，独立 worker）、Ycode（独立进程，完整 agent runtime） |
| 具名编码后端 | **15** | `coding-agents/services/registry/definitions.ts:34-48`：qwen／kimi／codebuddy／qoder／copilot／zcode／antigravity／claude-code／codex／pi／grok／opencode／mimo／dsh／cursor |
| 入口 | 8 | 见下表 |

| # | 入口 | 落到哪个执行体 | 锚点 |
|---|---|---|---|
| 1 | Studio 单聊（Hermes 支） | Hermes Bridge | `vendor/hermes-studio/packages/server/src/modules/studio/sockets/chat-run.ts:1962` |
| 2 | Studio 单聊（Ekko 支） | Ekko | 同文件 `:2070` |
| 3 | IDE 编程任务 | 15 个具名后端之一 | 同文件 `:2129`→`handleCodingAgentRun`；`coding-agents/services/zcode/chat-turn.ts:21` |
| 4 | 群聊成员 | 按成员名映射到上述任意一个（含 15 个具名后端） | `studio/services/group-chat/agent-clients.ts:1211-1241` |
| 5 | `@zcode`／列自动化／Automations | Ycode `:3030` V4 引擎 | `custom/server/zcode/mention-dispatch.ts:411-452` |
| 6 | Hermes 工具 `acp_send(provider=zcode)` | 再起一个 Ycode ACP agent | `team/profiles/worker-coder/plugins/acp-client/__init__.py:1129-1186` |
| 7 | `coding-delegate` 技能 | `zcode-acp-delegate.py` 子进程 | `runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py:389-438` |
| 8 | DevTools 直启 ZCode | 完整 Ycode | `custom/server/controllers/ide/devtools.ts:66-128` |

两条必须说清的事实：

**其一，群聊是分裂的放大器，不是统一点。** 房间只统一了消息路由与展示，成员各自持有会话、循环、审批和记忆。删映射表会让 11 个以上具名成员失去执行方——这是全计划里产品破坏面最大的一步，不能当"止损"轻做。

**其二，"编码后端"本质上都含模型循环。** 把它们降为工具调用，循环仍在，只是不再由 AIStudio 拥有其会话、审批、事件。因此不变量要分两段写：**过渡期按所有权口径**（Hermes 是唯一所有者，白名单外的外部循环可存在但无所有权）；**终态按"白名单唯一"口径**（13 家退役后只剩 Hermes 通用内核＋Ycode／Zcode／DSH 三个编码后端，三者共用四挡权限契约，不共用会话与审批所有权）。写成一段会在过渡期假红或在终态放水（见 §10 I1）。

### 2. 现状：四处事实源分裂

| 面 | 分裂形态 | 锚点 |
|---|---|---|
| 会话 | Studio DB／profile `state.db`／`~/.zcode/cli/db/db.sqlite`／`.ekko/ekko.db` | `studio/infrastructure/database/index.ts:12-20`；`ekko-agent/src/directories.ts:67-93` |
| 审批 | ZCode 默认 `--mode yolo`（无审批请求）；`acp_send` 自动 `allow_once` 或 cancel；delegate 一律 cancel；Ekko pending broker；Hermes `tools.approval`＋`approval_floors`；AIStudio `approval-rules` 八态五档 | `zcode/chat-turn.ts:21`；`acp-client/__init__.py:608-634`；`zcode-acp-delegate.py:466-470`；`modules/ekko/services/approvals.ts:32-79`；`custom/server/approval-rules/approval-domain.ts` |
| 工具治理 | 钩子只挂 Ekko runtime，注释自陈不含 Hermes Python 子进程，更不含编码后端 | `custom/server/toolpipeline/tool-hooks.ts:384`、`:390-394` |
| 事件 | Ekko `AgentRuntimeEvent`／Hermes Bridge `RunRecord`／Ycode V4 | `ekko-agent/src/runtime/events.ts:7-56`；`hermes/services/bridge/python/bridge_pool.py:157` |

### 3. 目标架构

```
┌────────── 控制面 Studio：房间编排 / 队列 / UI / 用量 / 审计投影 ──────────┐
│   群聊      看板派发     工作流节点     IDE 会话     外部 ACP 客户端      │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ 会话提交 / 事件回传（单一协议）
                     ┌───────────▼────────────┐
                     │ Hermes gateway + AIAgent │ ← 唯一会话/审批/记忆/事件所有者
                     │ 会话事实源 state.db       │   唯一模型—工具循环（自有时）
                     │ 工具治理唯一插桩点         │
                     └───────────┬────────────┘
                      ┌──────────┼───────────┐
                      ▼          ▼           ▼
                Hermes 原生工具   Ycode 编码工具服务   外部 MCP
                          （无会话/审批/事件所有权）

  编码后端白名单（3 个，共用四挡权限契约）：Ycode / Zcode / DeepSeek Harness
  其余 13 家：过渡期以受限形态存在，承接清单结清后逐家退役
```

四条硬边界（同时是验收口径）：

1. AIStudio 拥有的会话只能由一处推进：`AIAgent` 的循环（`agent/turn_facade.py:22` → `agent/conversation_loop.py:1883`）。
2. 活会话只有一处写：Hermes `state.db`。Studio DB 降为可重建投影缓存。
3. 审批裁决只有一处产生：AIStudio 本机执行准入由 Hermes 审批链裁决（详见 §10 的 E4 边界，跨机 HumanGate 不并入）。
4. 工具治理只有一处拦截：Hermes 工具执行咽喉。Ycode 工具与外部编码后端作为被调执行器，照样过这一处。

群聊并发口径：房间内多成员可同时推理，这是业务并发，不是执行面分裂。判据=同一会话所有权、同一审批链、同一事件投影。

### 4. 收编清单（修正后）

修正原则：以 Hermes 实际代码为准，不按"看起来缺"就移植。**原稿的 7 项移植里有 4 项 Hermes 已具备，移植量缩水约 80%。**

#### 4.1 从 Ekko 收编

| 件 | Hermes 侧实测 | 动作 |
|---|---|---|
| 边界中断：模型立即 abort、工具批跑完、下轮模型前停 | 现有 interrupt 是**跳过**剩余工具（`agent/tool_executor.py:372`、`:953`） | **代码移植，且爆炸半径大**：改的是 `/stop`、gateway cancel、Ctrl-C、cron 全部 surface 的取消契约 |
| per-run MCP 租约（每轮签发 token、abort 即撤销） | MCP 连接按进程/会话生命周期（`tools/mcp_tool_lifecycle.py`），ACP 侧只到会话级 server 选择（`acp_adapter/session.py:523`） | **代码移植**，需穿进整条 MCP 生命周期，不是 36 行改动 |
| 工具结果 sanitizer（266 行） | **已有且更大**：`tools/tool_result_storage.py`（26KB，阈值落盘工件化＋预览）＋`tools/budget_config.py:12-17`（单结果 100K／mcp 50K／单轮 200K） | 不移植 |
| 危险工具分级审批（502 行） | **已有三套**：`tools/approval_floors.py`（9.7KB 四层前置闸）＋`approval_detection.py`＋AIStudio `approval-rules`（八态五档） | 不移植；改为"三套分级器合流"（§6 P0b） |
| 强类型事件契约（56 行） | Bridge `RunRecord`（`bridge_pool.py:157`）＋ACP `session_update`＋`agent/monitoring/events.py:16-66` | 语义对齐：定一张事件语义表，Studio 投影按表实现 |
| plan／todo | **已有且更强**：`tools/todo_tool.py`（嵌套 parent、单调 revision、压缩后重注入、256 上限） | 不迁移 |
| 跨回合目标 session-tasks | 待核（kanban／session 面） | 实施前核对，有等价则不迁移 |
| 前后台 delegate | **已有**：`tools/delegate_tool_*.py`＋`tools/async_delegation.py`（daemon executor、返回 handle、完成后作为新回合浮出） | 不迁移，对齐事件 |

#### 4.2 从 Ycode 收编

| 件 | Hermes 侧实测 | 动作 |
|---|---|---|
| 编码工具面（Read／Write／Edit／Patch／Grep／Glob／Bash） | 无对应通用件 | 降为工具：封装成 Hermes 工具或 `ycode-tools` MCP，执行器不带会话 |
| checkpoint／rewind | **已有**：`tools/checkpoint_manager.py`（78KB，`ensure_checkpoint`／`diff`／`session_diff`／`restore`，透明基础设施）＋`hermes_state_rewind.py` | 不移植；只需把已有透明设施按需暴露为工具 |
| worktree 管理 | **已有**：`tools/subagent_worktree.py`（create／finalize／脏树归档 `refs/hermes/archive/<tree>`，含 GHSA-7x36-8jrh-v4pw 加固） | 不移植 |
| diff 采集 | `checkpoint_manager.diff`／`session_diff` 已有 | 不移植 |
| 终端进程组回收与超时 | 待核（`tools/process_registry.py` 已有进程登记） | 核对后定 |
| CUA 会话级 fail-closed 闸 | 无对应件 | 语义对齐：策略保留，接 Hermes 工具审批 |
| 技能多根探测（`.zcode`／`.agents`／`.claude`） | Hermes 有自己的技能根 | 语义对齐：并入 Hermes 技能发现 |
| session fork 定点分叉（rowId 锚点） | Hermes `fork_session` 是**整段 history 深拷贝**（`acp_adapter/session.py:197-209`），无 rowId 锚点 | **能力降级，须用户签字**（§7） |
| "沙箱" | — | 不继承这个名字。当前只有 cwd／env／进程组管理，补齐 realpath 与 workspace lease 后才可称沙箱 |

#### 4.3 Hermes 自身保留

durable turn lease、kanban、cron、gateway、profile 隔离、`state.db`、ACP adapter、memory／skills、context compressor、iteration budget、error classifier、`process_registry`（spawn 咽喉）。这些是基座理由，不替换。

### 5. 下线清单

| 下线对象 | 形态 | 连带处置 |
|---|---|---|
| Ekko `AgentRuntime` 装配点（`chat-run.ts:2070`、群聊 ekko 映射、工作流／Person 入口） | 断装配，代码在 vendor 保留但不可达 | `dist/ekko-skills` 打包项一并下线 |
| Ycode agent loop（`turn-loop.ts`／`turn-model-step.ts`／`turn-tools.ts`）作为可达路径 | 断装配 | `zcode-patches/001-009` 共 9 枚补丁的锚点随之失效，需逐枚评估：保留（转向工具服务仍有承载）／退役（归档 `.archived-patches/`） |
| `:3030` `createSession`／`sendText` | 停止接受会话创建 | `scripts/zcode-engine.mjs` 与 `vendor/zcode/packages/server` 的启动面 |
| `acp_send(provider=zcode)`、`zcode-acp-delegate.py` 生产调用 | 改为 Hermes 工具调用或 `delegate_task` | `worker-coder` 的 SOUL 与插件副本同步改写，否则模型会继续按旧指令拉起退役面 |
| DevTools 直启 ZCode agent | 改为薄客户端或禁用 | — |
| ZCode `PermissionBroker`／`SkillPort`／Memory Agent／`SqliteSessionStore` 活写／V4 事件总线 | 剥离所有权，旧数据只读 | — |
| 其余 13 家具名编码后端 | 逐家退役，承接清单结清才退（§12.3） | `definitions.ts` 注册项删除；各家配置模板与 ACP/JSONL 适配器归档；SOUL 与技能里教模型调这些后端的指令同步改写 |

### 6. 分阶段（修正顺序：工具服务先于成员改投）

原稿 P1 先删群聊映射、P2 才建工具服务，会让具名成员在中间态同时失去运行时和替代执行方。修正为 **工具服务先行**。

**P0a 契约（零行为变化）**
- 定四张表：事件语义表、审批裁决表、会话标识映射表（**双向可逆**）、工具清单与风险分级表。
- 只做定义，不接写路径。退出条件：四张表评审通过。

**P0b 审批合流与写账（承认行为增量）**
- 三套分级器合流：AIStudio `approval-rules` 八态五档／Hermes `approval_floors`＋`approval_detection`／免审记录。
- 八条入口全部接写入统一账。**yolo 入口（#3／#5／#8）本身不产生 permission 请求，必须在 Studio 入口层合成免审记录——这是新增写路径，属行为增量，不是"零变化"。**
- 入口 #6／#7 的裁决发生在 Hermes 工具链之外（`acp-client` 与 delegate 脚本），必须改这两个文件才能入账。
- 退出条件：账本里能看到八条入口的记录；同一危险命令在每入口产出一行同形记录。

**P1 四挡契约落地＋能力吸收（本阶段重心是补能力与统一权限语义，不是删代码）**
- 四挡契约接线：`build`／`guarded`／`plan`／`yolo` 对三个保留 app 与 Hermes 工具面一致生效；`edit` 保留历史映射；`chat-turn.ts:21` 的二值 `plan|yolo` 改成四挡。
- `guarded` 接 AIStudio `approval-rules` 八态五档；`yolo` 接 §8 免审记录；`build` 接逐次文件审批；`plan` 收敛为只读工具集。
- 按 §12.3 对 13 家逐家生成承接清单，按十面归并；编码能力工具化并接入 Hermes 工具链。
- 旧 ZCode 库转只读，历史做双向映射。
- 退出条件：四挡在三个 app 上行为一致；承接清单结清并可对照；生产路径不再以 agent 身份起 `zcode`／`zcode-acp-server`。

**P2 逐家退役＋群聊收口**
- 对 13 家按 §12.3 判据逐家退役：承接结清→入口改投→等价产物对照→签字。
- 群聊成员路由不再按名映射执行体：可承载的改投 Hermes 会话，编码需求只投三个白名单 app。
- 退出条件：具名后端只剩 Ycode／Zcode／DSH 三个；同一房间两名成员同时答，会话、审批、事件三处各只有一条记录。

**P3 Ekko 下线**
- 4.1 两项移植完成；删 `chat-run.ts:2070` 分支与群聊 ekko 映射。
- 退出条件：Ekko runtime 不可达；能力等价清单逐项签字。

**P4 收尾**
- 历史迁移、旧数据只读、事件单总线、五条不变量守门、`docs/DESIGN.md` 修订、9 枚 zcode 补丁去向结清。

### 7. 能力等价清单（验收装置）

每个阶段结束前列出现状独有能力，二选一：已在统一内核实现，或明确放弃并经**用户**签字。不允许"默认存在"通过。13 家待退役后端的承接清单按 §12.3 逐家生成，是 P1 的主交付物，不是附带项。三个保留 app 自身的能力不参与吸收，但必须全部接入四挡契约。

已知会降级、必须签字的三项：session fork 定点分叉（Hermes 只能整段拷贝）、ZCode 的 `plan` 审批档（现有代码只有 yolo／plan 两档，无"按需询问"）、编码后端自带的模型选择与配额逻辑。

### 8. 审批口径与免审记录

Hermes 已有会话级 yolo（`tools/approval_yolo.py`：内存 per-key 集合＋按 surface 持久化）。统一后的免审记录建在四挡契约的 `yolo` 挡之上，不另起机制：

- 每次被策略放行的工具调用写一条 `approval.exempted`：`{tool, riskClass, policyId, policyVersion, sessionId, profile, entryPoint, decidedBy, ts}`。
- 不可改、可查、进统一账；Studio 审批收件箱只读展示。
- 必须带 `policyVersion`，否则无法回答"当时按哪版策略放行"。
- 手工审批与免审同账同构，只差 `decidedBy`。
- 四挡与账本的关系：`build` 每次变更产生待审记录；`guarded` 仅在风险求值命中时产生；`plan` 不产生（只读工具集不触发写入类审批）；`yolo` 产生 `approval.exempted`。四类记录共用同一 schema。
- 入口 #3／#5／#8 的记录由 Studio 入口层合成（见 §6 P0b），合成点必须唯一，不得分散到各调用点。

### 9. 工程约束与风险

**9.1 vendor 只读与补丁锚点**
Ekko 与 Ycode 在 `vendor/` 内，直改不入提交。下线=patches 断装配点、装配层不接线；**验收按可达性写，不按"文件已删"写**。断装配若做成删除式补丁，每次 `npm run vendor:sync` 都要维持同一删除补丁，否则可达性会静默恢复——这条必须写成守门，不能靠人记。

**9.2 数据回滚**
D6 只给了代码级回滚。P1–P3 期间写进 `state.db` 的会话没有回到 Studio DB／Ekko DB 的逆路径。会话标识映射表必须双向可逆且持久，回滚脚本随每阶段同批交付。

**9.3 阶段间文件归属**
`chat-run.ts` 被入口 1／2／3 共用，`agent-clients.ts` 是入口 4，审批面被全部入口共用。多阶段并行时会撞同一文件。按仓规第 12 条（2026-11-04 用户裁决），merge 冲突只由分支属主解；因此每阶段须显式声明文件归属，共用文件同一时间只允许一个阶段改。

**9.4 安全方向：权限集中度上升**
目标态把多个执行体的工具面收进同时持有会话真值与审批裁决的进程。一次提示注入的影响面从"污染一个 agent 进程"变成"污染持有真值与裁决的进程"。缓解必须是确定性的（工具执行咽喉断言、spawn 白名单、workspace lease），不能靠提示词。**本 spec 不声称当前有沙箱。**

**9.5 过渡期递归**
P1/P2 期间 `acp_send(provider=zcode)` 仍是完整 Ycode agent，且可能本身就是 Hermes 的客户端。这是过渡期的**必然状态**，须逐入口真拦，不是一个测试用例能覆盖。

**9.6 部署面**
`runtime/` 沿用 PATCH_TOUCHED 派生，不强覆盖；`npm run runtime:doctor` 保持 0 败。SIM 与宿主运行树的版本对齐按 `2026-11-06-runtime-patch-touched-deploy.md` 口径。

### 10. 五条不变量（守门形态修正）

原稿打算用静态扫描，四条测不准或会假绿。改为运行期断言＋矩阵覆盖：

| # | 不变量 | 守门方式 |
|---|---|---|
| I1 | AIStudio 拥有的会话只由一处推进（终态：白名单唯一） | **过渡期**：运行期断言每次工具调用穿过 `agent/tool_executor.py` 分派，`agent/inline_tool_executors.py` 为唯一旁路且需白名单。**终态**追加：`coding-agents/services/registry/*` 只剩 Ycode／Zcode／DSH 三项，且三者共用四挡契约。不用 grep 符号名（`hermes_cli/gateway_agent.py:750` 有同名客户端会误判） |
| I2 | 不以 agent 身份 spawn 白名单外的内核 | **装配注册表断言**：`coding-agents/services/registry/*` 只允许 Ycode／Zcode／DSH 三项且必须映射到统一适配器；Hermes 侧 `tools/process_registry.py` 作为 spawn 白名单，按（父 pid，用途）记账。**不能按进程名**——Ycode 与 Zcode 同名系，DSH 也是 CLI |
| I3 | 活会话单写者 | **运行期互斥**：复用 `hermes_state_lockguard.py`／`hermes_state_holders.py`，同一 session id 只允许一个写持有者，跨进程生效。静态"禁止写会话主表"会误伤合法的投影写 |
| I4 | 审批只有一个裁决入口 | **入口矩阵覆盖率断言**：脚本化危险命令 × 入口矩阵，断言账本行数 == 入口数 × 1，且每个入口 id 在 CI 里至少出现一次。静态扫描在 yolo 入口上恒成立，会假绿 |
| I5 | 工具治理覆盖全部执行器 | 注册表成员断言＋**工具服务内部子调用计数断言**（防"一次工具调用内部跑十条命令"） |

负面测试三条：禁止双写（并发两入口写同一会话必须被拒或串行化）、禁止递归（Hermes→ACP→Hermes 环被拦）、禁止旁路（新增第二内核 spawn 代码守门当场红）。变异探针用于证明守门有效；对 I4 必须同时有覆盖率断言，否则空集合也通过。

### 11. 与既有裁决的关系

**本 spec 不推翻 `2026-09-25-capability-boundaries-design.md` 的 E4**。E4 原文：「审批规则 `command_allowlist` vs `approval/rules.json`——两平面分域（执行体不同），非缺陷；保持现状」。因此：

- **本机执行准入**（agent 调工具前能不能做）合流为一处，这是本 spec 的硬边界 3。
- **跨机人工裁决**（HumanGate／Matrix 事件）保持独立，不并入 `state.db`。跨机事实源仍是房间事件，见该文件 §6.2 修订。

同理，T7（Ekko 不入协作面）不是被推翻，而是被**执行**：本 spec 的做法正是 T7 要求的"先改造成消费 hermes 同一套 kanban／审批／记忆内核"。T7 的"可推翻"条款本次不使用。

### 12. 已裁决：3 个可选 app ＋ ZCode 四挡权限契约

**用户裁决（2026-11-10）：可选 app 只保留 Ycode、Zcode、DeepSeek Harness 三个；权限使用 ZCode 的四挡模式。**

#### 12.1 三个可选 app

| app | 实体 | 说明 |
|---|---|---|
| Ycode | `vendor/zcode` 分叉（`zcode-patches/001-009`） | 注册表里的 `zcode` 项，二进制取仓内分叉 |
| Zcode | 官方 ZCode CLI（PATH／ZCode.app 捆绑／`~/.hermes/ycode/zcode.cjs` 三级回退） | 同一注册项的官方二进制变体 |
| DeepSeek Harness | `@deepseek-ai/dsh`，命令 `dsh`（`coding-agents/services/dsh/definition.ts:3-9`） | 独立第三方 harness |

**注册表口径**：`definitions.ts:34-48` 的 15 项里，Ycode 与 Zcode 共用 `zcode` 一项（差别只在启动的二进制），DSH 占 `dsh` 一项。所以终态注册表是 **2 项**、可选 app 是 **3 个**；退役 **13 项**：qwen／kimi／codebuddy／qoder／copilot／antigravity／claude-code／codex／pi／grok／opencode／mimo／cursor。

**分层口径**：通用对话与协作内核仍是 Hermes 一个（Ekko 退役）；三个 app 是**编码后端白名单**，不是通用 agent。二者不冲突：白名单限定编码面，Hermes 限定会话/审批/记忆/事件所有权。

#### 12.2 四挡权限契约（单一事实源）

取值来自 `vendor/zcode/packages/shared/src/zcode-agent-model-state.ts:19-38` 的 `ZCODE_AGENT_MODE_OPTIONS`，四项：

| id | 名称 | 语义 | 统一实现 |
|---|---|---|---|
| `build` | Ask before changes | 每次文件变更前问 | 文件写入逐次人工审批 |
| `guarded` | Autonomous mode | 有风险才问 | 接 AIStudio `approval-rules` 八态五档风险求值 |
| `plan` | Plan mode | 只读，先给方案 | 只读工具集，禁写禁执行 |
| `yolo` | Full access | 少确认 | 走 §8 免审记录 |

三条硬约束：

1. **`edit` 不得删除。** 源码注释明确「菜单隐藏 Edit 不等于删除历史值；恢复/投影不能因候选变化把旧 edit 降为 build」（`ZCODE_AGENT_MODE_ID_SET` 特意保留 `edit`）。统一实现必须保留 `edit` 的历史映射，展示层可不列。
2. **四挡对三个 app 一致。** 任何 app 的原生模式都映射到这四个，不允许再出现"只有 yolo／plan 两档"（当前 `coding-agents/services/zcode/chat-turn.ts:21` 的 `approvalRequired ? 'plan' : 'yolo'` 是二值，必须改成四挡）。
3. **权限模式的单一事实源就是这一处目录。** 新增模式走设计变更，不得在 Studio、Hermes、各 app 适配器里各自加枚举。

#### 12.3 能力吸收（13 家退役前）

退役不是一刀切。每家退役前，其能力必须先在 Ycode 工具服务（或 Hermes 工具链）有承接并通过验收，逐家签字退役。

- **吸收的是工具面与交互面，不是模型**：模型选择由 Hermes provider 层统一，不得把某家的模型/配额逻辑搬进 Ycode。
- **承接清单来源**：每家后端的工具定义、命令面、配置模板（`CONFIG_FILE_DEFINITIONS`，`definitions.ts:34-48`），归类到十个面：代码智能与 LSP、多文件编辑与补丁、终端与进程管理、Git 与 worktree、checkpoint 与 rewind、图片输入、MCP 客户端、会话恢复、计划模式、项目规则文件（AGENTS.md／CLAUDE.md 等）。每类给"已承接／明确放弃"，放弃项须用户签字。
- **退役判据**：承接清单结清，且入口矩阵里原本落到该后端的路径全部改投后在等价产物上可对照（同一任务产出的 diff／测试结果／报告）。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| D1 | 唯一会话/审批/记忆/事件所有者=Hermes `AIAgent` | 已持有协作数据平面；`docs/DESIGN.md:782` 已定"任何产品功能不得另起绕过 gateway 的智能体执行链" | 以 Ekko 为基（否决：Hermes 是钉版上游且协作件全在 Python 侧） |
| D2 | 收编优势件而非保留内核 | 用户裁决"吸收不同内核优势，以一个为主" | 只做协议抽象（否决：不减少事实源） |
| D3 | 审批保留自动放行，写免审记录（含 policyVersion） | 用户裁决（2026-11-10） | 全量人工审批（否决：卡死现有全自动流程）；不动（否决：最高风险入口无护栏） |
| D4 | 群聊多成员可并发推理 | 业务并发≠执行面分裂 | 禁止房间内并发（用户未要求，另行立项） |
| D5 | 活会话事实源=Hermes `state.db` | 单写者原则 | 双写过渡（否决：`2026-11-05-platform-rewrite-design.md:174-205` 已定禁双写） |
| D6 | 下线=断装配，不删 vendor 文件 | `vendor/**` 钉版基线 | 直接删上游代码（否决：破坏 vendor:sync） |
| D7 | Ycode 终态=编码工具服务 | 工具能力有价值，循环/会话/审批是分裂源 | 整体退役（否决：工具面要重造）；保留 ACP 后端（否决：仍两套） |
| D8 | Ekko 无工具单次调用降为 provider 函数 | 上下文压缩、房间摘要不构成执行面 | 造 Hermes 会话（否决：成本与语义都不对） |
| D9 | 工具服务先于成员改投（原 P1/P2 对调） | 否则具名成员在中间态失去执行方 | 先删群聊映射（否决：产品破坏面最大且无接收方） |
| D10 | 每阶段独立批次、独立验收 | 八入口＋四处事实源，一轮做不完 | 单批全量（否决：不可回滚） |
| D11 | 不推翻 E4：本机准入合流，跨机 HumanGate 保持独立 | `2026-09-25-capability-boundaries-design.md:52` E4 原文 | 全部并入单机库（否决：跨机裁决真值在房间事件） |
| D12 | I1 在过渡期按所有权口径，终态按"白名单唯一"口径 | 终态只剩 Hermes 通用内核＋3 个编码 app；过渡期仍有白名单外的外部循环，只按所有权验收 | 全程坚持循环唯一（否决：三个保留 app 各有原生循环，循环唯一与 D13 不相容） |
| D13 | 可选 app 只保留 Ycode／Zcode／DeepSeek Harness 三个，其余 13 家退役 | 用户裁决（2026-11-10） | 只留 Ycode 一家（用户调整否决：Zcode 与 DSH 要保留）；保留 15 家（用户否决：口子太宽） |
| D14 | 先立后破：承接清单结清才允许逐家退役；吸收的是工具面与交互面，不含模型 | 用户裁决"其余工具的能力要吸收融入 Ycode 中"；模型归 Hermes provider 层 | 一刀切退役（否决：能力缺口无人承接）；连模型一起搬（否决：制造新的 provider 分裂） |
| D15 | 权限统一为 ZCode 四挡 `build`／`guarded`／`plan`／`yolo`，目录取 `zcode-agent-model-state.ts:19-38` 为单一事实源；`edit` 保留历史映射不删 | 用户裁决"使用 zcode 的四挡模式"；源码注释明确"菜单隐藏 Edit 不等于删除历史值" | 各 app 各留一套模式（否决：即现状的审批分裂）；新增第五挡（否决：无需求且破坏单一事实源） |

以上落 `.swarm-yuan/decisions.jsonl`。**D1／D5／D7 属架构级，须在实施前入账，不得等合并。**

## 验证

### 1. 每阶段复跑

`npm test` 全量绿；`npm run typecheck:harness` rc=0；`npm run runtime:doctor` 0 败；补丁 series 无撞号；`scripts/merge-invariants.mjs --check` 通过。

### 2. 端到端验收

同一危险命令在五个入口各触发一次（IDE 单聊、群聊、`@zcode`／列自动化、Hermes `delegate_task`、外部 ACP 客户端），必须产出同形审批记录与同一裁决路径；免审场景产出同形 `approval.exempted` 且 `policyVersion` 一致。

### 3. 实施前须复核的锚点

入口锚点为 2026-11-10 静态读码。群聊一路有一路子代理因配额中断，`agent-clients.ts:1211-1241` 与 `chat-run.ts:1962/2070/2129` 已人工复核，其余群聊细节在 P2 开工前补齐。

### 4. 实施进度（随批回填）

- **P0a 已落地（2026-11-10，本分支 3 提交）**：契约正本 `config/execution-contract.json`（四表＋白名单＋风险分级）＋`custom/server/executioncontract/` 装载校验＋`fourModeOf` 唯一归一点＋10 断言守门（含与上游四挡目录逐字重锚、edit 不得删、变异探针四枚）。零行为变化达成。
- **P0b-1 已落地（同日）**：`custom/server/approval-ledger/` 三态同 schema append-only 账本（只记不裁、fail-soft）＋`entryCoverage` I4 取数口。入口接线 6/8：#2/#4-ekko（`tool-hooks` postExecute ok=策略放行落 exempted）、#5（`mention-dispatch` 派发落 exempted，会话档经 `fourModeOf` 归一）、#8（DevTools 直启 zcode 系两键）、#6（`acp-client` auto_approve 放行，Python 侧 env 门控路径 fail-soft）、#7（`coding-delegate` session/new 建立即记，无人值守 yolo 设计口径）。**未接线**：#1（Hermes bridge 工具面，Python 侧需补丁）、#3（IDE 编程任务，vendor `chat-turn`/`handle-coding-agent-run` 需 B 类补丁）——留 P0b-2，接完前 P0b 退出条件（八入口全见记录）未达成。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md` §4.2（约 :782 后）：新增「执行面统一契约」段（Hermes 唯一所有者/三 app 白名单/四挡/免审记录/state.db 事实源），随本批已修订。
- `docs/DESIGN.md` §3.5 表 Ycode 行：定位补「编码后端白名单之首，共用四挡权限契约；不持有会话/审批/事件所有权」，随本批已修订。

- `docs/DESIGN.md` §4.2：执行链契约由"多执行体并存"改为"单一会话/审批所有权＋工具服务"。本 spec 批准后同批修订。
- `docs/DESIGN.md` Ekko／Ycode 定位段：Ekko 由"Studio 内嵌 Agent"改为"已下线，能力并入 Hermes"；Ycode 由"编码执行引擎"改为"编码工具服务"。
- 数字总账：架构内核 3→1（Hermes）、具名后端 15→3（Ycode／Zcode／DSH）、入口 8→1 类、会话事实源 4→1、本机审批面 5→1（四挡）、事件总线 3→1。逐阶段落地后更新，不提前记账。
- 待登记（合并时执行）：`docs/README.md` 附录 A、`docs/manuals/aistudio-design-document-index.md` 两处清单；`.swarm-yuan/decisions.jsonl` 十五条。

## 批准链

本 spec 的"批准"不是 PR 通过，而是三件事齐备：① D1／D5／D7／D13／D14 已获用户裁决并落 `.swarm-yuan/decisions.jsonl`；② P0a 四张表评审通过；③ 设计文档修订随同批提交。缺任一项不得进入 P0b。

## 不做的事

- 不在本 spec 内改代码、补丁或 vendor 基线。
- 不改 kanban／cron／gateway 既有语义。
- 不承诺一次性完成：六段各自验收，任一批失败可停在阶段边界。
- 不把"沙箱"作为既成事实写入文档。
- 不把"循环唯一"当过渡期判据：过渡期按所有权口径验收，终态按"白名单唯一"口径（§10 I1）。三个保留 app 各自仍有原生循环，这是裁决允许的边界，不是遗漏。
