# 2026-11-06 执行单元责任台账与署名记录（第一增量）

## 批准前六问

1. **决策**：本变更决定 AIStudio 是否为每个 AI 执行单元建立可追责的台账、责任卡与署名记录；由项目所有者批准，供治理页签与后续增量消费。
2. **口径**：30 个活动 profile、`team/shared/owner-registry.yaml` 只覆盖 12/30、现有身份册 17 条且 owner 多为团队名、git 作者 2 人——均为当次仓库实测；不引用研究文档中的行业效果数字。
3. **可逆性**：纯新增可选字段与新端点，存量身份记录不重写、不迁移；回退提交即恢复；台账文件在 `~/.hermes-web-ui/agent-identity/` 可备份。
4. **署名**：实现会话对代码与验证证据负责；项目所有者（plusprimer）对范围与验收负责；高风险执行单元的复核人须另行指定在岗自然人。
5. **停止条件**：出现台账与现有身份册双写冲突、签署校验导致存量身份不可用、或六问报表在无数据源时给出 yes/no，停止并回退。
6. **语法**：收紧「谁负责、谁复核、何时暂停、如何退出」的登记语法；不改变权限、预算、考核权重与数据权属。

## 变更

来源：`人与 AI agent 协作组织的人力资源管理与考核策略研究`（2026-11）。本 spec 只取其中与 AIStudio 自用相关、仓内可落地的最小闭环：执行单元五阶段台账、责任卡、人署名记录、六问完成判据。评分、权重、净贡献核算、岗位职级薪酬一律不做。

### 1. 边界

- **自用先行**：对象是 AIStudio 自身的 AI 执行单元（`team/profiles` 的 30 个 profile 与身份册既有条目），不是可交付产品面。
- **只建记录**：四类贡献只作为署名记录的归类（`kind`），不出分、不设权重、不写进正式绩效、不做个人排序。
- **单一事实源**：不新开「执行单元册」，在既有 `custom/server/agentidentity/` 身份册上扩；id 复用 `AgentIdentity.id`。
- **用词**：台账与界面使用「执行单元、结果责任人、复核人」，不用「AI 员工负责 / AI 员工业绩」。

### 2. 数据模型（扩 `custom/server/agentidentity/`）

`Person`（新文件 `people.ts`，存 `people.json`，与身份册同目录约定 `AGENT_IDENTITY_STORE`）：

```ts
interface Person {
  id: string            // p-<seq>；手动登记可指定
  name: string
  emails: string[]
  active: boolean
  source: 'git' | 'manual'
  createdAt: number
  activatedAt?: number
}
```

`AgentIdentity += responsibilityCard?`（新文件 `responsibility.ts`）：

```ts
interface ResponsibilityCard {
  deliveryStandard: string          // 交付标准
  riskTier: 'low' | 'medium' | 'high'
  primaryOwner: string              // person.id
  reviewer?: string                 // person.id；high 风险必填且 ≠ primaryOwner
  escalation: string[]              // 什么情况必须升级（非空）
  pauseConditions: string[]         // 什么情况必须暂停（非空）
  takerOver: string                 // 接管人 person.id
  testCaseVersion: string           // 检验用例版本
  costBudget: { limit: number; unit: string }  // 成本预算
  maintainer: string                // 技术维护人 person.id
  deploymentLocation: string        // 版本与部署位置
  businessOwnerSign?: { signedBy: string; signedAt: number; note?: string }
  admissionEvidence?: {
    representativeTasks: string[]   // 代表性任务
    edgeCases: string[]             // 边界情况
    dataPermissionReview: string[]  // 数据与权限评估
    recordedAt: number
  }
}
```

`AgentIdentity += lifecycle`（新文件 `lifecycle.ts`）：

```ts
interface Lifecycle {
  stage: 'registered' | 'admitted' | 'running' | 'changing' | 'retired'
  history: LifecycleEvent[]
  exit?: { kind: 'pause' | 'revoke' | 'decommission'; items: string[]; confirmedBy?: string; confirmedAt?: number }
}
interface LifecycleEvent { from: string; to: string; at: number; by: string; reason: string; evidenceRefs: string[] }
```

- 存量身份无 `responsibilityCard` / `lifecycle` 时按 `registered` 缺省展示，**不批量回填**；缺口由判定函数逐条报出。
- 卡必填项：除 `reviewer`（仅 `riskTier='high'` 必填）与 `admissionEvidence`（准入迁移时必填）外，其余字段均必填；`riskTier` 无默认值。
- `primaryOwner` / `reviewer` / `takerOver` / `maintainer` 必须是 `people.json` 中 `active: true` 的自然人；不是则拒写并列出问题。

`JudgmentRecord`（新文件 `judgments.ts`，append-only `judgments.jsonl`）：

```ts
interface JudgmentRecord {
  id: string
  unitId: string
  kind: 'acceptance' | 'rejection' | 'override' | 'escalation' | 'pause' | 'capability'
  subjectRef: string        // 任务/交付物/规则引用
  rationale: string         // ≥20 字，trim 后
  evidenceRefs: string[]
  signedBy: string          // person.id，active
  signedAt: number
  source: 'human-entry'     // 唯一允许来源
}
```

- 只有 human-entry 写入路径；**不存在**从遥测/工具日志写入的端点。`kind` 对应四类贡献的取证类别：acceptance/rejection → 判断质量；rejection 的缺陷发现与 evidenceRefs → 验证投入；override/escalation/pause → 例外处置；capability → 组织能力贡献。

### 3. 状态机（`lifecycle.ts` 纯函数，逐条守卫）

| 迁移 | 守卫 |
|---|---|
| registered → admitted | 卡必填项齐（见 §2）；`businessOwnerSign.signedBy` 为 active 自然人；`admissionEvidence` 三组均非空；`riskTier='high'` 时 `reviewer` 必填、≠ `primaryOwner`、两者均 active |
| admitted → running | 迁移输入 `by` 为 active 自然人、`reason` 非空（迁移本身即署名） |
| running → changing | 记录版本变化；`reason` 必填 |
| changing → running | `evidenceRefs` ≥2（重新验证 + 重新授权各一条） |
| 任意 → retired | `exit.items` 非空（暂停/撤权/未完事项/交接确认）；`confirmedBy` 为 active 自然人；high 风险时 `confirmedBy ≠ primaryOwner` |
| 责任人变更 | 更新卡时若 `primaryOwner` 变化，强制进入 `changing` 并写明理由；禁止静默改名 |

- `canTransition(identity, input)` 返回 `{ ok: true } | { ok: false, problems: string[] }`；控制器只做 IO，不重算判定。
- 暂停 = `retired(kind='pause')`；撤权 = `retired(kind='revoke')`；停用 = `retired(kind='decommission')`。

### 4. 六问报表（`custom/server/autonomygov/six-questions.ts`）

`GET /api/autonomygov/six-questions` 返回六项，每项 `{ id, question, answer: 'yes'|'no'|'unknown', evidence[], gap? }`：

1. 重大决定的责任链条能否还原 —— 读 `decisiongraph` 的 `decidedBy` 与 `stage` 覆盖率；样本为 0 时 `unknown`。
2. 责任卡是否签署、台账里是否还有无主执行单元 —— 读身份册与卡；列出缺口单元。
3. 账面调用量与实际资源消耗的差异方向能否说清 —— 读成本/观测面；源缺席时 `unknown` 并写明缺口。
4. 连续稳定运行的差距是否有可解释的数据 —— 读 eval 稳定性重测结果；无重测记录时 `unknown`。
5. 是否存在一个可与后续观测同口径比较的基准 —— 读跨轮指标台账；无基线时 `unknown`。
6. 验证投入与例外处置是否已有署名记录 —— 读 `judgments.jsonl`；零记录为 `no`。

约束：六问只回答「记录够不够」，不给人或执行单元排序、不出分；`unknown` 必须带 `gap`，禁止把缺席源写成 `yes/no`。

### 5. 端点（挂既有前缀，不新增挂载补丁）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/governance/agent-identity/:id/card` | 卡 + 生命周期 + 缺口 |
| PUT | `/api/governance/agent-identity/:id/card` | 保存卡（校验人名/分离规则；owner 变更强制 changing） |
| POST | `/api/governance/agent-identity/:id/transition` | 状态迁移 `{to, by, reason, evidenceRefs}` |
| GET/POST | `/api/governance/agent-identity/:id/judgments` | 署名记录列表 / 新增（只收 human-entry） |
| GET | `/api/governance/people` | 自然人名单 |
| POST | `/api/governance/people` | 手动登记自然人 |
| POST | `/api/governance/people/:id/activate` | 启用候选（在岗） |
| GET | `/api/autonomygov/six-questions` | 六问报表 |

响应一律走 `custom/server/lib/http` 的 `ok/fail/bodyOf`（K19）；错误信封含 `problems`。

### 6. 客户端

- `GovRegistryRulesView` 增 `WorkUnitLedgerSection.vue`：台账表（名称/阶段/结果责任人/复核人/缺口）＋责任卡编辑抽屉＋迁移按钮（服务端守卫为准）。
- `GovRegistryRulesView` 增 `JudgmentRecordsSection.vue`：记录列表＋新增表单（kind、subjectRef、理由必填、署名人为 active 自然人）。
- `GovHarnessView` 增 `SixQuestionsSection.vue`：六问卡片（answer 徽标、evidence、gap 文案）。
- 文案进 `custom/client/governance/i18n.ts` 同批补齐；缺口态一律显示原因，不显示假绿。

### 7. 种子与试点

- `scripts/maintenance/hrgov-seed.mjs`：读 `team/profiles/*/profile.yaml`、`team/shared/owner-registry.yaml`、`git log` 作者；生成 people 候选（`active: false`）与 `registered` 草案。草案只为 `team/profiles` 中尚无同名身份的 profile 创建；已存在身份只补空缺字段、不覆盖人工值；身份册现有 17 条不删除、不改写。幂等，`--dry-run` 输出将写内容；存储路径与身份册同约定。
- 试点验收：挑 1–2 个真实单元（如 `aiteam-orchestrator`、`ops-eval`）人工补卡并走完 registered→admitted→running，产生 ≥3 条署名记录；六问报表产出真实回答（允许 `unknown`，须给 `gap`）。

### 8. 强制面与禁区

- qgate 新门 `.qgate/gates/hrgov.workunit-contract.yaml`（advisory 起步）：改动触及 `custom/server/agentidentity/**` 或新增 profile 时，卡/状态机/署名判定面与守门测试必须在位；spec 必须保留批准前六问。
- 六条考核禁区本轮只落三条机械保障：署名只收 human-entry（无遥测写入）、`settle/*` 不得派生自 `measure/*`（既有）、六问不做个人排序。其余三条（不设替代率、不奖励零例外、净贡献成熟前不进正式绩效）写入本 spec 作为约束，不新增执法代码。

### 9. 明确的非目标

净贡献核算；pass^k 统计报表；四类贡献评分视图与权重；岗位/职级/晋升/薪酬；可交付产品面；把工具遥测转成人事结论；对存量 17 条身份记录做批量改写。

### 10. 配套同步（用户 2026-11-06 追加）

- **设计方案**：`docs/DESIGN.md` §4.4「署名与遥测分立」与 §4.6「执行单元责任台账」随实现事实复核措辞；实施完成时如与代码有出入，按代码修订，不保留两份口径。
- **全流程推演方案**：`docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md` 增「执行单元责任台账」一节：单元与责任卡的登记口径、四类署名记录在 26 步中的产出点、六问作为阶段完成判据，并同步 §2.9 人机接力与责任分工总表。
- **推演程序**：新增 `simharness/mux/mx-workunit-lib.sh`；在 `simharness/aipay-scenario.sh` 的 G1 冻结、G2 架构过闸、G5 准出、报告前接入署名记录与六问快照；`mx-prelaunch-check.sh` 增合同在位检查；`mx-report-gen.py` 增「执行单元与署名记录」节；`mx-report-audit.py` 增对应审计查项。推演产物缺失时如实渲染「未采集」，不得伪造记录。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 扩 `agentidentity` 而不新开 `workunit` 域 | 执行单元与身份是同一实体，另开域会形成两本台账双登记；研究文档第 8 章明确把「重复填报」列为落地风险 |
| D2 | 只建记录，不建评分 | 文档 5.3 与 7.2：净贡献核算成熟前把评价维度写进正式绩效会测量应对行为；用户同批裁定「最小闭环」 |
| D3 | 复核人分离只在高风险强制 | 文档 2.1 的分离要求限定在强监管场景；仓内 git 作者实为 1–2 人，全局强制会让所有单元不可准入 |
| D4 | 署名记录只收 human-entry | 文档 5.3 取证前提：记录由人填写并署名，不从工具遥测派生；自动勾选会让复核行为退化 |
| D5 | 六问无源即 `unknown` | 仓规 fail-soft 不造假；文档 6.2 要求「说得清」，不是「全绿」 |
| D6 | 种子只建草案、不自动补全 | 无主执行单元本身是六问之一；自动补 owner 会把最该被看见的缺口抹平 |
| D7 | 六问挂 `autonomygov` | 该域已是跨域只读聚合的落点（户口缺口、决策阶段比例），避免第二处聚合 |
| D8 | 迁移本身即署名 | 每次迁移记录 `by/at/reason`，与独立 judgment 记录职责不同：前者是流程动作，后者是判断内容；两者不合并 |

## 验证

- `npx vitest run custom/server/agentidentity/__tests__/responsibility.test.ts`：卡字段逐项缺失命中；人名必须 active；high 风险复核人同人/空缺直接拒；中低风险单人放行并报「未分离」提示。
- `npx vitest run custom/server/agentidentity/__tests__/lifecycle.test.ts`：五阶段每条守卫（含 changing→running 证据 ≥2、retired 交接确认、owner 变更强制 changing）；存量无字段身份按 registered 缺省不抛异常。
- `npx vitest run custom/server/agentidentity/__tests__/judgments.test.ts`：理由 <20 字拒绝；非 active 署名拒绝；无 subjectRef 拒绝；append-only（无 update/delete）；遥测来源不可写。
- `npx vitest run custom/server/autonomygov/__tests__/six-questions.test.ts`：有源给 yes/no；无源给 unknown 且 gap 非空；零署名记录时第 6 问为 no；不产出任何排序字段。
- 端点探活：card/transition/judgments/people/six-questions 均返回 200 与 `ok` 信封；非法迁移返回 400/409 且 `problems` 非空。
- 种子脚本：首次运行生成 people 候选与草案；二次运行零变更（幂等）；`--dry-run` 不写盘。
- 浏览器实物走查：治理页签台账表、卡编辑、迁移、署名新增、六问卡片均可见；缺口态有原因文案。
- `npm run typecheck:harness` + 全量 `npm test` 零新增失败。
- 未验证项（实施后回填）：30 条草案全部人工补卡的成本；六问第 3/5 问的真实数据源可用性。

## 设计文档影响

**DESIGN_SYNC: touched**

- `docs/DESIGN.md` §4.6「治理与审计」追加一小段：执行单元台账五阶段（登记/准入/运行/变更/退出）、责任卡要素、署名记录只收人填写；六问作为阶段完成判据，`unknown` 不是通过。
- `docs/DESIGN.md` §4.4「验证与证据」追加一句：署名记录（谁在什么依据下做出判断）与工具遥测是两类证据，前者不得由后者自动派生。
- 同批登记：`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md` 的 A.1 行与标题计数；`scripts/maintenance/gen-doc-indexes.mjs --write` 重生成设计文档索引。
