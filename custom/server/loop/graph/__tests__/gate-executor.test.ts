import {
  existsSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SandboxRunOptions, SandboxRunResult, SandboxSupport } from '../../../sandbox/exec-sandbox.ts'
import {
  _resetLeaseFileForTests, _useLeaseFileForTests, listLeases, sweepExpiredLeases,
} from '../../../sandbox/sandbox-lease'
import { GraphBuilder, fnNode } from '../graph-definition'
import { GraphRuntime } from '../graph-runtime'
import { InMemoryEventLogStore } from '../event-log-store'
import { reducers, type GraphDef, type GraphEvent, type NodeContext, type NodeDef } from '../types'
import {
  executeGraphGate, graphGateNodeTimeoutMs,
  type GateCommandEntry, type GateExecutorDeps,
} from '../gate-executor'

const runSandboxedMock = vi.fn<(opts: SandboxRunOptions) => Promise<SandboxRunResult>>()
const support: SandboxSupport = {
  backend: 'darwin-sandbox-exec', available: true, detail: 'test double',
}

let scratch: string
let root: string
let project: string
let writable: string
let entry: GateCommandEntry
let deps: GateExecutorDeps
let oldRoot: string | undefined
let oldSecret: string | undefined

function ok(overrides: Partial<SandboxRunResult> = {}): SandboxRunResult {
  return {
    status: 'ok', exitCode: 0, stdout: 'ok', stderr: '',
    stdoutTruncated: false, stderrTruncated: false,
    ...overrides,
  }
}

function context(overrides: Partial<NodeContext> = {}): NodeContext {
  return {
    graphId: 'graph', threadId: 'run-1', nodeId: 'g', superStep: 0,
    deps: { emitEvent: () => {} },
    ...overrides,
  }
}

beforeEach(() => {
  oldRoot = process.env.HERMES_SANDBOX_WORKSPACES_ROOT
  oldSecret = process.env.GATE_TEST_SECRET
  scratch = mkdtempSync(join(tmpdir(), 'graph-gate-'))
  root = join(scratch, 'root')
  project = join(root, 'project')
  writable = join(root, 'writable')
  mkdirSync(project, { recursive: true })
  mkdirSync(writable, { recursive: true })
  process.env.HERMES_SANDBOX_WORKSPACES_ROOT = root
  process.env.GATE_TEST_SECRET = 'gate-secret-value'
  _useLeaseFileForTests(join(scratch, 'leases.json'))
  entry = {
    command: 'test', argv: ['/bin/echo', 'ok'], cwd: project, timeoutMs: 1_000,
    envAllowlist: ['GATE_TEST_SECRET'], writableRoots: [writable],
  }
  runSandboxedMock.mockReset()
  runSandboxedMock.mockResolvedValue(ok())
  deps = {
    catalog: [entry],
    runSandboxed: runSandboxedMock,
    detectSandboxSupport: () => support,
  }
})

afterEach(() => {
  if (oldRoot === undefined) delete process.env.HERMES_SANDBOX_WORKSPACES_ROOT
  else process.env.HERMES_SANDBOX_WORKSPACES_ROOT = oldRoot
  if (oldSecret === undefined) delete process.env.GATE_TEST_SECRET
  else process.env.GATE_TEST_SECRET = oldSecret
  _resetLeaseFileForTests()
  rmSync(scratch, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('executeGraphGate 目录与结果矩阵', () => {
  it('只有 ok + exitCode 0 通过，并返回白名单证据与真实 lease', async () => {
    const result = await executeGraphGate({ id: 'g', command: 'test' }, context(), deps)
    expect(result.update).toEqual({ 'g.gatePassed': true })
    expect(result.evidence).toMatchObject({
      command: 'test', argv: ['/bin/echo', 'ok'], cwd: realpathSync(project),
      backend: 'darwin-sandbox-exec', status: 'ok', exitCode: 0,
      stdout: 'ok', stderr: '', stdoutTruncated: false, stderrTruncated: false,
    })
    expect(Object.keys(result.evidence ?? {}).sort()).toEqual([
      'argv', 'backend', 'command', 'cwd', 'durationMs', 'exitCode', 'finishedAt',
      'leaseId', 'startedAt', 'status', 'stderr', 'stderrTruncated', 'stdout', 'stdoutTruncated',
    ])
    expect(result.evidence?.leaseId).toEqual(expect.stringMatching(/^lease-/))
    expect(result.evidence?.durationMs).toEqual(expect.any(Number))
    expect(Number.isFinite(Date.parse(String(result.evidence?.startedAt)))).toBe(true)
    expect(Number.isFinite(Date.parse(String(result.evidence?.finishedAt)))).toBe(true)
    expect(listLeases()).toHaveLength(1)

    // 唯一被替换的是 OS 进程边界；传入其中的必须仍是服务端目录原值。
    expect(runSandboxedMock).toHaveBeenCalledWith({
      argv: ['/bin/echo', 'ok'], cwd: realpathSync(project), timeoutMs: 1_000,
      envAllowlist: ['GATE_TEST_SECRET'], writableRoots: [realpathSync(writable)],
    })
  })

  it.each([
    ['真实非零退出', ok({ exitCode: 1, stderr: 'failed' }), 'ok', 1],
    ['null exitCode 不是成功', ok({ exitCode: null }), 'ok', null],
    ['沙箱 timeout', ok({ status: 'timeout', exitCode: null }), 'timeout', null],
    ['沙箱 error', ok({ status: 'error', exitCode: null }), 'error', null],
    ['沙箱 unavailable', ok({ status: 'unavailable', exitCode: null }), 'unavailable', null],
  ])('%s 均 fail closed', async (_name, sandboxResult, status, exitCode) => {
    runSandboxedMock.mockResolvedValue(sandboxResult)
    await expect(executeGraphGate({ id: 'g', command: 'test' }, context(), deps))
      .rejects.toMatchObject({ code: 'gate_failed', evidence: { status, exitCode } })
  })

  it('执行器抛错也转为有界 error 证据，不泄露异常详情', async () => {
    runSandboxedMock.mockRejectedValue(new Error('spawn failed with gate-secret-value'))
    await expect(executeGraphGate({ id: 'g', command: 'test' }, context(), deps))
      .rejects.toMatchObject({ code: 'gate_failed', evidence: { status: 'error', exitCode: null } })
    const error = await executeGraphGate({ id: 'g', command: 'test' }, context(), deps).catch(e => e)
    expect(error.message).not.toContain('gate-secret-value')
  })

  it('缺 command 不 spawn', async () => {
    await expect(executeGraphGate({ id: 'g' }, context(), deps))
      .rejects.toMatchObject({ code: 'gate_command_missing' })
    expect(runSandboxedMock).not.toHaveBeenCalled()
  })

  it('非目录命令不 spawn；config/meta 不能扩大服务端目录', async () => {
    const config = {
      id: 'g', command: 'editor-only', argv: ['/bin/echo', 'pwned'], cwd: scratch,
      envAllowlist: ['HOME'], writableRoots: [scratch],
      meta: { gateCommands: [{ command: 'editor-only', argv: ['/bin/echo', 'pwned'] }] },
    }
    await expect(executeGraphGate(config as never, context(), deps))
      .rejects.toMatchObject({ code: 'gate_command_not_cataloged' })
    expect(runSandboxedMock).not.toHaveBeenCalled()
  })

  it.each(['argv', 'cwd', 'env', 'envAllowlist', 'writableRoots', 'catalog', 'commandCatalog'])(
    '编辑器提供 %s 执行覆盖字段时直接拒绝', async (key) => {
      const config = { id: 'g', command: 'test', [key]: key === 'argv' ? ['/bin/echo'] : [] }
      await expect(executeGraphGate(config as never, context(), deps))
        .rejects.toMatchObject({ code: 'gate_config_forbidden' })
      expect(runSandboxedMock).not.toHaveBeenCalled()
    },
  )

  it.each(['test;id', 'test && id', 'test|id', 'test"id', "test'id", 'test`id`', 'test$(id)', 'test>out', 'test\nid'])(
    '目录键含引号或 shell 控制符 %j 时不 spawn', async (command) => {
      await expect(executeGraphGate({ id: 'g', command }, context(), deps))
        .rejects.toMatchObject({ code: 'gate_command_invalid' })
      expect(runSandboxedMock).not.toHaveBeenCalled()
    },
  )

  it.each([';', '&&', '|', '"', "'", '`', '$(', '>', '<', '\n'])(
    '服务端目录 argv 含 shell 控制符 %j 同样拒绝', async (control) => {
      deps.catalog = [{ ...entry, argv: ['/bin/echo', `ok${control}id`] }]
      await expect(executeGraphGate({ id: 'g', command: 'test' }, context(), deps))
        .rejects.toMatchObject({ code: 'gate_command_invalid' })
      expect(runSandboxedMock).not.toHaveBeenCalled()
    },
  )
})

describe('executeGraphGate 路径边界', () => {
  it('缺沙箱根时 fail closed', async () => {
    delete process.env.HERMES_SANDBOX_WORKSPACES_ROOT
    await expect(executeGraphGate({ id: 'g', command: 'test' }, context(), deps))
      .rejects.toMatchObject({ code: 'gate_root_missing' })
    expect(runSandboxedMock).not.toHaveBeenCalled()
  })

  it('根本身是 symlink 时拒绝', async () => {
    const realRoot = join(scratch, 'real-root')
    const linkedRoot = join(scratch, 'linked-root')
    mkdirSync(realRoot)
    symlinkSync(realRoot, linkedRoot)
    process.env.HERMES_SANDBOX_WORKSPACES_ROOT = linkedRoot
    await expect(executeGraphGate({ id: 'g', command: 'test' }, context(), deps))
      .rejects.toMatchObject({ code: 'gate_path_invalid' })
    expect(runSandboxedMock).not.toHaveBeenCalled()
  })

  it('cwd 在根外时拒绝', async () => {
    const outside = join(scratch, 'outside')
    mkdirSync(outside)
    deps.catalog = [{ ...entry, cwd: outside }]
    await expect(executeGraphGate({ id: 'g', command: 'test' }, context(), deps))
      .rejects.toMatchObject({ code: 'gate_path_invalid' })
    expect(runSandboxedMock).not.toHaveBeenCalled()
  })

  it('cwd 不是目录时拒绝', async () => {
    const file = join(root, 'not-a-directory')
    writeFileSync(file, 'x')
    deps.catalog = [{ ...entry, cwd: file }]
    await expect(executeGraphGate({ id: 'g', command: 'test' }, context(), deps))
      .rejects.toMatchObject({ code: 'gate_path_invalid' })
    expect(runSandboxedMock).not.toHaveBeenCalled()
  })

  it('cwd 最终组件是 symlink 时即使指向根内也拒绝', async () => {
    const linked = join(root, 'linked-project')
    symlinkSync(project, linked)
    deps.catalog = [{ ...entry, cwd: linked }]
    await expect(executeGraphGate({ id: 'g', command: 'test' }, context(), deps))
      .rejects.toMatchObject({ code: 'gate_path_invalid' })
    expect(runSandboxedMock).not.toHaveBeenCalled()
  })

  it('cwd 中间组件 symlink 不得借 canonicalize 逃逸', async () => {
    const outside = join(scratch, 'outside-with-child')
    mkdirSync(join(outside, 'child'), { recursive: true })
    const linked = join(root, 'linked-parent')
    symlinkSync(outside, linked)
    deps.catalog = [{ ...entry, cwd: join(linked, 'child') }]
    await expect(executeGraphGate({ id: 'g', command: 'test' }, context(), deps))
      .rejects.toMatchObject({ code: 'gate_path_invalid' })
    expect(runSandboxedMock).not.toHaveBeenCalled()
  })

  it('writableRoots 在根外或是 symlink 时均拒绝', async () => {
    const outside = join(scratch, 'outside-writable')
    mkdirSync(outside)
    deps.catalog = [{ ...entry, writableRoots: [outside] }]
    await expect(executeGraphGate({ id: 'g', command: 'test' }, context(), deps))
      .rejects.toMatchObject({ code: 'gate_path_invalid' })

    const linked = join(root, 'linked-writable')
    symlinkSync(writable, linked)
    deps.catalog = [{ ...entry, writableRoots: [linked] }]
    await expect(executeGraphGate({ id: 'g', command: 'test' }, context(), deps))
      .rejects.toMatchObject({ code: 'gate_path_invalid' })
    expect(runSandboxedMock).not.toHaveBeenCalled()
  })
})

describe('gate 证据、GraphRuntime 终止与禁止绕行', () => {
  function graph(overrides: Partial<NodeDef> = {}, log?: InMemoryEventLogStore, command = 'test') {
    const events: GraphEvent[] = []
    let nextRuns = 0
    const gate: NodeDef = {
      id: 'g', type: 'function', label: 'g', timeout: graphGateNodeTimeoutMs(entry),
      execute: async (_state, ctx) => executeGraphGate({ id: 'g', command }, ctx, deps),
      ...overrides,
    }
    const def: GraphDef = new GraphBuilder('graph', 'Graph')
      .addChannel('nextRuns', { reducer: reducers.overwrite(), default: 0 })
      .addNode(gate)
      .addNode(fnNode('next', async () => {
        nextRuns += 1
        return { update: { nextRuns: 1 } }
      }))
      .setEntry('g')
      .addEdge('g', 'next')
      .build()
    const runtime = new GraphRuntime(
      { emitEvent: event => events.push(event) },
      log ? { eventLog: log, runId: 'run-1' } : undefined,
    )
    return { def, events, runtime, nextRuns: () => nextRuns }
  }

  it('stdout/stderr 经脱敏后保留有界尾部并带 truncated，事件不含 env 值或 token', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c'
    runSandboxedMock.mockResolvedValue(ok({
      stdout: `${'x'.repeat(5_000)} token=gate-secret-value`,
      stderr: `Authorization: Bearer ${jwt}`,
      stdoutTruncated: true,
    }))
    const log = new InMemoryEventLogStore()
    const { def, events, runtime } = graph({}, log)
    const instance = await runtime.start(def, 'run-1')
    expect(instance.status).toBe('completed')

    const complete = events.find(e => e.type === 'graph.node-complete')
    expect(complete).toMatchObject({
      evidence: {
        status: 'ok', exitCode: 0, stdoutTruncated: true, stderrTruncated: false,
      },
    })
    const evidence = complete?.type === 'graph.node-complete' ? complete.evidence : undefined
    expect(String(evidence?.stdout).length).toBeLessThanOrEqual(4_096)
    expect(String(evidence?.stdout)).toContain('token=<redacted>')
    expect(String(evidence?.stdout).endsWith('token=<redacted>')).toBe(true)
    expect(String(evidence?.stderr)).not.toContain(jwt)
    expect(JSON.stringify(events)).not.toContain('gate-secret-value')
    expect(JSON.stringify(events)).not.toContain(jwt)
    expect(JSON.stringify(events)).not.toContain('GATE_TEST_SECRET')

    const entries = await log.query('run-1')
    const persisted = entries.find(e => e.kind === 'node.completed')
    expect(persisted?.payload.evidence).toMatchObject({ status: 'ok', exitCode: 0 })
    expect(JSON.stringify(persisted?.payload)).not.toContain('gate-secret-value')
  })

  it('秘密值位于 cwd 时实时事件与持久化日志都只保留脱敏路径', async () => {
    const secretCwd = join(root, 'gate-secret-value', 'project')
    mkdirSync(secretCwd, { recursive: true })
    deps.catalog = [{ ...entry, cwd: secretCwd }]
    const log = new InMemoryEventLogStore()
    const { def, events, runtime } = graph({}, log)
    const instance = await runtime.start(def, 'run-1')
    expect(instance.status).toBe('completed')

    const complete = events.find(e => e.type === 'graph.node-complete' && e.nodeId === 'g')
    expect(complete?.type === 'graph.node-complete' ? complete.evidence?.cwd : '').toContain('<redacted>')
    expect(JSON.stringify(events)).not.toContain('gate-secret-value')
    const persisted = (await log.query('run-1')).find(e => e.kind === 'node.completed' && e.nodeId === 'g')
    expect(JSON.stringify(persisted?.payload)).not.toContain('gate-secret-value')
    expect(persisted?.payload.evidence).toMatchObject({ cwd: expect.stringContaining('<redacted>') })
  })

  it('command/cwd/argv 在事件与日志中有固定字符和元素数上限', async () => {
    const longCommand = 'c'.repeat(400)
    const longCwd = join(root, ...Array.from({ length: 5 }, (_, i) => `${i}-${'d'.repeat(100)}`))
    mkdirSync(longCwd, { recursive: true })
    deps.catalog = [{
      ...entry,
      command: longCommand,
      cwd: longCwd,
      argv: ['/bin/echo', 'a'.repeat(900), ...Array.from({ length: 40 }, () => 'b'.repeat(200))],
    }]
    const log = new InMemoryEventLogStore()
    const { def, events, runtime } = graph({}, log, longCommand)
    const instance = await runtime.start(def, 'run-1')
    expect(instance.status).toBe('completed')

    const complete = events.find(e => e.type === 'graph.node-complete' && e.nodeId === 'g')
    const evidence = complete?.type === 'graph.node-complete' ? complete.evidence : undefined
    expect(String(evidence?.command)).toHaveLength(256)
    expect(String(evidence?.cwd).length).toBeLessThanOrEqual(512)
    expect((evidence?.argv as string[]).length).toBeLessThanOrEqual(64)
    for (const arg of evidence?.argv as string[]) expect(arg.length).toBeLessThanOrEqual(512)
    expect((evidence?.argv as string[]).join('').length).toBeLessThanOrEqual(4_096)

    const persisted = (await log.query('run-1')).find(e => e.kind === 'node.completed' && e.nodeId === 'g')
    expect(persisted?.payload.evidence).toEqual(evidence)
    expect(String((persisted?.payload.evidence as Record<string, unknown>).command)).toHaveLength(256)
    expect(String((persisted?.payload.evidence as Record<string, unknown>).cwd).length).toBeLessThanOrEqual(512)

    deps.catalog = [{ ...entry, argv: ['/bin/echo', ...Array.from({ length: 80 }, () => 'x')] }]
    const manyArgs = await executeGraphGate({ id: 'g', command: 'test' }, context(), deps)
    expect((manyArgs.evidence?.argv as string[]).length).toBeLessThanOrEqual(64)
  })

  it('真实非零退出后下一节点未执行，失败事件带 exitCode 证据', async () => {
    runSandboxedMock.mockResolvedValue(ok({ exitCode: 1, stdout: '', stderr: 'failed' }))
    const log = new InMemoryEventLogStore()
    const { def, events, runtime, nextRuns } = graph({}, log)
    const instance = await runtime.start(def, 'run-1')
    expect(instance.status).toBe('failed')
    expect(nextRuns()).toBe(0)
    expect(runSandboxedMock).toHaveBeenCalledTimes(1)
    expect(events.find(e => e.type === 'graph.node-error')).toMatchObject({
      nodeId: 'g', evidence: { status: 'ok', exitCode: 1 },
    })
    expect(events.some(e => e.type === 'graph.node-complete')).toBe(false)
    const entries = await log.query('run-1')
    expect(entries.find(e => e.kind === 'node.failed')?.payload.evidence).toMatchObject({ exitCode: 1 })
  })

  it('gate 自动 retry 在 spawn 前拒绝', async () => {
    const { def, events, runtime, nextRuns } = graph({ retry: { maxAttempts: 3, backoffMs: 0 } })
    const instance = await runtime.start(def, 'run-1')
    expect(instance.status).toBe('failed')
    expect(nextRuns()).toBe(0)
    expect(runSandboxedMock).not.toHaveBeenCalled()
    expect(events.find(e => e.type === 'graph.node-error')).toMatchObject({ error: expect.stringContaining('gate_retry_forbidden') })
  })

  it.each([
    [{ type: 'goto', target: 'next' } as const],
    [{ type: 'retry-goto', target: 'next', maxAttempts: 3 } as const],
  ])('onError:%s 在 spawn 前拒绝且不得路由成完成', async (onError) => {
    const { def, runtime, nextRuns } = graph({ onError })
    const instance = await runtime.start(def, 'run-1')
    expect(instance.status).toBe('failed')
    expect(nextRuns()).toBe(0)
    expect(runSandboxedMock).not.toHaveBeenCalled()
  })

  it('Graph 节点 timeout 晚于 sandbox timeout；超时证据可回事件且 lease 可清扫', async () => {
    entry.timeoutMs = 20
    expect(graphGateNodeTimeoutMs(entry)).toBeGreaterThan(20)
    runSandboxedMock.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 30))
      return ok({ status: 'timeout', exitCode: null, stdout: '', stderr: '' })
    })
    const { def, events, runtime, nextRuns } = graph()
    const instance = await runtime.start(def, 'run-1')
    expect(instance.status).toBe('failed')
    expect(nextRuns()).toBe(0)
    const failed = events.find(e => e.type === 'graph.node-error')
    expect(failed).toMatchObject({ evidence: { status: 'timeout', exitCode: null } })
    expect(failed?.type === 'graph.node-error' ? failed.error : '').not.toContain('Timeout after')

    const lease = listLeases()[0]
    expect(lease.expiresAt - lease.createdAt).toBeGreaterThanOrEqual(entry.timeoutMs)
    expect(lstatSync(lease.workspace).isDirectory()).toBe(true)
    const swept = sweepExpiredLeases({ now: lease.expiresAt + 1 })
    expect(swept.swept).toContain(lease.id)
    expect(existsSync(lease.workspace)).toBe(false)
  })

  it('长命令 lease TTL 必须覆盖 sandbox timeout', async () => {
    entry.timeoutMs = 120_000
    await executeGraphGate({ id: 'g', command: 'test' }, context(), deps)
    const lease = listLeases()[0]
    expect(lease.expiresAt - lease.createdAt).toBeGreaterThanOrEqual(120_000)
    expect(graphGateNodeTimeoutMs(entry)).toBeGreaterThan(120_000)
  })
})

describe('Send 子任务 gate 失败终止语义', () => {
  function sendGraph(target: NodeDef) {
    const events: GraphEvent[] = []
    let afterRuns = 0
    const def = new GraphBuilder('send-graph', 'Send Graph')
      .addChannel('afterRuns', { reducer: reducers.overwrite(), default: 0 })
      .addNode(fnNode('dispatch', async () => ({ send: [{ node: target.id, state: {} }] })))
      .addNode(target)
      .addNode(fnNode('after', async () => {
        afterRuns += 1
        return { update: { afterRuns: 1 } }
      }))
      .setEntry('dispatch')
      .addEdge('dispatch', 'after')
      .build()
    const runtime = new GraphRuntime({ emitEvent: event => events.push(event) })
    return { def, events, runtime, afterRuns: () => afterRuns }
  }

  function gateTarget(): NodeDef {
    return {
      id: 'g', type: 'function', label: 'g', timeout: graphGateNodeTimeoutMs(entry),
      execute: async (_state, ctx) => executeGraphGate({ id: 'g', command: 'test' }, ctx, deps),
    }
  }

  it.each([
    ['非零 gate', ok({ exitCode: 1, stdout: '', stderr: 'failed' }), 'ok', 1],
    ['timeout gate', ok({ status: 'timeout', exitCode: null, stdout: '', stderr: '' }), 'timeout', null],
  ])('%s 必须终止 run，后续节点不得执行', async (_name, result, status, exitCode) => {
    runSandboxedMock.mockResolvedValue(result)
    const { def, events, runtime, afterRuns } = sendGraph(gateTarget())
    const instance = await runtime.start(def, 'run-1')
    expect(instance.status).toBe('failed')
    expect(afterRuns()).toBe(0)
    expect(events.find(e => e.type === 'graph.node-error' && e.nodeId === 'g')).toMatchObject({
      evidence: { status, exitCode },
    })
    expect(events.find(e => e.type === 'graph.failed')).toMatchObject({
      finishReason: 'node-error', verification: { nodesFailed: 1 },
    })
  })

  it('普通非 gate Send 失败仍保持既有忽略语义', async () => {
    const ordinary: NodeDef = {
      id: 'ordinary', type: 'function', label: 'ordinary',
      execute: async () => { throw new Error('ordinary boom') },
    }
    const { def, events, runtime, afterRuns } = sendGraph(ordinary)
    const instance = await runtime.start(def, 'run-1')
    expect(instance.status).toBe('completed')
    expect(afterRuns()).toBe(1)
    expect(events.some(e => e.type === 'graph.node-error' && e.nodeId === 'ordinary')).toBe(true)
    expect(events.some(e => e.type === 'graph.failed')).toBe(false)
  })
})
