// Task 3 守门：manifest v2 契约与严格增量判定（P1 注入核心）。
// 负例先行——以下形态必须 IncrementRefused（不得静默收养/重放）：
//   修改已应用补丁内容 / 中插 / 重排 / 改名 / 删除 / v1 manifest / last-failed /
//   baseline 变 / 根变；appliedPatches 只从 status==='applied' 派生。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let tmp: string
beforeAll(() => { tmp = mkdtempSync(join(tmpdir(), 'manifest-t-')) })
afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

const item = (over: Record<string, unknown> = {}) => ({
  channel: 'hermes',
  target: 'hermes-studio',
  name: '001-a.patch',
  sha256: 'a'.repeat(64),
  seriesIndex: 0,
  addedFiles: [],
  ...over,
})

const zitem = (over: Record<string, unknown> = {}) =>
  item({ channel: 'zcode', target: 'zcode', name: 'z1.patch', sha256: 'z'.repeat(64), seriesIndex: 0, ...over })

describe('manifest v2：emptyManifest 与逐补丁记录', () => {
  it('emptyManifest 产出 schemaVersion=2 骨架', async () => {
    const { emptyManifest, SCHEMA_VERSION } = await import('../platform/inject/manifest.mjs')
    const m = emptyManifest({ upstreamRoot: '/u', treeOids: { 'hermes-studio': 't1' } })
    expect(m.schemaVersion).toBe(SCHEMA_VERSION)
    expect(m.schemaVersion).toBe(2)
    expect(m.baseline.upstreamRoot).toBe('/u')
    expect(m.baseline.treeOids['hermes-studio']).toBe('t1')
    expect(m.baseline.treeOids['hermes-agent']).toBe(null)
    expect(m.patches).toEqual([])
    expect(m.status).toBe('complete')
  })

  it('applyPlanToManifest 记录逐补丁真实状态并推导整体 status', async () => {
    const { emptyManifest, applyPlanToManifest } = await import('../platform/inject/manifest.mjs')
    let m = emptyManifest({ upstreamRoot: '/u' })
    m = applyPlanToManifest(m, item(), { status: 'applied', addedFiles: ['x.ts'] })
    expect(m.patches[0]).toMatchObject({ name: '001-a.patch', status: 'applied', addedFiles: ['x.ts'], reason: null })
    expect(m.status).toBe('complete')
    m = applyPlanToManifest(m, item({ name: '002-b.patch', sha256: 'b'.repeat(64), seriesIndex: 1 }),
      { status: 'skipped', reason: 'absent-tree' })
    expect(m.status).toBe('partial')
    m = applyPlanToManifest(m, item({ name: '003-c.patch', sha256: 'c'.repeat(64), seriesIndex: 2 }),
      { status: 'failed', reason: 'apply-error' })
    expect(m.status).toBe('failed')
  })
})

describe('manifest v2：applied 投影只从 applied 派生', () => {
  it('负例：failed/skipped/rolled-back 不得进入 appliedPatches 投影', async () => {
    const { emptyManifest, applyPlanToManifest, deriveAppliedPatches, deriveAppliedZcodePatches } =
      await import('../platform/inject/manifest.mjs')
    let m = emptyManifest({ upstreamRoot: '/u' })
    m = applyPlanToManifest(m, item(), { status: 'applied' })
    m = applyPlanToManifest(m, item({ name: '002-f.patch', sha256: 'b'.repeat(64), seriesIndex: 1 }), { status: 'failed', reason: 'x' })
    m = applyPlanToManifest(m, item({ name: '003-s.patch', sha256: 'c'.repeat(64), seriesIndex: 2 }), { status: 'skipped', reason: 'absent-tree' })
    m = applyPlanToManifest(m, item({ name: '004-r.patch', sha256: 'd'.repeat(64), seriesIndex: 3 }), { status: 'rolled-back', reason: 'after:002-f.patch' })
    m = applyPlanToManifest(m, zitem(), { status: 'applied' })
    expect(deriveAppliedPatches(m)).toEqual(['001-a.patch'])
    expect(deriveAppliedZcodePatches(m)).toEqual(['z1.patch'])
  })

  it('落盘文件携带兼容数组且同样只含 applied（原子写：不留 tmp 残留）', async () => {
    const { emptyManifest, applyPlanToManifest, writeManifestAtomic, readManifestFile } =
      await import('../platform/inject/manifest.mjs')
    let m = emptyManifest({ upstreamRoot: '/u' })
    m = applyPlanToManifest(m, item(), { status: 'applied', addedFiles: ['n.ts'] })
    m = applyPlanToManifest(m, item({ name: '002-f.patch', sha256: 'b'.repeat(64), seriesIndex: 1 }), { status: 'failed', reason: 'x' })
    const path = join(tmp, 'sub', '.overlay-injected.json')
    writeManifestAtomic(path, m)
    const round = readManifestFile(path)
    expect(round.schemaVersion).toBe(2)
    expect(round.appliedPatches).toEqual(['001-a.patch'])
    expect(round.appliedPatches).not.toContain('002-f.patch')
    expect(round.appliedZcodePatches).toEqual([])
    // 原子写：目录内只有最终文件，无 .tmp 残留
    expect(readdirSync(join(tmp, 'sub')).filter((f) => f.includes('.tmp'))).toEqual([])
    // 读缺席文件 = null（不猜）
    expect(readManifestFile(join(tmp, 'not-exist.json'))).toBe(null)
  })
})

describe('manifest v2：planIncrement 严格增量', () => {
  const baseline = { upstreamRoot: '/u', treeOids: { 'hermes-studio': 't1', 'hermes-agent': null, 'zcode': 'tz' } }

  const appliedManifest = async (names: string[], extra: Record<string, unknown> = {}) => {
    const { emptyManifest, applyPlanToManifest } = await import('../platform/inject/manifest.mjs')
    let m = emptyManifest(baseline)
    for (let i = 0; i < names.length; i++) {
      m = applyPlanToManifest(m,
        item({ name: names[i], sha256: names[i].repeat(8).slice(0, 64), seriesIndex: i }),
        { status: 'applied' })
    }
    return { ...m, ...extra }
  }

  const planOf = (names: string[]) => ({
    baseline,
    items: names.map((n, i) => item({ name: n, sha256: n.repeat(8).slice(0, 64), seriesIndex: i })),
  })

  it('正例：精确前缀一致 → noop；尾部纯追加 → tail-append', async () => {
    const { planIncrement } = await import('../platform/inject/manifest.mjs')
    const m = await appliedManifest(['001-a.patch', '002-b.patch'])
    expect(planIncrement(m, planOf(['001-a.patch', '002-b.patch']))).toEqual({ kind: 'noop', items: [] })
    const inc = planIncrement(m, planOf(['001-a.patch', '002-b.patch', '003-c.patch']))
    expect(inc.kind).toBe('tail-append')
    expect(inc.items.map((i: any) => i.name)).toEqual(['003-c.patch'])
  })

  it('正例：全空 manifest + 全空 plan → noop', async () => {
    const { planIncrement, emptyManifest } = await import('../platform/inject/manifest.mjs')
    expect(planIncrement(emptyManifest(baseline), { baseline, items: [] })).toEqual({ kind: 'noop', items: [] })
  })

  it('负例：修改已应用补丁内容（sha 变）→ IncrementRefused reason=modify', async () => {
    const { planIncrement } = await import('../platform/inject/manifest.mjs')
    const m = await appliedManifest(['001-a.patch'])
    const plan = { baseline, items: [item({ name: '001-a.patch', sha256: 'f'.repeat(64) })] }
    expect(() => planIncrement(m, plan)).toThrowError(expect.objectContaining({ reason: 'modify' }))
  })

  it('负例：中插新补丁 → reason=insert', async () => {
    const { planIncrement } = await import('../platform/inject/manifest.mjs')
    const m = await appliedManifest(['001-a.patch', '002-b.patch'])
    expect(() => planIncrement(m, planOf(['001-a.patch', '0015-x.patch', '002-b.patch'])))
      .toThrowError(expect.objectContaining({ reason: 'insert' }))
  })

  it('负例：重排 → reason=reorder', async () => {
    const { planIncrement } = await import('../platform/inject/manifest.mjs')
    const m = await appliedManifest(['001-a.patch', '002-b.patch'])
    expect(() => planIncrement(m, planOf(['002-b.patch', '001-a.patch'])))
      .toThrowError(expect.objectContaining({ reason: 'reorder' }))
  })

  it('负例：改名（同 sha 异名）→ reason=rename', async () => {
    const { planIncrement } = await import('../platform/inject/manifest.mjs')
    const m = await appliedManifest(['001-a.patch'])
    const plan = { baseline, items: [item({ name: '001-a-renamed.patch', sha256: '001-a.patch'.repeat(8).slice(0, 64) })] }
    expect(() => planIncrement(m, plan)).toThrowError(expect.objectContaining({ reason: 'rename' }))
  })

  it('负例：删除已应用补丁 → reason=removed（要求 clean 全量重放）', async () => {
    const { planIncrement } = await import('../platform/inject/manifest.mjs')
    const m = await appliedManifest(['001-a.patch', '002-b.patch'])
    expect(() => planIncrement(m, planOf(['001-a.patch'])))
      .toThrowError(expect.objectContaining({ reason: 'removed' }))
  })

  it("负例：v1 manifest → IncrementRefusedError 且 reason 含 'v1'，不自动收养", async () => {
    const { planIncrement } = await import('../platform/inject/manifest.mjs')
    const v1 = { appliedPatches: ['001-a.patch'], appliedZcodePatches: [], generatedAt: '2026-01-01T00:00:00Z' }
    expect(() => planIncrement(v1 as any, planOf(['001-a.patch']))).toThrowError(/v1/)
    try {
      planIncrement(v1 as any, planOf(['001-a.patch']))
    } catch (e: any) {
      expect(e.reason).toContain('v1')
      expect(e.name).toBe('IncrementRefusedError')
    }
  })

  it('负例：上次失败（status=failed 或逐项含 failed）→ reason=last-failed', async () => {
    const { planIncrement } = await import('../platform/inject/manifest.mjs')
    const m = await appliedManifest(['001-a.patch', '002-f.patch'], { status: 'failed' })
    expect(() => planIncrement(m, planOf(['001-a.patch', '002-f.patch'])))
      .toThrowError(expect.objectContaining({ reason: 'last-failed' }))
  })

  it('负例：vendor 基线变（treeOid 变）→ reason=baseline-change', async () => {
    const { planIncrement } = await import('../platform/inject/manifest.mjs')
    const m = await appliedManifest(['001-a.patch'])
    const plan = { baseline: { ...baseline, treeOids: { ...baseline.treeOids, 'hermes-studio': 't2' } }, items: planOf(['001-a.patch']).items }
    expect(() => planIncrement(m, plan)).toThrowError(expect.objectContaining({ reason: 'baseline-change' }))
  })

  it('负例：根变（upstreamRoot 变）→ reason=root-change', async () => {
    const { planIncrement } = await import('../platform/inject/manifest.mjs')
    const m = await appliedManifest(['001-a.patch'])
    const plan = { baseline: { ...baseline, upstreamRoot: '/other-root' }, items: planOf(['001-a.patch']).items }
    expect(() => planIncrement(m, plan)).toThrowError(expect.objectContaining({ reason: 'root-change' }))
  })

  it('absent-tree 的 partial manifest 允许尾部增量（standalone 语义保留）', async () => {
    const { emptyManifest, applyPlanToManifest, planIncrement } = await import('../platform/inject/manifest.mjs')
    let m = emptyManifest(baseline)
    m = applyPlanToManifest(m, item(), { status: 'applied' })
    m = applyPlanToManifest(m, item({ name: '002-agent.patch', target: 'hermes-agent', sha256: '002-agent.patch'.repeat(8).slice(0, 64), seriesIndex: 1 }),
      { status: 'skipped', reason: 'absent-tree' })
    expect(m.status).toBe('partial')
    // 计划侧同名补丁必须携带与 manifest 一致的路由（agent 前缀 → hermes-agent）
    const plan = {
      baseline,
      items: [
        item({}),
        item({ name: '002-agent.patch', target: 'hermes-agent', sha256: '002-agent.patch'.repeat(8).slice(0, 64), seriesIndex: 1 }),
        item({ name: '003-c.patch', sha256: '003-c.patch'.repeat(8).slice(0, 64), seriesIndex: 2 }),
      ],
    }
    const inc = planIncrement(m, plan)
    expect(inc.kind).toBe('tail-append')
    expect(inc.items.map((i: any) => i.name)).toEqual(['003-c.patch'])
  })
})
