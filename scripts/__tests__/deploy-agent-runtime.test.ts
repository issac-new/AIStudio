// Task 5 守门：deploy-agent-runtime 状态化输出与退出码（P1 部署核心）。
// 负例先行：kept（目标与模板不同、默认保留）必须 partial+exit 2——旧实现
// exit 0 属「保留旧文件仍报告成功」的 P0 实锤缺陷；missing 必须 failed+exit 1；
// 末行 RESULT status= 是机器可读状态面（inject 预检消费）。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const SCRIPT = join(ROOT, 'scripts/deploy-agent-runtime.mjs')

let tmp: string
let srcRoot: string
let dstRoot: string
let manifestPath: string

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'deploy-rt-'))
  srcRoot = join(tmp, 'rt-src')
  dstRoot = join(tmp, 'rt-dst')
  mkdirSync(join(srcRoot, 'sub'), { recursive: true })
  writeFileSync(join(srcRoot, 'same.py'), 'same-content\n')
  writeFileSync(join(srcRoot, 'sub/new.py'), 'fresh\n')
  manifestPath = join(tmp, 'runtime-manifest.json')
  writeFileSync(manifestPath, JSON.stringify({
    root: srcRoot, // 绝对 root：直接采用（测试隔离面）
    target: '~/.hermes/hermes-agent',
    files: [
      { source: 'same.py', dest: 'same.py' },
      { source: 'sub/new.py', dest: 'sub/new.py' },
    ],
  }))
})
afterAll(() => { rmSync(tmp, { recursive: true, force: true }) })

function run(args: string[]) {
  const r = spawnSync('node', [SCRIPT, ...args, '--runtime', dstRoot], {
    env: { ...process.env, RUNTIME_DEPLOY_MANIFEST: manifestPath },
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

describe('deploy-agent-runtime：状态化输出与退出码', () => {
  it('全同 → exit 0 且末行 RESULT status=complete', () => {
    // 第一次 --apply 铺底（fresh copy 不算冲突）
    const first = run(['--apply'])
    expect(first.out.trimEnd().endsWith('RESULT status=complete')).toBe(true)
    expect(first.code).toBe(0)
    // 第二次全同
    const again = run([])
    expect(again.code).toBe(0)
    expect(again.out.trimEnd().endsWith('RESULT status=complete')).toBe(true)
    expect(existsSync(join(dstRoot, 'same.py'))).toBe(true)
  })

  it('负例：kept>0（目标与模板不同，默认保留）→ exit 2、RESULT status=partial、目标不被覆盖', () => {
    writeFileSync(join(dstRoot, 'same.py'), 'host-local-fix\n') // 宿主侧更新的本地修复
    const r = run([])
    expect(r.code).toBe(2)
    expect(r.out.trimEnd().endsWith('RESULT status=partial')).toBe(true)
    expect(r.out).toContain('保留目标')
    expect(readFileSync(join(dstRoot, 'same.py'), 'utf8')).toBe('host-local-fix\n')
  })

  it('负例：kept 状态下 --apply 也不得报 complete（partial 仍 exit 2）', () => {
    const r = run(['--apply'])
    expect(r.code).toBe(2)
    expect(r.out.trimEnd().endsWith('RESULT status=partial')).toBe(true)
    expect(readFileSync(join(dstRoot, 'same.py'), 'utf8')).toBe('host-local-fix\n')
  })

  it('--force 冲突：先备份再覆盖，exit 2/partial（conflict 必须产出 partial 而非成功）', () => {
    const r = run(['--apply', '--force'])
    expect(r.code).toBe(2)
    expect(r.out.trimEnd().endsWith('RESULT status=partial')).toBe(true)
    expect(readFileSync(join(dstRoot, 'same.py'), 'utf8')).toBe('same-content\n')
    const baks = (r.out.match(/same\.py\.bak\.\d+/g) ?? []).length
    expect(baks).toBeGreaterThan(0)
    // 备份文件真实存在且保留宿主旧内容
    const bakOnDisk = spawnSync('bash', ['-c', `ls ${dstRoot}/same.py.bak.* | head -1`], { encoding: 'utf8' }).stdout.trim()
    expect(readFileSync(bakOnDisk, 'utf8')).toBe('host-local-fix\n')
  })

  it('负例：源缺失 → exit 1、RESULT status=failed', () => {
    writeFileSync(manifestPath, JSON.stringify({
      root: srcRoot,
      target: '~/.hermes/hermes-agent',
      files: [{ source: 'ghost.py', dest: 'ghost.py' }],
    }))
    const r = run([])
    expect(r.code).toBe(1)
    expect(r.out.trimEnd().endsWith('RESULT status=failed')).toBe(true)
    expect(r.out).toContain('源缺失')
    // 还原清单供后续
    writeFileSync(manifestPath, JSON.stringify({
      root: srcRoot,
      target: '~/.hermes/hermes-agent',
      files: [
        { source: 'same.py', dest: 'same.py' },
        { source: 'sub/new.py', dest: 'sub/new.py' },
      ],
    }))
  })
})

// worktree 隔离守卫（2026-11-12 设计复盘 P0）：linked worktree 里跑 inject/npm test 时，
// 本脚本默认会把检出 runtime/ 同步到共享宿主树。守卫必须在「有实际写入 + 目标在检出外」
// 时 fail-closed；显式放行或 --runtime 隔离面不拦。CI 在普通克隆上跑，linked 判定用
// RUNTIME_DEPLOY_LINKED_WORKTREE 测试注入面固定（生产路径不读）。
describe('deploy-agent-runtime：worktree 宿主写入隔离', () => {
  // 影子重定向只作用于「默认清单 + 默认宿主目标」。用临时 HOME 保证任何情况下不写真宿主；
  // 自定义清单（RUNTIME_DEPLOY_MANIFEST）本身即既有测试隔离面，不叠加影子。
  const fakeHome = () => join(tmp, 'fake-home')
  const runHost = (extraEnv: Record<string, string> = {}) => {
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: fakeHome(), ...extraEnv }
    delete env.RUNTIME_DEPLOY_MANIFEST
    const r = spawnSync('node', [SCRIPT], { env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
    return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') }
  }

  it('linked worktree 默认目标 → 写入重定向到检出内影子目录（不触宿主）', () => {
    const r = runHost({ RUNTIME_DEPLOY_LINKED_WORKTREE: '1' })
    expect(r.code).toBe(0)
    expect(r.out).toContain('.runtime-deploy-shadow')
    expect(r.out).toContain('RUNTIME_DEPLOY_ALLOW_WORKTREE=1')
    expect(existsSync(join(fakeHome(), '.hermes', 'hermes-agent'))).toBe(false)
  })

  it('显式放行（RUNTIME_DEPLOY_ALLOW_WORKTREE=1）→ 目标恢复为宿主（临时 HOME）', () => {
    const r = runHost({ RUNTIME_DEPLOY_LINKED_WORKTREE: '1', RUNTIME_DEPLOY_ALLOW_WORKTREE: '1' })
    expect(r.code).toBe(0)
    expect(r.out).not.toContain('.runtime-deploy-shadow')
    expect(r.out).toContain(join(fakeHome(), '.hermes', 'hermes-agent'))
  })

  it('非 linked（主检出/普通克隆）→ 不重定向', () => {
    const r = runHost({ RUNTIME_DEPLOY_LINKED_WORKTREE: '0' })
    expect(r.code).toBe(0)
    expect(r.out).not.toContain('.runtime-deploy-shadow')
  })
})
