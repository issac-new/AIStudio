// 六域体检引擎守门（2026-09-28：六域必须产品化——检查器判定+台账累积）：
// ① run：六域全跑、每域 verdict+evidence 由真实工件产出，台账 JSONL 追加
// ② get：runs 轮次列表 + latest 最新判定（多轮累积=长期基础数据）
// ③ L0/L1 判定真实性：AC 数量、testlog 全绿字样、缺件 warn/fail（禁止文案式通过）
// ④ patch 490 挂载在案（series 含 490）
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from 'http'
import Koa from 'koa'
import type { AddressInfo } from 'net'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'child_process'

const repo = mkdtempSync(join(tmpdir(), 'gov-audit-'))
let base = ''

function git(args: string[]) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' })
}

beforeAll(async () => {
  git(['init', '-b', 'main']); git(['config', 'user.email', 't@t']); git(['config', 'user.name', 't'])
  // L0 材料：AC≥3 + Scope-Out
  mkdirSync(join(repo, 'docs/requirements'), { recursive: true })
  writeFileSync(join(repo, 'docs/requirements/RFD-001.freeze.md'),
    '# 冻结\nAC-1 幂等\nAC-2 状态机\nAC-3 金额\n范围外：退款分账\n')
  // L1 材料：分支内 testlog 全绿
  mkdirSync(join(repo, 'docs/evidence'), { recursive: true })
  writeFileSync(join(repo, 'docs/evidence/DEV-PAYCORE-testlog.txt'), 'vitest 52/52 全部通过\n渠道端点本地 mock\n')
  git(['add', '-A']); git(['commit', '-m', 'seed'])
  git(['branch', 'feat/DEV-PAYCORE'])

  process.env.GOVERNANCE_REPO = repo
  process.env.HERMES_APPROVALS_LOG_FILE = join(repo, 'approvals-log.json')
  writeFileSync(process.env.HERMES_APPROVALS_LOG_FILE, JSON.stringify([{ ts: 1, id: 'r1', actor: 'wei', targetKind: 'review', targetId: 'x', targetTitle: 't', decision: 'approve', note: '' }]))
  // L3/L5 材料：复盘含打回+DISP、RELEASE 含 SLA
  mkdirSync(join(repo, 'docs/retro'), { recursive: true })
  writeFileSync(join(repo, 'docs/retro/default-RFD-001-retrospective.md'),
    '# 复盘\nREADY-GATE FAIL 打回复审\n| a·b | 已修：xx |\n| c·d | 观察：yy |\n')
  writeFileSync(join(repo, 'RELEASE.md'), '# 发布\n可用性 99.5% P95≤800ms\n')
  // 全部材料入 origin/main（docText 走 ref 读取——未提交件读不到，如实）
  git(['add', '-A']); git(['commit', '-m', 'governance-materials'])
  git(['remote', 'add', 'origin', repo]); git(['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  git(['update-ref', 'refs/remotes/origin/feat/DEV-PAYCORE', 'HEAD'])

  const { governanceRoutes } = await import('../governance-controller')
  const app = new Koa()
  app.use(governanceRoutes.routes())
  const server = createServer(app.callback())
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  afterAll(() => { server.close(); rmSync(repo, { recursive: true, force: true }) })
})

async function get(p: string) { const r = await fetch(base + p); return { status: r.status, body: await r.json() as any } }
async function post(p: string) { const r = await fetch(base + p, { method: 'POST' }); return { status: r.status, body: await r.json() as any } }

describe('六域体检（POST /domains/run + GET /domains）', () => {
  it('run 产出六域判定并落台账（判定源自真实工件，非文案）', async () => {
    const { status, body } = await post('/api/governance/domains/run?run=seed-run')
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    const byDomain: Record<string, any> = {}
    for (const r of body.results) byDomain[r.domain] = r
    expect(body.results).toHaveLength(6)
    // L0：AC 3 条 + Scope-Out → pass，证据含实测数字
    expect(byDomain.L0.verdict).toBe('pass')
    expect(byDomain.L0.evidence.join()).toContain('AC 可判定 3 条')
    // L1：四分支仅 PAYCORE 有全绿 testlog → warn（如实，不粉饰）
    expect(byDomain.L1.verdict).toBe('warn')
    expect(byDomain.L1.evidence.join()).toContain('全绿')
    // L3：审批留痕 1 + 打回在案 → pass
    expect(byDomain.L3.verdict).toBe('pass')
    // L5：DISP 2 行 + RELEASE SLA → pass
    expect(byDomain.L5.verdict).toBe('pass')
    // 台账落盘
    const ledger = readFileSync(join(repo, 'docs/governance/domain-audit.jsonl'), 'utf8').trim().split('\n')
    expect(ledger.length).toBeGreaterThanOrEqual(6)
  })

  it('get 返回轮次列表与 latest（多轮累积可期）', async () => {
    await post('/api/governance/domains/run?run=run-two')
    const { status, body } = await get('/api/governance/domains')
    expect(status).toBe(200)
    expect(body.runs).toEqual(['run-two', 'seed-run'])
    expect(Object.keys(body.latest).sort()).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5'])
    expect(body.total).toBeGreaterThanOrEqual(12)
  })

  it('patch 490 在 series（挂载单一事实源）', async () => {
    const { readFileSync: rf } = await import('node:fs')
    const series = rf('patches/series', 'utf8')
    expect(series).toContain('490-server-governance-mount.patch')
  })
})
