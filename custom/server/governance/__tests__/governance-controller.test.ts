// 治理中心 API 守门（补功能主清单 2026-09-28）：
// ① overview 返回六闸工件清单（kind/路径/标题/闸归属）+ git 元数据
// ② 真仓环境下 freeze（G1 冻结）exists:true 且含 commit 锚点；未提交工件如实 exists:false
// ③ doc?kind= 返回 markdown 全文（含 frozen:true 字样）；未知 kind / 缺失工件 404（不编造）
// 仓根用临时 git 仓（GOVERNANCE_REPO 注入），不依赖推演仓在场——测试自包含。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import type { AddressInfo } from 'net'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'child_process'

const repo = mkdtempSync(join(tmpdir(), 'gov-repo-'))

function git(args: string[]) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
}

let base = ''

beforeAll(async () => {
  git(['init', '-b', 'main'])
  git(['config', 'user.email', 't@t'])
  git(['config', 'user.name', 't'])
  mkdirSync(join(repo, 'docs/requirements'), { recursive: true })
  writeFileSync(join(repo, 'docs/requirements/RFD-001.freeze.md'),
    '# RFD-001 G1 冻结标记\n\nAC-1 下单幂等：可判定\n\nfrozen: true\n')
  git(['add', '-A'])
  git(['commit', '-m', 'freeze'])
  git(['remote', 'add', 'origin', repo])
  git(['update-ref', 'refs/remotes/origin/main', 'HEAD'])

  process.env.GOVERNANCE_REPO = repo
  const { governanceRoutes } = await import('../governance-controller')
  const app = new Koa()
  app.use(governanceRoutes.routes())
  const server = createServer(app.callback())
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  afterAll(() => {
    server.close()
    rmSync(repo, { recursive: true, force: true })
  })
})

async function get(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}${path}`)
  return { status: res.status, body: await res.json() }
}

describe('治理中心 REST（/api/governance）', () => {
  it('overview 列出六闸工件清单并带 git 元数据', async () => {
    const { status, body } = await get('/api/governance/overview')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.repoReady).toBe(true)
    const kinds: string[] = body.docs.map((d: any) => d.kind)
    for (const k of ['freeze', 'design', 'schedule', 'test', 'release', 'uat', 'audit', 'retro']) {
      expect(kinds).toContain(k)
    }
    const freeze = body.docs.find((d: any) => d.kind === 'freeze')
    expect(freeze.exists).toBe(true)
    expect(freeze.commit).toMatch(/^[0-9a-f]{7,}$/)
    expect(freeze.committedAt).toBeTruthy()
    expect(freeze.gate).toBe('G1')
    // 未提交的工件如实 exists:false（不编造）
    const retro = body.docs.find((d: any) => d.kind === 'retro')
    expect(retro.exists).toBe(false)
  })

  it('doc?kind=freeze 返回 markdown 全文（含 frozen:true）', async () => {
    const { status, body } = await get('/api/governance/doc?kind=freeze')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.title).toContain('G1')
    expect(body.markdown).toContain('frozen: true')
    expect(body.commit).toMatch(/^[0-9a-f]{7,}$/)
  })

  it('未知 kind 404；缺失工件 404', async () => {
    expect((await get('/api/governance/doc?kind=nope')).status).toBe(404)
    expect((await get('/api/governance/doc?kind=retro')).status).toBe(404)
  })
})
