# 2026-10-21 zcode-usage-ledger — 本机 zcode 用量账本与全链路追踪（dsh-context 吸收·数据面）

## 背景

以 `upstream/dsh-context`（DeepSeek Harness 上下文洞察插件，bowenliang123，v0.73.3，2026-10-21 已同步至 origin/main 6f8dd88）为底层技术组件参考，完善本机 zcode 与 SwarmStudio「IDE 工作台」的全链路追踪与用量统计。

实测盘点（2026-10-21，锚点=本机 `~/.zcode/cli/db/db.sqlite` 实查）：

- zcode CLI/引擎库 `~/.zcode/cli/db/db.sqlite`（4.8G，2936 会话）已有三张结构化用量表，**Studio 完全未消费**：
  - `model_usage`（135,152 行）：每次模型调用一行——provider/model/agent/mode/task_type/query_source、状态、时长、首 token 延迟（TTFT）、五类 token（输入/输出/推理/缓存写/缓存读）、重试与错误。
  - `tool_usage`（155,490 行）：每次工具调用一行——工具名、只读/破坏性标记、审批状态、时长、输出字节数、错误。
  - `turn_usage`（4,478 行）：每轮一行——状态、TTFT、时长、token 汇总、错误码。
- `query_source` 维度把隐藏调用也记账：主轮 / 子代理 / workflow 子任务 / 会话标题生成 / 上下文压缩——这就是「全链路」的账本（studio 侧 session_usage 只覆盖 studio 自己拉起的聊天回合，本机 zcode 自身会话零记账）。
- 现有 IDE 域缺口与该数据源恰好对上：CLI 会话列表无 token/成本；TTFT 在 studio 轮表恒空（rounds-table.ts）；zcode 会话无任何轨迹视图（TrajectoryPane 恒空态，因其只认 hermes-agent 的 trace 文件）。

口径实锚（本机库实测）：
- `output_tokens` **包含** `reasoning_tokens`（违反包含关系的行数=0）→ 成本公式按 input+output 计，不重复计费；reasoning 仅作展示细分。
- `computed_total_tokens = input + output + cache_creation + cache_read`（抽样三行逐一对账相等）。
- 时间戳为毫秒 epoch。

## 与并行任务的分工

并行会话 `feat/context-insights`（qoder，2026-10-21 13:23 在途）做 **Studio 域聚合**（session_usage / messages / hermes state.db → 会话内 Context 页签）。本 spec 做**本机 zcode 数据面**，两者数据源、文件面零重叠（它改 store/ide.ts、IdeSidePane.vue、IdeContextPane.vue；本 spec 不触碰）。

## 变更

- **S1 服务端读取器** `custom/server/controllers/ide/zcode-usage.ts`（新建，仿 devtools.ts 惯例：`node:sqlite` 只读 + deps 全注入 + 纯函数层）：
  - `GET /api/ide/zcode-usage/summary?days=7|30|0`：KPI（会话数/轮数/模型调用/工具调用/五类 token/缓存命中率）+ byDay（日 token 序列）+ byModel + byAgent + bySource（全链路构成：主轮/子代理/workflow/标题/压缩）。
  - `GET /api/ide/zcode-usage/sessions?limit=&offset=`：逐会话行（join session：标题/目录/时间/task_type/父会话）+ 用量聚合，子代理会话带标记（列表可见，聚合含其 token）。
  - `GET /api/ide/zcode-usage/sessions/:id/rounds`：逐轮行（状态/TTFT/时长/token）+ 轮内按模型分解。
  - `GET /api/ide/zcode-usage/sessions/:id/tools`：工具调用时间线（名称/状态/时长/只读/破坏性/审批/字节数）。
  - 库缺席=空态+说明（不造数据）；只读打开，绝不写库。
- **S2 路由挂载**：`native-routes.ts` 增四个 GET 分支（devtools 同款原生 koa 中间件先例）。
- **S3 客户端 api** `custom/client/ide/api/zcodeUsage.ts`（authFetch 惯例）。
- **S4 客户端 UI**：
  - `IdeCliSessions.vue`（本机 zcode 会话列表）：行内加用量徽（轮数/计费 token/成本），新增「账单」展开——逐轮表（真实 TTFT/状态/token）+ 工具调用时间线，即本机 zcode 会话的轨迹视图。
  - `IdeMetricsPopover.vue`（状态栏遥测面板）：新增折叠分区「本机 zcode 全量账本」：7/30/全部 时间窗 KPI、按模型成本表、按 agent、全链路构成（bySource）、30 日日用量条带。
- **S5 价目补全** `custom/client/ide/utils/modelPricing.ts` TABLE 增行（第一方价，来源 models.dev 2026-10-21 抓取：zai glm-5.3 1.4/4.4/读 0.26/写 0；glm-5.3-flash 0.15/0.5/读 0.03/写 0；deepseek-flash 0.15/0.6/读 0.003；minimax-m3 0.3/1.2/读 0.06；mimo-v2.6-pro 0.435/0.87/读 0.0036；step-5-preview 0.959/2.741/读 0.048；USD/1M tokens）。沿用既立三原则：未收录不显示金额、缓存分价、手工维护。
- **S6 测试**：服务端 `zcode-usage.test.ts`（内存 sqlite 注入，覆盖聚合/整形/空态）；客户端 `zcode-usage-ui.test.ts`（mock api，账单展开/徽章/订阅不显金额）；live 探针 `zcode-usage.live.test.ts`（真库存在才跑，engine-models-levels.live.test.ts 先例——真实工具链先行）。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 不引入 dsh-context 运行时依赖，吸收其「寄生宿主不可变事件流做聚合、不自建采集」的方法与产品形态（洞察页/逐轮账单/全链路构成） | 框架不同（React+Cordis vs Vue），直连无收益；且 zcode 库已是结构化表，比 dsh 的日志 fold 更省——只差消费方 |
| D2 | 数据源=现有三张用量表只读，**不新增任何埋点/落库** | 对标 dsh-context「零自建管道」；4.8G 库已有索引（started_at/session/turn），聚合查询走索引 |
| D3 | 成本在客户端按 modelPricing 估算（服务端只出 token 聚合），价目表单一事实源=client TABLE 增行 | 与既有 G8 轮表成本口径同轨；避免前后端两套价目（现状 server tokens/pricing.ts 与 client modelPricing.ts 并存是历史债，本轮不扩大） |
| D4 | 订阅型 provider（`account:` 前缀，如 bigmodel 包月计划）不显示按 token 金额，显示「订阅」徽 | 包月不按 token 计费，套单价会造假账；诚实原则 |
| D5 | `reasoning_tokens` 按「output 子集」处理（实测包含关系成立），成本=输入+输出，推理仅展示细分 | 防重复计费；锚=本机库违反行数 0 |
| D6 | 会话列表含子代理会话并带标记（聚合口径=全部计入） | 子代理 token 是真实消耗；studio 域看不见的隐藏成本正是本账本要暴露的（bySource 全链路构成同因） |
| D7 | 轨迹先做成 CLI 会话账单内的逐轮+工具时间线，不接 IdeTrajectoryPane | TrajectoryPane 绑 hermes trace 文件语义；硬接会造成两套 trace 语义混流，留后续轮 |
| D8 | 价目数字全部来自 models.dev 第一方条目（zai/deepseek/minimax/xiaomi/stepfun），抓取时间与单价写入注释 | 红线：无锚点不成立；不编造价格 |
| D9 | UI 挂点选 IdeCliSessions + IdeMetricsPopover，避开并行会话在改的 store/ide.ts、IdeSidePane.vue、IdeDevTools.vue | 同域双会话零文件交集，收口不冲突 |

## 验证

- 单测：`npx vitest run custom/server/controllers/ide/__tests__/zcode-usage.test.ts custom/client/ide/__tests__/zcode-usage-ui.test.ts custom/client/ide/__tests__/devtools-ui.test.ts`（末项=相邻路径回归）。
- live 探针：`npx vitest run custom/server/controllers/ide/__tests__/zcode-usage.live.test.ts`（真库聚合非空、TTFT 有真值、缓存命中率 0-1 区间）。
- 全量：合并前 `npm test`。
- UI 走查：`npm run dev`（8649）浏览器验证账单展开与账本分区；若共享注入树被并行会话占用导致无法起独立后端，如实声明未走查项与原因。

### 验证实录（2026-10-21 收口时）

- 单测 14+8 全绿（含路由匹配纯函数：四端点命中/非 GET 不命中/会话 id URL 解码）；devtools-ui/usage-round1 回归 27 项全绿；tsc 对 zcode-usage.ts 零错（native-routes.ts 的 `ctx.request.body` 报错为 origin/main 既有，非本轮引入）。
- live 探针 3 项全绿（真库 13.5 万模型调用/2936 会话聚合非空、TTFT 真值、readOnly 工具存在）。
- 全量 `npm test`：5574 通过 / 0 失败 / 8 跳过。
- **浏览器走查未做**，原因：共享注入树与 8647/8649 端口被 serve-main（钉 main 的共享部署）占用，私栈需 OVERLAY_UPSTREAM_ROOT 新建隔离上游树而磁盘水位 13GB 已低于 20GB 门禁线；替代面=组件 jsdom 挂载断言（账单展开/账本分区/时间窗切换/fail-soft）+ 真库 live 探针 + 路由匹配纯函数。合并重部署 serve-main 后建议人工走查一次账单展开金路径。
