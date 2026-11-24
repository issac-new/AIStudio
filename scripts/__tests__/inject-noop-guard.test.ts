// N33-1 守门（挂账 2026-11-23-compat-release-pending-batch）：noop-inject 哨兵。
// 缺陷背景（v1.0.19 发版轮两次中毒实录）：`git checkout -- vendor/`＋clean 复基线后
// .overlay-injected.json 残留，inject/ensure-injected 的 v2 noop 判定（baseline
// treeOids＋series sha＋前缀一致）不验补丁落盘 → 判 noop 静默跳过，树保持 pristine，
// 后续一切「注入态」假设（docs:sync 投影、路由实验、下游消费）全部失真。
// 本组负例先行（夹具法同 inject-clean-v2）：全部 lane 还原 → 必须自动全量重放；
// 部分 lane 还原（混合态）→ 必须响亮拒绝并指引 clean；健康 noop 不回归。
// N34-9 增补（挂账 2026-11-24-zcode-400-pending-batch）：`git checkout -- .` 与
// `git reset --hard` 只还原已跟踪文件、不清理补丁新增的未跟踪文件——旧哨兵把
// 「通道下有任何状态输出」当作补丁在位，半还原态因此被判健康。本组的两个通道都
// 同时带已跟踪改动与新增文件，对齐真实仓形态。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { trackedFilesFromPatch } from '../lib/zcode-patch-manifest.mjs'
import { sentinelReport, treeStatusPaths } from '../platform/inject/lane-touch.mjs'

const ROOT = resolve(__dirname, '../..')
const v2SessionWired = readFileSync(join(ROOT, 'scripts/inject.mjs'), 'utf8').includes('planIncrement')

let tmp: string
let upRoot: string
let studioRoot: string
let agentRoot: string
let patchDir: string
let zcodePatchDir: string
let stateOut: string
let fakeHome: string
let deployManifest: string
let base: Record<'studio' | 'agent', string>

const sh = (cmd: string, cwd: string) => execFileSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' })

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'noop-guard-'))
  upRoot = join(tmp, 'up')
  studioRoot = join(upRoot, 'hermes-studio')
  agentRoot = join(upRoot, 'hermes-agent')
  patchDir = join(tmp, 'patches')
  zcodePatchDir = join(tmp, 'zcode-patches')
  stateOut = join(tmp, 'state')
  fakeHome = join(tmp, 'home')
  for (const d of [studioRoot, agentRoot, patchDir, zcodePatchDir, fakeHome]) mkdirSync(d, { recursive: true })
  for (const tree of [studioRoot, agentRoot]) {
    sh('git init -q && git config user.email t@t && git config user.name t', tree)
    // 忽略规则对齐真实仓：node_modules 不入 status（哨兵按 git status 判落盘差异）
    writeFileSync(join(tree, '.gitignore'), 'node_modules\n')
  }
  writeFileSync(join(studioRoot, 'src.txt'), 'base\n')
  sh('git add -A && git commit -qm base', studioRoot)
  mkdirSync(join(agentRoot, 'agent'), { recursive: true })
  mkdirSync(join(agentRoot, 'hermes_cli'), { recursive: true })
  writeFileSync(join(agentRoot, 'hermes_cli/__init__.py'), 'base\n')
  sh('git add -A && git commit -qm base', agentRoot)
  base = { studio: sh('git rev-parse HEAD', studioRoot).trim(), agent: sh('git rev-parse HEAD', agentRoot).trim() }

  // 补丁四枚：001 studio 修改 src.txt；002 agent 新增文件（addedFiles 面）；
  // 003 studio 新增文件；004 agent 修改已跟踪文件。两个通道都同时具备
  // 「已跟踪改动＋新增文件」（N34-9 事故形态的前提）。
  writeFileSync(join(studioRoot, 'src.txt'), 'base\n#1\n')
  sh(`git diff > ${JSON.stringify(join(patchDir, '001-s1.patch'))}`, studioRoot)
  sh('git add -A && git commit -qm p1', studioRoot)
  writeFileSync(join(agentRoot, 'agent/new_tool.py'), 'tool\n')
  sh(`git add -N agent/new_tool.py && git diff > ${JSON.stringify(join(patchDir, '002-a1.patch'))}`, agentRoot)
  sh('git add -A && git commit -qm p2', agentRoot)
  writeFileSync(join(studioRoot, 'added.txt'), 'added\n')
  sh(`git add -N added.txt && git diff > ${JSON.stringify(join(patchDir, '003-s2.patch'))}`, studioRoot)
  sh('git add -A && git commit -qm p3', studioRoot)
  writeFileSync(join(agentRoot, 'hermes_cli/__init__.py'), 'base\n#4\n')
  sh(`git diff > ${JSON.stringify(join(patchDir, '004-a2.patch'))}`, agentRoot)
  sh('git add -A && git commit -qm p4', agentRoot)
  // 回基线：补丁在 series 中以「基线→应用」方向重放
  sh(`git reset -q --hard ${base.studio} && git clean -qfd`, studioRoot)
  sh(`git reset -q --hard ${base.agent} && git clean -qfd`, agentRoot)
  writeFileSync(join(patchDir, 'series'), '001-s1.patch\n002-a1.patch\n003-s2.patch\n004-a2.patch\n')

  mkdirSync(join(tmp, 'rt-src'), { recursive: true })
  writeFileSync(join(tmp, 'rt-src', 'tool.py'), 'rt\n')
  deployManifest = join(tmp, 'runtime-manifest.json')
  writeFileSync(deployManifest, JSON.stringify({
    root: join(tmp, 'rt-src'),
    target: '~/.hermes/hermes-agent',
    files: [{ source: 'tool.py', dest: 'tool.py' }],
  }))
})

afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

function env() {
  return {
    ...process.env,
    OVERLAY_UPSTREAM_ROOT: upRoot,
    OVERLAY_PATCH_DIR: patchDir,
    OVERLAY_ZCODE_PATCH_DIR: zcodePatchDir,
    OVERLAY_STATE_OUT: stateOut,
    HOME: fakeHome,
    RUNTIME_DEPLOY_MANIFEST: deployManifest,
    OVERLAY_ALLOW_LIVE_CLEAN: '1',
  }
}

function cli(script: string, args: string[] = []) {
  const r = spawnSync('node', [join(ROOT, 'scripts', script), ...args], {
    env: env(), encoding: 'utf8', cwd: ROOT, maxBuffer: 16 * 1024 * 1024,
  })
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

const stateManifest = () => join(stateOut, '.overlay-injected.json')
/** 场景隔离：回到「完整注入态」确定性起点（清单与树一致）。 */
function restoreInjected() {
  cli('inject.mjs', ['--clean'])
  revertAll()
  const r = cli('inject.mjs')
  if (r.code !== 0) throw new Error(`restoreInjected 失败：${r.out.slice(-400)}`)
}
const revertAll = () => {
  sh(`git reset -q --hard ${base.studio} && git clean -qfd`, studioRoot)
  sh(`git reset -q --hard ${base.agent} && git clean -qfd`, agentRoot)
}
const revertAgentOnly = () => {
  sh(`git reset -q --hard ${base.agent} && git clean -qfd`, agentRoot)
}
/** 只还原已跟踪改动、不清理：补丁新增的未跟踪文件原样留下（N34-9 事故形态）。 */
const revertTrackedOnly = (how: 'checkout' | 'reset') => {
  sh(how === 'checkout' ? 'git checkout -- .' : `git reset -q --hard ${base.studio}`, studioRoot)
  sh(how === 'checkout' ? 'git checkout -- .' : `git reset -q --hard ${base.agent}`, agentRoot)
}
/** 半还原态：已跟踪改动已回基线，补丁新增文件仍在。 */
const expectTrackedReverted = () => {
  expect(readFileSync(join(studioRoot, 'src.txt'), 'utf8')).toBe('base\n')
  expect(readFileSync(join(agentRoot, 'hermes_cli/__init__.py'), 'utf8')).toBe('base\n')
  expect(existsSync(join(studioRoot, 'added.txt'))).toBe(true)
  expect(existsSync(join(agentRoot, 'agent/new_tool.py'))).toBe(true)
}
/** 完整注入态：四枚补丁的已跟踪改动与新增文件全部在位，清单 complete。 */
const expectFullyInjected = () => {
  expect(readFileSync(join(studioRoot, 'src.txt'), 'utf8')).toContain('#1')
  expect(readFileSync(join(agentRoot, 'hermes_cli/__init__.py'), 'utf8')).toContain('#4')
  expect(readFileSync(join(studioRoot, 'added.txt'), 'utf8')).toBe('added\n')
  expect(readFileSync(join(agentRoot, 'agent/new_tool.py'), 'utf8')).toBe('tool\n')
  expect(JSON.parse(readFileSync(stateManifest(), 'utf8')).status).toBe('complete')
}

describe.skipIf(!v2SessionWired)('noop 哨兵（N33-1）：清单残留 vs 树还原', () => {
  it('前置：注入成功建立 v2 清单', () => {
    const r = cli('inject.mjs')
    expect(r.code, r.out.slice(-800)).toBe(0)
    expect(JSON.parse(readFileSync(stateManifest(), 'utf8')).status).toBe('complete')
    expect(readFileSync(join(studioRoot, 'src.txt'), 'utf8')).toContain('#1')
  })

  it('全部 lane 被外部还原后：inject 不得 noop——自动全量重放恢复注入态（本轮事故正例）', () => {
    restoreInjected()
    revertAll()
    // 清单残留（毒化形态）：status complete、series/sha 全一致，唯独树是 pristine
    const m = JSON.parse(readFileSync(stateManifest(), 'utf8'))
    expect(m.status).toBe('complete')
    expect(sh('git status --porcelain', studioRoot).trim()).toBe('')
    expect(sh('git status --porcelain', agentRoot).trim()).toBe('')

    const r = cli('inject.mjs')
    expect(r.code, r.out.slice(-800)).toBe(0)
    // 不得再以 noop 收场：必须出现哨兵告警＋真实重放
    expect(r.out).toMatch(/哨兵|落盘校验|清单残留|全量重放/)
    expect(r.out).not.toMatch(/前缀精确一致（noop）：补丁面无事可做/)
    // 树恢复注入事实
    expect(readFileSync(join(studioRoot, 'src.txt'), 'utf8')).toContain('#1')
    expect(readFileSync(join(agentRoot, 'agent/new_tool.py'), 'utf8')).toBe('tool\n')
    expect(JSON.parse(readFileSync(stateManifest(), 'utf8')).status).toBe('complete')
  })

  it('全部 lane 被外部还原后：ensure-injected 不得 noop——触发重放恢复（pretest 主路径）', () => {
    restoreInjected()
    revertAll()
    const r = cli('ensure-injected.mjs')
    expect(r.code, r.out.slice(-800)).toBe(0)
    expect(r.out).not.toMatch(/v2 noop.*无需动作/)
    expect(readFileSync(join(studioRoot, 'src.txt'), 'utf8')).toContain('#1')
    expect(readFileSync(join(agentRoot, 'agent/new_tool.py'), 'utf8')).toBe('tool\n')
  })

  it('部分 lane 还原（混合态）：必须响亮拒绝并指引 clean，不自动处理', () => {
    restoreInjected()
    revertAgentOnly()
    const r = cli('inject.mjs')
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/混合|部分.*还原|npm run clean && npm run inject/)
    // studio 注入态未被破坏
    expect(readFileSync(join(studioRoot, 'src.txt'), 'utf8')).toContain('#1')
  })

  it('健康 noop 不回归：正常注入态下二次 inject 仍无事可做', () => {
    // 上一例拒绝后树是混合态——先恢复一致注入态
    const c = cli('inject.mjs', ['--clean'])
    expect(c.code, c.out.slice(-800)).toBe(0)
    const i1 = cli('inject.mjs')
    expect(i1.code, i1.out.slice(-800)).toBe(0)
    const i2 = cli('inject.mjs')
    expect(i2.code, i2.out.slice(-800)).toBe(0)
    expect(i2.out).toMatch(/noop|前缀精确一致/)
    expect(readFileSync(join(studioRoot, 'src.txt'), 'utf8')).toContain('#1')
  })

  it('N34-9：git checkout 只还原已跟踪改动、新增文件残留——inject 不得 noop，清残留后全量重放', () => {
    restoreInjected()
    revertTrackedOnly('checkout')
    expectTrackedReverted()
    const r = cli('inject.mjs')
    expect(r.code, r.out.slice(-800)).toBe(0)
    expect(r.out).toMatch(/哨兵/)
    expect(r.out).not.toMatch(/前缀精确一致（noop）/)
    expectFullyInjected()
  })

  it('N34-9：git reset --hard 只还原已跟踪改动、新增文件残留——ensure-injected 触发重放恢复', () => {
    restoreInjected()
    revertTrackedOnly('reset')
    expectTrackedReverted()
    const r = cli('ensure-injected.mjs')
    expect(r.code, r.out.slice(-800)).toBe(0)
    expect(r.out).not.toMatch(/v2 noop.*无需动作/)
    expectFullyInjected()
  })

  it('N34-9：单通道内部分已跟踪改动被还原——响亮拒绝并指引 clean，不动其余注入态', () => {
    restoreInjected()
    sh('git checkout -- src.txt', studioRoot)
    const r = cli('inject.mjs')
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/混合/)
    expect(r.out).toMatch(/hermes-studio/)
    expect(r.out).toMatch(/src\.txt/)
    expect(r.out).toMatch(/npm run clean && npm run inject/)
    // 未被还原的部分保持原样：新增文件与另一通道的注入不被拒绝路径破坏
    expect(existsSync(join(studioRoot, 'added.txt'))).toBe(true)
    expect(readFileSync(join(agentRoot, 'hermes_cli/__init__.py'), 'utf8')).toContain('#4')
  })

  it('N34-9：混合态按指引 clean＋inject 后恢复完整注入态（指引可执行）', () => {
    // 承接上一例留下的混合态
    const c = cli('inject.mjs', ['--clean'])
    expect(c.code, c.out.slice(-800)).toBe(0)
    const i = cli('inject.mjs')
    expect(i.code, i.out.slice(-800)).toBe(0)
    expectFullyInjected()
  })
})

describe('哨兵判别的纯函数面（N34-9）', () => {
  // 通道根必须是真实目录（缺席通道不核）；状态由 statusOf 注入，不依赖目录内容
  const pureRoot = mkdtempSync(join(tmpdir(), 'noop-guard-pure-'))
  const dirs = { S: join(pureRoot, 'S'), A: join(pureRoot, 'A'), Z: join(pureRoot, 'Z') }
  for (const d of Object.values(dirs)) mkdirSync(d)
  afterAll(() => { rmSync(pureRoot, { recursive: true, force: true }) })
  const manifestOf = (patches: Array<{ channel: string; target: string; name: string; addedFiles?: string[] }>) => ({
    schemaVersion: 2, status: 'complete', patches: patches.map((p) => ({ ...p, status: 'applied', addedFiles: p.addedFiles ?? [] })),
  })
  const items = [
    { channel: 'hermes', target: 'S', name: 'p1', trackedFiles: ['src.txt'], addedFiles: ['added.txt'] },
    { channel: 'hermes', target: 'A', name: 'p2', trackedFiles: ['cli/x.py'], addedFiles: [] },
    { channel: 'zcode', target: 'Z', name: 'p3', trackedFiles: [], addedFiles: ['new.ts'] },
  ]
  const manifest = manifestOf(items)
  /** 注入各通道的状态输出：modified＝已跟踪改动的路径，untracked＝未跟踪新增的路径。 */
  const statusOf = (modified: Record<string, string[]> = {}, untracked: Record<string, string[]> = {}) =>
    (root: string) => ({ modified: new Set(modified[root] ?? []), untracked: new Set(untracked[root] ?? []) })

  it('trackedFilesFromPatch：取前置镜像已存在的文件（修改与删除），新增文件不计', () => {
    const patch = [
      'diff --git a/src.txt b/src.txt',
      '--- a/src.txt',
      '+++ b/src.txt',
      '@@ -1 +1 @@',
      '-base',
      '+base#1',
      'diff --git a/added.txt b/added.txt',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/added.txt',
      '@@ -0,0 +1 @@',
      '+added',
      'diff --git a/gone.py b/gone.py',
      'deleted file mode 100644',
      '--- a/gone.py',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-x',
      '',
    ].join('\n')
    expect(trackedFilesFromPatch(patch)).toEqual(['src.txt', 'gone.py'])
  })

  it('已跟踪文件全部不在状态输出里即判已还原——新增文件残留不改变结论', () => {
    // 事故形态：只剩未跟踪的新增文件（?? added.txt），已跟踪改动一个都不在
    const report = sentinelReport(manifest, items, dirs,
      statusOf({}, { [dirs.S]: ['added.txt'], [dirs.A]: ['agent/new.py'] }))
    expect(report.lanes.S.state).toBe('absent')
    expect(report.lanes.S.missing).toEqual(['src.txt'])
    expect(report.lanes.A.state).toBe('absent')
    // Z 通道无已跟踪文件面，新增文件 new.ts 在磁盘上不存在 → 也算不在位
    expect(report.lanes.Z.state).toBe('absent')
    expect(report.verdict).toBe('reverted')
  })

  it('已跟踪文件在位即健康；一个通道在位另一个不在即混合', () => {
    const healthy = sentinelReport(manifest, items, { S: dirs.S, A: dirs.A },
      statusOf({ [dirs.S]: ['src.txt'], [dirs.A]: ['cli/x.py'] }))
    expect(healthy.verdict).toBe('ok')
    const mixed = sentinelReport(manifest, items, { S: dirs.S, A: dirs.A },
      statusOf({ [dirs.S]: ['src.txt'] }, { [dirs.A]: ['agent/new.py'] }))
    expect(mixed.verdict).toBe('mixed')
  })

  it('通道内部分已跟踪文件不在位记「部分还原」；状态命令失败或无可观察证据时按在位放行', () => {
    const two = [
      { ...items[0], trackedFiles: ['src.txt', 'other.txt'] },
    ]
    const partial = sentinelReport(manifestOf(two), two, { S: dirs.S }, statusOf({ [dirs.S]: ['other.txt'] }))
    expect(partial.lanes.S.state).toBe('partial')
    expect(partial.verdict).toBe('mixed')
    // git status 失败（返回 null）：非 git 树，无从观察，不阻断
    const failed = sentinelReport(manifest, items, { S: dirs.S }, () => null)
    expect(failed.lanes.S.state).toBe('present')
    expect(failed.verdict).toBe('ok')
    // 既无已跟踪文件面、也无新增文件声明的通道：无可观察证据，同样放行
    const blind = [{ channel: 'x', target: 'S', name: 'p', trackedFiles: [], addedFiles: [] }]
    const b = sentinelReport(manifestOf(blind), blind, { S: dirs.S }, statusOf())
    expect(b.lanes.S.state).toBe('present')
  })

  it('补丁面全缺但通道里另有已跟踪改动——只算部分还原，绝不判已还原（防误清）', () => {
    // 2026-11-24 实录：前缀处理出错时，健康注入态的路径全部对不上补丁面——此时通道里
    // 明明有已跟踪改动，必须落到「部分还原」而不是触发清残留的「已还原」
    const one = [{ ...items[0], trackedFiles: ['src.txt'] }]
    const report = sentinelReport(manifestOf(one), one, { S: dirs.S }, statusOf({ [dirs.S]: ['vendor/x/src.txt', 'other.ts'] }))
    expect(report.lanes.S.state).toBe('partial')
    expect(report.verdict).toBe('mixed')
  })

  it('只以未跟踪形态出现的补丁目标是中性证据（链上更早的补丁新建、git 还原动不了）', () => {
    const one = [{ ...items[0], trackedFiles: ['src.txt', 'chain.ts'] }]
    // src.txt 仍是已跟踪改动；chain.ts 只以 ?? 出现 → 不算缺失
    const ok = sentinelReport(manifestOf(one), one, { S: dirs.S },
      statusOf({ [dirs.S]: ['src.txt'] }, { [dirs.S]: ['chain.ts'] }))
    expect(ok.lanes.S.state).toBe('present')
    expect(ok.verdict).toBe('ok')
    // 中性文件与新增文件都在、已跟踪改动一个不在 → 仍是已还原
    const reverted = sentinelReport(manifestOf(one), one, { S: dirs.S },
      statusOf({}, { [dirs.S]: ['chain.ts', 'added.txt'] }))
    expect(reverted.lanes.S.missing).toEqual(['src.txt'])
    expect(reverted.verdict).toBe('reverted')
  })

  it('treeStatusPaths：通道是仓库子目录时剥掉目录前缀，并按状态位分组（真实 git）', () => {
    // 对齐真实仓形态：vendor/<通道> 是本仓的子目录，--porcelain 输出相对仓库根
    const repo = mkdtempSync(join(tmpdir(), 'noop-guard-nested-'))
    afterAll(() => { rmSync(repo, { recursive: true, force: true }) })
    const lane = join(repo, 'vendor', 'x')
    mkdirSync(lane, { recursive: true })
    sh('git init -q && git config user.email t@t && git config user.name t', repo)
    writeFileSync(join(lane, 'a.txt'), 'base\n')
    writeFileSync(join(lane, 'kept.txt'), 'k\n')
    sh('git add -A && git commit -qm base', repo)
    writeFileSync(join(lane, 'a.txt'), 'base\n#1\n')
    writeFileSync(join(lane, '新文件 with space.txt'), 'n\n')
    writeFileSync(join(repo, 'outside.txt'), 'o\n')
    const st = treeStatusPaths(lane)
    expect(st).not.toBeNull()
    // 路径不带 vendor/x/ 前缀；未跟踪文件不转义、逐个列出；通道外的文件不计
    expect([...st!.modified]).toEqual(['a.txt'])
    expect([...st!.untracked].sort()).toEqual(['新文件 with space.txt'])
    // 仓库根本身作为通道（夹具形态：无前缀）同样成立
    expect([...treeStatusPaths(repo)!.modified]).toEqual(['vendor/x/a.txt'])
    // 非 git 目录返回 null
    const bare = mkdtempSync(join(tmpdir(), 'noop-guard-bare-'))
    afterAll(() => { rmSync(bare, { recursive: true, force: true }) })
    expect(treeStatusPaths(bare)).toBeNull()
  })
})
