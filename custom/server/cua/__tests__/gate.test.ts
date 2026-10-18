// patch 664 语义守卫：startZcodeChatTurn 在 spawn 前把会话 CUA 闸门合并进
// run.launch.env。不启真进程——用注入的 host/spawn 桩捕获 env 快照。
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'

const storeDir = mkdtempSync(join(tmpdir(), 'ide-cua-gate-'))
process.env.IDE_CUA_POLICY_FILE = join(storeDir, 'ide-cua.json')

const { setSessionCua } = await import('../policy')

// 上游根取法与 zcode-002 集成测试同款：优先 OVERLAY_UPSTREAM_ROOT（私有注入克隆），
// 缺省共享 upstream。chat-turn 是 patch 664 的落点——旧注入树（无 overlay[cua-gate]
// 标记）按「旧引擎」跳过，不误报。
const upstreamRoot = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  ? await import('node:path').then(m => m.resolve(process.env.OVERLAY_UPSTREAM_ROOT!.trim(), 'hermes-studio'))
  : (await import('node:path')).resolve(import.meta.dirname, '../../../../../upstream/hermes-studio')
let startZcodeChatTurn: ((d: { name: string }, run: any, input: string, sys: string, host: any, images?: any[]) => void) | null = null
let patched = false
try {
  const mod = await import(/* @vite-ignore */ `${upstreamRoot}/packages/server/src/modules/coding-agents/services/zcode/chat-turn.ts`)
  startZcodeChatTurn = mod.startZcodeChatTurn
  const { readFileSync } = await import('node:fs')
  patched = readFileSync(`${upstreamRoot}/packages/server/src/modules/coding-agents/services/zcode/chat-turn.ts`, 'utf8').includes('overlay[cua-gate]')
} catch { startZcodeChatTurn = null }

interface Captured { env: NodeJS.ProcessEnv }

function fakeRun(sessionId: string) {
  return {
    launch: {
      agentPreset: undefined, agentSessionId: 'as', agentId: 'zcode', mode: 'scoped' as const,
      profile: 'p', provider: '', model: 'm', sessionId,
      command: 'node', args: ['zcode.cjs'], shellCommand: '', workspaceDir: '/tmp',
      approvalRequired: false,
    },
    exited: false, stoppedByUser: false, nativeResumeReady: false, printText: false,
  } as never
}

function captureHost(captured: Captured) {
  const child = new EventEmitter() as never as { stdout: EventEmitter; stdin: EventEmitter & { end: () => void }; stderr?: EventEmitter }
  ;(child as never as { stdout: EventEmitter }).stdout = new EventEmitter()
  ;(child as never as { stderr?: EventEmitter }).stderr = new EventEmitter()
  const stdin = new EventEmitter() as EventEmitter & { end: () => void }
  stdin.end = () => undefined
  ;(child as never as { stdin: EventEmitter & { end: () => void } }).stdin = stdin
  return {
    spawn: (_c: string, _a: string[], options: { env: NodeJS.ProcessEnv }) => {
      captured.env = options.env
      return child
    },
    isRunning: () => false, terminate: () => undefined, forceKill: () => undefined,
    processError: (e: unknown) => String(e), exitError: () => undefined,
    stderr: () => undefined, touch: () => undefined, response: () => undefined,
    completeAfterUsage: async () => undefined, complete: () => undefined, fail: () => undefined,
  } as never
}

describe.skipIf(!startZcodeChatTurn || !patched)('patch 664：zcode spawn 前合并 CUA 闸门 env', () => {
  beforeEach(() => {
    writeFileSync(process.env.IDE_CUA_POLICY_FILE!, JSON.stringify({ version: 1, sessions: {} }))
  })

  it('未开启会话 → spawn env 带 ZCODE_CUA_DISABLE=1（fail-closed）', async () => {
    const captured: Captured = {}
    startZcodeChatTurn({ name: 'ZCode' }, fakeRun('sess-closed'), 'hi', '', captureHost(captured))
    expect(captured.env?.ZCODE_CUA_DISABLE).toBe('1')
  })

  it('开启会话 → 不注入（不覆盖宿主 env）', async () => {
    setSessionCua('sess-open', true)
    const captured: Captured = {}
    startZcodeChatTurn({ name: 'ZCode' }, fakeRun('sess-open'), 'hi', '', captureHost(captured))
    expect(captured.env?.ZCODE_CUA_DISABLE).toBeUndefined()
    // 显式存在的宿主值不被清掉
    expect('ZCODE_CUA_DISABLE' in (captured.env ?? {})).toBe(false)
  })
})
