# 数字员工 3.0 吸收·批一 实施计划

> **给执行者：** 必用子技能：superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务逐个实施。步骤用复选框（`- [ ]`）跟踪。

**目标：** 把已有的执行单元身份、责任卡、生命周期接到派单、署名、退役与离职上，使一个执行单元能通过界面完成上岗、接单、退役，并在退役后确实不再接新派单。

**做法：** 不新建平台，只补断点。新增一个纯函数模块（派单门）和两个端点（责任卡签署、离职前置检查），其余是在既有域函数、控制器、判定核与界面上补字段、补接线。零补丁。

**技术栈：** TypeScript、Koa、Vue 3、Pinia、vitest。仓库规约见根 `AGENTS.md`。

**规格：** `docs/superpowers/specs/2026-11-24-digital-employee-batch1-lifecycle-loop.md`（已批准）。执行者须同时读规格。

## 全局约束

- 零补丁：不改 `vendor/**`、不改 `patches/**`。发现必须改上游文件时停下，回到用户裁决（规格反目标）。
- 存量未绑定目标的派单行为不得变化（规格反目标）。
- 门读不到台账时不拦截，但读数记 `unknown`，不得显示为通过（D4）。
- 系统不得自动退役任何执行单元；退役须在岗自然人确认交接（D9）。
- 署名类身份只取 `requireAuthenticatedActor(ctx).username`，请求体同名字段不采纳（D6）。
- 代码注释用中文，标识符用英文；注释只写约束与来源（仓规第 7 条）。
- 新模块的 HTTP 响应用 `custom/server/lib/http.ts` 的 `ok/fail/bodyOf`（K19 棘轮，注释里的字面量也计数）。
- `git add` 禁用 `-A`，逐个路径添加（历史上 `-A` 造成过 449 文件污染）。
- 不向 `.swarm-yuan/decisions.jsonl` 追加内容：主干上该台账的哈希链已断（存量问题，第 136 行是被换行截开的残片），本批不续写，决策以 spec 的「决策记录」段为准。
- 行号基准：`custom/` 在本分支检出即有效；`vendor/` 行号只在干净检出有效，注入后会变。
- 测试命令一律 `cd` 到工作区根的绝对路径后执行。工作区：`/Users/cuishi/lab/AIStudio/.claude/worktrees/feat-digital-employee-batch1`。
- 跑测试前确认环境里没有 `GIT_DIR`、`GIT_INDEX_FILE`、`GIT_WORK_TREE` 等 git 内部变量（2026-11-24 事故：带钩子变量跑测试会波及真实仓库）。
- 提交信息用中文、Conventional Commits 风格，scope 用 `agentidentity`、`dispatch`、`matrix-teams`、`governance` 等。
- 修改前基线：改动面 30 个测试文件 302 例全绿。

## 审查重点

以下是规格隐含、但容易在真实使用中伤到人的情形，每条都钉了测试：

1. 责任卡引用的自然人被停用后，已绑定单元的责任卡即失效——它必须停止接新派单，而不是等下次有人看台账（Task 4）。
2. 一次派单文本里 @ 了多个目标，其中一个被门拦截——其余目标必须照常起跑，不能整体失败（Task 4）。
3. 同一个运行时目标被两个身份绑定——必须在绑定时拒绝，否则门无法确定该信谁（Task 2）。
4. 离职前两次调用之间，有人新准入了一个绑定该账号的执行单元——离职端点自身必须再查一次，不能只信前置检查（Task 8）。
5. 责任卡保存后内容与签署时不一致，之后又改回原样——签署应恢复有效（指纹相同），不该要求重签（Task 3）。

---

### Task 1：身份台账补字段与自然人停用

**Files:**
- Modify: `custom/server/agentidentity/agent-identity.ts`
- Modify: `custom/server/agentidentity/people.ts`
- Test: `custom/server/agentidentity/__tests__/runtime-bindings.test.ts`（新建）
- Test: `custom/server/agentidentity/__tests__/people-deactivate.test.ts`（新建）

**Interfaces:**
- Produces: `AgentIdentity.runtimeBindings?: { agents?: string[]; matrixAccounts?: string[] }`
- Produces: `Person.deactivatedAt?: number; Person.deactivatedBy?: string; Person.deactivatedReason?: string`
- Produces: `normalizeRuntimeBindings(raw: unknown): { ok: true; bindings: RuntimeBindings } | { ok: false; problems: string[] }`
- Produces: `registerIdentity` / `updateIdentity` 的入参增加 `runtimeBindings?`；返回值形态不变
- Produces: `deactivatePerson(id: string, actor: string, reason: string): { ok: boolean; problems: string[]; person?: Person; referencedBy: Array<{ id: string; name: string; stage: Stage }> }`

- [ ] **Step 1：写失败测试 `runtime-bindings.test.ts`**

```ts
// 夹具：_useStoreDirForTests 指向 mkdtemp；afterEach 清 env
it('runtimeBindings 规范化：去空白、去重、空数组剔除', () => {
  expect(normalizeRuntimeBindings({ agents: [' zcode ', 'zcode', ''], matrixAccounts: ['@a-agent:sv'] }))
    .toEqual({ ok: true, bindings: { agents: ['zcode'], matrixAccounts: ['@a-agent:sv'] } })
})
it('runtimeBindings 非对象或数组元素非字符串 → 拒绝', () => {
  expect(normalizeRuntimeBindings('x').ok).toBe(false)
  expect(normalizeRuntimeBindings({ agents: [1] }).ok).toBe(false)
})
it('同一目标被两个身份绑定 → 第二个注册被拒并点名冲突', () => {
  registerIdentity({ ...FULL, name: 'u1', runtimeBindings: { agents: ['zcode'] } }, 'alice')
  const r = registerIdentity({ ...FULL, name: 'u2', runtimeBindings: { agents: ['zcode'] } }, 'alice')
  expect(r.ok).toBe(false)
  expect(r.problems.join()).toContain('zcode')
})
it('update 改绑已被占用的目标 → 拒绝；改绑到自己已占的目标 → 通过（幂等）', () => {
  // u1 占 zcode；u2 update 到 zcode 被拒；u1 update 仍为 zcode 通过
})
it('不传 runtimeBindings 的注册与更新不改变既有行为', () => {
  // registerIdentity({...FULL, name: 'u3'}, 'alice').ok === true，identity 无 runtimeBindings 键
})
```

`FULL` 沿用 `roster-gaps.test.ts` 的五要素齐备夹具。

- [ ] **Step 2：运行，确认失败**

Run: `cd <工作区> && npx vitest run custom/server/agentidentity/__tests__/runtime-bindings.test.ts`
Expected: FAIL，`normalizeRuntimeBindings is not a function` 一类错误。

- [ ] **Step 3：实现绑定字段**

在 `agent-identity.ts`：导出 `RuntimeBindings` 接口与 `normalizeRuntimeBindings`；`AgentIdentity` 增可缺省 `runtimeBindings`；`registerIdentity`、`updateIdentity` 的入参加 `runtimeBindings?`。唯一性校验在写盘前做，遍历 `store.identities` 中 `id !== 自身` 的身份，两个数组任一命中即拒绝，问题文案为 `运行时目标已被身份 ${other.id}（${other.name}）绑定：${target}`。传入空数组时剔除该键。

- [ ] **Step 4：运行，确认通过**

Run: 同 Step 2。Expected: PASS。

- [ ] **Step 5：写失败测试 `people-deactivate.test.ts`**

```ts
it('deactivatePerson 置 active=false 并记 deactivatedAt/By/Reason', () => {
  // 登记→激活→停用；断言 person.active===false，三个字段齐
})
it('重复停用幂等：第二次 ok 且不报错', () => {})
it('停用不存在的自然人 → ok=false', () => {})
it('referencedBy 列出仍引用此人的未退役单元', () => {
  // alice 是 unit-a 的 primaryOwner；停用 alice → referencedBy 含 {id: unit-a.id, name: 'unit-a', stage: 'registered'}
})
it('已退役单元不计入 referencedBy', () => {})
```

- [ ] **Step 6：运行，确认失败**

Run: `cd <工作区> && npx vitest run custom/server/agentidentity/__tests__/people-deactivate.test.ts`
Expected: FAIL，`deactivatePerson is not a function`。

- [ ] **Step 7：实现自然人停用**

在 `people.ts`：`Person` 增三个可缺省字段；导出 `deactivatePerson(id, actor, reason)`。`referencedBy` 的取法：读 `listIdentities()`，筛 `stageOf(i) !== 'retired'` 且其 `responsibilityCard` 的 `primaryOwner / reviewer / takerOver / maintainer` 任一等于该 id。`people.ts` 此前不依赖 `agent-identity.ts`，为避免循环导入，在函数体内用动态 `import()` 取 `listIdentities` 与 `stageOf`，函数签名因此是 `async`。测试里相应 `await`。

- [ ] **Step 8：运行，确认通过**

Run: 同 Step 6。Expected: PASS。

- [ ] **Step 9：回归本域既有测试**

Run: `cd <工作区> && npx vitest run custom/server/agentidentity`
Expected: 全部 PASS（既有 `agent-identity.test.ts`、`roster-gaps.test.ts` 不变绿）。

- [ ] **Step 10：提交**

```bash
cd <工作区> && git add custom/server/agentidentity/agent-identity.ts custom/server/agentidentity/people.ts custom/server/agentidentity/__tests__/runtime-bindings.test.ts custom/server/agentidentity/__tests__/people-deactivate.test.ts
git commit -m "feat(agentidentity): 身份册增运行时绑定与自然人停用——数字员工批一 Task 1"
```

---

### Task 2：派单门纯函数

**Files:**
- Create: `custom/server/agentidentity/dispatch-gate.ts`
- Test: `custom/server/agentidentity/__tests__/dispatch-gate.test.ts`（新建）

**Interfaces:**
- Produces: `type UnitGateDecision = 'pass' | 'block' | 'unknown' | 'skipped'`
- Produces: `interface UnitGateVerdict { target: string; applicable: boolean; identityId?: string; decision: UnitGateDecision; reasons: string[] }`
- Produces: `interface UnitGateFacts { target: string; targetKind: 'agent' | 'matrix-account'; identities: AgentIdentity[] | null; people: Person[]; mode: 'on' | 'off' }`
- Produces: `assessUnitDispatchGate(facts: UnitGateFacts): UnitGateVerdict`
- Produces: `readUnitGateFacts(target: string, targetKind: 'agent' | 'matrix-account', mode?: 'on' | 'off'): UnitGateFacts`（读盘包装：台账读失败时 `identities` 置 `null`；`mode` 缺省读 `process.env.WORKUNIT_DISPATCH_GATE`，值为 `'off'` 时关闭）
- Produces: `DISPATCH_GATE_MODE_ENV = 'WORKUNIT_DISPATCH_GATE'`

- [ ] **Step 1：写失败测试 `dispatch-gate.test.ts`**

```ts
const person = (id: string, active = true): Person => ({ id, name: id, emails: [], active, source: 'manual', createdAt: 1 })
const unit = (over: Partial<AgentIdentity> = {}): AgentIdentity => ({
  id: 'aid-001', name: 'u1', kind: 'agent', owner: 'alice', toolAllowlist: ['read_file'],
  credentials: [], delegations: [], createdAt: 1, updatedAt: 1,
  runtimeBindings: { agents: ['zcode'] }, ...over,
})
const card = (over: Partial<ResponsibilityCard> = {}): ResponsibilityCard => ({
  deliveryStandard: '可复现', riskTier: 'medium', primaryOwner: 'alice', escalation: ['e'], pauseConditions: ['p'],
  takerOver: 'bob', testCaseVersion: 'tc-1', costBudget: { limit: 1, unit: 'CNY' }, maintainer: 'alice', deploymentLocation: 'x', ...over,
})
const admitted = (over: Partial<AgentIdentity> = {}): AgentIdentity =>
  unit({ responsibilityCard: card(), lifecycle: { stage: 'admitted', history: [] }, ...over })
const base = (over: Partial<UnitGateFacts> = {}): UnitGateFacts =>
  ({ target: 'zcode', targetKind: 'agent', identities: [admitted()], people: [person('alice'), person('bob')], mode: 'on', ...over })

it('mode=off → skipped，applicable=false', () => {
  expect(assessUnitDispatchGate(base({ mode: 'off' }))).toMatchObject({ decision: 'skipped', applicable: false, reasons: ['gate_off'] })
})
it('无身份绑定该目标 → skipped / not_bound', () => {
  expect(assessUnitDispatchGate(base({ target: 'other' }))).toMatchObject({ decision: 'skipped', reasons: ['not_bound'] })
})
it('台账不可读（identities=null）→ unknown，不判通过', () => {
  const v = assessUnitDispatchGate(base({ identities: null }))
  expect(v.decision).toBe('unknown'); expect(v.reasons.join()).toContain('ledger_unavailable')
})
it.each([
  ['registered', 'unit_registered'], ['changing', 'unit_changing'], ['retired', 'unit_retired'],
])('阶段 %s → block / %s', (stage, reason) => {
  const v = assessUnitDispatchGate(base({ identities: [admitted({ lifecycle: { stage, history: [] } as Lifecycle })] }))
  expect(v).toMatchObject({ decision: 'block', applicable: true, identityId: 'aid-001' })
  expect(v.reasons).toContain(reason)
})
it.each(['admitted', 'running'])('阶段 %s 且卡有效 → pass', (stage) => {
  expect(assessUnitDispatchGate(base({ identities: [admitted({ lifecycle: { stage, history: [] } as Lifecycle })] }))).toMatchObject({ decision: 'pass' })
})
it('责任卡按非准入口径有缺口 → block / card_invalid', () => {
  const v = assessUnitDispatchGate(base({ identities: [admitted({ responsibilityCard: undefined })] }))
  expect(v.decision).toBe('block'); expect(v.reasons).toContain('card_invalid')
})
it('主责任人已停用 → card_invalid（责任人停用使卡失效）', () => {
  const v = assessUnitDispatchGate(base({ people: [person('alice', false), person('bob')] }))
  expect(v.reasons).toContain('card_invalid')
})
it('matrix-account 目标按 runtimeBindings.matrixAccounts 匹配', () => {
  const v = assessUnitDispatchGate(base({
    target: '@u1-agent:sv', targetKind: 'matrix-account',
    identities: [admitted({ runtimeBindings: { matrixAccounts: ['@u1-agent:sv'] } })],
  }))
  expect(v).toMatchObject({ decision: 'pass', identityId: 'aid-001' })
})
it('readUnitGateFacts：env=off 时 mode=off；未设时 mode=on', async () => {
  process.env.DISPATCH_GATE_MODE_ENV = 'off'
  expect((await readUnitGateFacts('zcode', 'agent')).mode).toBe('off')
  delete process.env.DISPATCH_GATE_MODE_ENV
  expect((await readUnitGateFacts('zcode', 'agent')).mode).toBe('on')
})
```

审查重点第 1 条由「主责任人已停用」一例覆盖。

- [ ] **Step 2：运行，确认失败**

Run: `cd <工作区> && npx vitest run custom/server/agentidentity/__tests__/dispatch-gate.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3：实现 `dispatch-gate.ts`**

判定顺序严格按规格第二节：`mode` → 绑定查找 → `identities` 是否为 `null` → 阶段 → 责任卡。绑定查找：`targetKind==='agent'` 查 `runtimeBindings.agents`，否则查 `matrixAccounts`。阶段用 `stageOf`；非 `admitted|running` 即拦截，原因码 `unit_${stage}`。责任卡用 `cardGaps(card, people)`（不带 `forAdmission`），有缺口即 `card_invalid`，把缺口明细附在 `reasons` 之后。文件不读盘（纯函数），读盘只在 `readUnitGateFacts`。

- [ ] **Step 4：运行，确认通过**

Run: 同 Step 2。Expected: PASS。

- [ ] **Step 5：变异探针并改回**

把 `assessUnitDispatchGate` 开头临时改成 `return { target: facts.target, applicable: true, decision: 'pass', reasons: [] }`，运行 Step 2 的命令，Expected: FAIL（阶段与卡失效各例变红）。改回后再跑一次，Expected: PASS。把两次结果记入收口说明。

- [ ] **Step 6：提交**

```bash
cd <工作区> && git add custom/server/agentidentity/dispatch-gate.ts custom/server/agentidentity/__tests__/dispatch-gate.test.ts
git commit -m "feat(agentidentity): 派单门纯函数——已绑定单元的阶段与责任卡求值，数字员工批一 Task 2"
```

---

### Task 3：责任台账接口补全与业务负责人签署

**Files:**
- Modify: `custom/server/agentidentity/responsibility.ts`
- Modify: `custom/server/agentidentity/agent-identity.ts`
- Modify: `custom/server/governance/governance-controller.ts`（`/agent-identity/register`、`/:id/update`、`/people`、`/people/:id/deactivate`、`/:id/card`、`/:id/card/sign`、`/:id/transition`、`/:id/judgments`）
- Test: `custom/server/governance/__tests__/workunit-routes.test.ts`（改写）

**Interfaces:**
- Consumes: Task 1 的 `runtimeBindings`、`deactivatePerson`
- Produces: `ResponsibilityCard.businessOwnerSign?: { signedBy: string; signedAt: number; note?: string; cardRevision?: string; stale?: boolean }`
- Produces: `cardRevision(card: ResponsibilityCard): string`（去掉 `businessOwnerSign` 与 `admissionEvidence` 后规范化 JSON 的 SHA-256 十六进制）
- Produces: `cardGaps(card, people, { forAdmission: true })` 增两条缺口：签署缺失或 `stale` → `business-owner-sign`；签署无 `cardRevision` → `business-owner-sign`（文案注明「旧签署无版本指纹，须重签」）
- Produces: `signResponsibilityCard(id: string, signedBy: string, people: Person[]): { ok: boolean; problems: string[]; card?: ResponsibilityCard }`
- Produces: `updateResponsibilityCard` 保存时：若新卡指纹与已签 `cardRevision` 不同，把签署标为 `stale: true`；相同则清除 `stale`
- Produces: `transitionIdentity(id, input, actor)` 返回值增加 `revoked?: { credentials: number; delegationsOut: number; delegationsIn: number }`（仅在迁往 `retired` 时出现）
- Produces: `POST /api/governance/agent-identity/:id/card/sign` → `200 { ok, card }`
- Produces: `POST /api/governance/people/:id/deactivate` → `200 { ok, person, referencedBy }`

- [ ] **Step 1：改写 `workunit-routes.test.ts` 的夹具为带登录态，并写失败用例**

现有测试全程不带登录态。改法：`req()` 增加可选第五参 `as?: string`，有值时在 Koa 前置中间件里设 `ctx.state.user = { id: as, username: as, role: 'super_admin' }`。`beforeAll` 里登记并启用 `alice`、`bob`，两者登录名等于其自然人 id。`afterAll` 不变。

新增用例：

```ts
it('注册透传 capabilityBoundary/auditRequirement/runtimeBindings 并规范化', async () => {
  const r = await req('POST', '/api/governance/agent-identity/register', {
    name: 'full-unit', kind: 'agent', owner: 'team',
    capabilityBoundary: { can: [' 改代码 '], cannot: ['改发布'] },
    auditRequirement: { sampling: 0.5, retentionDays: 30 }, runtimeBindings: { agents: ['zcode'] },
  }, 'alice')
  expect(r.status).toBe(200)
  expect(r.body.identity.capabilityBoundary).toEqual({ can: ['改代码'], cannot: ['改发布'] })
  expect(r.body.identity.auditRequirement.sampling).toBe(0.5)
  expect(r.body.identity.runtimeBindings).toEqual({ agents: ['zcode'] })
})
it('未登录的迁移 → 401 authenticated_actor_required', async () => {
  const r = await req('POST', `/api/governance/agent-identity/${unitId}/transition`, { to: 'admitted', by: alice, reason: 'x' })
  expect(r.status).toBe(401)
})
it('请求体冒填迁移人不生效：记录里 by 是登录人', async () => {
  // 以 alice 登录、body.by 写 bob；迁移成功后 GET /card，断言 lifecycle.history.at(-1).by === alice
})
it('登录人不是在岗自然人 → 400，问题列表含「在岗自然人」', async () => {
  // 以 'mallory' 登录（未登记）；断言 400 且 problems.join() 含 '在岗自然人'
})
it('请求体冒填署名记录签署人不生效', async () => {
  // 以 alice 登录、body.signedBy 写 bob；断言 record.signedBy === alice
})
it('保存责任卡不采纳请求体里的签署字段', async () => {
  const r = await req('PUT', `/api/governance/agent-identity/${unitId}/card`, card({ businessOwnerSign: { signedBy: bob, signedAt: 1 } }), 'alice')
  expect(r.body.identity.responsibilityCard.businessOwnerSign).toBeUndefined()
})
it('签署：未登录 401；登录人非在岗 400；在岗登录人签署成功并带 cardRevision', async () => {
  const no = await req('POST', `/api/governance/agent-identity/${unitId}/card/sign`, {})
  expect(no.status).toBe(401)
  const bad = await req('POST', `/api/governance/agent-identity/${unitId}/card/sign`, {}, 'mallory')
  expect(bad.status).toBe(400)
  const okr = await req('POST', `/api/governance/agent-identity/${unitId}/card/sign`, {}, 'alice')
  expect(okr.body.card.businessOwnerSign).toMatchObject({ signedBy: alice, stale: false })
  expect(okr.body.card.businessOwnerSign.cardRevision).toMatch(/^[0-9a-f]{64}$/)
})
it('签后改卡内容 → stale=true；改回原样 → stale=false', async () => {
  // 签署 → PUT card({ deliveryStandard: '改了' }) → stale true
  // → PUT card()（原内容）→ stale false，cardRevision 不变
})
it('凭失效签署准入被拒；凭无版本指纹的旧签署准入被拒', async () => {
  // stale 状态下 transition to admitted → 400，problems 含 '签署'
  // 直接写库把 cardRevision 删掉 → transition to admitted → 400
})
it('准入须责任卡带三组准入证据', async () => {
  // PUT card({ admissionEvidence: undefined }) + 签署 + transition admitted → 400，problems 含 '准入'
})
it('退役自动撤权并返回 revoked 计数', async () => {
  // 另建身份 victim（已准入），登记 1 个凭证、给 bob 建委托、bob 给它建委托
  // alice 登录迁 retired（exit: { kind:'revoke', items:['交接'], confirmedBy: alice })
  // 断言 body.identity.revoked 等于 { credentials: 1, delegationsOut: 1, delegationsIn: 1 }
  // 断言 victim.credentials[0].status === 'revoked'，两条委托均带 revokedAt
})
it('自然人停用端点：幂等并返回 referencedBy', async () => {
  // 登记并启用 carol 作为 unit 的 takerOver → 停用 carol → 200，referencedBy 含该单元；再停一次 → 200
})
it('people 登记透传 mxids', async () => {
  const r = await req('POST', '/api/governance/people', { name: 'dave', mxids: ['@dave:sv'] }, 'alice')
  expect(r.body.person.mxids).toEqual(['@dave:sv'])
})
```

既有用例「完整卡可保存并走完准入/运行」改为：`card()` 不带 `businessOwnerSign`，保存后显式调用签署，再迁移；两次迁移都以 `alice` 登录。既有用例「署名记录写入与读取」加 `'alice'` 登录参数并从 body 去掉 `signedBy`。

审查重点第 5 条由「签后改卡内容」一例覆盖。

- [ ] **Step 2：运行，确认失败**

Run: `cd <工作区> && npx vitest run custom/server/governance/__tests__/workunit-routes.test.ts`
Expected: FAIL，新用例失败，既有迁移用例因未带登录态而 401。

- [ ] **Step 3：实现域层**

`responsibility.ts`：`businessOwnerSign` 类型加 `cardRevision?`、`stale?`；导出 `cardRevision`；`cardGaps` 的 `forAdmission` 分支按上文加两条判定。`cardRevision` 用 `node:crypto` 的 `createHash('sha256')`，输入是 `JSON.stringify` 前对键做字典序排序的结果。

`agent-identity.ts`：导出 `signResponsibilityCard`（签署人须 `people` 中在岗，否则问题 `签署人必须是在岗自然人`；写入 `signedBy / signedAt / cardRevision / stale:false`，追加事件 `action:'update'`、`detail:'card-sign'`）。`updateResponsibilityCard` 保留原签署对象但按指纹重算 `stale`。`transitionIdentity` 迁往 `retired` 成功时，在同一次 `writeStore` 之前：把该身份所有 `status==='active'` 的凭证置 `revoked`（记 `revokedAt / revokedBy=actor`）；遍历全册，把 `from` 或 `to` 等于该身份且未撤销的委托置 `revokedAt / revokedBy`；逐条 `appendEvent`（`revoke-credential`、`revoke-delegation`，`detail` 前缀 `随单元退役：`）。返回值带 `revoked` 计数。`IdentityEvent.action` 联合类型无需新增。

- [ ] **Step 4：实现控制器**

`governance-controller.ts`：
- `register` 与 `:id/update` 透传 `capabilityBoundary`、`auditRequirement`、`runtimeBindings`（仅在请求体键存在且为对象时传入，否则不传该键）。
- `/people` 透传 `mxids`（数组时传，否则不传）。
- 新增 `POST /people/:id/deactivate`：`superAdminDenied` 闸 → `decisionActor` → `await deactivatePerson(id, actor.username, String(body.reason ?? ''))` → `ok(ctx, { person, referencedBy })`。
- `cardFromBody` 不再读取 `businessOwnerSign`。
- 新增 `POST /agent-identity/:id/card/sign`：闸 → `decisionActor` → `signResponsibilityCard(id, actor.username, listPeople())` → 成功 `ok(ctx, { card })`，失败 `fail(ctx, 400, '责任卡签署未通过', { code: 'invalid-sign', problems })`。
- `/transition`：`const actor = decisionActor(ctx); if (!actor) return`；`input.by = actor.username`；`exit.confirmedBy = actor.username`；忽略请求体的 `by` 与 `exit.confirmedBy`。
- `/judgments`：`decisionActor`；`signedBy` 传 `actor.username`。
- `matrix-offboard` 的 `actor` 改为 `decisionActor(ctx)?.username ?? ''`。

`decisionActor` 现有签名接收 `Context`，返回 `null` 时已写 401，调用处直接 `return`。

- [ ] **Step 5：运行，确认通过**

Run: 同 Step 2。Expected: PASS。

- [ ] **Step 6：变异探针并改回**

把 `/transition` 里 `input.by = actor.username` 临时改回 `String(b.by ?? '')`，运行 Step 2 的命令，Expected: FAIL（「请求体冒填迁移人不生效」变红）。改回后再跑，Expected: PASS。结果记入收口说明。

- [ ] **Step 7：回归治理与身份域既有测试**

Run: `cd <工作区> && npx vitest run custom/server/agentidentity custom/server/governance/__tests__`
Expected: 全部 PASS。

- [ ] **Step 8：提交**

```bash
cd <工作区> && git add custom/server/agentidentity/responsibility.ts custom/server/agentidentity/agent-identity.ts custom/server/governance/governance-controller.ts custom/server/governance/__tests__/workunit-routes.test.ts
git commit -m "feat(governance): 责任台账接口补全、署名绑定登录身份与卡片版本、退役自动撤权——数字员工批一 Task 3"
```

---

### Task 4：派单门接入派单判定核

**Files:**
- Modify: `custom/server/zcode/dispatch-reasons.ts`
- Modify: `custom/server/zcode/mention-dispatch.ts`
- Modify: `custom/server/services/kanban/raci-dispatch.ts`
- Modify: `custom/server/outcome/team-validate.ts`
- Modify: `custom/server/outcome/outcome-controller.ts`（`PUT /:id/team` 一处）
- Modify: `custom/client/zcode/store/zcode-projection.ts`（标签映射）
- Test: `custom/server/__tests__/zcode-mention-dispatch.test.ts`（追加）
- Test: `custom/server/__tests__/raci-dispatch.test.ts`（追加；既有文件，已隔离真实 Matrix 凭据并走内存模拟通道）
- Test: `custom/server/outcome/__tests__/team-validate.test.ts`（追加）
- Test: `custom/server/zcode/__tests__/squad-protocol.test.ts`（追加；既有文件，已含 `willEnqueueRun` 的用例）

**Interfaces:**
- Consumes: Task 2 的 `assessUnitDispatchGate`、`readUnitGateFacts`、`UnitGateVerdict`
- Produces: `DISPATCH_REASON_CODES` 追加 `'unit_gate'`、`'capability_block'`（只追加，不改动既有项）
- Produces: `PlanFacts.unitGate?: ReadonlyMap<string, UnitGateVerdict>`（键为派单目标名）
- Produces: `PlanFacts.capabilityReadiness?: CapabilityReadiness | null`
- Produces: `MentionDispatchService.planFacts(extra?: Partial<Pick<PlanFacts, 'unitGate' | 'capabilityReadiness'>>): PlanFacts`（无参调用行为不变）
- Produces: `MentionDispatchService.dispatch(params)` 的 `params` 不变（能力读数在服务内按 `taskId` 取）
- Produces: `validateTeam(contract, team, activePersonIds, rosterOk, unitGateOk?: (agentId: string) => boolean)`（第 5 参可选；传入时对 agent 成员追加校验，问题文案 `agent 成员 ${id} 不可接单（${reason}）`）

- [ ] **Step 1：在 `zcode-mention-dispatch.test.ts` 追加失败用例**

```ts
// 夹具：AGENT_IDENTITY_STORE 指向 mkdtemp；登记 alice 并启用；登记身份 worker 绑定 zcode
describe('派单门（数字员工批一）', () => {
  it('已绑定单元阶段 running → 照常起跑；读数 pass 随结果可见', async () => {
    // svc.dispatch({ workspacePath, text: '@zcode 修一下' }) → result[0].reason === 'queued'
  })
  it('已绑定单元阶段 retired → reject unit_gate，引擎未被调用', async () => {
    const engine = fakeEngine()
    // result[0] 匹配 { reason: 'unit_gate' }，detail 含 'unit_retired'；engine.sessions === 0
  })
  it.each(['registered', 'changing'])('阶段 %s → reject unit_gate', async (stage) => {})
  it('未绑定目标 → 行为不变（queued）', async () => {
    // 身份册里没有任何绑定 zcode 的身份；result[0].reason === 'queued'
  })
  it('门关闭（WORKUNIT_DISPATCH_GATE=off）→ retired 单元照常起跑', async () => {})
  it('台账不可读 → 起跑且 unitGate 读数为 unknown', async () => {
    // 把 AGENT_IDENTITY_STORE 指向一个内容非法 JSON 的目录
    // result[0].reason === 'queued'
  })
  it('多目标文本：一个被拦、其余照常起跑', async () => {
    // 绑定 ret-unit→@ret-x；文本 '@ret-x @zcode 修一下'；knownAgents 含两者
    // result[0].reason === 'unit_gate'；result[1].reason === 'queued'
  })
  it('门通过但能力读数为 block → reject capability_block', async () => {
    // 任务声明了能力需求、全池无供给：mock fetchTaskTitleAndBodyByTaskId 返回带 required_capabilities 的快照，
    // mock assessTaskCapabilityReadiness 返回 { decision: 'block', reasons: ['capability_not_supplied:x'], candidates: [], evidenceRefs: [] }
    // svc.dispatch({ workspacePath, text: '@zcode 修一下', taskId: 't_x' }) → result[0].reason === 'capability_block'
  })
  it('门通过、能力读数 warn → 起跑并带警告', async () => {
    // plan.warnings 含能力原因；result[0].reason === 'queued'
  })
  it('能力 block 对未绑定目标不拦截（维持只警告）', async () => {})
})
```

预演同源的断言放在 `will-enqueue` 的测试里（Step 6 末尾），不混进写路径测试。

审查重点第 2 条由「多目标文本」一例覆盖。

- [ ] **Step 2：运行，确认失败**

Run: `cd <工作区> && npx vitest run custom/server/__tests__/zcode-mention-dispatch.test.ts`
Expected: FAIL，`unit_gate` 相关用例失败（`queued` 而非 `unit_gate`）；既有用例仍绿。

- [ ] **Step 3：实现接线**

`dispatch-reasons.ts`：在数组末尾追加注释行 `// ── 执行单元派单门（2026-11-24 数字员工批一，只追加）──` 与两个值 `unit_gate`、`capability_block`。

`zcode-projection.ts` 的 `REASON_CHIP_TEXT` 追加 `unit_gate: '单元未就绪'`、`capability_block: '能力无供给'`。既有守门测试会断言词表与标签一一对应。

`mention-dispatch.ts`：
- `PlanFacts` 增 `unitGate?` 与 `capabilityReadiness?`。
- `planDispatch` 在「自触发抑制」之后、「团队停止条件」之前插入：
  - `const gate = facts.unitGate?.get(runsFor)`；`gate?.decision === 'block'` → `wrap({ action: 'reject', reason: 'unit_gate', detail: gate.reasons.join('；') })`。
  - 门为 `pass`（或 `skipped`/`unknown`，即不拦截）时，若 `gate?.decision === 'pass' && facts.capabilityReadiness?.decision === 'block'` → `reject capability_block`；`warn` 则追加到 `warnings`。
- `planFacts()` 增可选入参 `extra?: Partial<Pick<PlanFacts, 'unitGate' | 'capabilityReadiness'>>`，原样并入返回值；无参调用行为不变。
- `dispatch(params)`：在解析 mention 之前，若 `params.taskId` 存在，取任务快照；任务声明了能力需求时调用 `assessTaskCapabilityReadiness`（从 `custom/server/capabilitypool/readiness.ts` 导入）并保留结果。用 `readUnitGateFacts` 对 `parseMentions(params.text)` 的每个目标按 `targetKind:'agent'` 求门读数，组成 `Map`；调用 `this.planFacts({ unitGate, capabilityReadiness })`，并把该快照传给 `dispatchOne`。`dispatchOne / dispatchLocked` 增一个形参接收快照，`dispatchLocked` 内不再调用无参 `planFacts()`。
- `mention-dispatch.ts` 已同时导入 `kanban/dispatch-readiness` 与 `capabilitypool/readiness`（见文件头 `import … assessTaskCapabilityReadiness from '../capabilitypool/readiness'`），本任务不新增跨模块导入，只新增来自 `agentidentity/dispatch-gate` 的一条；`dispatch-gate.ts` 只依赖 `agent-identity.ts` 与 `responsibility.ts`、`lifecycle.ts`，不反向依赖派单模块，无循环。
- 门读数采集失败（抛错）时记为空 `Map` 并 `console.warn`，不阻断派发。

预演入口（`custom/server/zcode/engine-controller.ts:407-411`）用无参 `service.planFacts()`，没有任务上下文，能力读数不评；但门读数必须评，否则预演显示会起跑而实际被拦。在该路由里对 `parseMentions(text)` 的目标逐个 `readUnitGateFacts`，结果并入 `planFacts({ unitGate })`。这一处是对规格「预演控制器不改」的修正，`engine-controller.ts` 纳入本任务 Files。

- [ ] **Step 4：在 `raci-dispatch.test.ts` 的 `RACI Dispatch` 段追加用例**

既有夹具：`beforeEach` 把 `HERMES_HOME` 指向空目录，使派发走内存模拟通道（房间号形如 `!sim-*:localhost`）；去重路径用 `freshDedupePath()`。「是否建房」通过模拟通道的返回来观察：全被拦时 `dispatch` 应当抛错，连去重文件都不该出现。

```ts
// 这些用例需把 AGENT_IDENTITY_STORE 指向 mkdtemp，并在登记夹具身份后设回/清理
it('责任人账号全被派单门拦截 → 抛错，不建房、不写去重记录', async () => {
  // 身份 u-ret 绑定 @ret-agent:localhost、阶段 retired；task.raci.responsible = ['@ret-agent:localhost']
  const path = await freshDedupePath()
  await expect(RACIDispatchService.dispatch(task, path)).rejects.toThrow(/unit_retired/)
  await expect(readFile(path, 'utf-8')).rejects.toMatchObject({ code: 'ENOENT' })
})
it('部分被拦 → 未被拦的账号照常派发，返回 ok 与 !sim- 房间号', async () => {
  // responsible = ['@ret-agent:localhost', '@ok:localhost'] → result.ok === true，result.roomId 匹配 /^!sim-/
})
it('未绑定账号 → 行为不变（既有「succeeds in simulation mode」用例即覆盖）', async () => {})
```

「被拦账号没进房间」用模拟通道的现成导出断言：`custom/server/matrix/simulation.ts` 导出 `getUserMemberships(userId): RoomMembership[]`。全被拦的用例之后断言 `getUserMemberships('@ret-agent:localhost')` 为空；部分被拦的用例之后断言 `getUserMemberships('@ret-agent:localhost')` 为空、`getUserMemberships('@ok:localhost')` 长度为 1。

Run: `cd <工作区> && npx vitest run custom/server/__tests__/raci-dispatch.test.ts`。Expected: FAIL（第一条得到 `ok:true` 而不是抛错）。

- [ ] **Step 5：实现 RACI 接线**

`raci-dispatch.ts` 的 `doDispatch`：解析 RACI 后、建房前，对 `raci.responsible` 逐个求门。账号形态可能是 Matrix 全形也可能是 profile 名，每个账号按两种形态各求一次（`targetKind: 'matrix-account'` 与 `'agent'`），任一为 `block` 即拦。全部被拦 → `throw new Error('RACI 派发被单元派单门拦截：' + 被拦账号与原因)`，此时尚未写去重记录。部分被拦 → 从 `responsible` 中剔除后继续，`console.warn` 记被拦名单。门读数采集失败 → 不拦，`console.warn`。

- [ ] **Step 6：在 `team-validate.test.ts` 追加用例并实现**

```ts
it('传入 unitGateOk 时：roster 齐备但不可接单 → 拒并点名原因', () => {
  const team = validTeam({ members: [member(), member({ subjectId: 'p-2', role: 'reviewer', responsibility: '独立复核' }),
    member({ subjectKind: 'agent', subjectId: 'ag-ok-1', role: 'executor', responsibility: '执行' })] })
  const r = validateTeam(baseContract, team, active, rosterOk, (id) => id !== 'ag-ok-1')
  expect(r.problems.join()).toContain('ag-ok-1')
  expect(r.problems.join()).toContain('不可接单')
})
it('不传 unitGateOk → 行为不变', () => {
  expect(validateTeam(baseContract, validTeam({ members: [member(), member({ subjectKind: 'agent', subjectId: 'ag-ok-1', role: 'x', responsibility: 'y' })] }), active, rosterOk).problems).toEqual([])
})
```

`team-validate.ts` 按 Interfaces 增第 5 参。`outcome-controller.ts` 的 `PUT /:id/team`：`rosterOk` 回调改为——`rosterStatus(identity) === 'complete'` 且门不是 `block`；未绑定身份（门读数 `skipped`）沿用现判据，只查户口齐备。实现时把这段封成控制器内的局部函数 `unitGateOk(agentId): boolean`，返回「未绑定，或门读数为 `pass` 或 `unknown`」；门求值用 `assessUnitDispatchGate`，目标取该身份的绑定（有 `agents` 取首个按 `agent` 求值，否则有 `matrixAccounts` 取首个按 `matrix-account` 求值），`identities:[identity]`、`people: listPeople()`、`mode:'on'`。门求值抛错或读失败按不可接单处理（与现有 `rosterOk` 的 fail-closed 口径一致）。

预演同源断言（放 `squad-protocol.test.ts` 里既有的 `willEnqueueRun` 用例旁）：

```ts
it('unitGate 并入事实后，预演对已退役单元预测 unit_gate / willRun=false', () => {
  const facts = { knownAgents: new Set(['zcode']), deferredAgents: new Set(), pendingSince: new Map(), pendingTtlMs: 1000, now: 0,
    engineOnline: true, unitGate: new Map([['zcode', { target: 'zcode', applicable: true, decision: 'block', reasons: ['unit_retired'] }]]) }
  expect(willEnqueueRun('@zcode 修一下', '/ws/p', facts)[0]).toMatchObject({ willRun: false, reason: 'unit_gate' })
})
it('无 unitGate 时预演行为不变', () => {
  // 同上夹具去掉 unitGate → { willRun: true, reason: 'queued' }
})
```

- [ ] **Step 7：运行本任务全部测试**

Run: `cd <工作区> && npx vitest run custom/server/__tests__/zcode-mention-dispatch.test.ts custom/server/__tests__/raci-dispatch.test.ts custom/server/zcode custom/server/outcome/__tests__/team-validate.test.ts custom/server/outcome/__tests__/outcome-controller.test.ts custom/client/zcode/__tests__/zcode-projection.test.ts custom/server/kanban`
Expected: 全部 PASS。

- [ ] **Step 8：变异探针并改回**

在 `planDispatch` 里把门判定临时改成恒不拦截（删掉 `unit_gate` 的 `reject` 分支），运行 Step 7 的命令，Expected: FAIL（`retired → reject unit_gate` 等变红）。改回后再跑，Expected: PASS。

- [ ] **Step 9：提交**

```bash
cd <工作区> && git add custom/server/zcode/dispatch-reasons.ts custom/server/zcode/mention-dispatch.ts custom/server/zcode/engine-controller.ts custom/server/services/kanban/raci-dispatch.ts custom/server/outcome/team-validate.ts custom/server/outcome/outcome-controller.ts custom/client/zcode/store/zcode-projection.ts custom/server/__tests__/zcode-mention-dispatch.test.ts custom/server/__tests__/raci-dispatch.test.ts custom/server/outcome/__tests__/team-validate.test.ts custom/server/zcode/__tests__/squad-protocol.test.ts
git commit -m "feat(dispatch): 派单门接入统一判定核、RACI 派发与结果团队确认——数字员工批一 Task 4"
```

---

### Task 5：能力路由落到实际执行者

**Files:**
- Modify: `custom/client/matrix-teams/protocol.ts`
- Modify: `custom/client/matrix-teams/agent-router.ts`
- Modify: `custom/client/matrix-teams/stores/task-dispatch.ts`
- Modify: `custom/client/matrix-teams/store/dispatch-kv.ts`（索引条目类型）
- Modify: `custom/server/matrix/chat-bridge.ts`
- Test: `custom/client/matrix-teams/__tests__/mb-routing.test.ts`（追加）
- Test: `custom/client/matrix-teams/__tests__/protocol-v2.test.ts`（追加）
- Test: `custom/server/matrix/__tests__/chat-bridge.test.ts`（追加）

**Interfaces:**
- Produces: `AgentDescriptor.profile?: string`（字符集 `^[A-Za-z0-9._-]{1,64}$`；不合法即整条 `parseAgentProfileContent` 返回 `null`）
- Consumes: `AgentDescriptor.profile`
- Produces: `selectAgent` 只把 `profile` 非空的 Agent 纳入候选；新增决策 `{ kind: 'unroutable'; covering: number }`（有覆盖能力的 Agent 但都没有 `profile`）
- Produces: `DispatchIndexEntry.routedProfile?: string`
- Consumes: 既有 `createTask({ assignee })`

- [ ] **Step 1：在 `mb-routing.test.ts` 追加失败用例**

```ts
it('selectAgent：无 profile 的 Agent 不参与路由；全覆盖者都无 profile → unroutable', () => {
  const noProfile = agent({ agentId: 'np' })
  expect(selectAgent({ capability: ['coding'] }, [noProfile], [])).toEqual({ kind: 'unroutable', covering: 1 })
  const withProfile = agent({ agentId: 'wp', profile: 'worker-coder' })
  expect(selectAgent({ capability: ['coding'] }, [noProfile, withProfile], [])).toMatchObject({ kind: 'assigned', agent: { agentId: 'wp' } })
})
it('store：看板卡 assignee 等于路由选中 Agent 的 profile', async () => {
  const store = useTaskDispatchStore()
  await store.handleTimelineEvent(profileEv([agent({ agentId: 'coder', profile: 'worker-coder' })]), { roomId: '!reg:sv' })
  await store.receiveAssign(assign({ capability: ['coding'] }))
  expect(created[0].assignee).toBe('worker-coder')
  expect(loadDispatchIndex()[TASK_ID]).toMatchObject({ routedAgentId: 'coder', routedProfile: 'worker-coder' })
})
it('store：覆盖者无 profile → failed 回执 no-routable-profile，不建卡、不回落原目标', async () => {
  await store.handleTimelineEvent(profileEv([agent({ agentId: 'coder' })]), { roomId: '!reg:sv' })
  await store.receiveAssign(assign({ capability: ['coding'] }))
  expect(created).toHaveLength(0)
  expect(sentEvents.find(e => e.type === TASK_EVENT_TYPES.receipt)?.content).toMatchObject({ status: 'failed', reason: 'no-routable-profile' })
})
it('无能力标签的 assign 不走路由，assignee 仍是原目标 profile（行为不变）', async () => {
  await store.receiveAssign(assign())
  expect(created[0].assignee).toBe('pb2')
})
```

既有用例「agent.profile 经 timeline 汇入 … 建卡」里的夹具没有 `profile`，按新规则会变成 `no-routable-profile`。给该用例和「满 maxParallel」用例的 `agent()` 夹具补 `profile: 'worker-coder'`，并保留原有断言。`TASK_ID` 用该文件已有的任务 id 常量。

- [ ] **Step 2：在 `protocol-v2.test.ts` 追加**

```ts
it('agent.profile：合法 profile 保留；非法字符整条拒收', () => {
  // parseAgentProfileContent({ schemaVersion: 2, updatedBy:'@b:sv', updatedAt:1, agents:[{ agentId:'a', agentType:'coder', capabilities:[], profile:'worker-coder' }] }) 非 null 且 profile 保留
  // profile:'bad profile!'（含空格与感叹号）→ 返回 null
})
```

- [ ] **Step 3：运行，确认失败**

Run: `cd <工作区> && npx vitest run custom/client/matrix-teams/__tests__/mb-routing.test.ts custom/client/matrix-teams/__tests__/protocol-v2.test.ts`
Expected: FAIL。

- [ ] **Step 4：实现**

`protocol.ts`：`AgentDescriptor` 增 `profile?`；`parseAgentProfileContent` 里若 `a.profile !== undefined`，校验字符集与长度，不合法 `return null`。

`agent-router.ts`：`RouteDecision` 增 `{ kind: 'unroutable'; covering: number }`；先按能力覆盖筛出 `covering`，为空 → `no-match`；再筛 `profile` 非空，为空 → `unroutable`；其余逻辑不变。

`task-dispatch.ts` 的 `doReceiveAssign`：`decision.kind === 'unroutable'` → 回执 `failed`、`reason: 'no-routable-profile'`；`assigned` 时 `assignee: decision.agent.profile!`；索引条目带 `routedProfile`。`dispatch-kv.ts` 的条目类型加 `routedProfile?: string`。

`chat-bridge.ts` 的 `declareAgentProfiles`：从视图 `v.profile` 取值，是字符串且满足同一字符集时写入 `profile` 字段。字符集正则在客户端与服务端各写一份并加注释指明对方位置（两侧不互相导入）。

- [ ] **Step 5：在 `chat-bridge.test.ts` 追加并实现**

```ts
it('agent.profile 声明带出房间 Agent 的 profile；非法值不带该字段', async () => {
  // 现有「agent.profile v2 声明」describe 内追加；mock getRoomAgentViews 返回 [{ name:'wc', agentId:'a1', agent:'hermes', profile:'worker-coder' }, { …profile:'bad profile!' }]
  // 断言发出的 state 事件 agents[0].profile === 'worker-coder'，agents[1] 无 profile 键
})
```

Run: `cd <工作区> && npx vitest run custom/client/matrix-teams custom/server/matrix/__tests__/chat-bridge.test.ts custom/server/matrix/__tests__/task-protocol-guard.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6：变异探针并改回**

把 `doReceiveAssign` 里 `assignee` 临时改回 `profile`（原目标），运行 Step 5 的命令，Expected: FAIL（「看板卡 assignee 等于路由选中 Agent 的 profile」变红）。改回后再跑，Expected: PASS。

- [ ] **Step 7：提交**

```bash
cd <工作区> && git add custom/client/matrix-teams/protocol.ts custom/client/matrix-teams/agent-router.ts custom/client/matrix-teams/stores/task-dispatch.ts custom/client/matrix-teams/store/dispatch-kv.ts custom/server/matrix/chat-bridge.ts custom/client/matrix-teams/__tests__/mb-routing.test.ts custom/client/matrix-teams/__tests__/protocol-v2.test.ts custom/server/matrix/__tests__/chat-bridge.test.ts
git commit -m "fix(matrix-teams): 能力路由结果落到看板卡实际指派对象——数字员工批一 Task 5"
```

---

### Task 6：信任域操作者绑定登录身份

**Files:**
- Modify: `custom/server/trust/controller.ts`
- Test: `custom/server/trust/__tests__/trust.test.ts`（追加）

**Interfaces:** 无新增导出。

- [ ] **Step 1：追加失败用例**

```ts
it('请求体 actor 被忽略：有登录用户时记登录名', async () => {
  // 以 user={ id:'u1', username:'alice', role:'super_admin' } 调 POST /cases，body.actor='mallory'
  // 断言 case 的操作者字段为 'alice'
})
it('无登录用户时回落 operator，不读请求体 actor', async () => {
  // 不设 ctx.state.user；body.actor='mallory'；断言操作者为 'operator'
})
```

- [ ] **Step 2：运行，确认失败**

Run: `cd <工作区> && npx vitest run custom/server/trust`
Expected: FAIL（操作者为 `mallory`）。

- [ ] **Step 3：实现**

`trust/controller.ts` 的 `actorOf(ctx, _body)`：删去请求体 `actor` 分支，只保留登录用户名与 `operator` 回落。

- [ ] **Step 4：运行，确认通过**

Run: 同 Step 2。Expected: PASS。

- [ ] **Step 5：提交**

```bash
cd <工作区> && git add custom/server/trust/controller.ts custom/server/trust/__tests__/trust.test.ts
git commit -m "fix(trust): 操作者只取登录身份，请求体 actor 不再生效——数字员工批一 Task 6"
```

---

### Task 7：离职前置检查、自然人联动与任务改派核实

**Files:**
- Modify: `custom/server/governance/registry-admin.ts`
- Modify: `custom/server/governance/governance-controller.ts`（`/matrix-offboard`、新增 `/matrix-offboard/precheck`）
- Create: `custom/server/governance/offboard-handover.ts`
- Test: `custom/server/governance/__tests__/registry-admin.test.ts`（追加）
- Test: `custom/server/governance/__tests__/offboard-handover.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 的 `runtimeBindings`、`deactivatePerson`
- Produces: `interface OffboardInput` 增可选 `handoverProfile?: string`
- Produces: `interface TaskHandoverRow { taskId: string; before: string | null; after: string | null; reassigned: boolean; note: string }`
- Produces: `class OffboardBlockedError extends Error { code: 'offboard_blocked'; blockedUnits: Array<{ identityId: string; name: string; stage: string }> }`
- Produces: `precheckOffboard(inp: OffboardInput): Promise<{ blockedUnits: Array<{ identityId: string; name: string; stage: string }>; person: { status: 'deactivated' | 'not-linked'; personId?: string } }>`（只读；令牌无效时抛错）
- Produces: `offboardAccount(inp)` 返回值在原三个字段（`handoverCommit / deactivated / auditCommit`）之外增 `taskHandover: TaskHandoverRow[]` 与 `person: { status: 'deactivated' | 'not-linked'; personId?: string }`；仍有在岗执行单元时抛 `OffboardBlockedError`
- Produces: `verifyTaskHandover(taskIds: string[], expectedProfile: string): Promise<TaskHandoverRow[]>`
- Produces: `POST /api/governance/matrix-offboard/precheck` → `200 { ok, blockedUnits, person }`
- Produces: `POST /api/governance/matrix-offboard` 在被阻止时 → `409 { ok: false, code: 'offboard_blocked', blockedUnits }`

- [ ] **Step 1：写失败测试 `offboard-handover.test.ts`**

```ts
it('verifyTaskHandover：指派对象等于预期 → reassigned=true；不等 → false 并带原值', async () => {
  // 以注入的查询函数返回 { assignee: 'worker-coder' } 与 { assignee: 'old' }
})
it('verifyTaskHandover：任务不存在 → after=null、reassigned=false、note 写明', async () => {})
```

`verifyTaskHandover` 签名增可选第三参 `fetchAssignee?: (taskId: string) => Promise<string | null>`（测试注入；缺省用 `fetchTaskTitleAndBodyByTaskId` 取 `assignee`）。

- [ ] **Step 2：在 `registry-admin.test.ts` 追加失败用例**

现有测试把 `node:fs/promises`、`node:child_process`、矩阵管理服务全 mock。追加：

```ts
it('precheck：令牌无效 → 抛错且不写任何文件', async () => {
  whoamiMock.mockResolvedValueOnce(null as never)
  await expect(precheckOffboard(base())).rejects.toThrow()
  expect(writeFile).not.toHaveBeenCalled()
})
it('precheck：命中在岗执行单元 → blockedUnits 列出；不写文件', async () => {
  // AGENT_IDENTITY_STORE 指向 tmp；登记身份绑定 @zhang-agent:matrix.test、阶段 running
  // blockedUnits 等于 [{ identityId, name, stage: 'running' }]；execMock 无 commit 调用
})
it('precheck：无命中 → blockedUnits 为空', async () => {})
it('precheck：自然人 mxids 命中 → 预览 deactivated', async () => {
  // 登记 carol，mxids ['@zhang:matrix.test']，启用 → person.status === 'deactivated'
})
it('offboard：仍有在岗执行单元 → 抛 offboard_blocked，未停用账号、未写文件', async () => {
  // await expect(offboardAccount(base())).rejects.toThrow(/offboard_blocked|先完成退役/)
  // deactivateMock 未被调用；execMock 无 commit
})
it('offboard：联动停用命中的自然人', async () => {
  // 无在岗单元；carol mxids 命中 → 执行后 carol.active === false，返回 person.status === 'deactivated'
})
it('offboard：移交工单写入逐卡核实结果', async () => {
  // offboardAccount({ ...base(), taskIds: ['t1','t2'], handoverProfile: 'worker-coder' })
  // 断言 writeFile 收到的工单文本含 't1' 的核实行；返回 taskHandover 长度 2
})
it('offboard：未填接手执行单元 → 不核实改派，工单写「仅登记」', async () => {})
```

审查重点第 4 条由「offboard：仍有在岗执行单元」一例覆盖（它直接调离职端点，不经过前置检查）。

- [ ] **Step 3：运行，确认失败**

Run: `cd <工作区> && npx vitest run custom/server/governance/__tests__/registry-admin.test.ts custom/server/governance/__tests__/offboard-handover.test.ts`
Expected: FAIL。

- [ ] **Step 4：实现**

`offboard-handover.ts`：导出 `verifyTaskHandover`。每张卡取当前指派对象，与预期比较得 `reassigned`；查不到时 `after: null`、`note: '任务不存在或不可读'`。

`registry-admin.ts`：
- `OffboardInput` 增 `handoverProfile?`。
- 导出 `precheckOffboard`：`validateMatrixToken` 失败即抛（沿用现有文案）；账号全形按 `offboardAccount` 现有的服务器名推导；读 `listIdentities()`，筛 `runtimeBindings?.matrixAccounts` 命中 `@${name}-agent:${serverName}` 且阶段属于 `admitted|running|changing`；自然人预览同下。
- 提取内部函数 `findOffboardBlock(inp, serverName)` 与 `deactivateLinkedPerson(name, serverName, actor, reason)`，供 `precheckOffboard` 与 `offboardAccount` 共用。自然人匹配：`mxids` 中存在等于 `@${name}:${serverName}` 或等于裸 `name` 的值，且 `active`。
- `offboardAccount`：令牌校验之后、写任何文件之前调用 `findOffboardBlock`，有命中 → `throw new Error('offboard_blocked：仍有在岗执行单元，先完成退役交接：' + 名单)`。`taskIds` 与 `handoverProfile` 都有时调用 `verifyTaskHandover`；都没有或未填 `handoverProfile` 时 `taskHandover` 各行 `reassigned:false`、`note:'仅登记'`。工单文本在每个任务号后追加核实结果。停用账号成功后调用 `deactivateLinkedPerson`。返回值增两个字段。
- 前置检查读取身份册所用的 `AGENT_IDENTITY_STORE` 环境变量在该测试文件里需指向临时目录；`beforeEach` 里设、`afterEach` 里清。

`governance-controller.ts`：新增 `POST /matrix-offboard/precheck`（`superAdminDenied` 闸；入参校验同离职接口；调用 `precheckOffboard`；失败按现有离职接口的方式返回状态码与 `{ error }`）。`/matrix-offboard` 的错误分支：消息以 `offboard_blocked` 开头时 `ctx.status = 409`，响应体 `{ ok: false, code: 'offboard_blocked', error, blockedUnits }`。为此让 `offboardAccount` 抛出一个带 `code` 与 `blockedUnits` 属性的错误对象（`class OffboardBlockedError extends Error`，导出）。

- [ ] **Step 5：运行，确认通过**

Run: 同 Step 3。Expected: PASS。

- [ ] **Step 6：提交**

```bash
cd <工作区> && git add custom/server/governance/registry-admin.ts custom/server/governance/governance-controller.ts custom/server/governance/offboard-handover.ts custom/server/governance/__tests__/registry-admin.test.ts custom/server/governance/__tests__/offboard-handover.test.ts
git commit -m "feat(governance): 离职前置检查、自然人联动停用与任务改派核实——数字员工批一 Task 7"
```

---

### Task 8：界面——身份面板

**Files:**
- Modify: `custom/client/governance/components/AgentIdentitySection.vue`
- Test: `custom/client/governance/__tests__/agent-identity-section.test.ts`（新建；现有 `workunit-sections.test.ts` 未覆盖该组件）

**Interfaces:**
- Consumes: Task 1、Task 3 的接口字段
- Produces: 界面文本键（组件内联中英字典，沿用现有 `T` 写法）

- [ ] **Step 1：写失败测试**

```ts
// @vitest-environment jsdom；fetch 全 mock；挂载后断言
it('表格有「户口缺口」列，缺口身份显示缺口说明', async () => {
  // /agent-identity 返回带 capabilityBoundary/auditRequirement 的完整身份与一个缺项身份
  // 断言缺口行的 data-testid="gov-ai-gap-<name>" 文本含「能力边界」
})
it('登记表单可填能力边界与审计要求，并随请求发出', async () => {
  // 填 regName/regOwner、can/cannot 文本域、sampling/retentionDays 输入；点登记
  // 断言 fetch 被以 body 含 capabilityBoundary:{can:[…],cannot:[…]} 与 auditRequirement 调用
})
it('补全编辑把 runtimeBindings 与五要素发给 update', async () => {
  // 点某行「补全」→ 填绑定目标 → 提交；断言 PUT/POST 到 /agent-identity/:id/update，body 含 runtimeBindings.agents
})
it('界面说明如实写明执法范围', async () => {
  // 断言文本含「工具白名单」且含「凭证」；不再含「台账不是鉴权」
})
```

- [ ] **Step 2：运行，确认失败**

Run: `cd <工作区> && npx vitest run custom/client/governance/__tests__/agent-identity-section.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

登记表单增：工具白名单（每行一个）、能做什么、不做什么（每行一条）、抽样比例（数字 0–1）、留存天数（数字）。登记请求带 `toolAllowlist` 与两组新字段。表格增「户口缺口」列：前端用身份的 `capabilityBoundary / auditRequirement / toolAllowlist` 按 `rosterGaps` 同样的判据计算（判据只在服务端定义；界面改为调用 `GET /api/governance/agent-identity` 响应里新增的 `gaps` 字段，避免前端复制规则——在控制器 `GET /agent-identity` 的响应里加 `gaps: listRosterGaps().rows`）。每行增「补全」按钮，展开编辑责任人、白名单、能力边界、审计要求、绑定目标，提交到 `:id/update`。底部说明改为：工具白名单与委托白名单已在工具调用前执法；凭证状态与生命周期派单门（绑定后）为记录与派单约束，不吊销真实凭证。

Controllers 的那一处响应字段扩充属于本任务（`governance-controller.ts` 的 `GET /agent-identity`），Files 里补上。

- [ ] **Step 4：运行，确认通过并回归治理界面测试**

Run: `cd <工作区> && npx vitest run custom/client/governance`
Expected: 全部 PASS。

- [ ] **Step 5：提交**

```bash
cd <工作区> && git add custom/client/governance/components/AgentIdentitySection.vue custom/client/governance/__tests__/agent-identity-section.test.ts custom/server/governance/governance-controller.ts
git commit -m "feat(governance): 身份面板支持补全户口五要素与运行时绑定——数字员工批一 Task 8"
```

---

### Task 9：界面——责任台账

**Files:**
- Modify: `custom/client/governance/components/WorkUnitLedgerSection.vue`
- Test: `custom/client/governance/__tests__/workunit-sections.test.ts`（追加）

**Interfaces:**
- Consumes: Task 3 的 `/card/sign`、`/people/:id/deactivate`；`GET /api/auth/me`（受保护接口，返回 `{ user: { username, role, … } }`）

- [ ] **Step 1：追加失败用例**

```ts
it('保存带准入证据的责任卡 → 签署 → 准入 → 运行：请求体字段正确', async () => {
  // mock GET /agent-identity、/people、/card、POST /card/sign、POST /transition
  // 点某行「保存责任卡」，填三组准入证据，保存 → 断言 PUT body 含 admissionEvidence.{representativeTasks,edgeCases,dataPermissionReview}
  // 点「以当前登录身份签署」→ 断言 POST …/card/sign 的 body 不含 signedBy
  // 目标阶段选 admitted → 点该行迁移 → 断言 POST body 为 { to:'admitted', reason }，不含 by
  // 再选 running → 迁移 → 同上
})
it('迁移人输入框不存在；界面显示当前登录身份', async () => {
  // 断言不存在「迁移人」可编辑输入；文本含当前登录名
})
it('变更后重启：提交两条证据引用', async () => {
  // 阶段为 changing 的行；目标阶段 running；填两条 evidenceRefs；断言 body.evidenceRefs 长度 2
})
it('退出：交接事项必填且请求体不含占位文字', async () => {
  // 目标阶段 retired；不填事项点迁移 → 界面报错且不发请求
  // 填一条 → 断言 body.exit.items 等于所填内容，body 不含 confirmedBy
})
it('目标阶段下拉只列当前阶段的合法去向', async () => {
  // registered 行 → 选项为 admitted、retired；running 行 → changing、retired
})
it('停用自然人：点「停用」→ POST /people/:id/deactivate', async () => {})
```

- [ ] **Step 2：运行，确认失败**

Run: `cd <工作区> && npx vitest run custom/client/governance/__tests__/workunit-sections.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

- 新增「当前登录身份」的取得与显示：组件挂载时用 `fetch('/api/auth/me', { headers: auth() })` 取 `user.username`（这两个组件现有的取数写法就是直接 `fetch`＋`auth()`，沿用；自定义层此前没有组件导入过上游的 `fetchCurrentUser` 封装，不新开这种导入）。取不到（未开启登录的单机部署会 401）时显示「未登录（单机部署需设置 AISTUDIO_LOCAL_OPERATOR）」，署名与迁移按钮置灰。迁移人、退出确认人显示为该用户名的只读文本。测试里 mock `/api/auth/me` 返回 `{ user: { username: 'alice', role: 'super_admin' } }`。
- 自然人名单处：未启用的人保留「启用」；已启用的人增「停用」。另加「以登录名登记并启用」按钮，调 `POST /people` 与 `POST /people/:id/activate`。
- 责任卡表单：增三组准入证据文本域（每行一条）；签署人输入框换成按钮「以当前登录身份签署」，调 `POST …/card/sign`；显示签署人与是否对当前版本有效（读 `businessOwnerSign.stale`）。
- 迁移区：目标阶段下拉按 `stage` 过滤合法去向（`registered→admitted/retired`、`admitted→running/retired`、`running→changing/retired`、`changing→running/retired`）。目标为 `running` 且当前阶段 `changing` 时显示两条证据引用输入。目标为 `retired` 时显示退出类型下拉（暂停/撤权/下线）与交接事项文本域（必填）。高风险单元提示确认人不得是主责任人。
- 表格增「绑定目标」列（`runtimeBindings` 的两个数组拼接显示）。
- 请求体：迁移只发 `to / reason / evidenceRefs? / exit?`，`exit` 含 `kind / items`。
- 中英文案同步补齐。

- [ ] **Step 4：运行，确认通过并回归**

Run: 同 Step 2。Expected: PASS。再跑 `cd <工作区> && npx vitest run custom/client/governance`，Expected: 全部 PASS。

- [ ] **Step 5：提交**

```bash
cd <工作区> && git add custom/client/governance/components/WorkUnitLedgerSection.vue custom/client/governance/__tests__/workunit-sections.test.ts
git commit -m "feat(governance): 责任台账界面走通准入证据、签署、变更重启与退出登记——数字员工批一 Task 9"
```

---

### Task 10：界面——离职向导

**Files:**
- Modify: `custom/client/ia2/components/gov/OrgEditor.vue`
- Test: `custom/client/ia2/__tests__/org-editor-board-hint.test.ts`（追加）

**Interfaces:**
- Consumes: Task 7 的 `/matrix-offboard/precheck` 与离职响应的 `taskHandover / person`
- Consumes: `reassignTask`（`vendor/hermes-studio/packages/client/src/api/hermes/kanban.ts` 导出）与 `getAssignees`（同文件）

- [ ] **Step 1：追加失败用例**

```ts
it('前置检查被阻止 → 显示在岗执行单元名单，不发起改派与离职', async () => {
  // mock：precheck 返回 409/blockedUnits；reassignTask 与 offboardAccount 为 spy
  // 向导填齐后点执行 → 断言界面含被拦单元名；两个 spy 均未被调用
})
it('前置检查通过 → 先改派再离职，结果显示逐卡核实与自然人联动', async () => {
  // precheck 通过；reassignTask 两次成功；offboardAccount 返回 taskHandover 两行、person.status='deactivated'
  // 断言调用顺序：precheck → reassign → offboard；结果文本含核实行与自然人结果
})
it('离职失败且已有改派 → 列出已改派的卡并提供改回入口', async () => {
  // offboardAccount 抛错；断言界面含「改回原指派对象」按钮；点击后 reassignTask 被以原指派对象调用
})
it('管理员令牌为空时不能进入执行', async () => {})
```

- [ ] **Step 2：运行，确认失败**

Run: `cd <工作区> && npx vitest run custom/client/ia2/__tests__/org-editor-board-hint.test.ts`
Expected: FAIL。

- [ ] **Step 3：实现**

向导第一步增：管理员令牌输入（从第二步前移）、接手执行单元下拉（可选；选项来自 `getAssignees`）。`runWizard` 改为：前置检查 →（填了接手执行单元且有任务卡时）逐卡 `reassignTask(taskId, profile, { reason: '离职移交' })`，记录每张卡的原指派对象（前置检查响应不带任务信息，原指派对象取自界面已有的任务卡输入旁的展示；若无则在改派前用 `getTask` 取一次）→ `offboardAccount`。失败分支：若已发生改派，显示这些卡与原指派对象及「改回原指派对象」按钮（逐卡 `reassignTask(taskId, 原指派对象)`）。结果区展示逐卡核实、自然人联动结果、被拦名单。

- [ ] **Step 4：运行，确认通过**

Run: 同 Step 2。Expected: PASS。

- [ ] **Step 5：提交**

```bash
cd <工作区> && git add custom/client/ia2/components/gov/OrgEditor.vue custom/client/ia2/__tests__/org-editor-board-hint.test.ts
git commit -m "feat(governance): 离职向导前置检查、逐卡改派与半完成恢复——数字员工批一 Task 10"
```

---

### Task 11：机制预算、设计文档与决策留痕

**Files:**
- Modify: `config/mechanism-budget.json`
- 核对（不默认改动）: `docs/DESIGN.md`（§4.6「执行单元责任台账」段，已随立项提交修订）
- Modify: `docs/superpowers/specs/2026-11-24-digital-employee-batch1-lifecycle-loop.md`（「验证」段回填结果、状态行）
- Modify: `config/regression-matrix.json`（仅当新增测试目录未被既有 `covers` 覆盖时）
- 不改动：`.swarm-yuan/decisions.jsonl`（主干存量断链，本批不续写，见 Step 4）

**Interfaces:** 无。

- [ ] **Step 1：登记机制预算**

在 `config/mechanism-budget.json` 的 `changes` 数组头部插入一条（文本插入，不重排整个文件——历史上用脚本重写该文件造成过格式漂移）：`at: "2026-11-24"`；`delta` 与 `reason` 按规格第七节；`pairedRemovals` 两条；`sunset` 为 `{ owner: "数字员工批一", reviewBy: "2026-12-08", retireWhen: "全部在用执行单元完成绑定且连续两轮真实运行门零误拦后，派单门并入内核领取门，本层门退役；或连续两轮零绑定时降级为只读读数" }`。

- [ ] **Step 2：预算与治理 lint**

Run: `cd <工作区> && node scripts/governance-lint.mjs --budget`
Expected: 退出码 0，无 problem。本批补丁、脚本、账本、npm 脚本零新增，不触及任何上限。

- [ ] **Step 3：设计正本（已在立项提交完成，本步只核对）**

`docs/DESIGN.md` §4.6「执行单元责任台账」段的修订已随立项提交入库（提交钩子要求规格的「设计文档影响：touched」声明与设计正本修订同批兑现）。本步只读核对：该段含「只有显式绑定的执行单元受派单门约束」一句。若实施过程中规格的设计有变（例如某个决策被审查推翻），在这里同步修订设计正本，并保持现在时陈述、不带日期与提交号。

- [ ] **Step 4：决策留痕（有前置阻塞，见下）**

**阻塞：** 主干 `.swarm-yuan/decisions.jsonl` 的哈希链当前是断的，与本批无关。`bash skills/swarm-yuan/assets/trace-log.sh --verify-chain` 报「断裂于第 136 行」；第 136 行不是独立记录，而是第 135 行那个 JSON 对象的后半段被换行截开后的残片（行内含 `"restore": "spec=…ai-native-outcome-batch1.md"}`，本身不是合法 JSON），其后第 137–145 行是正常记录。校验脚本的红线是「勿改写历史行」，修复历史行须用户授权。

**本批做法：** 不向该台账追加任何行（在断链上续写会让后续记录同样无法校验）。决策留痕在本批内以 spec 的「决策记录」段为准（D1–D13 已随 spec 入库）。待用户裁决断链修复后，用专用工具补记，不手拼 JSON 行：

```bash
cd <工作区> && bash skills/swarm-yuan/assets/trace-log.sh --decision --project-dir "$PWD" \
  --type UserChallenge --phase "数字员工批一" \
  --suggestion "派单门只约束显式绑定运行时目标的执行单元，绑定后默认强制，WORKUNIT_DISPATCH_GATE=off 可整体回滚" \
  --user-action approved --reversibility reversible \
  --rationale "用户 2026-11-24 在方案 A/B/C 中指令「执行A」，随后对批一 spec 指令「批准」；D1、D2 随批复确认"
```

第二条（D12、D13，`--type Mechanical`）同法。补记后运行 `--verify-chain`，Expected: 退出码 0。

不要用编辑器或脚本直接往 `decisions.jsonl` 追加文本：行尾的 `seq / previous_checksum / checksum` 三个链字段由工具计算，手拼必断链。

- [ ] **Step 5：回归矩阵登记检查**

Run: `cd <工作区> && npx vitest run scripts/__tests__/regression-matrix.test.ts`
Expected: PASS。本批新增测试都在 `custom/**/*.test.ts`，已被根 vitest 的 `covers` 覆盖；若该测试报「未登记的测试文件」，按报错把文件所在目录加进 `config/regression-matrix.json` 对应测试面的 `covers`。

- [ ] **Step 6：提交**

```bash
cd <工作区> && git add config/mechanism-budget.json
git commit -m "chore(budget): 数字员工批一机制预算登记"
```

（决策台账本批不改动，见 Step 4 的阻塞说明；设计正本已在立项提交里修订。）

spec 的验证回填留到 Task 12 完成后一并提交（那时才有真实结果）。

---

### Task 12：收口验证与 spec 回填

**Files:**
- Modify: `docs/superpowers/specs/2026-11-24-digital-employee-batch1-lifecycle-loop.md`（「验证」段回填）
- Modify: `docs/superpowers/plans/2026-11-24-digital-employee-batch1.md`（勾选步骤）

- [ ] **Step 1：服务端类型检查**

Run: `cd <工作区> && npm run typecheck:harness`
Expected: 退出码 0。`typecheck:harness` 用 `find custom/server -name '*.ts' ! -name '*.test.ts'` 取文件，新模块自动纳入，无需登记。

- [ ] **Step 2：合并前回归矩阵**

Run: `cd <工作区> && npm run regress -- --scope merge`
Expected: 全部测试面 PASS，无「未执行」。任一面失败或未执行：先区分是本批引入还是主干既有（在主工作区同一命令对照），本批引入的当场修。

- [ ] **Step 3：浏览器实操**

隔离实例：独立 `HERMES_WEB_UI_HOME`（指向新建的临时目录）、`NODE_ENV=production`、`AGENT_IDENTITY_STORE` 指向临时目录；端口避开 8647/8649。起服后核对启动日志里的数据库路径指向临时目录（只隔离 `HERMES_HOME` 不够，会读写到真实库）。

实操并留文字记录（不入库二进制）：
1. 以管理员登录；在责任台账把自己「以登录名登记并启用」。
2. 身份面板：登记一个五要素齐备、绑定一个真实可派单目标的身份。
3. 责任台账：保存带三组准入证据的责任卡 → 以当前登录身份签署 → 准入 → 运行。
4. 触发一次指向该目标的派单，确认照常起跑。
5. 迁到变更 → 再迁运行（填两条证据）→ 迁退役（填交接事项）。确认凭证记录与委托已撤销。
6. 再触发一次指向该目标的派单，确认被拒且原因显示为单元未就绪。
7. 关闭 `WORKUNIT_DISPATCH_GATE=off` 重启，确认第 6 步的目标照常起跑。
8. 离职向导：对一个绑定了在岗执行单元的账号发起离职，确认被前置检查拦下并显示名单。

记录每步的界面文案与请求结果。任何一步与预期不符：记入收口说明，属本批缺陷的当场修。

- [ ] **Step 4：回填 spec 的「验证」段**

把以下真实结果写入 spec「验证」段：各任务测试的通过数、四次变异探针的结果（Task 2、3、4、5）、`regress --scope merge` 的结果、类型检查结果、浏览器实操八步的结果。`状态` 行改为「已实施（待独立审查）」。

- [ ] **Step 5：重生成文档索引并检查合并不变量**

Run: `cd <工作区> && node scripts/maintenance/gen-doc-indexes.mjs --write`（该脚本不在 `package.json` 的脚本里，直接用 node 调；它重写 `docs/manuals/aistudio-design-document-index.md` 的机器段，把新 spec 收入索引）
Expected: 退出码 0。再 Run: `cd <工作区> && node scripts/merge-invariants.mjs --check`，Expected: 退出码 0。

- [ ] **Step 6：提交**

```bash
cd <工作区> && git add docs/superpowers/specs/2026-11-24-digital-employee-batch1-lifecycle-loop.md docs/superpowers/plans/2026-11-24-digital-employee-batch1.md docs/manuals/aistudio-design-document-index.md
git commit -m "docs(spec): 数字员工批一验证回填与实施计划勾选"
```

---

## 收口（计划之外，由主会话执行）

独立审查（新起一个审查者看整条分支）→ 处理审查发现 → `git fetch origin` → `rebase origin/main` → 在主工作区 `merge --no-ff` → 推送前钩子跑回归矩阵推送前档 → `git worktree remove`。合并冲突由本分支属主会话（本会话）解决。
