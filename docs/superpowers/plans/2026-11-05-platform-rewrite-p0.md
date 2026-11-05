# AIStudio 平台重写 P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立新的身份、授权、执行与证据核心，关闭 Matrix 跨 IdP 绑定、跨 profile 写入、未知工具放行、沙箱绕过和空证据假绿。

**Architecture:** 共享契约位于 `custom/platform/contracts/`，服务端策略位于 `custom/server/platform/`。现有控制器调用新核心；vendor 只通过补丁接入。P0 在 `refactor/platform-rewrite` 内独立提交和验收，不单独合入主干，最终与 P1/P2 一次性切换。

**Tech Stack:** TypeScript、Koa、Vue 3、Node 24、Vitest、SQLite、git apply patch series。

## Global Constraints

- 工作树固定为 `/Users/cuishi/lab/AIStudio/.claude/worktrees/platform-rewrite`，不直接在 main 修改。
- Matrix 保留任意 IdP；新身份必须 disabled、空 profiles、不签 JWT、不保存 Matrix session。
- 同一 MXID 的跨 origin 冲突返回 409，不在 P0 重建 users 表。
- 未登记写端点默认拒绝；无身份、空授权和不可判定状态不得被解释为全通或成功。
- 配置文件系统 roots 后，terminal/code 没有真实 OS 沙箱证明即拒绝，不能用 Shell 文本检查代替。
- 所有缺陷先写负例并确认旧实现失败，再写实现；每个任务完成目标测试后单独提交。
- 注入测试使用临时 `HOME` 与 `OVERLAY_STATE_OUT`，不得改写宿主 `~/.hermes/hermes-agent`。
- 不升级依赖，不删除其他会话分支或 worktree，不执行真实外部写操作。

---

### Task 1: 建立平台身份与授权契约

**Files:**
- Create: `custom/platform/contracts/identity.ts`
- Create: `custom/server/platform/authz/policy.ts`
- Create: `custom/server/platform/__tests__/policy.test.ts`
- Modify: `package.json`（typecheck:harness 点名）

**Interfaces:**
- Produces: `PlatformPrincipal`、`normalizeIssuerOrigin()`、`evaluateIdentityBinding()`、`canAccessProfile()`、`requirePlatformSuperAdmin`（Koa 中间件常量）。
- Consumes: Koa `Context/Next`，上游 `ctx.state.user` 的 `id/username/role/status/profiles`。

- [ ] **Step 1: 写授权与身份绑定负例**

```ts
import { describe, expect, it } from 'vitest'
import { evaluateIdentityBinding, canAccessProfile } from '../authz/policy'

it('拒绝同 MXID 的跨 origin 认领', () => {
  expect(evaluateIdentityBinding(
    { issuerOrigin: 'https://old.example', subject: '@alice:example' },
    { issuerOrigin: 'https://evil.example', subject: '@alice:example' },
  )).toEqual({ allowed: false, code: 'MATRIX_IDENTITY_CONFLICT' })
})

it('空授权普通账号没有任何 profile 权限', () => {
  expect(canAccessProfile({ id: 1, role: 'admin', profiles: [] }, 'default')).toBe(false)
})
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `npx vitest run custom/server/platform/__tests__/policy.test.ts`
Expected: FAIL，无法解析 `../authz/policy`。

- [ ] **Step 3: 实现最小契约与纯函数**

```ts
export interface PlatformPrincipal {
  id: number | string
  username?: string
  role?: 'super_admin' | 'admin'
  status?: 'active' | 'disabled'
  profiles?: string[]
}

export function normalizeIssuerOrigin(raw: string): string {
  const url = new URL(raw)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('unsupported issuer protocol')
  if (url.username || url.password || url.search || url.hash) throw new Error('issuer must be an origin')
  return url.origin
}

export function evaluateIdentityBinding(
  stored: { issuerOrigin: string | null; subject: string },
  presented: { issuerOrigin: string; subject: string },
): { allowed: true } | { allowed: false; code: string } {
  if (stored.subject !== presented.subject) return { allowed: false, code: 'MATRIX_IDENTITY_NOT_FOUND' }
  if (!stored.issuerOrigin) return { allowed: false, code: 'MATRIX_IDENTITY_ORIGIN_UNBOUND' }
  return normalizeIssuerOrigin(stored.issuerOrigin) === presented.issuerOrigin
    ? { allowed: true }
    : { allowed: false, code: 'MATRIX_IDENTITY_CONFLICT' }
}

export function canAccessProfile(user: PlatformPrincipal | undefined, profile: string): boolean {
  if (!user) return false
  if (user.role === 'super_admin') return true
  return user.status === 'active' && Array.isArray(user.profiles) && user.profiles.includes(profile)
}
```

`requirePlatformSuperAdmin` 是 Koa 中间件常量：无主体 401、非 super_admin 403，通过时才 `await next()`。

- [ ] **Step 4: 运行测试并确认通过**

Run: `npx vitest run custom/server/platform/__tests__/policy.test.ts`
Expected: 全部 PASS，覆盖无身份、super_admin、绑定 profile、跨 profile、空 profiles、非法 origin。

- [ ] **Step 5: 提交**

```bash
git add custom/platform/contracts/identity.ts custom/server/platform package.json
git commit -m "feat(platform): 身份绑定与 profile 授权契约"
```

### Task 2: Matrix 零权限建号与统一认证拦截

**Files:**
- Create: `custom/server/platform/identity/matrix-login.ts`
- Create: `custom/server/platform/identity/__tests__/matrix-login.test.ts`
- Create: `patches/751-platform-matrix-zero-provisioning.patch`（若号被占则取下一可用号）
- Modify: `patches/series`
- Patch targets: `vendor/hermes-studio/packages/server/src/modules/studio/controllers/auth.ts`、`repositories/users-store.ts`、`middleware/auth.ts`
- Modify: `custom/client/loop/__tests__/matrix-login-session.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `normalizeIssuerOrigin/evaluateIdentityBinding`。
- Produces: `provisionMatrixIdentity()`；返回 `active|pending|conflict`，pending/conflict 不含 token。
- Patch target 的 `createFromMatrix()` 增加可选 `status?: 'active'|'disabled'`，默认 active 仅供管理端显式建号。

- [ ] **Step 1: 写 Matrix 生命周期负例**

```ts
it('新身份只落待激活账号，不写 token/session/profile', async () => {
  const result = await provisionMatrixIdentity(validPresentation, deps)
  expect(result).toMatchObject({ kind: 'pending', status: 'disabled' })
  expect(result).not.toHaveProperty('token')
  expect(deps.issueUserJwt).not.toHaveBeenCalled()
  expect(deps.saveMatrixSession).not.toHaveBeenCalled()
  expect(deps.replaceUserProfiles).not.toHaveBeenCalled()
})

it('已有账号来源不同返回 409，且不改绑', async () => {
  const result = await provisionMatrixIdentity(conflictingPresentation, deps)
  expect(result).toMatchObject({ kind: 'conflict', code: 'MATRIX_IDENTITY_CONFLICT' })
  expect(deps.syncMatrixMetadata).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 确认旧控制器路径不满足负例**

Run: `npx vitest run custom/server/platform/identity/__tests__/matrix-login.test.ts custom/client/loop/__tests__/matrix-login-session.test.ts`
Expected: 新测试 FAIL；旧测试若断言自动 admin/default 授权，也应因新契约未满足而失败。

- [ ] **Step 3: 实现 Matrix 供应状态机并接入补丁**

```ts
if (!user) {
  user = createFromMatrix({
    matrixUserId, username: uniqueUsername(localpart, safeOrigin, matrixUserId),
    displayName: matrixInfo?.displayName || localpart,
    avatarUrl: matrixInfo?.avatarUrl || '', homeserverUrl: safeOrigin,
    role: 'admin', status: 'disabled',
  })
}
if (!user) throw new Error('Failed to provision Matrix identity')
const binding = evaluateIdentityBinding(
  { issuerOrigin: user.matrix_homeserver_url, subject: user.matrix_user_id || matrixUserId },
  { issuerOrigin: safeOrigin, subject: matrixUserId },
)
if (!binding.allowed) {
  ctx.status = 409
  ctx.body = { error: 'Matrix identity binding requires administrator review', code: binding.code }
  return
}
if (user.status !== 'active' || (user.role !== 'super_admin' && listUserProfiles(user.id).length === 0)) {
  ctx.status = 403
  ctx.body = { error: 'Account awaits activation and profile grant', code: user.status !== 'active' ? 'ACCOUNT_PENDING_ACTIVATION' : 'PROFILE_GRANT_REQUIRED' }
  return
}
```

只有上述检查通过后才允许 `syncMatrixMetadata`、`saveMatrixSession` 和 `issueUserJwt`。统一认证中间件对普通 admin 空 profiles 返回 403；super_admin 不受 profile 行数限制。

- [ ] **Step 4: 重放补丁并运行目标测试**

Run: `npm run clean && npm run inject`（仅在临时 HOME/状态目录下）
Run: `npx vitest run custom/server/platform/identity custom/client/loop/__tests__/matrix-login-session.test.ts`
Expected: pending、冲突、激活后成功、旧空授权 JWT 拒绝均 PASS。

- [ ] **Step 5: 提交**

```bash
git add custom/server/platform/identity custom/client/loop/__tests__ patches/751-platform-matrix-zero-provisioning.patch patches/series
git commit -m "feat(platform): Matrix 零权限供应与来源绑定"
```

### Task 3: 将 userenv、权限档、自治阶梯和审批接入统一授权

**Files:**
- Create: `custom/server/platform/authz/middleware.ts`
- Create: `custom/server/platform/authz/route-guard.ts`
- Create: `registries/server/platform-route-policy.ts`
- Create: `custom/server/platform/__tests__/route-policy.test.ts`
- Create: `patches/752-platform-route-authz.patch`（若号被占则取下一可用号）
- Modify: `custom/server/userenv/controller.ts`
- Modify: `custom/server/autonomyladder/autonomy-ladder-controller.ts`
- Modify: `custom/server/permmodes/session-mode-controller.ts`
- Modify: `custom/server/approval-inbox/pending-controller.ts`
- Test: 各域既有 `__tests__` 与 `custom/server/platform/__tests__/policy.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `canAccessProfile` 和 `requirePlatformSuperAdmin`。
- Produces: `requireProfileParameterAccess(parameter: string)`，供 `:name` 与 `:profileId` 路由复用；`assertPlatformRoutePolicies()` 在启动期拒绝未登记写路由；`enforcePlatformRoutePolicy()` 在请求副作用前执行策略。

- [ ] **Step 1: 写跨 profile 与垂直越权负例**

```ts
it('普通 admin 改其他 profile 的 env 时 403 且文件不变', async () => {
  const response = await requestAs(adminWithProfile('alice'), 'PUT', '/api/userenv/profiles/bob/env', payload)
  expect(response.status).toBe(403)
  expect(readFileSync(bobEnv, 'utf8')).toBe(original)
})

it('普通 admin 不得切 bypassPermissions 或裁决审批', async () => {
  expect((await requestAs(adminWithProfile('alice'), 'PUT', '/api/hermes/permmodes/session-mode/alice', bypass)).status).toBe(403)
  expect((await requestAs(adminWithProfile('alice'), 'POST', '/api/approvals/fleet:s:a/decide', approve)).status).toBe(403)
})
```

- [ ] **Step 2: 运行相关测试确认旧实现失败**

Run: `npx vitest run custom/server/userenv custom/server/autonomyladder custom/server/permmodes custom/server/approval-inbox`
Expected: 新增 403/无副作用用例 FAIL。

- [ ] **Step 3: 实现路由政策清单并在副作用前接入授权中间件**

```ts
export interface PlatformRoutePolicy {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  pathPattern: string
  access: 'public' | 'authenticated' | 'profile' | 'super-admin'
  profileParam?: string
}

export function assertPlatformRoutePolicies(routers: Router[], policies: PlatformRoutePolicy[]): void {
  const writes = routers.flatMap((router) => router.stack)
    .filter((layer) => layer.methods.some((method) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)))
  const missing = writes.filter((layer) => !policies.some((policy) => matchesPolicy(policy, layer)))
  if (missing.length > 0) throw new Error(`Unregistered write routes: ${missing.map((layer) => layer.path).join(', ')}`)
}
```

`registries/server/platform-route-policy.ts` 从实际 Router stack 生成候选清单，再由人工为每个写路由填写 access 和 profileParam；禁止用 `/**` 或全量 `authenticated` 通配掩盖未审查写面。启动时缺登记直接失败，请求时未匹配写策略返回 403 `PLATFORM_POLICY_UNREGISTERED`。公开 Matrix/password 登录和既有公开健康检查必须显式列明。

```ts
router.put('/profiles/:name/env', requireProfileParameterAccess('name'), async (ctx) => {
  // 通过授权后才允许 profileExists/readProfileEnv/writeProfileEnv
})
autonomyLadderRoutes.put('/:target', requirePlatformSuperAdmin, upsertHandler)
autonomyLadderRoutes.delete('/:target', requirePlatformSuperAdmin, removeHandler)
sessionModeRoutes.put('/:profileId', requirePlatformSuperAdmin, setHandler)
sessionModeRoutes.del('/:profileId', requirePlatformSuperAdmin, clearHandler)
approvalsRoutes.use(requirePlatformSuperAdmin)
```

既有测试通过 `app.use((ctx, next) => { ctx.state.user = superAdmin; return next() })` 注入合法主体；另保留普通 admin、无身份和空授权负例。

- [ ] **Step 4: 运行目标测试与类型检查**

Run: `npx vitest run custom/server/userenv custom/server/autonomyladder custom/server/permmodes custom/server/approval-inbox custom/server/platform`
Run: `npm run typecheck:harness`
Expected: 全部 PASS，拒绝路径无文件、审批或引擎副作用。

- [ ] **Step 5: 提交**

```bash
git add custom/server/platform custom/server/userenv custom/server/autonomyladder custom/server/permmodes custom/server/approval-inbox registries/server/platform-route-policy.ts patches/752-platform-route-authz.patch patches/series package.json
git commit -m "fix(platform): 统一 profile 与管理授权边界"
```

### Task 4: 将自动审批从读请求迁入显式命令

**Files:**
- Modify: `custom/server/approval-inbox/pending-controller.ts`
- Modify: `custom/client/shared/api/approvals.ts`
- Test: `custom/server/approval-inbox/__tests__/autopass.test.ts`
- Test: `custom/server/approval-inbox/__tests__/pending-controller.test.ts`

**Interfaces:**
- Produces: `POST /api/approvals/autopass/scan`，返回 `{ ok: true, acted: number }`。
- Consumes: 既有 `collectPendingItems/runAutoPassScan/autopassEnabled`。

- [ ] **Step 1: 写 GET 零副作用负例**

```ts
it('GET pending 与 summary 不产生 auto_pass 或响应文件', async () => {
  await fetchJson(base, '/api/approvals/pending')
  await fetchJson(base, '/api/approvals/pending-summary')
  expect(existsSync(responseFile)).toBe(false)
  expect(readApprovalHistory().filter((x) => x.decision === 'auto_pass')).toHaveLength(0)
})

it('只有显式 POST scan 才执行一次自动审批', async () => {
  const response = await fetchJson(base, '/api/approvals/autopass/scan', { method: 'POST' })
  expect(response.body.acted).toBe(1)
  expect(existsSync(responseFile)).toBe(true)
})
```

- [ ] **Step 2: 确认旧 GET 使测试失败**

Run: `npx vitest run custom/server/approval-inbox/__tests__/autopass.test.ts`
Expected: 新零副作用断言 FAIL。

- [ ] **Step 3: 实现显式扫描端点并调整客户端**

```ts
router.post('/autopass/scan', async (ctx) => {
  const acted = await runAutoPassScan(collectPendingItems())
  ctx.body = { ok: true, acted }
})
router.get('/pending', async (ctx) => {
  const items = collectPendingItems()
  items.sort(comparePendingItems)
  ctx.body = { ok: true, items, ts: Date.now() }
})
```

客户端刷新函数先 `await postAutopassScan()` 再 GET；POST 失败向调用方抛出，不伪装扫描成功。

- [ ] **Step 4: 运行审批与客户端契约测试**

Run: `npx vitest run custom/server/approval-inbox custom/client --grep "approval|autopass|pending"`
Expected: GET 纯读、POST 单次执行、普通 admin 无权限均 PASS。

- [ ] **Step 5: 提交**

```bash
git add custom/server/approval-inbox custom/client/shared/api/approvals.ts
git commit -m "fix(platform): 自动审批改为显式写命令"
```

### Task 5: 未知 MCP 硬拒与真实路径沙箱

**Files:**
- Create: `custom/platform/contracts/execution.ts`
- Modify: `custom/server/toolpipeline/enforce-gate.ts`
- Modify: `custom/server/toolpipeline/tool-hooks.ts`（仅传递真实 cwd/workspaceRoot）
- Test: `custom/server/toolpipeline/__tests__/enforce-gate.test.ts`
- Test: `custom/server/toolpipeline/__tests__/enforce-identity-sandbox.test.ts`

**Interfaces:**
- Produces: `isUnknownMcpTool(tool)`；扩展 `sandboxPathViolation(tool,input,roots?,context?)`，context 为 `{cwd?:string,workspaceRoot?:string}`。
- Consumes: 上游工具上下文的 `cwd/workspaceRoot`。

- [ ] **Step 1: 写未知工具、相对路径、symlink 和终端负例**

```ts
expect(mcpCategoryOf('mcp__github__merge_pull_request')).not.toBe('read')
expect(evaluateEnforcement('mcp__weird__do_something', {}, bypassEnv).rule).toBe('mcp-unknown')
expect(sandboxPathViolation('read_file', { path: '../outside.txt' }, [root], { cwd: root })).not.toBeNull()
expect(sandboxPathViolation('read_file', { path: symlinkOutside }, [root], { cwd: root })).not.toBeNull()
expect(evaluateEnforcement('terminal_exec', { command: 'cat /etc/passwd', cwd: root }, sandboxEnv).rule).toBe('sandbox-terminal-unavailable')
```

- [ ] **Step 2: 确认旧实现失败**

Run: `npx vitest run custom/server/toolpipeline/__tests__/enforce-gate.test.ts custom/server/toolpipeline/__tests__/enforce-identity-sandbox.test.ts`
Expected: 新增断言 FAIL。

- [ ] **Step 3: 实现分类与 canonical path 检查**

```ts
if (MCP_READ_CONNECTORS.has(parsed.server)) {
  const verb = MCP_TOOL_VERBS.find((candidate) => candidate.re.test(parsed.tool))
  return verb?.cat ?? null
}

export function isUnknownMcpTool(tool: string): boolean {
  return tool.startsWith('mcp__') && mcpCategoryOf(tool) === null
}
```

沙箱实现使用 `realpathSync.native`；不存在目标向父级回溯，最近存在祖先 canonicalize 后拼回剩余段；使用 `path.relative` 判断包含。`evaluateEnforcement` 在身份和审批桥之前处理 `mcp-unknown` 与 `sandbox-terminal-unavailable`，两者均不可经普通审批放行。

- [ ] **Step 4: 运行工具链测试与类型检查**

Run: `npx vitest run custom/server/toolpipeline`
Run: `npm run typecheck:harness`
Expected: 全部 PASS；已知 read/write/exec 工具保持原分类。

- [ ] **Step 5: 提交**

```bash
git add custom/platform/contracts/execution.ts custom/server/toolpipeline
git commit -m "fix(platform): 未知工具硬拒与真实路径沙箱"
```

### Task 6: 六闸 unknown 与证据不完整时不产 M1

**Files:**
- Create: `custom/platform/contracts/evidence.ts`
- Create: `custom/server/platform/evidence/gate-evidence.ts`
- Create: `custom/server/platform/evidence/__tests__/gate-evidence.test.ts`
- Modify: `custom/server/governance/run-metrics.ts`
- Modify: `custom/server/governance/__tests__/run-metrics.test.ts`
- Modify: `simharness/mux/mx-scenario-lib.sh`
- Modify: `simharness/tests/harness-gate-integrity.test.ts`

**Interfaces:**
- Produces: `GatePassState` 增加 `unknown`；`RunMetrics.unknownGateCount:number`；`gateEvidenceFromState()` 把完成键、打回和补证输入转成统一 `EvidenceRecord`，run-metrics 只消费该记录的状态。
- Consumes: 既有 `GATE_STATE_KEYS`、issuesLog、stateEnv。

- [ ] **Step 1: 写空状态和缺键负例**

```ts
const empty = computeRunMetrics({ run: 'empty', rfd: 'RFD-X', issuesLog: '', stateEnv: '' })
expect(empty.gateStats.every((gate) => gate.state === 'unknown')).toBe(true)
expect(empty.firstPass).toBe(0)
expect(empty.metricsRows.some((row) => row.id === 'M1')).toBe(false)

const partial = computeRunMetrics({ ...completeInput, stateEnv: withoutKey('g2_arch_pass') })
expect(partial.unknownGateCount).toBe(1)
expect(partial.metricsRows.some((row) => row.id === 'M1')).toBe(false)
```

- [ ] **Step 2: 确认旧实现把空状态算成 6/6**

Run: `npx vitest run custom/server/governance/__tests__/run-metrics.test.ts custom/server/platform/evidence/__tests__/gate-evidence.test.ts`
Expected: 新增 unknown 断言 FAIL。

- [ ] **Step 3: 实现四态与分母完整性**

```ts
const evidence = gateEvidenceFromState({ gate, completionValue: state[GATE_STATE_KEYS[gate]], failed, supplement })
const state = evidence.status === 'fail' ? '打回'
  : evidence.status === 'unknown' ? 'unknown'
    : evidence.status === 'pass' && evidence.supplement ? '补过' : '首过'
const unknownGateCount = gateStats.filter((gate) => gate.state === 'unknown').length
const firstPass = gateStats.filter((gate) => gate.state === '首过').length
```

只有 `unknownGateCount===0` 才追加 M1。Shell 渲染读取 `trend.at(-1).firstPass`，unknown 显示 `⬜`，不得自行拼 `0/6`。

- [ ] **Step 4: 运行根与 simharness 目标测试**

Run: `npx vitest run custom/server/governance/__tests__/run-metrics.test.ts custom/server/platform/evidence/__tests__/gate-evidence.test.ts`
Run: `npx vitest run --root simharness tests/harness-gate-integrity.test.ts`
Expected: 全部 PASS；完整旧样本数值不变。

- [ ] **Step 5: 提交**

```bash
git add custom/platform/contracts/evidence.ts custom/server/governance custom/server/platform/evidence simharness/mux/mx-scenario-lib.sh simharness/tests/harness-gate-integrity.test.ts
git commit -m "fix(platform): 六闸缺证据进入 unknown"
```

### Task 7: 类型工具 INCONCLUSIVE 退出 2

**Files:**
- Modify: `scripts/typecheck-client-baseline.mjs`
- Create: `scripts/__tests__/typecheck-client-baseline.test.ts`

**Interfaces:**
- Consumes: 子进程 `error/status/signal/stdout/stderr`。
- Produces: 0=判定完成且未超基线；1=错误数超基线；2=无法形成判定。

- [ ] **Step 1: 用假 npx 写工具故障负例**

```ts
it('工具崩溃退出 2 且 baseline 不变', () => {
  const fakeBin = makeFakeNpx('#!/bin/sh\necho "spawn exploded" >&2\nexit 127\n')
  const before = readFileSync(baseline, 'utf8')
  const result = runTypecheck({ PATH: fakeBin })
  expect(result.status).toBe(2)
  expect(result.stderr).toContain('INCONCLUSIVE')
  expect(readFileSync(baseline, 'utf8')).toBe(before)
})
```

- [ ] **Step 2: 确认当前脚本错误地退出 0**

Run: `npx vitest run scripts/__tests__/typecheck-client-baseline.test.ts`
Expected: `expected 0 to be 2`。

- [ ] **Step 3: 实现退出码和异常优先级**

```js
if (inconclusive) {
  console.warn('[typecheck:client] INCONCLUSIVE：无法形成类型判定，不写基线')
  process.exit(2)
}
```

`catch` 中若 `e.error`、`e.signal`、`e.code==='ETIMEDOUT'` 或 `maxBuffer` 溢出，优先返回 inconclusive，即使输出中夹带 TS 错误行。

- [ ] **Step 4: 运行故障注入与真实类型门**

Run: `npx vitest run scripts/__tests__/typecheck-client-baseline.test.ts`
Run: `npm run typecheck:client:ratchet`
Expected: 故障注入 PASS；真实门若仍有存量 29>18 则保持红，进入 Task 8 清偿，不得抬高基线。

- [ ] **Step 5: 提交**

```bash
git add scripts/typecheck-client-baseline.mjs scripts/__tests__/typecheck-client-baseline.test.ts
git commit -m "fix(platform): 类型工具无法判定时退出 2"
```

### Task 8: P0 集成、存量红清偿与阶段验收

**Files:**
- Modify: `custom/client/governance/components/ProactivitySection.vue` 及实际类型错误源文件
- Modify: `docs/superpowers/specs/2026-11-05-platform-rewrite-design.md`（仅更新 P0 实测记录，不提前宣称 P1/P2 完成）
- Test: 本计划全部测试

**Interfaces:**
- Consumes: Task 1-7 的全部接口。
- Produces: 可复跑的 P0 验收记录与当前错误清单。

- [ ] **Step 1: 运行 P0 全目标测试并记录真实失败**

Run: `npx vitest run custom/server/platform custom/server/userenv custom/server/autonomyladder custom/server/permmodes custom/server/approval-inbox custom/server/toolpipeline custom/server/governance custom/client/loop custom/client/shared scripts/__tests__/typecheck-client-baseline.test.ts`
Expected: 所有新增负例 PASS；任何失败逐项修复，不修改判据迎合实现。

- [ ] **Step 2: 清偿当前客户端类型红**

读取 `npm run typecheck:client:ratchet` 的实际错误。`ProactivitySection.vue` 的偏好表单应以嵌套 `quietHours` 为唯一数据源：

```ts
const attForm = reactive<AttentionPrefsDto & { quietHoursEnabled: boolean }>({
  quietHoursEnabled: false,
  quietHours: null,
  dailyBudget: 8,
  hourlyBudget: 3,
  cooldownMinutes: 30,
  rejectionBackoffHours: 12,
  minScore: 0.2,
})
```

保存时只读取 `attForm.quietHours?.startHour/endHour`，加载时由 `quietHours` 派生 `quietHoursEnabled`，不得新增根级 startHour/endHour 双源。其余错误按实际输出逐个修复，基线只能下降。

- [ ] **Step 3: 运行 P0 与全量验证**

Run: `npm run typecheck:harness && npm run typecheck:client:ratchet`
Run: `npm test`
Run: `npx vitest run --root simharness tests/harness-gate-integrity.test.ts`
Expected: 全部退出 0；skipped 逐项记录，不能把 skip 写成已验证。

- [ ] **Step 4: 做 P0 独立审查与变异探针**

分别移除 origin 检查、profile ACL、未知 MCP 硬拒、realpath 检查和 unknown 分支，确认对应测试立即失败；随后恢复实现并重跑。审查记录写入 spec 的验证段，列明命令和实测计数。

- [ ] **Step 5: 提交 P0 阶段结果**

```bash
git add custom docs/superpowers/specs/2026-11-05-platform-rewrite-design.md scripts simharness package.json patches
git commit -m "test(platform): P0 身份执行与证据核心验收"
```

P0 到此只在重写分支完成。不得单独合并 main，不得执行真实平台切换；下一阶段以本阶段实际接口编写 P1 计划。
