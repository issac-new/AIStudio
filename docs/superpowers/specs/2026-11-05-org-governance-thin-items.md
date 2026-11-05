# 2026-11-05 组织治理能力·薄项补强（四项扩展）

## 变更

四处扩展，不新开域。四项均来自调研中「机制成熟但缺一个强制点」的判定。

### 1. Agent 户口五要素 → 扩 `custom/server/agentidentity/`

文章《定义权之争》下篇动作 3「给 Agent 发户口」要求五项：**名字、能力边界、权限范围、审计要求、负责人**。仓内现状对照：

| 要素 | 现有字段 | 判定 |
|---|---|---|
| 名字 | `name` | 具备 |
| 负责人 | `owner` | 具备（注释已写明"谁为这个身份的行为负责"） |
| 权限范围 | `toolAllowlist` | 具备（注释已写明"空=未声明，不等于无限制"） |
| **能力边界** | 无 | 缺失——现有只记"被允许用什么工具"，不记"被设计来做什么、不做什么" |
| **审计要求** | 无 | 缺失——凭证可撤销 ≠ 有审计要求（抽样比例、留存期） |

新增两个字段：

```
AgentIdentity {
  ...既有
  capabilityBoundary: { can: string[]; cannot: string[] }   // 能力边界（设计意图，与 toolAllowlist 的"许可"正交）
  auditRequirement: { sampling: number; retentionDays: number; note?: string } | null
}
```

判定函数 `rosterGaps(identity)` 返回缺失要素清单：

- `capabilityBoundary.can.length === 0` → 缺「能力边界（能做什么）」
- `capabilityBoundary.cannot.length === 0` → 缺「能力边界（不做什么）」
- `auditRequirement === null || auditRequirement.sampling <= 0` → 缺「审计要求」
- `owner` 为空 → 缺「负责人」
- `toolAllowlist.length === 0` → 缺「权限范围」

`rosterStatus(identity)` → `'complete' | 'blocked'`。`blocked` 不删除既有身份（存量兼容），但：

- `GET /api/agentidentity/roster-gaps` 列出全部 `blocked` 身份与缺项
- 新注册接口在 `blocked` 时返回 201（**仍注册**）但响应体带 `rosterGaps`，并写 `IdentityEvent(action='register', detail='roster-incomplete: …')`

**为什么不 fail-closed 拒绝注册**：存量身份全部缺两项，一次性拒绝会让既有部署不可用。采用"注册放行 + 缺口可见 + 门禁拦"，把强制放在门（见第 4 项），不放在注册路径。这是本项最重要的取舍。

### 2. 决策权审计两比例 → 扩 `custom/server/decisiongraph/`

文章《断裂与重建》6.1 的决策权审计给出三个标注（谁发起 / 谁能否决 / 介入阶段）与两个比例（设计阶段介入比 / 实质否决率）。

现状：`BridgeDecision` 有 `outcome`、`decidedBy`、`category`、`scenario`，无「介入阶段」。

新增字段与纯函数：

```
BridgeDecision {
  ...既有
  stage?: 'initiate' | 'design' | 'review' | 'implement' | 'posthoc'
}
```

- `stageRatios(decisions)` → `{ designShare, vetoRate, distribution, sample }`
  - `designShare` = `stage in (design)` 计数 / 有 `stage` 的决策数
  - `vetoRate` = `outcome === 'rejected'` / (`rejected` + `approved`)
  - 缺 `stage` 的历史记录不计入分母，单独回报 `unstaged: n`（不猜阶段）
- 端点 `GET /api/governance/decision-graph/stage-ratios`
- `sample < 10` 时返回 `available: false` 与 `gap`

### 3. 批准前六问 → spec 模板 + 门禁 claim

文章三处批准清单（下篇 6.4 五问、下篇「批准前必答」七问、上篇 1.2 前提两问）合并成适配本仓的六问，进 `skills/swarm-yuan/assets/spec-template.md` 与仓内 spec 骨架：

```
## 批准前六问

1. 本变更推动的是哪一个具体决策？谁做、给谁看？
2. 关键数字的出处与口径是什么？（涉及统计/度量时必答，否则写"不涉及"）
3. 失败可逆吗？回滚路径是什么？
4. 谁为结果署名？（须为具体人/角色，不接受"团队"）
5. 什么条件下这个变更应该被停掉或回退？
6. 它动了哪几条「语法」（权限 / 预算 / 考核 / 数据权属）？
```

第 5 问与 A 组的 `stopCondition` 同源——文章辨伪底线的两处落点（配置层与提案层）。

强制面：qgate claim `orgscale.spec-six-questions`，`task_close` 时检查本次改动新增/修改的 spec 是否含该段且六问均有非空答案。

### 4. 60 分线任务级前置 → 归入 A 组

不单独设机制。A 组 `dod.stopCondition` 即为任务级前置：缺 `stopCondition` 的任务不得进入 AL>=3 的执行路径。此处只登记归属，避免同义机制两处实现。

## 决策记录

- **D1（户口缺项不 fail-closed 注册）**：存量 30 个 profile 身份全缺「能力边界/审计要求」，fail-closed 会让既有部署立即不可用。改为"注册放行 + 缺口可见 + 门禁拦"。代价：缺口存在期可见但不阻断；收益：不制造迁移悬崖。
- **D2（`capabilityBoundary` 与 `toolAllowlist` 分立维护）**：两者语义不同——一个是"设计意图"（被造来干什么），一个是"许可"（被允许调用什么）。合并会让"能力边界写宽了"自动等于"权限放宽了"，是权限面最危险的一类混同。
- **D3（`vetoRate` 分母只取 approved+rejected）**：`deferred` 既非通过也非否决，计入分母会稀释否决率。缺 `stage` 的历史记录单独计数，不按 `category` 猜测回填。
- **D4（六问写进 spec 模板而非独立表单）**：独立表单会变成第二份事实源。写进模板 = 与 spec 同生共死，且能被现有 L2/L3 检查链顺带覆盖。
- **D5（第 4 问拒绝"团队"署名）**：文章反复强调「一个没有人愿意为之负责的结果，在组织里等于不存在」。允许"团队"署名等于允许无人负责。

## 验证

- `npx vitest run custom/server/agentidentity/__tests__/` —— `rosterGaps` 五要素逐项缺一命中、`rosterStatus` 两态、存量身份（无新字段）不抛异常。
- `npx vitest run custom/server/decisiongraph/__tests__/` —— `stageRatios` 各阶段分布、`vetoRate` 不含 `deferred`、`unstaged` 单独计数、`sample < 10` 返回 `available:false`。
- spec 六问：既有 spec 结构守门测试（`spf_sections_check` 家族）不因模板新增段落而红；新模板生成的 spec 含六问段。
- 端点探活：`GET /api/agentidentity/roster-gaps`、`GET /api/governance/decision-graph/stage-ratios` 返回 200。
- 浏览器实物走查：`AgentIdentitySection.vue` 出现缺项标记（缺什么逐条列出）。
- `npm run typecheck:harness` + 全量 `npm test` 零新增失败。

## 设计文档影响

**DESIGN_SYNC: touched** —— 整合正本 §4.3（agent teams 的组织与治理）需补一句：Agent 身份记录含「能力边界」与「审计要求」两项，能力边界是设计意图、与工具白名单的许可语义分立。§3.6 的治理视图清单标注决策阶段比例读数为读侧投影。同批修订附录 A 索引。
