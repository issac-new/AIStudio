// overlay/custom/server/loop/engine/__tests__/mention-bus-round6.test.ts
// R6 @mention 总线守门：客户端/服务端双端解析一致 / 分发决策（agent/squad/member）
// / runtime 护栏 / 留痕 / patch 355 漂移。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { parseMentions, hasAgentTrigger } from '@/custom/ia2/utils/mention'
import { parseMentionsServer, dispatchMention, type MentionBusDeps } from '../mention-bus'

const knownAgents = new Set(['codex', 'kimi', 'minimax'])
const isKnown = (n: string) => knownAgents.has(n.toLowerCase())

describe('@mention 双端解析（multica comment.go:3100 语义，单一事实源）', () => {
  const cases: Array<[string, Array<[string, string]>]> = [
    ['[@codex] 跑一下', [['codex', 'agent']]],
    ['@codex 跑一下', [['codex', 'agent']]],
    ['[@kimi] @codex 一起', [['kimi', 'agent'], ['codex', 'agent']]],
    ['@squad 触发 leader', [['squad', 'squad']]],
    ['[@squad]', [['squad', 'squad']]],
    ['@alice 看一下', [['alice', 'member']]],
    ['无提及', []],
  ]
  for (const [text, expected] of cases) {
    it(`客户端 parseMentions('${text.slice(0, 20)}') → ${JSON.stringify(expected)}`, () => {
      const got = parseMentions(text, isKnown).map((m) => [m.name, m.kind])
      expect(got).toEqual(expected)
    })
    it(`服务端 parseMentionsServer('${text.slice(0, 20)}') 同判定`, () => {
      const got = parseMentionsServer(text, isKnown).map((m) => [m.name, m.kind])
      expect(got).toEqual(expected)
    })
  }

  it('hasAgentTrigger：agent/squad 任一即真；仅 member 为假', () => {
    expect(hasAgentTrigger(parseMentions('[@codex] x', isKnown))).toBe(true)
    expect(hasAgentTrigger(parseMentions('@squad x', isKnown))).toBe(true)
    expect(hasAgentTrigger(parseMentions('@alice x', isKnown))).toBe(false)
    expect(hasAgentTrigger(parseMentions('无', isKnown))).toBe(false)
  })
})

describe('@mention 分发决策（multica enqueue semantics）', () => {
  function deps(over: Partial<MentionBusDeps> = {}): MentionBusDeps {
    return {
      isKnownAgent: isKnown,
      isRuntimeHealthy: () => true,
      enqueueAgentRun: vi.fn(async () => 'run-123456789012'),
      ...over,
    }
  }

  it('@agent → enqueue run + queued reason + action 含 agent 名', async () => {
    const d = deps()
    const r = await dispatchMention('t1', '[@codex] 处理这个', d)
    expect(r.triggered).toBe(true)
    expect(r.reason.code).toBe('queued')
    expect(r.action).toContain('codex')
    expect(d.enqueueAgentRun).toHaveBeenCalledWith('codex', expect.stringContaining('处理这个'))
  })

  it('@squad → enqueue + coalesced reason（leader 协调语义）', async () => {
    const r = await dispatchMention('t1', '@squad 派单', deps())
    expect(r.triggered).toBe(true)
    expect(r.reason.code).toBe('coalesced')
  })

  it('@member / 无提及 → 不触发（self_trigger_suppressed）', async () => {
    const r = await dispatchMention('t1', '@alice 看一下', deps())
    expect(r.triggered).toBe(false)
    expect(r.reason.code).toBe('self_trigger_suppressed')
  })

  it('runtime 离线 → 拦截不 enqueue + runtime_offline（R6 认领护栏同源）', async () => {
    const d = deps({ isRuntimeHealthy: () => false })
    const r = await dispatchMention('t1', '[@codex] 跑', d)
    expect(r.triggered).toBe(false)
    expect(r.reason.code).toBe('runtime_offline')
    expect(d.enqueueAgentRun).not.toHaveBeenCalled()
  })

  it('enqueue 失败 → runtime_offline + enqueue failed action', async () => {
    const d = deps({ enqueueAgentRun: vi.fn(async () => null) })
    const r = await dispatchMention('t1', '[@codex] 跑', d)
    expect(r.triggered).toBe(false)
    expect(r.reason.code).toBe('runtime_offline')
    expect(r.action).toContain('enqueue failed')
  })
})

describe('patch 355 漂移守卫', () => {
  const overlayRoot = resolve(__dirname, '../../../../..')

  it('355 含 HERMES_CUSTOM[MentionBus] + runMentionBus 调用；series/manifest 登记', () => {
    const patch = readFileSync(resolve(overlayRoot, 'patches/355-server-kanban-mention-bus.patch'), 'utf8')
    expect(patch).toContain('HERMES_CUSTOM[MentionBus]')
    expect(patch).toContain('runMentionBus')
    expect(patch).toContain('controllers/kanban.ts')
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain('355-server-kanban-mention-bus.patch')
    const manifest = JSON.parse(readFileSync(resolve(overlayRoot, '.overlay-injected.json'), 'utf8'))
    expect(manifest.appliedPatches).toContain('355-server-kanban-mention-bus.patch')
  })
})
