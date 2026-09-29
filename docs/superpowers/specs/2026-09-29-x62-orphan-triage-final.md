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
