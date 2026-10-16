// P1 工具执行瀑布守门：注入树三处上游编辑在档（ekko types/registry/runtime+types
// + server manager 注入）+ overlay 钩子观测面（只观测不拦截，脱敏纪律）。
// patch 565/566 被误删或漂移时当场红。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const overlayRoot = resolve(import.meta.dirname, '..', '..', '..', '..')
const up = (rel: string) => resolve(overlayRoot, '..', 'upstream', 'hermes-studio', rel)

describe('P1 工具执行瀑布（注入态守门）', () => {
  it('ekko types.ts：ToolExecuteHook 接口在档（pre 拒绝形态+post 改写形态）', () => {
    const txt = readFileSync(up('packages/ekko-agent/src/tools/types.ts'), 'utf8')
    expect(txt).toContain('export interface ToolExecuteHook')
    expect(txt).toContain('preExecute?')
    expect(txt).toContain('postExecute?')
  })

  it('ekko registry.ts：setExecuteHooks + pre 拒绝 + post 改写三段瀑布', () => {
    const txt = readFileSync(up('packages/ekko-agent/src/tools/registry.ts'), 'utf8')
    expect(txt).toContain('setExecuteHooks(hooks: ToolExecuteHook[])')
    // pre 在 authorizer 之后
    const authIdx = txt.indexOf('authorization && !authorization.approved')
    const preIdx = txt.indexOf("hook.preExecute?.(name, input, context)")
    const execIdx = txt.indexOf('let result = await tool.execute(input, context)')
    const postIdx = txt.indexOf('hook.postExecute?.(name, input, result, context)')
    expect(authIdx).toBeGreaterThan(-1)
    expect(preIdx).toBeGreaterThan(authIdx, 'pre 钩子必须在权限门之后')
    expect(execIdx).toBeGreaterThan(preIdx)
    expect(postIdx).toBeGreaterThan(execIdx)
  })

  it('runtime/types.ts 选项 + runtime.ts 双路径挂载（自建与外部 registry）', () => {
    const types = readFileSync(up('packages/ekko-agent/src/runtime/types.ts'), 'utf8')
    expect(types).toContain('toolExecuteHooks?: ToolExecuteHook[]')
    const rt = readFileSync(up('packages/ekko-agent/src/runtime/runtime.ts'), 'utf8')
    expect(rt).toContain('this.tools.setExecuteHooks(options.toolExecuteHooks ?? [])')
  })

  it('server manager：两处 createRuntime 注入 overlay 钩子', () => {
    const txt = readFileSync(up('packages/server/src/modules/ekko/services/manager.ts'), 'utf8')
    expect(txt).toContain("from '../../../custom/toolpipeline/tool-hooks'")
    // runIsolated 路径（可被调用方覆盖）与常驻 runtime 路径（固定注入）
    expect(txt.match(/toolExecuteHooks: options\.toolExecuteHooks \?\? ekkoToolExecuteHooks/g)).toHaveLength(1)
    expect(txt.match(/toolExecuteHooks: ekkoToolExecuteHooks/g)?.length).toBeGreaterThanOrEqual(1)
  })
})

describe('P1 overlay 观测钩子', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tool-audit-'))
    process.env.TOOL_EXEC_AUDIT_DIR = dir
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.TOOL_EXEC_AUDIT_DIR
  })

  it('pre 记键名不落值；post 记 ok/error 摘要；fail-open（审计失败不抛）', async () => {
    const { ekkoToolExecuteHooks, readToolExecAudit } = await import('../tool-hooks')
    const hook = ekkoToolExecuteHooks[0]!
    await hook.preExecute!('terminal_exec', { command: 'rm -rf /secret', cwd: '/x' })
    await hook.postExecute!('terminal_exec', { command: 'x' }, { ok: false, error: 'boom' })
    const entries = readToolExecAudit()
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ phase: 'pre', tool: 'terminal_exec', inputKeys: ['command', 'cwd'] })
    // 脱敏纪律：不落入参值
    expect(JSON.stringify(entries)).not.toContain('/secret')
    expect(JSON.stringify(entries)).not.toContain('rm -rf')
    expect(entries[1]).toMatchObject({ phase: 'post', ok: false, error: 'boom' })
    // fail-open：post 传非字符串 error 不炸
    await hook.postExecute!('t', {}, { ok: true } as { ok?: boolean; error?: string })
    expect(readToolExecAudit()).toHaveLength(3)
  })

  it('v1 只观测不拦截：pre 不返回拒绝', async () => {
    const { ekkoToolExecuteHooks } = await import('../tool-hooks')
    const verdict = await ekkoToolExecuteHooks[0]!.preExecute!('x', {})
    expect(verdict).toBeUndefined()
  })
})

// 2026-10-16 安全轮 M6：审计账补身份字段 + 按天轮转 + 失败计数。
// 零阻断约束：只加观测面，不动裁决路径（上组既有断言全须保持绿）。
// 类型说明：ekkoToolExecuteHooks 是异质钩子数组，元素为联合类型，TS 在联合上
// 取 .preExecute 会报错（本文件既有 5 处同源错，仓库 tsc 非门禁）。本组新增
// 用例统一经 auditHookOf() 收窄，不新增同类错实例。
interface AuditHookShape {
  preExecute: (name: string, input: Record<string, unknown>, context?: Record<string, string | undefined>) => Promise<unknown>
  postExecute: (name: string, input: Record<string, unknown>, result: { ok?: boolean; error?: string }, context?: Record<string, string | undefined>) => Promise<unknown>
}

function auditHookOf(hooks: unknown[]): AuditHookShape {
  return hooks[0] as AuditHookShape
}

describe('M6 审计账身份字段与轮转', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tool-audit-m6-'))
    process.env.TOOL_EXEC_AUDIT_DIR = dir
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.TOOL_EXEC_AUDIT_DIR
  })

  it('pre/post 落身份字段（context 透传的 sessionId/userId/profileId/runId）', async () => {
    const { ekkoToolExecuteHooks, readToolExecAudit } = await import('../tool-hooks')
    const hook = auditHookOf(ekkoToolExecuteHooks)
    const ctx = { sessionId: 's-1', userId: 'u-1', profileId: 'aiteam-scout', runId: 'r-1' }
    await hook.preExecute('read_file', { path: '/x' }, ctx)
    await hook.postExecute('read_file', { path: '/x' }, { ok: true }, ctx)
    const entries = readToolExecAudit()
    expect(entries).toHaveLength(2)
    for (const e of entries) {
      expect(e).toMatchObject({ sessionId: 's-1', userId: 'u-1', profileId: 'aiteam-scout', runId: 'r-1' })
    }
  })

  it('context 缺省时身份字段为 undefined（无头/CLI 运行合法匿名行，不阻断）', async () => {
    const { ekkoToolExecuteHooks, readToolExecAudit } = await import('../tool-hooks')
    const hook = auditHookOf(ekkoToolExecuteHooks)
    await hook.preExecute!('read_file', { path: '/x' })
    const [e] = readToolExecAudit()
    expect(e?.sessionId).toBeUndefined()
    expect(e?.profileId).toBeUndefined()
    expect(e?.tool).toBe('read_file')
  })

  it('账本按天分文件（tool-exec-YYYY-MM-DD.jsonl），readToolExecAudit 跨文件回读', async () => {
    const { ekkoToolExecuteHooks, readToolExecAudit } = await import('../tool-hooks')
    const hook = auditHookOf(ekkoToolExecuteHooks)
    await hook.preExecute('t1', {})
    const day = new Date()
    const stamp = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    expect(existsSync(join(dir, `tool-exec-${stamp}.jsonl`))).toBe(true)
    // 旧格式单文件不再生成
    expect(existsSync(join(dir, 'tool-exec.jsonl'))).toBe(false)
    // 手工造一个更早日期的文件，回读应合并两个文件
    const { writeFileSync } = await import('fs')
    writeFileSync(join(dir, 'tool-exec-2020-01-01.jsonl'), `${JSON.stringify({ ts: 1, phase: 'pre', tool: 'old' })}\n`)
    const tools = readToolExecAudit().map((e) => e.tool)
    expect(tools).toContain('old')
    expect(tools).toContain('t1')
  })

  it('过期文件被清理（RETAIN_DAYS=14，跨天 lazy 触发）', async () => {
    const { _rotateAndPruneForTests } = await import('../tool-hooks')
    const { writeFileSync } = await import('fs')
    writeFileSync(join(dir, 'tool-exec-2020-01-01.jsonl'), '{}\n')
    writeFileSync(join(dir, 'tool-exec-2099-01-01.jsonl'), '{}\n')
    _rotateAndPruneForTests(new Date('2026-10-16T12:00:00'))
    expect(existsSync(join(dir, 'tool-exec-2020-01-01.jsonl'))).toBe(false)
    expect(existsSync(join(dir, 'tool-exec-2099-01-01.jsonl'))).toBe(true)
  })

  it('单文件超行数上限转 .1 后缀（不整文件重写）', async () => {
    const { _rolloverIfFullForTests } = await import('../tool-hooks')
    const { writeFileSync } = await import('fs')
    const file = join(dir, 'tool-exec-2026-10-16.jsonl')
    // 6000 行×~110B ≈ 660KB，越过 DAY_CAP*120 的粗估线且行数 > DAY_CAP
    const line = `${JSON.stringify({ ts: 1, phase: 'pre', tool: 't', inputKeys: ['command', 'cwd', 'path', 'x'], pad: 'x'.repeat(60) })}\n`
    writeFileSync(file, line.repeat(6000))
    _rolloverIfFullForTests(file)
    expect(existsSync(`${file}.1`)).toBe(true)
    expect(existsSync(file)).toBe(false)
  })

  it('落盘失败 fail-open：不抛、计数可见', async () => {
    // 把审计目录指到一个已存在文件上，mkdirSync 必失败
    const { writeFileSync } = await import('fs')
    const blocker = join(dir, 'blocker')
    writeFileSync(blocker, 'x')
    process.env.TOOL_EXEC_AUDIT_DIR = blocker
    const { ekkoToolExecuteHooks, toolExecAuditWriteFailures } = await import('../tool-hooks')
    const before = toolExecAuditWriteFailures()
    await expect(auditHookOf(ekkoToolExecuteHooks).preExecute('t', {})).resolves.toBeUndefined()
    expect(toolExecAuditWriteFailures()).toBeGreaterThan(before)
  })
})
