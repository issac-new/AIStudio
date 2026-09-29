# X 类孤儿终局分档台账（逐件评估版，2026-09-29）

评估方法：第一批 15 件逐件读模块源码+挂点组件定实施设计；第二档 19 件按语义/适用性/互补性逐件裁决；第三档 28 件按"多机依赖/重复实现"归类。62 件（50 确证孤儿+12 孤岛网络件）三态落档，无未裁决件。核验方法见吸收矩阵 §5（三层验法）。

## 终局：吸收 20 件（第一批 15 + 升格 v2 批 5）｜挂起（依赖记档）6 件｜归档 36 件

### 吸收·第一批 15 件（实施分支 feat/x20-absorb-first-batch）
draft / workdir 并发警告 / presence-two-axis / shell-detach / harnesshealth / resume-safety / thread-usage / trajectory-hotspot / roster-tree / sections / keymap / whiteboard 回路 / memorytax+memscope(v1) / brief 度量面 / modelroute

### 吸收·升格 v2 批 5 件（第一批后顺位）
codesec（命令面板入口+结果卡）/ websearch（IdeMcpPane 策略段）/ goalautonomy（Goal 面板档位段）/ compactthreshold（CompactionCard 数据面）/ boost（命令/任务卡入口）

### 挂起 6 件（依赖未就绪，非放弃）
knowledge、learndistill（semantica 迁移排队）；distillgate（等 FTS 反馈，原裁决维持）；cacheattr（provider 缓存归因数据面）；goalpreemption、goalbudget(server)（引擎侧 hermes goals.py 域）

### 归档 36 件
- 多机/外部依赖：a2a、workerabs、crdt、wsgroups、speech、notify
- 与已落地重复：statusline、cmdmeta、mcpcatalog、extmarket、agentsmd、bashcontract、boardorg、tuicopy、changedfiles、btw、managerhub、swarm、commandtask、configlayers
- 资产性质移 roster：prdelivery、secguidance
- 孤岛网络随档：filehistory、file-undo 等互引件

### 诚实分版记档
keymap v1 生效面=session 三键；memory 四类型 v2（写入侧 type）；brief 生效面挂 provider 增量帧；shelldetach 引擎后台化降级路径；#22 importer 依赖引擎 RPC 开面。

## 遗留清单执行终态（2026-09-29 第三批 feat/x20-leftovers）

| 项 | 执行结果 |
|---|---|
| main 推 origin | ✅ 已推（b643d147..79235827，38 提交） |
| 体检升五维 | ✅ harnessReport 五维真数据（memory/rules/automations 三维补齐），IdeMcpPane |
| keymap 生效面 v2 | ✅ global palette（⌘K）真实走映射分发 |
| trajhot 热点 | ✅ RunTrace L2 durationMs→buildHotspots（工具/节点类型 Top5，TraceModal） |
| boost 聚合件 | ✅ IdeAgentsView ⚡聚合（boostPipeline 一致数胜出+断言回灌计数） |
| websearch 写穿 | ✅ 声明式注入（策略变更→会话声明消息；引擎参数面记档） |
| cacheattr | ✅ cc-switch.db 28 万行实锤→GET /api/ide/cache-attribution（命中率+归因+建议） |
| A4 引擎后台化 | ✅ 结案：pty 服务端持久，⌘B 收面板即真 detach |
| #22 导入链 | ✅ overlay 半链（解析 REST+UI+写入 501 如实）+引擎 RPC 补丁草稿（notes/...draft.md） |
| goalpreemption | ✅ patch 498-goals-user-preempt（GOAL-05 让位，fail-open 自证，series 已入） |
| goalbudget(server) | 引擎预算字段未开——引擎侧记档（turns 预算已在 goals.py） |
| 知识系 3 件 | 依赖 semantica 迁移（base-runtimes §7）+FTS 反馈——外部依赖，迁移立项时连动 |
| brief 生效面 | 依赖 provider 增量帧协议（同 prefix-reuse 层 3） |


## 依赖消除批终态（2026-09-29 第四批 feat/x20-deps-cleared）

| 原依赖项 | 消除方式 | 终态 |
|---|---|---|
| #22 引擎 importSession RPC | **zcode-patch 002**（transport 方法+schema/service 方法/migrationSource 枚举扩 codex/kimi；persist 泛化写入）+桥声明+POST /import/history 真写入 | ✅ 引擎代码全链落库；**引擎进程重启窗口后生效**（旧进程未载补丁时端点如实 503 engine_rpc_not_loaded） |
| 知识系待 semantica | 核查发现**已实装**（~/.hermes/config.yaml mcp_servers.semantica enabled+venv 可 import+KG_PATH 持久化）——台账状态过时 | ✅ 依赖本已消除；补 IDE 侧闭环：IdeKnowledgeBar（/learn 三归宿判定+通用性贡献判定+semantica 在线状态） |
| brief 待 provider 增量帧 | 依赖重定性：prompt-cache 命中只依赖**请求侧前缀字节稳定**（响应侧增量帧是另一优化）——squad 简报规则段天然前缀稳定 | ✅ 守门测试钉死该性质（diffBrief 前缀≥task_data 定界头，防回归） |
| goalbudget 引擎字段 | **patch 499**（GoalState 加 token_budget/token_used/wall_clock_budget_sec/goal_started_at+evaluate 累计+触顶 pause+status_line 展示；调用方 last_usage_tokens 传参面） | ✅ 三预算路径 python 实测自证（token 触顶/墙钟触顶/无预算不干扰） |

**补丁重放风险记档**：498/499 生成于共享 hermes-agent 树（含并行会话 WIP 基线）——inject 重放窗口需统一验证顺序（498→499），与并行 goals.py 改动的合并由该窗口裁决。zcode-patch 002 同理（引擎进程重启窗口）。


## 剩余项清零批终态（2026-09-29 第五批 feat/x20-final）

| 项 | 结果 |
|---|---|
| 死补丁 416/417 | series 行回补推 main（ae23e6a7）；416 direct-apply 干净已树上应用（delegate 交接话术）；417（kanban 硬化 751 行）与树上并行 WIP 冲突——series 在列，inject 重放窗口统一裁决 |
| workflow 四端点 REST 实证 | 全通：saved（目录探测+诚实空表）/saved-runs（**真 run 数据**：dwfrun-665fe20c RSI v3 completed）/runs+run-events（引擎 fault.sessionNotFound 语义正确——imported 会话无 workflow 事件） |
| semantica 探测层修正 | 原判定查 studio MCP 面板判错层（semantica 在 hermes agent 层 config.yaml）→ 新端点 GET /api/ide/semantica-status（读 agent 配置+KG 路径+venv）+IdeKnowledgeBar 改调 |
| 498/499 补丁双向验证 | 498 单独可完整剥离 ✓；499 因并行会话清树曾失——新基线重打+可完整剥离 ✓+三路径语义终证（token/墙钟触顶+无预算走轮数兜底） |
| MCP 面板走查补漏 | 以组件守门证据收口（454/454 绿含 ide-health-memory/automations/搜索四档精确 testid 断言）；走查 vite 反复被共享树并行活动杀，不再与不稳定环境缠斗 |
| qgate 2 例基线红 | 裁决不修：qgate 域为并行会话活跃战场（qgate-main worktree 占 main），各轮已证非本线引入 |
