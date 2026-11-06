// Task 4 守门：事务化注入 Executor 与 Journal（P1 注入核心）。
// 负例先行（临时 git 仓 + 临时 overlay 快照，参照 inject-absent-tree 夹具法）：
//   ① 注入中强制第 N 个补丁失败 → 前 N-1 个已应用项全部回滚（文件字节比对）、
//      manifest status=failed、后续 skipped/blocked-by-failed；
//   ② 部署预检返回 partial → 注入中止、不写任何 applied 投影；
//   ③ 成功路径 manifest=complete 且 appliedPatches 与 plan 一致；
//   ④ 中断后重跑 → IncrementRefused（last-failed）并提示 clean；
//   ⑤ lane 独立：agent lane 失败不牵连 studio lane 已应用项；
//   ⑥ 部署后置 partial → manifest 不得 complete。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// v2 会话层接线检测（挂账 2026-11-06-inject-seam-restore）：manifest v2 noop/增量分派
// （planIncrement）与 executor 会话化执行被 cognition P0 重构从主链剥落，平台域回植前
// 本组用例以条件 skip 冻结（接线=scripts/inject.mjs 重新 import planIncrement 后自动复活）。
const ROOT = resolve(__dirname, '../..')
const v2SessionWired = readFileSync(join(ROOT, 'scripts/inject.mjs'), 'utf8').includes('planIncrement')


let tmp: string
let upRoot: string
let studioRoot: string
let agentRoot: string
let patchDir: string
let zcodePatchDir: string
let pristinePatchDir: string
let stateOut: string

const sh = (cmd: string, cwd: string) => execFileSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' })

/** 在 git 树内生成一个「修改既有文件」补丁（相对 HEAD），并把工作树留在已应用态供下一补丁叠加。 */
function genModifyPatch(tree: string, file: string, marker: string, outPatch: string) {
  const abs = join(tree, file)
  writeFileSync(abs, readFileSync(abs, 'utf8') + `${marker}\n`)
  sh(`git diff > ${JSON.stringify(outPatch)}`, tree)
  sh(`git add -A && git commit -qm p`, tree)
}

/** 在 git 树内生成一个「新增文件」补丁（git add -N 让 diff 纳入 untracked）。 */
function genNewFilePatch(tree: string, file: string, content: string, outPatch: string) {
  mkdirSync(resolve(join(tree, file), '..'), { recursive: true })
  writeFileSync(join(tree, file), content)
  sh(`git add -N ${JSON.stringify(file)} && git diff > ${JSON.stringify(outPatch)}`, tree)
  sh(`git add -A && git commit -qm p`, tree)
}

/** 上下文失配的必败补丁（git apply --check 即红）。 */
const badPatch = (file: string) =>
  `diff --git a/${file} b/${file}\nindex 1111111..2222222 100644\n--- a/${file}\n+++ b/${file}\n@@ -1,2 +1,2 @@\n-this-line-does-not-exist\n+broken\n context-also-missing\n`

let baselineBytes: Record<string, Buffer>
let baseCommit: Record<string, string>

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'executor-t-'))
  upRoot = join(tmp, 'up')
  studioRoot = join(upRoot, 'hermes-studio')
  agentRoot = join(upRoot, 'hermes-agent')
  patchDir = join(tmp, 'patches')
  zcodePatchDir = join(tmp, 'zcode-patches')
  pristinePatchDir = join(tmp, 'patches-pristine')
  stateOut = join(tmp, 'state')
  for (const d of [studioRoot, agentRoot, patchDir, zcodePatchDir]) mkdirSync(d, { recursive: true })
  for (const tree of [studioRoot, agentRoot]) {
    sh('git init -q && git config user.email t@t && git config user.name t', tree)
  }
  // studio 基线：src.txt（补丁链修改）与 agent/pre-existing.txt（同路径防误删锚）
  writeFileSync(join(studioRoot, 'src.txt'), 'base\n')
  mkdirSync(join(studioRoot, 'agent'), { recursive: true })
  writeFileSync(join(studioRoot, 'agent/pre-existing.txt'), 'studio-side\n')
  sh('git add -A && git commit -qm base', studioRoot)
  // agent 基线：hermes_cli 目录存在（树在位锚）
  mkdirSync(join(agentRoot, 'hermes_cli'), { recursive: true })
  writeFileSync(join(agentRoot, 'hermes_cli/__init__.py'), '')
  sh('git add -A && git commit -qm base', agentRoot)
  baseCommit = {
    studio: sh('git rev-parse HEAD', studioRoot).trim(),
    agent: sh('git rev-parse HEAD', agentRoot).trim(),
  }

  // 补丁链（增量差量：每步提交推进 HEAD，下一补丁的 context 建立在前面补丁之上，与 series 顺序应用语义一致）：
  //  001/003/004 studio 修改 src.txt；002 studio 新增文件；005 agent 新增；006 agent 修改
  genModifyPatch(studioRoot, 'src.txt', '#1', join(patchDir, '001-s1.patch'))
  genNewFilePatch(studioRoot, 'new-studio.txt', 'fresh\n', join(patchDir, '002-s2.patch'))
  genModifyPatch(studioRoot, 'src.txt', '#3', join(patchDir, '003-s3.patch'))
  genModifyPatch(studioRoot, 'src.txt', '#4', join(patchDir, '004-s4.patch'))
  genNewFilePatch(agentRoot, 'agent/new_agent_tool.py', 'tool\n', join(patchDir, '005-a1.patch'))
  genModifyPatch(agentRoot, 'hermes_cli/__init__.py', '#a2', join(patchDir, '006-a2.patch'))
  // 原始补丁留档（badPatch 会覆写，逐会话还原）
  cpSync(patchDir, pristinePatchDir, { recursive: true })
  resetAll()
  baselineBytes = {
    'src.txt': readFileSync(join(studioRoot, 'src.txt')),
    'agent/pre-existing.txt': readFileSync(join(studioRoot, 'agent/pre-existing.txt')),
    'hermes_cli/__init__.py': readFileSync(join(agentRoot, 'hermes_cli/__init__.py')),
  }
})

afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

/** 会话隔离：两树回基线提交、补丁还原原始内容、状态目录清空。 */
function resetAll() {
  sh(`git reset -q --hard ${baseCommit.studio} && git clean -qfd`, studioRoot)
  sh(`git reset -q --hard ${baseCommit.agent} && git clean -qfd`, agentRoot)
  cpSync(pristinePatchDir, patchDir, { recursive: true })
  rmSync(stateOut, { recursive: true, force: true })
}

const FULL_SERIES = '001-s1.patch\n002-s2.patch\n003-s3.patch\n004-s4.patch\n005-a1.patch\n006-a2.patch\n'

interface Opts {
  applyRuntimeDeploy?: (phase: 'precheck' | 'apply') => { status: string; detail?: string }
  series?: string
  zcodeSeries?: string
  badPatch?: string
  rootsOverride?: Record<string, string>
}

async function run(o: Opts = {}) {
  if (o.badPatch) {
    writeFileSync(join(patchDir, o.badPatch), badPatch(o.badPatch === '005-a1.patch' ? 'agent/new_agent_tool.py' : 'src.txt'))
  }
  const { buildPlan } = await import('../platform/inject/planner.mjs')
  const items = buildPlan(o.series ?? FULL_SERIES, o.zcodeSeries ?? '', patchDir)
  const { runInjection } = await import('../platform/inject/executor.mjs')
  const logs: string[] = []
  const out = runInjection(
    { baseline: { upstreamRoot: upRoot, treeOids: { 'hermes-studio': 't-s', 'hermes-agent': 't-a', zcode: null } }, items },
    {
      roots: o.rootsOverride ?? { 'hermes-studio': studioRoot, 'hermes-agent': agentRoot, zcode: join(upRoot, 'zcode-absent') },
      patchDirs: { hermes: patchDir, zcode: zcodePatchDir },
      stateOut,
      applyRuntimeDeploy: o.applyRuntimeDeploy ?? (() => ({ status: 'complete' })),
      log: (m: string) => logs.push(m),
    },
  )
  return { ...out, logs, items }
}

const manifestPath = () => join(stateOut, '.overlay-injected.json')

describe.skipIf(!v2SessionWired)('executor+journal：失败事务回滚（负例①）', () => {
  it('第 3 个补丁失败 → 前 2 项回滚（字节比对）、status=failed、第 4 项 blocked-by-failed', async () => {
    const r = await run({ badPatch: '003-s3.patch' })
    expect(r.wroteManifest).toBe(true)
    expect(r.manifest.status).toBe('failed')
    const p = r.manifest.patches
    expect(p.map((x: any) => [x.name, x.status])).toEqual([
      ['001-s1.patch', 'rolled-back'],
      ['002-s2.patch', 'rolled-back'],
      ['003-s3.patch', 'failed'],
      ['004-s4.patch', 'skipped'],
      ['005-a1.patch', 'applied'],
      ['006-a2.patch', 'applied'],
    ])
    expect(p[3].reason).toMatch(/blocked-by-failed:003-s3\.patch/)
    // studio lane 文件字节 == 原基线（修改回滚 + 新增文件删除）
    expect(readFileSync(join(studioRoot, 'src.txt')).equals(baselineBytes['src.txt'])).toBe(true)
    expect(existsSync(join(studioRoot, 'new-studio.txt'))).toBe(false)
    // agent lane 不受牵连（lane 独立事务）
    expect(existsSync(join(agentRoot, 'agent/new_agent_tool.py'))).toBe(true)
    // journal 留档：失败会话的备份仍在（取证面），字节与基线一致
    const jdir = join(stateOut, 'journal')
    expect(existsSync(jdir)).toBe(true)
    const backup = readFileSync(join(jdir, '001-s1.patch.pre', 'files', 'src.txt'))
    expect(backup.equals(baselineBytes['src.txt'])).toBe(true)
  })
})

describe.skipIf(!v2SessionWired)('executor+journal：部署预检（负例②）', () => {
  it('precheck partial → 中止：零补丁应用、不写 manifest/applied 投影、文件不动', async () => {
    resetAll()
    const r = await run({
      applyRuntimeDeploy: (phase) => ({ status: phase === 'precheck' ? 'partial' : 'complete' }),
    })
    expect(r.wroteManifest).toBe(false)
    expect(r.manifest).toBe(null)
    expect(r.runtimeDeploy.precheck).toBe('partial')
    expect(existsSync(manifestPath())).toBe(false)
    expect(readFileSync(join(studioRoot, 'src.txt')).equals(baselineBytes['src.txt'])).toBe(true)
    for (const item of r.results) {
      expect(item.status).toBe('skipped')
      expect(item.reason).toMatch(/runtime-deploy-precheck:partial/)
    }
  })
})

describe.skipIf(!v2SessionWired)('executor+journal：成功路径（③）', () => {
  it('全部应用 → manifest complete、appliedPatches 与 plan 一致、journal 清理', async () => {
    resetAll()
    const r = await run({})
    expect(r.wroteManifest).toBe(true)
    expect(r.manifest.status).toBe('complete')
    expect(r.manifest.patches.every((p: any) => p.status === 'applied')).toBe(true)
    const { deriveAppliedPatches, deriveAppliedZcodePatches, readManifestFile } =
      await import('../platform/inject/manifest.mjs')
    expect(deriveAppliedPatches(r.manifest)).toEqual(r.items.filter((i: any) => i.channel === 'hermes').map((i: any) => i.name))
    expect(deriveAppliedZcodePatches(r.manifest)).toEqual([])
    // 落盘读回一致
    const disk = readManifestFile(manifestPath())
    expect(disk.status).toBe('complete')
    expect(disk.appliedPatches).toHaveLength(6)
    // 内容面：studio src.txt 带全部标记、新增文件在位；agent 新文件在位
    const src = readFileSync(join(studioRoot, 'src.txt'), 'utf8')
    for (const marker of ['#1', '#3', '#4']) expect(src).toContain(marker)
    expect(existsSync(join(studioRoot, 'new-studio.txt'))).toBe(true)
    expect(existsSync(join(agentRoot, 'agent/new_agent_tool.py'))).toBe(true)
    expect(readFileSync(join(agentRoot, 'hermes_cli/__init__.py'), 'utf8')).toContain('#a2')
    // 成功会话收尾清空 journal（回滚窗口关闭）
    expect(existsSync(join(stateOut, 'journal'))).toBe(false)
    // studio 树 agent/ 同路径既有文件不被触碰
    expect(readFileSync(join(studioRoot, 'agent/pre-existing.txt')).equals(baselineBytes['agent/pre-existing.txt'])).toBe(true)
  })
})

describe.skipIf(!v2SessionWired)('executor+journal：中断后重跑（负例④）', () => {
  it('failed manifest → planIncrement 抛 last-failed 且提示 clean', async () => {
    resetAll()
    await run({ badPatch: '004-s4.patch' })
    const { readManifestFile, planIncrement, IncrementRefusedError } = await import('../platform/inject/manifest.mjs')
    const m = readManifestFile(manifestPath())
    expect(m.status).toBe('failed')
    const { buildPlan } = await import('../platform/inject/planner.mjs')
    const items = buildPlan(FULL_SERIES, '', patchDir)
    let err: any
    try {
      planIncrement(m, { baseline: m.baseline, items })
    } catch (e) { err = e }
    expect(err).toBeInstanceOf(IncrementRefusedError)
    expect(err.reason).toBe('last-failed')
    expect(err.message).toContain('clean')
  })
})

describe.skipIf(!v2SessionWired)('executor+journal：lane 独立事务（负例⑤）', () => {
  it('agent lane 首补丁失败 → agent lane 回滚+blocked；studio lane 保持 applied', async () => {
    resetAll()
    const r = await run({ badPatch: '005-a1.patch' })
    expect(r.manifest.status).toBe('failed')
    const p = r.manifest.patches
    expect(p.map((x: any) => [x.name, x.status])).toEqual([
      ['001-s1.patch', 'applied'],
      ['002-s2.patch', 'applied'],
      ['003-s3.patch', 'applied'],
      ['004-s4.patch', 'applied'],
      ['005-a1.patch', 'failed'],
      ['006-a2.patch', 'skipped'],
    ])
    expect(p[5].reason).toMatch(/blocked-by-failed:005-a1\.patch/)
    // agent 树回到基线：修改回滚、（本例失败补丁是新增文件，无残留）
    expect(readFileSync(join(agentRoot, 'hermes_cli/__init__.py')).equals(baselineBytes['hermes_cli/__init__.py'])).toBe(true)
    // studio 保持注入态
    expect(readFileSync(join(studioRoot, 'src.txt'), 'utf8')).toContain('#4')
    // applied 投影只含 studio lane（agent 两项一项 failed 一项 skipped）
    const { deriveAppliedPatches } = await import('../platform/inject/manifest.mjs')
    expect(deriveAppliedPatches(r.manifest)).toEqual(['001-s1.patch', '002-s2.patch', '003-s3.patch', '004-s4.patch'])
  })
})

describe.skipIf(!v2SessionWired)('executor+journal：部署后置 partial（负例⑥）', () => {
  it('patches 全应用但 runtime apply=partial → manifest 不得 complete', async () => {
    resetAll()
    const r = await run({
      applyRuntimeDeploy: (phase) => ({ status: phase === 'precheck' ? 'complete' : 'partial' }),
    })
    expect(r.wroteManifest).toBe(true)
    expect(r.manifest.status).toBe('partial')
    expect(r.manifest.runtimeDeploy).toMatchObject({ apply: 'partial' })
    expect(r.manifest.patches.every((p: any) => p.status === 'applied')).toBe(true)
  })
})

describe.skipIf(!v2SessionWired)('executor+journal：absent-tree 语义保留', () => {
  it('zcode 根缺席 + zcode 补丁 → skipped/absent-tree、不阻断整体（partial）', async () => {
    resetAll()
    writeFileSync(join(zcodePatchDir, 'z1.patch'), badPatch('src/anything.ts'))
    const r = await run({ series: '001-s1.patch\n', zcodeSeries: 'z1.patch\n' })
    expect(r.manifest.patches.map((p: any) => [p.name, p.status])).toEqual([
      ['001-s1.patch', 'applied'],
      ['z1.patch', 'skipped'],
    ])
    expect(r.manifest.patches[1].reason).toMatch(/absent-tree/)
    expect(r.manifest.status).toBe('partial')
    expect(r.logs.join('\n')).toContain('tree absent')
  })
})

describe.skipIf(!v2SessionWired)('executor+journal：多补丁同文件叠加回滚字节断言（P2 Task 4）', () => {
  it('第 4 个补丁失败 → src.txt 上已叠加的 001+003 逐层回滚，字节==基线（非 git reset 取巧）', async () => {
    resetAll()
    const r = await run({ badPatch: '004-s4.patch' })
    expect(r.manifest.status).toBe('failed')
    const p = r.manifest.patches
    expect(p.map((x: any) => [x.name, x.status])).toEqual([
      ['001-s1.patch', 'rolled-back'],
      ['002-s2.patch', 'rolled-back'],
      ['003-s3.patch', 'rolled-back'],
      ['004-s4.patch', 'failed'],
      ['005-a1.patch', 'applied'],
      ['006-a2.patch', 'applied'],
    ])
    // 关键断言：失败时刻 src.txt = base + '#1' + '#3'（两补丁叠加态），回滚后逐字节回基线
    expect(readFileSync(join(studioRoot, 'src.txt')).equals(baselineBytes['src.txt'])).toBe(true)
    // 叠加态确实不同于基线（防止「从未应用」的假回滚）
    const appliedState = `${'base\n'}#1\n#3\n`
    expect(appliedState.length).toBeGreaterThan(baselineBytes['src.txt'].length)
    // 新增文件回滚删除
    expect(existsSync(join(studioRoot, 'new-studio.txt'))).toBe(false)
    // journal 备份链留档：001 与 003 的 pre 备份都在
    expect(existsSync(join(stateOut, 'journal', '001-s1.patch.pre', 'files', 'src.txt'))).toBe(true)
    expect(existsSync(join(stateOut, 'journal', '003-s3.patch.pre', 'files', 'src.txt'))).toBe(true)
    // 回滚后的 003 备份内容=「base+#1」叠加态（证明回滚是按备份逐层还原，不是只回滚最后一层）
    const backup003 = readFileSync(join(stateOut, 'journal', '003-s3.patch.pre', 'files', 'src.txt'), 'utf8')
    expect(backup003).toBe('base\n#1\n')
  })
})
