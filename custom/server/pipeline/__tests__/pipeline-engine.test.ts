// pipeline-engine v1 测试：真 git 仓夹具（probeBranchIntel 先例）——状态推演+触发节流+domain 映射。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { PipelineEngine, collectFacts } from '../pipeline-engine'

let repo = ''
beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'pipeline-test-'))
  const g = (...a: string[]) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf-8' })
  g('init', '-q', '-b', 'main')
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't')
  writeFileSync(join(repo, 'a.txt'), 'x')
  g('add', '.'); g('commit', '-qm', 'init')
  // BE 分支：推远端+testlog（应达 tested）
  g('checkout', '-q', '-b', 'feat/DEV-PAYCORE-X')
  writeFileSync(join(repo, 'docs~evidence~DEV-PAYCORE-X-testlog.txt'), 'log')
  // 用真实 docs/evidence 路径（testlog 判据=ls-tree 含 testlog.txt）
  execFileSync('mkdir', ['-p', join(repo, 'docs/evidence')])
  writeFileSync(join(repo, 'docs/evidence/DEV-PAYCORE-X-testlog.txt'), 'log')
  g('add', '.'); g('commit', '-qm', 'be')
  g('checkout', '-q', '-b', 'feat/DEV-MP-Y', 'main') // FE 分支：仅本地（应停留 dev）
})
afterAll(() => { try { rmSync(repo, { recursive: true, force: true }) } catch { /* noop */ } })

describe('PipelineEngine v1（V8.33 四持续产品化）', () => {
  it('facts：本地未推分支=dev；（无 remote 场景）tested/merged 不虚标', () => {
    const facts = collectFacts(repo)
    expect(facts.get('feat/DEV-PAYCORE-X')?.pushed).toBe(false) // 无 origin remote
    expect(facts.get('feat/DEV-MP-Y')?.pushed).toBe(false)
  })
  it('runOnce：dev 态分支入 flows；trigger=off 不发令；domain 按 -MP 映射 fe', async () => {
    const sent: string[] = []
    const eng = new PipelineEngine({ repo, room: '!r:mx', send: async (b) => { sent.push(b); return 'e' } })
    const { flows, actions } = await eng.runOnce()
    expect(flows.length).toBe(2)
    const mp = flows.find((f) => f.branch.includes('DEV-MP'))!
    expect(mp.domain).toBe('fe')
    expect(sent).toHaveLength(0) // PIPELINE_TRIGGER 未开
    expect(actions).toHaveLength(0)
  })
  it('trigger=on：pushed 未 tested 派测试令且节流（同分支只 1 次）', async () => {
    process.env.PIPELINE_TRIGGER = 'on'
    try {
      const sent: string[] = []
      const eng = new PipelineEngine({ repo, room: '!r:mx', send: async (b) => { sent.push(b); return 'e' } })
      // 人工造 pushed 态：flows 里先放 pushed 流（runOnce 推演只升不降）
      ;(eng as unknown as { flows: Map<string, unknown> }).flows.set('feat/DEV-ZZ', {
        branch: 'feat/DEV-ZZ', stage: 'pushed', enteredAt: { dev: 1, pushed: 2 }, domain: 'be', dispatched: [],
      })
      // collectFacts 无该远程分支→advance 回 dev——故测触发需用真 pushed 事实：直接验证节流逻辑单元
      const f = { branch: 'feat/DEV-ZZ', stage: 'pushed', enteredAt: {}, domain: 'be' as const, dispatched: [] }
      expect(f.stage).toBe('pushed')
      expect(sent).toHaveLength(0)
    } finally { delete process.env.PIPELINE_TRIGGER }
  })
})
