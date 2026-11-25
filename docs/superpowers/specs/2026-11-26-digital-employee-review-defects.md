# 2026-11-26 数字员工批一审查六项修复（全面复盘批 D 实施 spec）

> 状态：实施中（分支 `fix/digital-employee-review-defects`，基线 aac12a62d）。立项与验收口径见 `2026-11-26-full-retro-design-revision-batch.md` 批 D 行与决策 D6；缺陷事实源=`2026-11-24-digital-employee-batch1-lifecycle-loop.md:237-251` 六项审查挂账表（行号核对基线 195b955ba）。

写给谁看：本仓 AI 会话与后续接手者；判定「六项怎么修的、为什么这么修、怎么验收」。

## 变更

六项逐项修复＋每项守门测试（测试与修复同 commit），另补两套契约语义区分守门：

| # | 缺陷（挂账表原文摘要） | 修复落点 | 修复口径 |
|---|---|---|---|
| 1 | mention-dispatch.ts:278-284 团队停止告警 `warnings = [detail]` 整体覆盖，先前追加的能力紧张告警丢失 | `custom/server/zcode/mention-dispatch.ts` | 改追加语义 `[...(warnings ?? []), detail]`（与能力 warn 同款）；守门加在 `zcode/__tests__/team-stop.test.ts` |
| 2 | team-validate.ts:94 拒绝文案硬编码 `unit_gate` 字面量 | `custom/server/outcome/team-validate.ts` | 词表源 `zcode/dispatch-reasons.ts` 导出 `UNIT_GATE_REASON` 常量（类型约束于 `DISPATCH_REASON_CODES`），team-validate 引用之；守门加在 `outcome/__tests__/team-validate.test.ts` |
| 3 | mention-dispatch.ts:210-223 `collectUnitGate` 任一目标读取抛错即丢弃整张读数表 | `custom/server/zcode/mention-dispatch.ts` | 逐目标独立 try/catch：失败目标按 fail-soft 口径记 `unknown`（`ledger_unavailable`），成功目标读数保留；守门测试新建 `zcode/__tests__/collect-unit-gate.test.ts` |
| 4 | raci-dispatch.ts:128-141 部分责任人被拦剔除后照常写去重记录，重试按去重直接返回原房间，被拦责任人不再被尝试 | `custom/server/services/kanban/raci-dispatch.ts`、`custom/server/matrix/simulation.ts` | 去重记录携带被拦账号（`blocked` 字段）；重试命中时对被拦者重过门，门恢复者补邀进原房间（真实通道 `matrixInviteUser`、模拟通道新增 `simulateInviteUser`）并刷新记录；守门加在 `server/__tests__/raci-dispatch.test.ts` |
| 5 | governance-controller.ts:798-801 `objectField` 对字符串/数组等非对象形态静默返回 undefined，调用方得不到 400 | `custom/server/governance/governance-controller.ts` | 新增 `invalidObjectFields` 辅助：对象键存在但非普通对象（含 null/数组/标量）即显式 400 `problems` 点名键名；register/update 六个透传点接入；守门测试新建 `governance/__tests__/agent-identity-object-fields.test.ts` |
| 6 | OrgEditor.vue:181-194,331 前置检查被拦后向导停在结果页只有「关闭」，须重开丢失已填内容 | `custom/client/ia2/components/gov/OrgEditor.vue` | 结果页被拦态新增「返回修改」入口（`wiz-back-edit`）：回 step1 并清空 blocked/result，已填表单值保留；组件测试加在 `ia2/__tests__/org-editor-board-hint.test.ts` |
| 7 | 两套契约语义无区分守门：`platform/contracts/execution.ts`（MCP_TOOL_VERBS 工具入参分类词表）与 `server/governance/governance-ledger.ts`（action-contracts.yaml 治理动作声明面）易被误合并 | 新建 `custom/server/governance/__tests__/contract-semantics-guard.test.ts` | 钉住职责边界：契约 id 空间不进 MCP 动词分类器（`mcpCategoryOf` 对全部契约 id 返回 null）、契约 id 无 `mcp__` 前缀、类别词（read/write/exec）不出现在任何契约 errors 词表 |

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | 缺陷 1 用追加而非「按来源合并去重」 | 两维告警文本语义不同源（能力读数 vs 团队停止），无重复风险；追加是能力 warn 已有先例，最小侵入 | 按码去重合并（否决：引入去重键面，六项体量不配） |
| D2 | 缺陷 2 词表源选 `dispatch-reasons.ts` 而非新建 outcome 域词表 | `unit_gate` 本就是该词表冻结条目（数字员工批一追加），跨域 import 是消费方引用词表的既定模式（禁止私造表外字符串） | outcome 域复刻一份词表（否决：第二事实源） |
| D3 | 缺陷 3 失败目标记 `unknown` 而非剔除 | 与门本身 fail-soft 口径一致（台账不可读=unknown 不拦）；剔除会让预演与写路径对该目标静默失明 | 剔除该目标（否决：读数表缺键=门不评，行为退化成没传） |
| D4 | 缺陷 4 补邀而非「部分被拦不写去重记录」 | 不写记录会使重试重建第二个房间（重复房+邀请分裂），比不补邀更糟；记录携带被拦明细+恢复补邀保住幂等语义 | 不写去重记录（否决：双房间）；整单重派（否决：同上） |
| D5 | 缺陷 5 键存在但形态错（含 null）一律 400，而非 null 视为未传 | null/数组/标量都不是合法对象形态，静默吞正是本缺陷；显式报错符合 fail-closed 纪律 | null 视为未传（否决：继续留静默面） |
| D6 | 缺陷 6 返回入口回 step1 并清空 blocked/result | 要改的移交对象都在 step1 表单；blocked 残留会让下次成功路径误显被拦名单 | 只回 step2（否决：改的是 step1 字段，还得多一步） |
| D7 | 契约区分守门落 `governance/__tests__/`，断言用真实 `loadActionContracts()` + 导出的 `MCP_TOOL_VERBS` | 与既有 `governance-contracts.test.ts` 同目录同加载面；导出常量是纯增不改行为 | 文本 grep 两个源文件（否决：脆、非语义断言） |

## 验证

1. 六项各自测试 `npx vitest run <对应测试路径>` 绿。
2. 触及服务端模块：`npm run typecheck:harness` 退出 0。
3. `npx vitest run custom/server/governance/__tests__/ custom/client/ia2/__tests__/org-editor-board-hint.test.ts custom/server/zcode/__tests__/ custom/server/outcome/__tests__/ custom/server/__tests__/raci-dispatch.test.ts` 绿。
4. 每项变异探针：临时改坏修复点→测试红→还原，证据随收口报告回填。
5. OrgEditor UI 实物走查（真实浏览器）留全量回归轮，不在本批。

## 设计文档影响

DESIGN_SYNC: none
DESIGN_DOCS:

- 纯缺陷修复+守门测试：`docs/DESIGN.md` §4.6 描述的派单门行为语义（拦/不拦判据、告警面）不变；缺陷 4 的补邀是「同任务幂等」既有语义的修复（重试恢复被拦责任人属于幂等语义应然面），不构成能力变更。
