// N33-1 守门（挂账 2026-11-23-compat-release-pending-batch）：noop-inject 哨兵。
// 缺陷背景（v1.0.19 发版轮两次中毒实录）：`git checkout -- vendor/`＋clean 复基线后
// .overlay-injected.json 残留，inject/ensure-injected 的 v2 noop 判定（baseline
// treeOids＋series sha＋前缀一致）不验补丁落盘 → 判 noop 静默跳过，树保持 pristine，
// 后续一切「注入态」假设（docs:sync 投影、路由实验、下游消费）全部失真。
// 本组负例先行（夹具法同 inject-clean-v2）：全部 lane 还原 → 必须自动全量重放；
// 部分 lane 还原（混合态）→ 必须响亮拒绝并指引 clean；健康 noop 不回归。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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

  // 补丁两枚：001 studio 修改 src.txt；002 agent 新增文件（addedFiles 面）
  writeFileSync(join(studioRoot, 'src.txt'), 'base\n#1\n')
  sh(`git diff > ${JSON.stringify(join(patchDir, '001-s1.patch'))}`, studioRoot)
  sh('git add -A && git commit -qm p1', studioRoot)
  writeFileSync(join(agentRoot, 'agent/new_tool.py'), 'tool\n')
  sh(`git add -N agent/new_tool.py && git diff > ${JSON.stringify(join(patchDir, '002-a1.patch'))}`, agentRoot)
  sh('git add -A && git commit -qm p2', agentRoot)
  // 回基线：补丁在 series 中以「基线→应用」方向重放
  sh(`git reset -q --hard ${base.studio} && git clean -qfd`, studioRoot)
  sh(`git reset -q --hard ${base.agent} && git clean -qfd`, agentRoot)
  writeFileSync(join(patchDir, 'series'), '001-s1.patch\n002-a1.patch\n')

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
})
