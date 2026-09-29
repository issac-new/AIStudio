# 调研：需求变更治理 + 三账管理看板 → studio 能力完善

- 日期：2026-09-29
- 来源：两篇公众号文章（战略研发领航）
  1. 《研发总监怎么管需求变更：变更评审、影响评估、版本控制》（2026-08-31）
     https://mp.weixin.qq.com/s/ZQceYiGuTvWhWh4ycxStjA
  2. 《研发项目管理看板怎么搭：进度、风险、资源一屏清》（2026-09-21）
     https://mp.weixin.qq.com/s/eGC1q4u9JJW6l230B7dfAA
- 结论：两套方法论与本项目治理/看板面高度互补，本轮落地两个新能力域
  ——**变更治理（/api/change-gov + 治理中心变更区）** 与 **管理三账（看板第三页签）**。

## 一、文章一要点：需求变更治理

### 1.1 指标管控基准（实绩 vs 基准 vs 状态判定）

| 核心维度 | 文章示例实绩 | 管控基准 | 状态 |
|---|---|---|---|
| 月新增变更数 | 128 项 | ≤100 项 | 偏多 |
| 紧急变更占比 | 27% | ≤20% | 偏高 |
| 超时评审占比 | 15% | ≤8% | 超标 |
| 变更返工工时 | 320h | ≤180h | 翻倍 |

方法论：每个管控维度都有数值基准与状态判定，让"真实代价"被管理层看见，
而不是口头承诺与临时插单。

### 1.2 三大失控根因 → 治理动作

| 痛点 | 典型表现 | 深层根因 | 治理动作 | 阶段目标 | 牵头人 |
|---|---|---|---|---|---|
| 评审失序 | 紧急变更占 27%、评审超时 | 无分级机制、无决策时效 | L1-L4 分级 + 明确决策时效 | 一次通过率 ≥80% | 研发总监 |
| 评估失真 | 只提需求不提成本风险 | 无统一影响评估维度 | 五维度评估 + RACI 分工 | 评估完成率 100% | 项目经理 |
| 版本失控 | 版本混用返工多、缺陷反复 | 基线冻结弱、无版本闸门 | 三级冻结窗口 + 基线强绑定 | 冻结穿透率 ≤5% | 配置管理岗 |

## 二、文章二要点：三账决策型管理看板

### 2.1 核心定位

看板不是堆数据做汇报，而是**算清进度、风险、资源三笔账**，让管理层一屏看清取舍：
- 信息堆砌型：堆指标列清单，重展示轻决策 → 半小时抓不住重点；
- 三账决策型：进度+风险+资源一屏穿透 → 30 秒锁定决策点。

### 2.2 三笔核心账

| 账目 | 文章示例发现 | 影响等级 | 决策指向 |
|---|---|---|---|
| 进度偏差 | 绿灯率 62%，关键路径偏 6.8 天 | 最高 | 交付延期风险 |
| 风险分布 | 少量高风险贡献近六成延期影响 | 高 | 资源倾斜依据 |
| 资源结构 | 关键角色过载、通用产能闲置 | 中高 | 结构性错配 |

### 2.3 落地机制与验收标准

| 推进节点 | 核心动作 | 验收标准 |
|---|---|---|
| 一屏联动 | 黄单拆解 + 三类决策对应 | 决策响应时长缩 70% |
| 周度例会 | 偏差/风险/请求三项议程 | 例会时长 ≤60 分钟 |
| 口径统一 | 数据源打通 + 自动更新 | 数据一致性 ≥99% |

## 三、项目现状对账（能力映射，2026-09-29 main）

| 文章能力 | 项目现状 | 缺口判定 |
|---|---|---|
| 变更分级（L1-L4） | 无。最接近先例：审批风险档 high/medium/low、六域体检 L0-L5 | **本轮补齐** |
| 决策时效（SLA） | 无 SLA 机制。仅有 worker 文件审批队列 300s TTL | **本轮补齐** |
| 五维度影响评估 | 无统一评估维度。qgate impact.ts 是路径→门禁选择，非变更影响量化 | **本轮补齐** |
| RACI 分工 | 已有：task.raci 列 + 徽章 + needsMyAction | 复用（挂到变更单） |
| 三级冻结窗口 | 无。先例：SLO 预算 freeze、G1 需求上锁工件、kanban 门禁 gateMode | **本轮补齐** |
| 管控基准指标条 | 无变更域指标。先例：SLO tier 表、六域体检 verdict | **本轮补齐** |
| 绿灯率 | 无。先例：IdeTeamSummaryBar red/amber/green 六态 | **本轮补齐** |
| 关键路径偏差 | 无关键路径算法；任务无 due date；有停滞分级阈值（KanbanTaskCard） | 停滞推算口径（界面标注） |
| 风险 Pareto | 无 | **本轮补齐** |
| 资源负载账 | 部分先例：matrix-teams/stats.ts byAssignee/byAgent（协议卡） | 看板面**本轮补齐** |
| 一屏联动决策点 | 无管理视角页（看板为执行视角） | **本轮补齐** |
| 口径统一 | 已有底座：/api/hermes/kanban/overview 聚合端点 + WS 推送 | 复用 |

## 四、本轮落地设计

### 4.1 变更治理域（文章一 → /api/change-gov）

**数据**：sqlite（node:sqlite DatabaseSync），`CHANGE_GOV_DB` 环境变量可覆写，
缺省 `~/.hermes-web-ui/change-governance.db`。表：`change_requests`、`freeze_windows`。

**分级与决策时效**（SLA 由提交时刻起算，deadline = submitted_at + slaHours）：

| 级别 | 语义 | 决策时效 | 决策权 |
|---|---|---|---|
| L1 | 重大/紧急 | 24h | 研发总监 |
| L2 | 重要 | 48h | 项目经理 |
| L3 | 一般 | 120h | 模块负责人 |
| L4 | 微小 | 168h | 组内备案 |

**五维度影响评估**：进度 schedule / 成本 cost / 范围 scope / 质量 quality / 风险 risk，
每维 0-3 分；总分参与分级建议（紧急旗标或总分 ≥11 → 建议 L1，≥8 → L2，≥4 → L3，否则 L4；
最终级别人工裁定）。RACI 四角色随单登记。

**三级冻结窗口**：tier 1 需求冻结 / tier 2 设计冻结 / tier 3 代码冻结（最严），
scope 可指定看板或全局。窗口生效期内提交的变更自动标记 freeze_violation=1；
L2 及以下变更在冻结窗口内**批准需显式 override_freeze**（409 拦截），L1 不豁免标记但可批。

**管控基准指标**（GET /metrics?month=YYYY-MM，月度口径按 submitted_at 归集）：

| 指标 | 基准 | 判定 |
|---|---|---|
| 月新增变更数 | ≤100 | 超限→warn；>1.25×→over |
| 紧急变更占比 | ≤20% | 同上 |
| 超时评审占比 | ≤8% | 已决超 deadline + 未决已过 deadline 均计超时 |
| 变更返工工时 | ≤180h | implement 时登记 |
| 冻结穿透率 | ≤5% | freeze_violation 占比 |
| 一次通过率 | ≥80% | 驳回后重提（resubmit）计非一次通过 |

### 4.2 管理三账页签（文章二 → 看板第三页签）

**数据面**：复用 `useWorkspaceStore().rawTasks`（/api/hermes/kanban/overview 聚合，
WS 500ms 去抖自动更新——即文章"口径统一、数据源打通+自动更新"的现有底座）。

**口径诚实声明**：看板任务无交付期限（due date）字段，偏差天数按**停滞时长**推算
（阈值与 KanbanTaskCard 停滞分级同源：ready/blocked 1h 琥珀/24h 红、running 10m/1h、
todo 7d/30d）；"最劣偏差天数"取全部任务最劣值，界面明确标注推算口径（非依赖图关键路径）。

**三账**：
1. 进度偏差账：绿灯率（green/total）+ 最劣偏差天数 + 黄红单计数；
2. 风险分布账：偏差天数降序 Pareto——头部 20% 任务占全部偏差天数比例
   （对应文章"少量高风险贡献近六成延期"的集中度口径）+ 高风险清单；
3. 资源结构账：按 assignee 聚合未结负载（todo/running/blocked 分桶）、
   过载阈值 = max(3, 2×均值)、闲置 = 历史出现但当前零未结、
   结构性错配 = 最大负载/均值 ≥2；空受理人聚合到"未指派"桶。

**决策点联动（三类决策对应）**：偏差/风险账→"定位"（跳看板页签+搜索定位任务）；
资源账→过载人员"过滤看板"（assignee filter）+ "去审批"入口（/app/inbox）。

### 4.3 接线清单

| 层 | 文件 | 类型 |
|---|---|---|
| 服务端 | custom/server/governance/change-governance-store.ts | A 类 |
| 服务端 | custom/server/governance/change-governance-controller.ts | A 类 |
| 挂载 | patches/506-server-change-gov-mount.patch（仿 490 两行） | B 类 |
| 客户端 | custom/client/governance/api/changeGov.ts | A 类 |
| 客户端 | custom/client/governance/components/ChangeGovernanceSection.vue | A 类 |
| 客户端 | custom/client/governance/i18n.ts 增 changeGov 子树 | A 类 |
| 客户端 | custom/client/kanban/utils/accounts.ts（纯函数） | A 类 |
| 客户端 | custom/client/kanban/components/ManagementAccountsPanel.vue | A 类 |
| 客户端 | custom/client/kanban/i18n-accounts.ts（模块内词条） | A 类 |
| 客户端 | custom/client/ia2/views/TasksView.vue 第三页签 | A 类 |
| 词条 | patches/507-client-i18n-tasks-tab-accounts.patch（ia2.tasks.tabAccounts） | B 类 |

## 五、验证计划

1. 守门测试：服务端 API 全流程（分级 SLA/冻结 409 拦截/指标月度判定/一次通过率）+
   三账纯函数（停滞分级/绿灯率/Pareto/负载）+ 两组件渲染；
2. 隔离链浏览器走查：OVERLAY_UPSTREAM_ROOT 私有上游 + 端口 8659/8657，
   不污染共享 upstream 树（并行会话在用）；走查脚本 scripts/change-gov-walkthrough.mjs
   断言关键 testid + 截图。

## 六、未覆盖与后续（如实记档）

- 变更单与 kanban 任务的**写路径联动**（批准后自动建任务/改任务）未做——
  本轮先做治理闭环（申请→评审→决议→实施登记），联动留后续；
- 关键路径**算法**（依赖图最长链）未做——task_links 依赖数据在，先以停滞推算口径顶，
  后续可升级为依赖链口径；
- 变更单通知（Matrix 房间派发）未接——raci-dispatch 模式在，留后续。

## 七、过程记档（灾后重建）

首轮实现曾在 /tmp/wxgov worktree 完成到走查 17/20，被 /tmp 并行进程清扫整树丢失
（分支无提交、文件未落 main）。教训：**/tmp 与 ncwk/.claude 均非安全作业区**
（并行会话/系统清理高频掏空），本轮起 worktree 固定放 lab 卷
`/Volumes/nvme2230/lab/.wxwork/`，且**每个稳定节点立即提交**。全部文件自上下文重写，
基于新 main b0014ed9（4A 第六期已挂 Ledger/Runtime/Audit/StateModel 四区，
本轮变更治理区追加其后）。
