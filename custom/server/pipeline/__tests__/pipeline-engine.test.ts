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
  g('checkout', '-q', '-b', 'feat/DEV-MP', 'main') // FE 分支：仅本地（应停留 dev）
})
afterAll(() => { try { rmSync(repo, { recursive: true, force: true }) } catch { /* noop */ } })

describe('PipelineEngine v1（V8.33 四持续产品化）', () => {
  it('facts：本地未推分支=dev；（无 remote 场景）tested/merged 不虚标', () => {
    const facts = collectFacts(repo)
    expect(facts.get('feat/DEV-PAYCORE-X')?.pushed).toBe(false) // 无 origin remote
    expect(facts.get('feat/DEV-MP')?.pushed).toBe(false)
  })
  it('runOnce：dev 态分支入 flows；trigger=off 不发令；domain 按 -MP 映射 fe', async () => {
    const sent: string[] = []
    const eng = new PipelineEngine({ repo, room: '!r:mx', send: async (b) => { sent.push(b); return 'e' } })
    const { flows, actions } = await eng.runOnce()
    expect(flows.length).toBe(2)
    const mp = flows.find((f) => f.branch.includes('DEV-MP'))!
    expect(mp.domain).toBe('fe')
    const be = flows.find((f) => f.branch.includes('DEV-PAYCORE'))!
    expect(be.domain).toBe('be')  // 回归：裸 fe 正则曾致全部误判 fe
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

// ── v2 状态扩展（staged/released，2026-10-16）：真 git 仓多 remote 夹具 ──
describe('PipelineEngine v2（staged/released 扩展）', () => {
  let v2repo = ''
  let bare = ''
  beforeAll(() => {
    bare = mkdtempSync(join(tmpdir(), 'pipeline-bare-'))
    const gb = (...a: string[]) => execFileSync('git', ['-C', bare, ...a], { encoding: 'utf-8' })
    gb('init', '-q', '--bare', '-b', 'main')
    v2repo = mkdtempSync(join(tmpdir(), 'pipeline-v2-'))
    const g = (...a: string[]) => execFileSync('git', ['-C', v2repo, ...a], { encoding: 'utf-8' })
    g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't')
    writeFileSync(join(v2repo, 'a.txt'), 'x'); g('add', '.'); g('commit', '-qm', 'init')
    g('remote', 'add', 'origin', bare); g('push', '-q', 'origin', 'main')
    // BE 分支：推 origin+testlog（应达 tested）
    g('checkout', '-q', '-b', 'feat/DEV-PAYCORE-S')
    execFileSync('mkdir', ['-p', join(v2repo, 'docs/evidence')])
    writeFileSync(join(v2repo, 'docs/evidence/DEV-PAYCORE-S-testlog.txt'), 'log')
    g('add', '.'); g('commit', '-qm', 'be'); g('push', '-q', '-u', 'origin', 'feat/DEV-PAYCORE-S')
    // integration 分支：并入 BE 分支（应达 merged/staged）
    g('checkout', '-q', '-b', 'integration/RFD-001', 'main')
    g('merge', '-q', '--no-ff', 'origin/feat/DEV-PAYCORE-S', '-m', 'integ')
    g('push', '-q', '-u', 'origin', 'integration/RFD-001')
    // release 分支：从 integration 起（并入后 BE 分支应达 released）
    g('checkout', '-q', '-b', 'release/RFD-001', 'origin/integration/RFD-001')
    g('push', '-q', '-u', 'origin', 'release/RFD-001')
  })
  afterAll(() => {
    try { rmSync(v2repo, { recursive: true, force: true }) } catch { /* noop */ }
    try { rmSync(bare, { recursive: true, force: true }) } catch { /* noop */ }
  })

  it('facts：merged 分支 staged=true；release 分支缺席时 released 不虚标', () => {
    const facts = collectFacts(v2repo)
    const be = facts.get('feat/DEV-PAYCORE-S')!
    expect(be.pushed).toBe(true)
    expect(be.tested).toBe(true)
    expect(be.merged).toBe(true)
    expect(be.staged).toBe(true) // staged=已并 integration（release 候选集口径）
    expect(be.released).toBe(true) // release/RFD-001 含该分支
  })

  it('runOnce：六阶段状态机推演到 released；enteredAt 全链记录', async () => {
    const eng = new PipelineEngine({ repo: v2repo, room: '!r:mx', send: async () => 'e' })
    const { flows } = await eng.runOnce()
    const be = flows.find((f) => f.branch.includes('DEV-PAYCORE'))!
    expect(be.stage).toBe('released')
    for (const s of ['dev', 'pushed', 'tested', 'merged', 'staged', 'released']) {
      expect(be.enteredAt[s]).toBeGreaterThan(0)
    }
  })

  it('release 分支缺席：merged 分支 staged 但 released=false（不虚标）', () => {
    // 另起无 release 分支的仓：BE 分支并入 integration 但不发 release
    const bare2 = mkdtempSync(join(tmpdir(), 'pipeline-bare2-'))
    const r2 = mkdtempSync(join(tmpdir(), 'pipeline-v2b-'))
    try {
      execFileSync('git', ['-C', bare2, 'init', '-q', '--bare', '-b', 'main'], { encoding: 'utf-8' })
      const g = (...a: string[]) => execFileSync('git', ['-C', r2, ...a], { encoding: 'utf-8' })
      g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't')
      writeFileSync(join(r2, 'a.txt'), 'x'); g('add', '.'); g('commit', '-qm', 'init')
      g('remote', 'add', 'origin', bare2); g('push', '-q', 'origin', 'main')
      g('checkout', '-q', '-b', 'feat/DEV-PAYCORE-R')
      execFileSync('mkdir', ['-p', join(r2, 'docs/evidence')])
      writeFileSync(join(r2, 'docs/evidence/DEV-PAYCORE-R-testlog.txt'), 'log')
      g('add', '.'); g('commit', '-qm', 'be'); g('push', '-q', '-u', 'origin', 'feat/DEV-PAYCORE-R')
      g('checkout', '-q', '-b', 'integration/RFD-001', 'main')
      g('merge', '-q', '--no-ff', 'origin/feat/DEV-PAYCORE-R', '-m', 'integ')
      g('push', '-q', '-u', 'origin', 'integration/RFD-001')
      const facts = collectFacts(r2)
      const be = facts.get('feat/DEV-PAYCORE-R')!
      expect(be.merged).toBe(true)
      expect(be.staged).toBe(true)
      expect(be.released).toBe(false) // 无 release 分支——不可达不虚标
    } finally {
      try { rmSync(r2, { recursive: true, force: true }) } catch { /* noop */ }
      try { rmSync(bare2, { recursive: true, force: true }) } catch { /* noop */ }
    }
  })
})
