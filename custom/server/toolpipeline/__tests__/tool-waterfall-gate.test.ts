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
