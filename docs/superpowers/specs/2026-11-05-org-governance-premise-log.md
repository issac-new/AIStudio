# 2026-11-05 组织治理能力·B 组：假设登记簿

## 变更

新增服务端域 `custom/server/premiselog/`。把「我们的判断基于哪些关于外部世界的假设、它们何时该被复核、被推翻时哪些东西跟着失效」做成入库对象。

来源：泊珩简澈《从规划未来到生成未来》上篇 1.2「一个标本：Chegg 的崩塌」给出的第 1 个判断——**「战略规划的第一产物不是规划书，是假设清单」**；以及下篇 Step3 的判词「校准不是提高开会频率，是给每一条假设标上复核日期」。

仓内现状：全仓 `假设登记` 0 命中，`premise` 仅 1 处（`skills/swarm-yuan/references/pstack-methodology.md:104` 的 `attack-the-premise` 排障方法论，是"怀疑前提出问题"的调试手法，不是登记簿）。本域是空白补齐。

### 数据模型

```
Premise {
  id: string                    // pr-YYYYMMDD-NNNN
  statement: string             // 一句话陈述（可被证伪的形式，非口号）
  kind: 'market' | 'tech' | 'org' | 'cost' | 'compliance'
  scope: string[]               // 失效传播范围：受影响对象锚（spec 文件名/域/端点/看板列）
  reviewAt: number              // 复核日期（校准的落点）
  status: 'hold' | 'pending' | 'refuted' | 'expired'
  confidence: 'high' | 'medium' | 'low'
  refutedBy?: { evidence: string; at: number; by: string }
  supersededBy?: string
  createdAt: number
  createdBy: string
}
```

`statement` 的质量门槛（判定函数 `checkStatement`）：必须可被证伪——拒绝纯口号（黑名单词 + 最小信息量），要求含比较对象或可观测条件。文章对「前提」的要求是「哪一条一旦被推翻，整套逻辑会同时失效」，所以 `scope` 必填且非空：写不出影响面，等于这条假设不承重。

### 四个动作

| 动作 | 函数 | 行为 |
|---|---|---|
| 到期队列 | `dueQueue(now)` | `reviewAt <= now` 且 `status='hold'` → 列 `pending`（逾期天数） |
| 过期升级 | `expireOverdue(now, graceDays)` | 超宽限仍未复核 → `status='expired'` |
| 推翻影响面 | `impactOf(id)` | 遍历 `scope`，逐锚返回：存在的受影响对象 / 锚已失联（`stale`） |
| 推翻联动 | `refute(id, evidence)` | 置 `refuted` + 记录证据来源；生成重评队列条目 `ReevalItem` |

`ReevalItem { premiseId, anchors[], reason, queuedAt, state: 'queued'|'done'|'dismissed' }` —— 重评队列不清空不丢失，`dismissed` 必须带理由。

### 端点（挂 `/api/premiselog`）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/premises?status=&kind=` | 列表（默认全部） |
| POST | `/premises` | 新建（`checkStatement` 不过则 422 返回逐项理由） |
| PUT | `/premises/:id` | 更新（`statement` 变更保留历史版本，防静默改写） |
| GET | `/due` | 到期/逾期队列 |
| POST | `/premises/:id/refute` | 推翻（body 带 evidence），返回影响面与生成的重评项 |
| GET | `/premises/:id/impact` | 只读影响面 |
| GET | `/reeval` | 重评队列 |
| POST | `/reeval/:id/resolve` | 处置（done/dismissed + 理由） |

### 强制面

并入 A 组的 `.qgate/gates/governance.orgscale.yaml`，claim `orgscale.premise-freshness`：`release` 触发时，`kind in (market, tech)` 且 `status='hold'` 且 `reviewAt` 逾期的假设 → 判 `CONDITIONAL`（不是 FAIL：假设逾期不等于产品不可发布，但必须在发布说明里出现）。

### 客户端

新增 `custom/client/governance/components/PremiseLogSection.vue`，插入 `GovOrgKnowledgeView.vue`（协作与知识页签）。展示：假设台账（状态色带）、到期队列、「被推翻 → 影响面 → 重评队列」三步链路、`stale` 锚标红。

## 决策记录

- **D1（`scope` 必填而非可选）**：文章的核心不是"记录假设"，而是"知道哪条假设一倒会连带什么倒"。允许空 `scope` 会让登记簿退化成笔记本。代价：录入成本上升；收益：推翻时有可执行影响面。
- **D2（`statement` 做形式校验而不是内容评审）**：内容真假无法机器判断，但"是否可被证伪"有形式特征（含对象/条件/比较）。校验只拦明显口号，把实质判断留给人。避免用机器判真伪造成假权威。
- **D3（推翻触发 `CONDITIONAL` 而非 `FAIL`）**：发布门若因假设逾期直接 FAIL，会诱导把 `reviewAt` 一律往后推（古德哈特式规避）。用 CONDITIONAL + 发布说明必列，保留可见性又不制造规避动机。
- **D4（重评项不可静默删除）**：`dismissed` 必带理由，与文章「让失败可见」一致；无理由删除等于把闭环重新切断。
- **D5（不复用 decisiongraph）**：决策与假设是两类对象——决策是已发生的选择，假设是尚未验证的判断，混存会让"被推翻"语义污染决策图谱的 outcome 三态。

## 验证

- `npx vitest run custom/server/premiselog/__tests__/` —— `checkStatement` 正反例、`dueQueue` 边界（当日/逾期/宽限）、`impactOf` 存在锚与 `stale` 锚、`refute` 生成重评项且不可静默删除。
- 域级集成：新建→到期→推翻→影响面→处置 全链路一次跑通；`PUT` 改 `statement` 保留历史。
- 端点探活：`GET /api/premiselog/premises` 与 `/due` 返回 200。
- 浏览器实物走查：协作与知识页签出现假设台账区块，三步链路可点通。
- `npm run typecheck:harness` + 全量 `npm test` 零新增失败。

## 设计文档影响

**DESIGN_SYNC: touched** —— 整合正本 §3.6 追加「假设登记簿」一段：定位为读模型＋标注层（登记簿本身是业务对象，但影响面是读侧计算），说明它与 `decisiongraph`（已发生决策）的边界。同批修订附录 A 索引。
