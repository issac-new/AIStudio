import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// 评审锚钉根治件守门（2026-11-05 run27 G2 两连熔断）：派单后评审回合曾读本地
// 未 fetch 旧稿判错轮。本组断言钉锚脚本的三态语义：钉成（内容=锚版）／幂等放行
// （锚空、非 git 仓）／锚路径缺席=exit 1 记障。
const HARNESS = join(__dirname, '..')
const FIX = join(HARNESS, 'tests', 'fixtures', 'anchor-pin')
const PIN = join(HARNESS, 'mux', 'mx-pin-review-object.sh')
let origin = ''
let ws = ''

function run(cmd: string, cwd?: string) {
  return execSync(cmd, { cwd, encoding: 'utf8', shell: '/bin/bash' })
}

beforeAll(() => {
  rmSync(FIX, { recursive: true, force: true })
  origin = join(FIX, 'origin.git')
  ws = join(FIX, 'ws')
  // 远端仓：两版 docs/design/app.md（v1 缺项 / v2 修订）
  run(`git init --bare -q ${JSON.stringify(origin)}`)
  const seed = join(FIX, 'seed')
  mkdirSync(join(seed, 'docs/design'), { recursive: true })
  run('git init -q . && git config user.email t@t && git config user.name t', seed)
  writeFileSync(join(seed, 'docs/design/app.md'), 'v1 缺项版\n', 'utf8')
  run('git add -A && git commit -qm v1 && git remote add origin ' + JSON.stringify(origin) + ' && git push -q origin master', seed)
  writeFileSync(join(seed, 'docs/design/app.md'), 'v2 修订版（缺项全闭合）\n', 'utf8')
  run('git add -A && git commit -qm v2 && git push -q origin master', seed)
  // 评审人工作区：clone 停在 v1（模拟未 fetch 旧稿）
  run(`git clone -q ${JSON.stringify(origin)} ${JSON.stringify(ws)} && git -C ${JSON.stringify(ws)} checkout -q HEAD~1`)
})

afterAll(() => rmSync(FIX, { recursive: true, force: true }))

describe('mx-pin-review-object 钉锚三态', () => {
  it('钉成：工作区文件内容=锚版（v2）而非本地旧版（v1）', () => {
    const headV1 = run(`git -C ${JSON.stringify(ws)} rev-parse --short=7 HEAD`).trim()
    // 先取远端新提交进对象库（脚本自身 fetch，这里预热断言用）
    run(`git -C ${JSON.stringify(ws)} fetch -q origin`)
    const sha = run(`git -C ${JSON.stringify(ws)} rev-parse --short=7 origin/master`).trim()
    expect(sha).not.toBeNull()
    const r = spawnSync('bash', [PIN, ws, sha, 'docs/design/app.md'], { encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('钉锚')
    const content = run(`cat ${JSON.stringify(join(ws, 'docs/design/app.md'))}`).trim()
    expect(content).toContain('v2 修订版')
    expect(content).not.toContain('v1 缺项版')
    expect(headV1).not.toBe(sha)
  })

  it('幂等放行：锚空 / 非 git 仓 → exit 0 且带 SKIP 字样', () => {
    const a = spawnSync('bash', [PIN, ws, '', 'docs/design/app.md'], { encoding: 'utf8' })
    expect(a.status).toBe(0)
    expect(a.stdout).toContain('SKIP')
    const b = spawnSync('bash', [PIN, join(FIX, 'not-a-repo'), 'abc1234', 'docs/design/app.md'], { encoding: 'utf8' })
    expect(b.status).toBe(0)
    expect(b.stdout).toContain('SKIP')
  })

  it('记障：锚:路径不存在于对象库 → exit 1', () => {
    const r = spawnSync('bash', [PIN, ws, '0000000', 'docs/design/absent.md'], { encoding: 'utf8' })
    expect(r.status).toBe(1)
    expect(r.stdout).toContain('钉锚 FAIL')
  })
})
