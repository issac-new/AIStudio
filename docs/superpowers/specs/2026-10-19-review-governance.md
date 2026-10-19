# 评审治理（Review Governance）设计

- 日期：2026-10-19
- 来源：Anthropic 工程博客《How the Claude Code team does code review》（2026-10-15，Addy Osmani / Morgan Westlee Lunt / Qing Wang）及其中文解读《Claude Code团队内部如何做Code Review》（AI编程实验室，2026-10-18）
- 状态：实施中

## 1. 问题

Claude Code 团队公开的评审体系回答了三个 SwarmStudio 当前没有产品化的问题：

1. **人工审批按什么分配**：不是“每个 PR 都找人看”，而是按改动本身的风险分三档（低 0 人 / 中 1 人 / 高 2 人），受信任作者 + 自动检查全绿才可走零人工通道。
2. **Agent 互审如何收敛**：不设轮次上限时两个 Agent 会通宵互搏；收敛靠轮次上限、只看新增 diff、按 bug 类归并、不重复已发意见、存量问题转夜间扫描。
3. **评审质量如何不退化**：事故与回滚变成回归评测集；用一轮通过率、5+ 轮占比、人工审批数、回滚率做守门，并预留回滚率抬头时自动收紧审批的熔断器。

SwarmStudio 已有 `/api/review` 行内评审、qgate 质量门、并行评审编排与审批台账，但以上三件事都缺：没有变更级风险分级，没有发现项（finding）的严重级/验证投票/去重/轮次语义，没有评审度量与熔断，也没有事故→评测集的回流通道。

## 2. 目标与非目标

**目标**

- 新增“评审案例（Review Case）”领域：以一次变更集为单位，记录风险分级、轮次、发现项、审批与合并就绪度。
- 风险分级按改动内容（路径、规模、是否特性开关后、作者信任度）计算，不按作者是人是 Agent 计算；受保护路径永远至少需要人工审批。
- 审批绑定当前 head commit；新 commit 或手工解冲突后旧审批自动失效；Agent 审批只记录，不占人工名额。
- 互审收敛规则可执行：最多 3 轮、第 3 轮起只看新增 diff、同文件同 bug 类去重、每轮 nit 预算、存量问题转延后队列。
- 度量与熔断：一轮通过率、平均轮次、5+ 轮占比、人工审批中位数、噪声率、存量问题占比、回滚率/事故数；熔断触发时自动升一档审批。
- 在 ⑥治理阶段新增“评审治理”页签，展示策略、熔断状态、案例列表与未决重要发现。

**非目标**

- 不替代 GitHub/GitLab 的 PR 页面，不做代码托管平台集成。
- 不自动执行 merge；只输出合并就绪度与阻塞项。
- 不改动既有 `/api/review` 行内评论与三裁决语义（新领域通过 `reviewId` 关联，不双写评论）。
- 不做多租户隔离（与 `review-store`、`evidence-store` 同一边界，单租户信任模型）。

## 3. 设计

### 3.1 分层

| 层 | 文件 | 职责 |
|---|---|---|
| 类型与默认策略 | `custom/server/reviewgov/types.ts` | ReviewCase / Finding / Approval / RiskAssessment / Metrics / Breaker 类型；默认策略常量 |
| 策略引擎（纯函数） | `custom/server/reviewgov/policy.ts` | 路径 glob → 风险档；人工审批名额；有效人工审批计数；审批失效 |
| 收敛引擎（纯函数） | `custom/server/reviewgov/convergence.ts` | 轮次上限、diff-only、去重、nit 预算、验证票、合并就绪度 |
| 度量与熔断（纯函数） | `custom/server/reviewgov/metrics.ts` | 评审度量聚合；信号窗口 → 熔断状态 |
| 持久化 | `custom/server/reviewgov/store.ts` | 每案例一份 JSON + 信号账 + 评测案例账，原子写、坏档隔离 |
| REST | `custom/server/reviewgov/reviewgov-controller.ts` | `/api/review/gov/*`（挂在既有 review 路由下，免新 patch） |
| 客户端 API | `custom/client/ia2/api/review-gov.ts` | 类型镜像 + fetch 封装 + 纯视图函数 |
| 客户端页面 | `custom/client/ia2/views/gov/ReviewGovPanel.vue` | 策略/熔断/度量/案例/未决发现 |
| 页签注册 | `custom/client/ia2/stage-tabs.ts`、`views/stage/StageShell.vue` | ⑥治理新增 `reviewGov` 页签 |

### 3.2 风险分级规则

输入：`changedPaths`、`diffLines`、`behindFlag`、`author`、`trustedAuthors`、当前熔断状态。

优先级（高→低）：

1. 命中受保护路径（CI workflow、发布脚本、计费、自动更新、鉴权、依赖清单）→ `high`，2 人。
2. 熔断激活 → 原档升一档（`low→medium`、`medium→high`），并禁用低档零人工通道。
3. 命中敏感路径（缓存、更新器、系统提示词、数据库迁移）或常规产品逻辑 → `medium`，1 人。
4. 纯文档 / 纯文案 / 内部工具 / 特性开关后的新增改动 → `low`；受信任作者 0 人，非受信任作者 1 人。
5. 无变更路径或无法判定 → `medium`（保守，不低判）。
6. 大 diff：> 800 行升一档，> 2000 行直接 `high`。

每个结论都带 `reasons` 与命中路径，便于 UI 解释“为什么这档”。

每开新一轮按**累计变更路径**重新分级：新增受保护路径会当场升档，人工名额随之上调，不能沿用首轮的结论；熔断状态在开轮时同样参与升档。

### 3.3 审批语义

- `ReviewApproval { actor, actorKind: human|agent|policy|system, decision: approve|request_changes|comment, commit, at, invalidatedAt? }`。
- 只有 `actorKind=human && decision=approve && commit===case.headCommit` 且未失效的审批计入名额。
- `startRound` 写入新 headCommit 时，把旧审批标记失效（`invalidatedBy: new_commit`）。
- `POST /approvals` 可带 `conflictResolved: true`，同样使旧审批失效（`invalidatedBy: conflict_resolution`）。
- 合并就绪度 = 人工审批达标 + 无阻塞发现 + 检查绿（`checks` 字段，由调用方上报）。

### 3.4 发现项与收敛规则

- `Finding { findingId, file, line, body, severity: important|nit|preexisting, bugClass?, origin: new|preexisting, authorKind, evidence?, state, round, dedupeKey, verifications[], resolution?, deferred? }`。
- 入库校验：`file` 为项目相对路径（复用 review 域归一规则）、`line` 正整数；`severity=important` 必须有 `evidence`（终端输出/截图/命令返回的引用），否则 400。
- 去重：`dedupeKey = file + bugClass(或归一化正文)`；同 key 且未关闭的发现不重复入库，返回既有条目并累加 `duplicateCount`。
- 轮次：`startRound` 在当前轮次 ≥ `maxRounds`（默认 3）时返回 409 `round_cap_reached`，提示“退后一步重新审视方案”，不再允许继续拉锯。
- 只看新增：`round > diffOnlyAfterRound`（默认 2）时，`origin=preexisting` 或文件不在本轮 `changedPaths` 的发现标记 `deferred=true, reason=preexisting_after_round_n`，不阻塞合并，进入延后队列（对应“夜间扫描存量”）。
- nit 预算：每轮最多 5 条 nit；超出的标记 `deferred=true, reason=nit_budget`。
- 验证投票：`POST /findings/:fid/verify` 追加 `confirm|reject`；`authorKind=human` 视为已确认；`confirmed = confirm > reject && confirm >= 1`。只有 `confirmed && severity=important && !deferred && state not resolved/dismissed` 阻塞合并。
- 噪声度量：`answer` 的 `resolution` 取 `fixed|wrong|intentional|didnt_matter`，后三者计入噪声。

### 3.5 度量与熔断

- 度量（按案例聚合）：`firstRoundPassRate`（1 轮内达到 ready 的占比）、`meanRounds`、`p95Rounds`、`fivePlusShare`、`humanApprovalsMedian`、`noiseRate`、`preexistingShare`、`deferredBacklog`、`openImportant`。
- 信号：`revert|incident|merge`，带时间与可选 `caseId/note`；存储上限 2000 条。
- 熔断：窗口默认 24h；`revertRate = reverts / merges > 2%` 或 `incidents >= 2` 时激活，原因写入 `reasons`。激活期间风险分级升一档，低档不再允许零人工。信号回落后自动恢复（窗口滚动计算）。
- 预留：度量接口同时返回 `evalCases` 数量，发现项可 `promote` 为回归评测案例（`source: incident|revert|manual`），对应“错题本”机制。

### 3.6 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/review/gov/policy` | 有效策略 + 熔断状态 |
| GET | `/api/review/gov/cases` | 案例列表（`state/tier/limit`） |
| POST | `/api/review/gov/cases` | 开案例（计算风险档） |
| GET | `/api/review/gov/cases/:id` | 案例详情 + 合并就绪度 |
| POST | `/api/review/gov/cases/:id/rounds` | 开新一轮（新 head commit） |
| POST | `/api/review/gov/cases/:id/findings` | 加发现项（去重/预算/延后） |
| POST | `/api/review/gov/cases/:id/findings/:fid/answer` | 回答（fixed/wrong/intentional/didnt_matter） |
| POST | `/api/review/gov/cases/:id/findings/:fid/verify` | 验证投票 |
| POST | `/api/review/gov/cases/:id/findings/:fid/promote` | 提升为回归评测案例 |
| POST | `/api/review/gov/cases/:id/approvals` | 记录审批（人/Agent） |
| POST | `/api/review/gov/cases/:id/checks` | 上报自动检查状态（green/red/unknown） |
| POST | `/api/review/gov/signals` | 记录回滚/事故/合并信号 |
| GET | `/api/review/gov/metrics` | 度量 + 熔断 + 评测案例数 |

所有写接口的 actor 取 `ctx.state.user`（与 `/api/review` 同源），缺省不伪造。

### 3.7 存储

- `HERMES_REVIEW_GOV_DIR` > `~/.hermes-web-ui/review-gov`。
- `cases/<caseId 哈希>.json`、`signals.json`、`eval-cases.json`。
- 原子写（tmp+rename）；坏档改名 `.corrupt.<ts>` 留档；案例文件名 = 可读前缀 + sha256 前 32 hex，避免清洗名碰撞。

## 4. 验收

1. 纯函数守门：风险分级、审批计数与失效、轮次上限、diff-only、去重、nit 预算、验证票、度量、熔断阈值。
2. REST 守门：开案例→加发现→回答→审批→合并就绪度→信号→度量全链路；非法输入 400；轮次上限 409。
3. 客户端守门：策略表/度量卡纯函数；页签 zh/en 成对；StageShell 组件映射存在。
4. 既有 `/api/review` 测试零回归。
5. `npm run typecheck`、相关 vitest 全绿。

## 5. 与既有能力的关系

- `/api/review`：继续负责行内评论与三裁决；评审治理案例可用 `reviewId` 关联，不重复存评论。
- qgate：继续负责自动检查与证据；评审治理消费 `checks=green` 作为合并前置，不复制执行器。
- 审批台账 `approvals/approval-log.ts`：本轮不双写；评审治理的审批是案例域内的结构化记录，后续可由台账聚合器收编。
- ⑥治理页签：新增 `reviewGov`，不改动既有 `clearance/issues/audit/metrics/docs/gateLog`。

## 决策记录

1. **独立领域而非改造行内评论**：评审治理以“变更集”为单位，行内评论保持现有语义；两者用 `reviewId` 关联，避免同一份评论存两处。
2. **挂载复用 patch 414**：子路由 `prefix=/gov` 与父路由 `prefix=/api/review` 组合成 `/api/review/gov/*`，不新增 B 类 patch，降低注入与升级回归面。
3. **失败分支统一带 `error` 字段**：项目 tsconfig 为 `strict:false`，布尔字面量判别不会收窄；沿用 `review-store` 的 `'error' in result` 约定，避免类型层假绿。
4. **审批只认人类 approve 且绑定当前 head commit**：Agent 审批记痕但不占名额；新提交或解冲突统一失效旧审批，防止旧结论被复用。
5. **重要发现必须有证据**：`important` 缺证据直接 400；Agent 发现需独立验证多数确认才阻塞合并，人类发现视为已确认。
6. **熔断先做“信号 → 状态 → 升档”**：本批只收紧审批门槛，不自动执行回滚；回滚仍由人或发布系统执行，避免越权。
7. **存量问题延后由开关控制**：`deferPreexisting` 默认开；本批只落延后队列与 API，夜间扫描执行器留待后续接入。
8. **配置采用 JSON 覆盖内置默认**：`HERMES_REVIEW_POLICY_FILE` > `<cwd>/config/review-policy.json`；坏配置回落默认，不允许把审批门槛清零。
