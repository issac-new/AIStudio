# 2026-11-05 组织治理能力·C 组：度量纪律

## 变更

新增服务端域 `custom/server/metricpolicy/`。三件事：指标双轨命名空间、四类核心指标派生、装饰化判据。

来源：《从规划未来到生成未来》下篇 Step6（四类核心指标 / 三个过程信号 / 反向指标 / 指标双轨与古德哈特定律）与第七部分伪重建之「数据装饰化」。

仓内现状：`测量指标`／`结算指标`／`古德哈特`／`人机配比`／`返工率` 均 0 命中；`覆盖度` 13 处但无三维组合；技能调用计量 0 命中。既有指标散落在 `governance-analytics.ts`（派发/看板/qgate 计数）、`harness/cost`（token/人工干预/工具执行/等待时延/返工成本）、`run-metrics.ts`，无命名空间隔离、无消费者登记。

### 数据模型

```
MetricDef {
  key: string                    // 形如 'measure/autonomy-rate'
  namespace: 'measure' | 'settle'   // 双轨
  title: string
  definition: string             // 口径一句话，含分子分母
  sources: string[]              // 数据源锚（域/文件/表）
  consumers: { decisionRef: string; changedAt: number; note?: string }[]
  derivedFrom?: string[]         // 派生自哪些原始指标
  version: number
  readonly?: boolean             // settle 轨只读，变更需审批
}
```

### 三条判定

| 判定 | 函数 | 判据 |
|---|---|---|
| 双轨隔离 | `checkNamespace(def, all)` | `settle/*` 的 `derivedFrom` 不得指向 `measure/*`；违反即配置错误（422）。理由：测量指标一旦进入考核口径就会失真（古德哈特定律），混轨等于把学习工具变成考核工具 |
| 装饰化判据 | `isDecorative(def)` | `consumers` 为空 → `decorative: true`。文章判据句：「过去一个季度，有哪个决策因为这个看板上的某个数字而改变？」答不出即装饰 |
| 结算稳定性 | `checkSettleStability(def, prev)` | `settle/*` 的 `definition` 变更须升 `version` 且留旧版；无版本号变更即拒（分配口径不可静默漂移） |

### 四类核心指标（派生，不新增埋点）

文章给出的四类核心：自主运营比例、人机配比、单任务人时、返工率。全部从既有面派生：

| 指标 | 口径 | 数据源 |
|---|---|---|
| 自主运营比例 | AL>=4 的任务数 / 已派发任务数 | `autonomygov` 配置 × 任务台账 |
| 人机配比 | 每人类 owner 名下的 agent 任务数（均值/分布） | `handoff` + `dispatch-ledger` + session 记录 |
| 单任务人时 | 任务 created→completed 的中位数（分钟） | kanban 任务表 |
| 返工率 | `changes_requested` 次数 / 任务完成数 | 看板事件 |

每个派生函数返回 `{ value: number | null, sample: number, available: boolean, gap?: string }`。样本不足（`sample < 5`）返回 `available: false` 并写明缺口，**不猜数**。

### 技能调用计量（派生，不插桩）

`skillUsage()` 从 session 记录与 audit 记录里提取 skill 引用：`{ skill, refs, tasks, failures, reuseRate }`。**如实边界**：若运行时未记录 skill 级引用，返回 `available: false` 与 `gap: 'skill-level reference not recorded in session/audit surfaces'`，并在页签标注"数据缺口"，不编造。插桩属 vendor 面，本轮不做。

### 端点（挂 `/api/metricpolicy`）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/metrics?namespace=` | 指标登记簿 |
| PUT | `/metrics/:key` | 登记/更新（跑三条判定） |
| GET | `/core` | 四类核心指标派生结果（含 available/gap） |
| GET | `/decorative` | 装饰化清单 |
| GET | `/skill-usage` | 技能调用计量（可能 available:false） |
| GET | `/interface-count` | 反向指标：跨系统取上下文的接口数（来自 changedfiles/impact 面，不可得则 unknown） |

### 强制面

并入 `.qgate/gates/governance.orgscale.yaml`，claim `orgscale.metric-registry`：`task_close` 时，若本次改动新增了指标消费点却未在登记簿登记 `key` 与 `consumers`，判 `INCONCLUSIVE`。advisory 起步。

### 客户端

新增 `custom/client/governance/components/MetricDisciplineSection.vue`，插入 `GovHarnessView.vue`（研发效能页签）。展示：双轨两组、四类核心卡（含缺口态）、装饰化清单标红、技能计量缺口说明。

## 决策记录

- **D1（双轨落成命名空间而非标签）**：标签可以被忽略，命名空间可以在配置层报错。`settle/*` 引用 `measure/*` 直接 422，是唯一能防"指标悄悄变成考核"的机械手段。
- **D2（四类核心全部派生、不埋点）**：新增埋点要改运行时（vendor 面）且会引入不可回滚的采集成本。既有面已够算出四类核心，先派生并在样本不足时诚实返回 `available: false`。
- **D3（技能计量接受 `available: false`）**：不为凑一个漂亮的复用率去插桩。文章自己强调「不能被检验的动作不是动作」——同样，拿不到的数不装成拿得到。
- **D4（`settle/*` 只读 + 版本化）**：分配口径的稳定性优先于灵活性。变更必须升版本并留旧版，防止"口径漂移导致历史不可比"。
- **D5（接口数先做不可得即 unknown）**：反向指标需要跨系统调用链数据，仓内暂无统一接口计数源。先占位并标 unknown，接数据源留后续轮；不伪造趋势图。

## 验证

- `npx vitest run custom/server/metricpolicy/__tests__/` —— 双轨隔离（settle 引用 measure 报错、反向允许）、装饰化（空 consumers/非空）、结算版本（同版本改 definition 拒绝、升版本通过）、四类派生函数在样本不足时返回 `available:false` 且 `gap` 非空。
- 派生函数对空数据面不抛异常（fail-soft 断言）。
- 端点探活：`/core`、`/decorative`、`/skill-usage` 返回 200 且结构含 `available` 字段。
- 浏览器实物走查：研发效能页签出现度量纪律区块，缺口态可见。
- `npm run typecheck:harness` + 全量 `npm test` 零新增失败。

## 设计文档影响

**DESIGN_SYNC: touched** —— 整合正本 §3.6「交付效能」段落后追加「度量纪律」一小段：四类核心指标的口径与来源、双轨命名空间的约束、缺口态如实标注（`available:false`），并与既有「成熟度参考读数非结论」的纪律对齐。同批修订附录 A 索引。
