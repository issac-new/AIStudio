# 主动性两轴模型与目标持续对齐（2026-10-26）

分支：`feat/proactivity-two-axis`（worktree `proactivity-two-axis`，自 origin/main 0a5f213da 起）

## 变更

深读阿里技术公众号文章《Personal Agent 落地思考：主动性从哪来，又卡在哪？》（Qoder，2026-10-26 18:08，原文 https://mp.weixin.qq.com/s/c5k2iwYh1O1OLA8ULf5X_A ；正文与 8 张模型图全量提取核验）后，对账 AIStudio 既有实现并吸收净增量。

**对账结论（文章要素 → 既有锚点）**：

- 已覆盖：时机两来源（定时=cron/autosched；事件=`custom/server/automations/automation-rules.ts:19` 四源 file/kanban/git/webhook——文章 §1.1「数据源变化即事件」）；独立身份（agentidentity 域+48 profile）；执行自主度阶梯（`custom/server/autonomyladder/`（BCG 三档 insight/assist/auto）+ 执行面 `custom/server/toolpipeline/enforce-gate.ts:27` 消费）；风险三档与影响面（`custom/server/approvals/risk-tier.ts:10`、`impact-preview.ts`）；停点判定（`custom/server/goalautonomy/goal-autonomy.ts`）；任务级验收规则（vendor hermes goals.py completion contract：Verification criterion）。
- **净缺口（本轮落地）**：①「谁定义问题」横轴（L1 指令/L2 时间规则/L3 事件触发/L4 用户目标-Agent 算差距/L5 Agent 推断目标）与「做到哪一步」纵轴（告知/建议/起草待确认/可逆执行/不可逆对外执行）的**两轴组合裁决**——既有阶梯是执行自主度单轴，无「问题定义权」维度；②**长期目标漂移防线**——全仓无「目标关键节点重新确认」机制（仅有 MCP 配置漂移 mcpcatalog/mcp-drift），文章定性「拿着错位目标用力推进」为长期主动最危险的失败方式；③**失败代价三要素结构化**（可撤回/影响谁/可验证）——既有 risk-tier 按命令破坏力分档，无三要素判定通道。

本轮新增（A 类纯新增域 + B 类两行挂载补丁）：

- `custom/server/proactivity/proactivity-model.ts`：两轴纯函数——档位语义表、`assess()` 组合裁决（横轴上限 × 失败代价上限取低者 × 目标对齐约束）、`failureCostTier()` 三要素、`upgradeAdvice()` 升仓通道（说清目标 L5→L4；说清验收规则 L4→按规则执行）。
- `custom/server/proactivity/goal-alignment.ts`：目标对齐台账（append-only 确认记录，不覆盖历史）+ 新鲜度判定（`alignmentStatus()`：fresh/stale/never-confirmed）。
- `custom/server/proactivity/proactivity-controller.ts`：REST `GET /api/hermes/proactivity/model`、`POST /assess`、`GET|POST /alignment`、`PUT /alignment/:goalId/confirm`、`DELETE /alignment/:goalId`；变更发 govbus autonomy 域事件（对齐 autonomyladder 审计面先例）。
- 挂载补丁 `patches/695-server-proactivity-routes.patch`（vendor routes.ts import+app.use 两行，683 先例同款）+ series 登记。
- 测试：`__tests__/proactivity.test.ts`（模型+台账纯函数）+ `__tests__/proactivity-controller.test.ts`（真 HTTP 契约：Koa+临时端口+fetch）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 新建 proactivity 域而非扩展 autonomyladder | autonomyladder 是 BCG 执行自主度单轴（insight/assist/auto），横轴「谁定义问题」是正交维度；改旧域会动 incident/enforce-gate 两个消费者的契约回归面 | 扩展 autonomyladder 加 problemDefiner 字段（否决：语义混轴+消费者回归） | 是 |
| D2 | 档位裁决规则：L5 恒只告知；L4 无契约上限起草、有契约（目标明确+验收规则）放开到不可逆执行但受失败代价约束；L1-L3 全档可及（同样受代价约束） | 文章 §6 上限论+Daisy 实证（276 条 todo 自动核销 0 条=L4 责任不对称的实证）+§6.3 杠杆（说清目标+验收规则才能升仓）；L1-L3 问题与边界皆用户定义、责任在用户 | 全 level 统一上限（否决：抹掉横轴语义）；L4 有契约直接全放（否决：授权必须跟子任务走，代价三要素正是子任务级闸） | 是 |
| D3 | 失败代价三要素映射：low=可撤回∧仅本人∧可验证（不降档）；high=不可撤回∧（对外影响∨不可验证）（上限起草）；其余 medium（上限可逆执行） | 文章 §5 五档图「左下角最适合直接执行、越往右上越需人在关键节点把关」的最小忠实实现；与 approvals 三档命名对齐（low/medium/high）便于未来接线 | 五档独立枚举（否决：与既有三档审批面双口径，违反单一事实源） | 是 |
| D4 | 目标再确认周期默认 7 天、never-confirmed 宽限 1 天；stale/never-confirmed 时 L4 一律压回起草（契约不豁免） | 文章「几周周期里目标会漂」→周级再确认；新建目标=创建即对齐不误伤；旧目标的契约一样过期，漂移防线优先于升仓 | 周期硬编码无 policy（否决：不可调）；stale 仅告警不降档（否决：无执行语义的告警在无 UI 面时不可见） | 是 |
| D5 | 本轮只落「判定面+台账+REST」，enforce-gate 执行面接线与治理 UI 面板挂账 | 对齐 autonomyladder H2→H3 先例（先配置/判定面，执行面单独轮动 patch 565 瀑布）；一次动 enforce-gate 会牵连 permmodes/toolpolicy 全链回归 | 本轮直接接 enforce-gate（否决：回归面超出文章吸收轮边界，且执法语义变更须独立 spec） | 是 |
| D6 | worktree 并行上限临时放宽（先收口 swarm-yuan-p1 至 4 在途，本树为第 5） | 在途 4 树均属活跃并行会话（2 树 IN-FLIGHT<24h、cockpit-full-audit 有当日未提交重构、swarm-yuan-integration 有暂存件），按 IN-FLIGHT 规则不可清理；已先经 git 通道收口唯一可清的 p1（干净、无在途标记、分支保留） | 等待在途收口（否决：阻塞不可控）；在 main 直接改（否决：违反仓规） | 是 |

## 验证

- 目标测试：`npx vitest run custom/server/proactivity` 25/25 绿（模型纯函数矩阵+台账边界+Koa 临时端口真 HTTP 契约）。
- `npm run typecheck:harness` 0 错（三个新文件并入点名清单）。
- 补丁 695：快照重建法生成（注入态全量快照→增改→对快照 diff）；`npm run clean && npm run inject` 全链重放 0 FAILED（日志 /tmp/inject-695.log），routes.ts 挂载标记在位（proactivityRouter×2）。
- 合并前全量 `npm test`（2026-10-26 worktree 实测）：894 文件＝887 过/7 跳过；6,404 用例＝6,391 过/13 跳过/**0 失败**，exit=0。
- 未验证项：enforce-gate 实际消费两轴裁决（挂账 D5）；治理页面呈现面（挂账）；8647 生产面重启换装（本轮未动宿主服务，端点契约由真 HTTP 测试承载）。

## 设计文档影响

DESIGN_SYNC: touched
- docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md — §4.3 审批与人机边界：补「主动性两轴（谁定义问题 × 做到哪一步）+目标持续对齐」一段（proactivity 域判定面）。
- docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md — 数字总账补记本轮（specs/补丁计数随批刷新）。

## 挂账（本轮不做）

- enforce-gate 执行面消费两轴裁决（H4：enforce-gate 加第四级策略源或在阶梯判定前先过 proactivity 裁决；须独立 spec+全链回归）。
- 治理呈现面：GovernanceView 的 AutonomyLadderSection 旁挂两轴矩阵与目标对齐清单（客户端域，走配方 B2）。
- goal 运行时（vendor hermes goals.py）目标创建时自动登记对齐台账（涉 vendor patch，另轮）。
- 文章 §7 Qoder Cloud Agents 基础设施清单（Channel/Schedule/云端执行环境）对本仓 simharness/网关的映射对账（产品规划面）。
