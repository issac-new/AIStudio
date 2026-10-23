# 天猫数字员工两文吸收轮：交付效能面 + 协作画像（2026-10-23）

## 背景与来源

用户指定两篇大淘宝技术《天猫数字员工》系列文章深入调研并完善 SwarmStudio：

1. 《天猫数字员工（实践篇）——接管全链路：交付能力与技术拆解》，大淘宝技术，2026-10-23 12:37，
   https://mp.weixin.qq.com/s/kLWwdqZzhm0rqEGQMzn2Iw
2. 《天猫数字员工（协作篇）——研发的暗物质与 AI Native 组织协作》，大淘宝技术，2026-10-21 10:18，
   https://mp.weixin.qq.com/s/o_y-WjIFV2Qoa8lpHKR4BQ

（提取时间 2026-10-23；全文经 wechat-article-extractor 落档本轮工作分支。）

## 文章核心主张（对本轮有用的部分）

**协作篇**：
- 研发提效瓶颈不在编码（两成亮的），在协作与知识（八成暗的「暗物质」）；四种摩擦=传递（传丢/传歪）、获取（在等/在找）、默契、决策。
- 病根=隐性上下文没有载体；解法=协作形态（驻群共享上下文）+资产沉淀（上下文层）两条线。
- 上下文层四维资产：知识（装载）/能力（调用）/过程（检索）/**协作（查询——「谁懂什么、该找谁」，每条推荐挂可回查原文证据）**。
- 三级协作演进：流程协同→单人主导→数字员工主导（它找人）；「打扰升级决策链」=先查知识资产→再查判例→才找人。

**实践篇**：
- 效能度量两把尺子：**需求分层 C1-C4（复杂度，七维就高）× AI 交付深度 L1-L4（承接范围）** 交叉画像，每格「需求数+平均介入次数」。
- **人工介入次数**按协作层/交付层分账；介入归因打标（催进度/解决卡点/拍板确认/提出需求/纠错返工/补充上下文）+风险信号（上下文缺失/理解偏差）；口径声明：计划内确认计入参与轮次但不判「非自主」，介入次数只用于观测归因、不追求越低越好。
- **日报**：每天一份需求摘要（当前状态/下一步动作/待处理事项/趋势变化/卡点负责人/停留时长），可追问「第 2 条展开说说」。
- 明确反对的口径：代码采纳率/使用覆盖率答不了「承接到了哪一步」。

## SwarmStudio 现状对账（2026-10-23 实测）

已有：看板 28 块「人-域」迷你板（SQLite，含 task_events 生命周期事件）、推演 run 台账
（compensation-ledger.tsv：run22 实测 85 条 dispatch-preset/13 auto-approve/1 nudge）、
G5 release-gate.jsonl 与 uat-verdicts.jsonl 判词、eval 域难度/角色分桶（京东轮）、
监督面板 briefs、reviewgov nightly。时长计算先例 optadvice/leadtime.ts；直读看板库先例
governance/board-status.ts。

缺口（本轮补）：**介入归因账本**（六类打标+两层分账+风险信号）、**C×L 效能画像矩阵**、
**日报**、**协作画像「谁懂什么」路由表**——四件均不存在。

实测数据约束（决定口径设计）：
- SIM 侧 studio 库 gc_messages 为空表（群聊走 Matrix 不入库）→ 协作画像证据源不依赖 gc_messages，
  改道台账 dispatch-preset（`from=<人> text=<原话>`）+看板 slug（28 块全为 `<人>-<域>` 形态）+任务事件。
- task_events 只有生命周期 kind（created/claimed/heartbeat/spawned/commented/completed/timed_out），
  无 column_transition → L 档以 status+事件为准，不用 leadtime 瀑布。
- tasks.estimate_days 全空、task_links 全空 → C 档信号缺席为主，设 C0=未评估如实降档。

## 落地四件套

### 1. delivery 域（custom/server/delivery/，prefix `/api/hermes/delivery`）

- `interventions.ts`（纯函数）+ `GET /interventions?run=`：聚合推演 run 台账与判词 → 介入条目
  `{ts, actor, layer(协作/交付), type(六类), source, run, snippet, anchor}` + 统计 + 风险信号。
- `matrix.ts`（纯函数）+ `GET /matrix`：看板任务 → C×L 矩阵，每格 `{count, avgInterventions|null}`。
- `digest.ts`（纯函数）+ `GET /digest`：跨板日报（状态盘点+24h 完成+卡点含负责人与停留时长+
  评审排队老化+停滞候选+下一步建议），条目可展开（详情行）。
- `boards-reader.ts`：lean 直读看板库（board-status.ts 同款：主库+boards 目录、逐板 fail-soft、只读即关）。

### 2. expertise 域（custom/server/expertise/，prefix `/api/hermes/expertise`）

- `evidence.ts`（纯函数）：从台账 dispatch-preset/看板 slug/任务标题/任务事件提炼
  `人 × 概念 × 证据`（证据={source, snippet, anchor, ts}）。
- `GET /wall`：画像墙（人→概念列表+证据数+最近活跃）；`GET /search?q=`：概念检索 →
  候选人按 `证据数×2 + 新近度衰减` 排序，每条挂可回查证据。

### 3. 客户端·看板域第 4 页签「交付效能」（TasksView tab key=effectiveness）

`custom/client/ia2/views/effectiveness/`：日报卡 + C×L 矩阵（CSS 格阵，同 eval 金字塔不引
echarts 先例）+ 介入归因（run 选择器+六类分布+两层分账+风险信号）。i18n 模块小字典
（zh/en 成对导出供守门断言）。

### 4. 客户端·协作与知识页签新区块「协作画像·谁懂谁懂什么」

GovOrgKnowledgeView 增 `ExpertiseSection`（搜索框+画像墙卡片），消费 expertise 域端点。

## 口径决策（逐条可辩驳）

| # | 决策 | 依据 |
|---|---|---|
| D1 | 介入六类映射：dispatch-preset 带 from=人→首条=提出需求、后续=补充上下文；nudge→催进度；release-gate/uat 判 pass/approve→拍板确认、reject→纠错返工；任务 commented 事件→补充上下文 | 文章六类逐一落到 SwarmStudio 实有数据源；无对应数据的类型不造数 |
| D2 | 两层分账：协作层=台账 dispatch-preset（群/导演侧派发与澄清）；交付层=nudge、判词门、任务事件（执行链内） | 文章「协作层=主 Agent 群内、交付层=编码子 Agent 会话后」的 SwarmStudio 同构 |
| D3 | auto-approve 不计入介入（系统代行=计划内节点），在统计 meta 单列 | 文章「计划内确认计入参与轮次但不判非自主」的从严侧 |
| D4 | C 档代用口径：estimate_days（≤1=C1/≤3=C2/≤5=C3/>5=C4）与子任务数（≥1=C2/≥3=C3/≥6=C4）取高；信号全缺席=C0 未评估 | 文章七维人工判定不可机判；如实降档优于伪精确（eval 域「全未标注→undefined 不产噪」先例） |
| D5 | L 档：todo 族=L0 未启动；started_at 有值=L1 已认领；running/blocked=L2 执行中；review=L3 评审中；done+result 非空=L4 完成有产物，done 无 result 降 L3 | SwarmStudio 看板生命周期实况（实测无 column_transition） |
| D6 | 矩阵 avgInterventions 用任务 commented 事件数（板库内实有）；台账派发词无 taskId 锚不强行挂任务 | 断言带锚点纪律；不造 join |
| D7 | 介入账本只观测归因、不做 KPI；风险信号阈值：补充上下文占比≥40% 且总量≥5=上下文缺失；纠错返工≥3 次=理解偏差 | 文章「介入次数不追求越低越好，只用于定位改进方向」 |
| D8 | 协作画像证据评分=匹配概念证据数×2+新近度衰减（30 天半衰），每条证据必带 anchor（台账行 id/看板 slug/任务 id/事件 id） | 文章「每次打扰都带着理由」「候选人按证据强度排序」 |
| D9 | 日报区间=24h 滚动窗，趋势=本窗 vs 上一窗；停留时长=now−最后事件时刻（秒级，<1e12 视作秒×1000 归一） | detectors.ts 既有容错约定 |
| D10 | 读模型全部 fail-soft（源缺席 available:false/空数组如实呈现）；不写任何存储 | custom/server/AGENTS.md 读写语义铁律 |
| D11 | 端点只读不鉴权扩面（上游 JWT 统一拦 `/api/*`），无越权面 | 现有惯例 |
| D12 | 客户端页签落在看板域第 4 键（工作台 3→4），守门测试拆分守恒断言随批更新（3+5+1=9 → 4+5+1=10） | 页签纪律：同域相关（交付效能消费看板数据）不新开岛屿 |

原不做四项，2026-10-23 挂账批（用户指令「完成挂账及剩余待办」）再评估后落三项、保留一项：
- 落地：三级演进→协作成熟度读数（D17）；判例库检索（D18）；概念口径冲突提示（D19）。
- 保留不做：确定性消息直转/首响 P90——hermes-agent 运行时行为，overlay 侧不可达（真实约束未变）。

## 挂账批（D16-D19）

| # | 决策 | 依据 |
|---|---|---|
| D16 | C 档补数=81 任务按标题语义分档批量写 estimate_days（探针/跟踪/登记类 0.5d=C1、单功能片/单项评审 1-3d=C2、端到端单域卡 4d=C3、跨端主卡/统一下单全景 6d=C4）；写通道=hermes CLI（HERMES_HOME 指 SIM 侧，过 kanban_write_sanctioned 触发器的唯一合法通道——plain sqlite3 被拦，mx-clean 实锤） | SIM 推演语义=代演（预写派发词先例）；估时是代演人给估时，非造业务数据；写库走 sanctioned 通道不破写守卫 |
| D17 | 协作成熟度三级（文章三级演进的 SwarmStudio 读数版）：L1 流程协同（默认档）/L2 单人主导/L3 数字员工主导；读数=协作层介入占比、系统代行（auto-approve）率、nudge 频次、纠错返工数；档位判定纯启发式（协作层占比≤60% 且系统代行>0 → 迈向 L2 迹象等），UI 标注「参考读数非结论」 | 文章三级扳机（组织垂直化/资产厚度/模型能力）不可直接机判；用介入账本实数据画像「今天站在哪、差什么」 |
| D18 | 判例库检索 /api/hermes/precedent/search：按 run 聚合（run id/周期/问题单数/处置数/关键词条目），源=活跃 runs/<id>/evidence（台账 dispatch 行+issues）+归档 tar（archive/*/runs.tar 先列清单缓存、命中 run 后 tar -xOf 按需抽单文件，不全量解压）；检索词命中台账派发词/问题行 | 文章「过程资产：类似需求怎么做的、接需求检索类似判例当样板」；归档在 NVMe tar 的读取面=清单+按需抽，体积可控 |
| D19 | 概念口径冲突提示：expertise 域 wall/search 对同一概念挂多人且证据域≥2（板 slug 域不同）时标注「跨域概念·口径待对齐」（conflicts 字段）；提示非结论，留给用户裁定 | 文章「传歪」摩擦（cursor/nextToken 同物异名）的机械可检代理；语义级冲突检测需 NLP，机械面只做跨域标注 |


## 验证计划

1. vitest：delivery/expertise 域 `__tests__/`（纯函数正反例+临时夹具起 koa 端到端断言，
   env 覆盖 afterEach 复原、绝不写真实 home）。
2. `npm run typecheck:harness`（新文件入清单）+ ts-node serve 启动编译门。
3. 守门测试更新：workbench-nav-centers 拆分守恒、i18n zh/en 成对。
4. 浏览器 web 版走查（localhost:8649）：交付效能页签四区块+协作画像搜索，活体数据可见。

## 决策记录

- 2026-10-23 立项（用户指令「深入调研两文完善 swarm studio」）：选四件套落地面（介入账本/矩阵/日报/协作画像），
  弃三级演进视图等四项（D12 同段「不做」），口径 D1-D11 全部以实测数据约束为准（gc_messages 空表、
  无 column_transition、estimate_days 全空三项实测直接改变了设计）。
- 遵循吸收轮先例（京东轮/RRSI 轮/diagram 轮）：调研→对账→纯函数域+端点+页签→测试+走查→合 main。
- 2026-10-23 卫生批（活体走查实录驱动，D13-D14）：
  D13 台账 TSV 解析 detail 只取第 5 列止——此前 cols.slice(4).join 把 status 列（open）吞入摘要与
  概念抽取（「open」成为画像墙高频噪音词的实测根因）。
  D14 概念词卫生：停用词增补（open/status/resolution/backfill/matrix/agent/desc——群域名与自指词）；
  结构词形过滤（纯数字开头、*-agent 后缀、v* 开头 run 形态）；extractTerms 不再把 run id 拼入抽取
  文本（v8-run22 类噪音源头）。切词粒度不深修（拉丁连字符二元切出 an-paycore 类片段属可容忍噪音，
  排序正确性不受影响——search?q=pay 实测 chen>wei>lin>qi>fanfan 与看板归属一致）。
  D15 派发词模板话术剥离：台账 dispatch-preset 尾部统一带「（预写派发词代演人类派单）」
  模板括注，CJK 二元组会切出 人类/代演/写派 类高频假概念——抽取前正则剥括注（治本）
  +模板词入停用表（兜底）。
- 2026-10-23 挂账批（用户指令「完成挂账及剩余待办」）：D16 C 档补数（81 任务估时分档走 hermes CLI
  sanctioned 通道批量写入）；D17 协作成熟度三级读数；D18 判例库检索（活跃 runs+归档 tar 按需抽）；
  D19 概念跨域冲突提示。首响 P90 维持不做（hermes-agent 运行时，overlay 不可达）。
