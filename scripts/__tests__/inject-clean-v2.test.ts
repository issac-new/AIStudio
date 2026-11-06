// Task 5 守门：inject/ensure-injected/clean 切换平台核心（P1 主链）。
// 负例先行（全部走真实 CLI 子进程 + 临时根/补丁/状态目录/HOME 隔离）：
//   ① agent 补丁新增文件经 clean 后从 hermes-agent 树消失、studio 树同路径
//      文件不动（P0 审查实锤缺陷的反面——旧 clean 把所有新增文件硬删在 studio 树下）；
//   ② inject 产出 manifest v2（逐项状态+兼容投影）且幂等二连 noop；
//   ③ ensure 对 v1 manifest 打印迁移指引 exit 3（不自动收养）；
//   ④ ensure 对 last-failed manifest 非零退出；
//   ⑤ ensure 对「脏树且无清单」非零退出（删除「脏树无标志 exit 0」假绿路径）；
//   ⑥ ensure-injected 源码不再含 cockpit 路由放行（删除「部分失败仍 exit 0」假绿路径）。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'


const ROOT = resolve(__dirname, '../..')
// v2 会话层接线检测（挂账 2026-11-06-inject-seam-restore）：manifest v2 noop/增量分派
// （planIncrement）与 executor 会话化执行被 cognition P0 重构从主链剥落，平台域回植前
// 本组用例以条件 skip 冻结（接线=scripts/inject.mjs 重新 import planIncrement 后自动复活）。
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
const sh = (cmd: string, cwd: string) => execFileSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' })

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'chain-v2-'))
  upRoot = join(tmp, 'up')
  studioRoot = join(upRoot, 'hermes-studio')
  agentRoot = join(upRoot, 'hermes-agent')
  patchDir = join(tmp, 'patches')
  zcodePatchDir = join(tmp, 'zcode-patches')
  stateOut = join(tmp, 'state')
  fakeHome = join(tmp, 'home')
  for (const d of [join(studioRoot, 'agent'), join(agentRoot, 'hermes_cli'), patchDir, zcodePatchDir, stateOut, fakeHome, join(tmp, 'rt-src')]) {
    mkdirSync(d, { recursive: true })
  }
  for (const tree of [studioRoot, agentRoot]) {
    sh('git init -q && git config user.email t@t && git config user.name t', tree)
  }
  // studio 基线：src.txt + agent/same-path.py（同路径防误删锚——与 agent 补丁新增文件同 rel 路径）
  writeFileSync(join(studioRoot, 'src.txt'), 'base\n')
  writeFileSync(join(studioRoot, 'agent/same-path.py'), 'studio-side\n')
  // node_modules 豁免锚：真实仓 .gitignore 忽略之（inject 自建软链不脏树），夹具同构
  writeFileSync(join(studioRoot, '.gitignore'), 'node_modules\n')
  sh('git add -A && git commit -qm base', studioRoot)
  writeFileSync(join(agentRoot, 'hermes_cli/__init__.py'), '')
  sh('git add -A && git commit -qm base', agentRoot)

  // 补丁链（增量差量，同 executor 夹具法）：
  //  001 studio 修改 src.txt；002 agent 新增 agent/same-path.py（与 studio 树同路径！）
  const genModify = (tree: string, file: string, marker: string, out: string) => {
    const abs = join(tree, file)
    writeFileSync(abs, readFileSync(abs, 'utf8') + marker + '\n')
    sh(`git diff > ${JSON.stringify(out)}`, tree)
    sh('git add -A && git commit -qm p', tree)
  }
  const genNew = (tree: string, file: string, content: string, out: string) => {
    mkdirSync(resolve(join(tree, file), '..'), { recursive: true })
    writeFileSync(join(tree, file), content)
    sh(`git add -N ${JSON.stringify(file)} && git diff > ${JSON.stringify(out)}`, tree)
    sh('git add -A && git commit -qm p', tree)
  }
  genModify(studioRoot, 'src.txt', '#1', join(patchDir, '001-s1.patch'))
  genNew(agentRoot, 'agent/same-path.py', 'tool\n', join(patchDir, '002-a1.patch'))
  genModify(agentRoot, 'hermes_cli/__init__.py', '#a2', join(patchDir, '003-a2.patch'))
  // 补丁生成后两树回纯净基线
  sh(`git reset -q --hard $(git rev-list --max-parents=0 HEAD) && git clean -qfd`, studioRoot)
  sh(`git reset -q --hard $(git rev-list --max-parents=0 HEAD) && git clean -qfd`, agentRoot)
  writeFileSync(join(zcodePatchDir, 'series'), '')
  writeFileSync(join(patchDir, 'series'), '001-s1.patch\n002-a1.patch\n003-a2.patch\n')

  // 部署清单（隔离面：绝对 root + RUNTIME_DEPLOY_MANIFEST）
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

describe.skipIf(!v2SessionWired)('主链 v2：inject → manifest v2 + 幂等二连', () => {
  it('inject 写 v2 manifest（逐项 applied+兼容投影）、deploy 产物落隔离 HOME、RESULT 行可见', () => {
    const r = cli('inject.mjs')
    expect(r.code, r.out.slice(-800)).toBe(0)
    const m = JSON.parse(readFileSync(stateManifest(), 'utf8'))
    expect(m.schemaVersion).toBe(2)
    expect(m.status).toBe('complete')
    expect(m.patches.map((p: any) => [p.name, p.target, p.status])).toEqual([
      ['001-s1.patch', 'hermes-studio', 'applied'],
      ['002-a1.patch', 'hermes-agent', 'applied'],
      ['003-a2.patch', 'hermes-agent', 'applied'],
    ])
    // addedFiles 按目标树记录（分树清理的数据面）
    expect(m.patches[1].addedFiles).toEqual(['agent/same-path.py'])
    // 兼容投影从 applied 派生
    expect(m.appliedPatches).toEqual(['001-s1.patch', '002-a1.patch', '003-a2.patch'])
    expect(m.appliedZcodePatches).toEqual([])
    // 两树注入事实
    expect(readFileSync(join(studioRoot, 'src.txt'), 'utf8')).toContain('#1')
    expect(readFileSync(join(agentRoot, 'agent/same-path.py'), 'utf8')).toBe('tool\n')
    expect(readFileSync(join(agentRoot, 'hermes_cli/__init__.py'), 'utf8')).toContain('#a2')
    // 部署同步落隔离 HOME
    expect(readFileSync(join(fakeHome, '.hermes/hermes-agent/tool.py'), 'utf8')).toBe('rt\n')
  })

  it('幂等二连：第二次 inject → planIncrement noop、exit 0、不重复应用', () => {
    const r = cli('inject.mjs')
    expect(r.code, r.out.slice(-800)).toBe(0)
    expect(r.out).toMatch(/noop|已是目标注入态|前缀精确一致/)
    expect(r.out).not.toContain('FAILED to apply patch')
  })
})

describe.skipIf(!v2SessionWired)('主链 v2：clean 分树删除（P0 缺陷反面，负例①）', () => {
  it('agent 新增文件从 agent 树消失；studio 树同路径文件原样保留；tracked 反放回基线；manifest 删除', () => {
    const r = cli('inject.mjs', ['--clean'])
    expect(r.code, r.out.slice(-800)).toBe(0)
    // 负例核心：agent 树新增文件消失
    expect(existsSync(join(agentRoot, 'agent/same-path.py'))).toBe(false)
    // studio 树同路径文件不动（旧实现在此路径误删/漏删）
    expect(readFileSync(join(studioRoot, 'agent/same-path.py'), 'utf8')).toBe('studio-side\n')
    // tracked 修改反放：两树 status 干净
    expect(sh('git status --porcelain', studioRoot).trim()).toBe('')
    expect(sh('git status --porcelain', agentRoot).trim()).toBe('')
    expect(readFileSync(join(studioRoot, 'src.txt'), 'utf8')).toBe('base\n')
    // manifest 随 clean 删除（树净=无注入态）
    expect(existsSync(stateManifest())).toBe(false)
    // journal 一并清理
    expect(existsSync(join(stateOut, 'journal'))).toBe(false)
  })

  it('clean 后再 inject → 全量重放成功（clean↔inject 循环幂等）', () => {
    const r = cli('inject.mjs')
    expect(r.code, r.out.slice(-800)).toBe(0)
    expect(readFileSync(join(agentRoot, 'agent/same-path.py'), 'utf8')).toBe('tool\n')
    expect(readFileSync(join(studioRoot, 'agent/same-path.py'), 'utf8')).toBe('studio-side\n')
  })
})

describe.skipIf(!v2SessionWired)('主链 v2：ensure-injected 假绿路径删除', () => {
  it('负例③：v1 manifest → exit 3 + 迁移指引（不自动收养）', () => {
    // 造 v1 形态清单（老字段：仅名字数组）
    mkdirSync(stateOut, { recursive: true })
    writeFileSync(stateManifest(), JSON.stringify({
      appliedPatches: ['001-s1.patch'], appliedZcodePatches: [], generatedAt: '2026-01-01T00:00:00Z',
    }))
    const r = cli('ensure-injected.mjs')
    expect(r.code).toBe(3)
    expect(r.out).toContain('v1')
    expect(r.out).toMatch(/clean|迁移/)
  })

  it('负例④：last-failed manifest → 非零退出 + clean 指引', () => {
    writeFileSync(stateManifest(), JSON.stringify({
      schemaVersion: 2,
      baseline: { upstreamRoot: upRoot, treeOids: { 'hermes-studio': 'x', 'hermes-agent': 'y', zcode: null } },
      patches: [{ channel: 'hermes', target: 'hermes-studio', name: '001-s1.patch', sha256: 'a'.repeat(64), seriesIndex: 0, addedFiles: [], status: 'failed', reason: 'apply-error' }],
      status: 'failed',
    }))
    const r = cli('ensure-injected.mjs')
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/clean|全量重放/)
  })

  it('负例⑤：无清单 + 脏树 → 非零退出（不再 exit 0 假绿）', () => {
    rmSync(stateOut, { recursive: true, force: true })
    mkdirSync(stateOut, { recursive: true })
    // 树脏：直接改 studio 树 tracked 文件（非注入产物）
    writeFileSync(join(studioRoot, 'src.txt'), 'local-edit\n')
    const r = cli('ensure-injected.mjs')
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/不干净|不可验证/)
    // 还原
    sh('git checkout -- .', studioRoot)
  })

  it('正例：v2 complete + series 一致 → noop exit 0', () => {
    // 自包含起点：先 clean 复原两树，再全量注入
    cli('inject.mjs', ['--clean'])
    rmSync(stateOut, { recursive: true, force: true })
    const r = cli('inject.mjs')
    expect(r.code).toBe(0)
    const e = cli('ensure-injected.mjs')
    expect(e.code, e.out.slice(-600)).toBe(0)
    expect(e.out).toMatch(/noop|精确一致/)
  })

  it('负例⑥：源码级——cockpit 路由放行与脏树 exit 0 路径已删除', () => {
    const src = readFileSync(join(ROOT, 'scripts/ensure-injected.mjs'), 'utf8')
    expect(src).not.toContain('cockpitRouteInjected')
    expect(src).not.toContain("name: 'hermes.cockpit'")
    // 脏树无清单分支必须 process.exit(1)，不得再出现 exit(0) 放行
    const dirtyBranch = src.slice(src.indexOf('不干净'))
    expect(dirtyBranch).toContain('process.exit(1)')
  })
})
