# 工具策略引擎（声明式策略 + strict/fail-closed + 有效性体检）（2026-10-21）

> 来源：调研《微软 Agent Governance Toolkit 拆解：把「请 AI 守规矩」换成
> 「让 AI 没法不守规矩」》（Wester 的 AI 安全札记，2026-09-28）。
> 原文核心：治理必须落在确定性应用代码的工具调用边界上；策略即代码、
> 失败即关闭、防篡改审计、按 agent 身份裁决。原文同时点名三个现实坑：
> 策略未加载时默认 allow（仪表盘照样显示 governed）、kill switch 语义不一致、
> 审计只记 attempt 不记 outcome。

## 现状盘点（改前）

已有执法链（`toolpipeline/enforce-gate.ts`）：身份 allowlist/委托 → 沙箱路径/域名 →
预算 → 自治阶梯 → 全局权限模式。已有审批桥、决策账、工具契约、九层体检。

缺口（与原文逐条对账）：

| 原文能力 | 本仓现状 | 本轮动作 |
|---|---|---|
| 确定性工具边界拦截 | 已有（HERMES_TOOL_ENFORCE=1） | 不重建，作为策略层挂载点 |
| 策略即代码（YAML/规则表） | 缺：只有阶梯/权限模式等粗粒度配置 | **新增声明式规则引擎** |
| strict（deny-by-default） | 缺 | **新增模式** |
| 求值异常 fail-closed | 现有执法门内部异常 fail-open | **策略层异常 deny**（只影响策略层） |
| 策略 lint / 可机器校验 | 缺 | **新增 lint（问题/告警分离）** |
| 「策略没加载却显示已治理」 | 仅九层体检提示总闸状态 | **策略页显式姿态横幅 + 决策账** |
| 审批人/规则名可追溯 | 审批单只有执法规则名 | **批单与决策账带 policyRuleId** |
| MCP 网关 / kill switch / outcome 校验 | 缺 | 本轮不做，列后续轮 |

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 策略是**附加约束层**，不能放宽既有硬边界 | 身份/沙箱/预算先于策略；策略 allow 命中后仍继续走阶梯/模式。strict 只增加“未显式 allow 即拒”，不做绕过 |
| D2 | 三层优先级：identity/sandbox/budget → **policy** → ladder/mode | 硬边界永远先赢；策略比粗粒度默认档更具体 |
| D3 | 未配置策略 = `inactive`，不改行为；**已配置但加载/校验失败 = deny** | 保留“未配置 ≠ 已治理”的诚实语义，同时消除“配置坏了却静默放行” |
| D4 | strict 无命中 → deny；permissive 无命中 → 放行但继续走既有链 | 对应原文 deny-by-default 与宽松模式两种合法用法 |
| D5 | 规则匹配 = 多条件 AND（tools/categories/users/profiles/argPattern），同类数组内 OR；按 priority 降序、同优先级按列表顺序取首条 | 确定性优先：同一输入永远同一裁决 |
| D6 | `argPattern` 统一大小写不敏感、上限 200 字符、对入参值文本求值（不含参数名） | 覆盖命令/路径/发送目标等场景；避免键名误命中 |
| D7 | 策略存 `~/.hermes-web-ui/tool-policies/policies.json`（`HERMES_TOOL_POLICY_DIR` / `HERMES_TOOL_POLICY_FILE` 可覆盖），原子写 | 与 identity/ladder 同款存储纪律；UI 可管理，便于备份 |
| D8 | 写前必须过 lint；拒绝未知字段 | 防拼写错误被静默忽略（原文 linter 的等价物） |
| D9 | 策略变更发 govbus `security` 域事件；裁决落决策账并带 `policyRuleId` | 回答“当时生效的是哪条策略”（原文三问之一） |
| D10 | 审批类规则复用现有审批桥，`policy-require-approval` 进 APPROVAL_CLASS_RULES；批单记录 policyRuleId | 不新建审批面；一单一执行语义不变 |
| D11 | UI 放「台账与规则」页，与自治阶梯并列；空态提供“载入三条起步策略”（真实写入，非演示按钮） | 原文第八章“先写三条策略再说”；人类可读，不展示原始 JSON |

## 变更清单

- 新增 `custom/server/toolpolicy/tool-policy.ts`：schema、lint、确定性求值、姿态投影。
- 新增 `custom/server/toolpolicy/policy-store.ts`：原子读写、mtime 缓存、变更事件。
- 新增 `custom/server/toolpolicy/__tests__/tool-policy.test.ts`：引擎/ lint / strict / fail-closed 单测。
- 改 `custom/server/toolpipeline/enforce-gate.ts`：策略层、新规则名、policyRuleId 透传、审批桥接入。
- 改 `custom/server/toolpipeline/policy-decisions.ts`：决策条目增 `policyRuleId`。
- 改 `custom/server/toolpipeline/enforce-approvals.ts`：批单增 `policyRuleId`（可选）。
- 改 `custom/server/governance/governance-controller.ts`：`GET/PUT /api/governance/tool-policies`、`POST .../lint`。
- 新增 `custom/client/governance/api/toolPolicy.ts` 与 `components/ToolPolicySection.vue`。
- 改 `custom/client/ia2/views/gov/GovRegistryRulesView.vue`：挂载策略区。
- 改 `package.json`：`typecheck:harness` 纳入新模块。

## 边界（本轮不做）

- 不做 MCP 工具投毒/typosquatting 扫描（MCP 网关单独立轮）。
- 不做跨会话/工作流级策略（原文承认的 workflow-level policies 空白）。
- 不做 outcome 校验与知识流治理（审计仍记 attempt；现有 tool-hooks 已记 post 结果）。
- kill switch 不冒充进程终止；本轮不新增。

## 验证

- `npx vitest run custom/server/toolpolicy custom/server/toolpipeline`：78/78 通过
  （含新增 15 例引擎/存储/执法门接线；既有执法门、审批桥、审计瀑布零回归）。
- `npx vitest run custom/server/governance custom/server/harness custom/client/governance`：
  362/362 通过（含新增 REST 4 例、组件 5 例）。
- `npm run typecheck:harness`：零错误（新增 toolpolicy 两文件已入清单）。
- `npm test` 全量：5572 通过 / 8 跳过 / 0 失败（2026-10-21，worktree
  `.claude/worktrees/tool-policy-engine`，隔离上游 `OVERLAY_UPSTREAM_ROOT`）。
- 浏览器走查（隔离后端 8653 + vite 8651，dev bootstrap 登录）：
  - 未配置态横幅「未配置策略…（不等于已治理）」如实呈现；
  - 「载入三条起步策略」→ 真实保存，规则表 3 行（优先级/动作/命中/更新人 admin）；
  - 总闸未开时横幅切「只保存、不拦截」，不假装已治理；
  - 模式切 strict → 保存成功并出现「无 allow 规则将全拒」告警；切回 permissive 正常；
  - 控制台与后端日志无新增错误。

## 交付备注

- 并行会话在同一主工作树切分支覆盖过一轮已跟踪文件改动（2026-10-21 实录）；
  本轮改为独立 worktree + `OVERLAY_UPSTREAM_ROOT` 隔离上游完成，worktree 清理走
  `git worktree remove`。
- 走查保存的三条起步策略落在本机 `~/.hermes-web-ui/tool-policies/policies.json`
  （permissive）；dev 后端未设 `HERMES_TOOL_ENFORCE`，按设计只保存不拦截。
