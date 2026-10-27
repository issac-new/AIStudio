// A2A 看板归属读模型测试（a2a-board-harness-alignment 挂账清偿批）：
// 正本投影 / fail-soft 缺席 / 解析失败 / 脱敏（账号原值不透出）/ 板级键口径同源。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { domainRegistryPath, loadBoardOwnership, parseBoardOwnership } from '../board-ownership'

let dir: string | null = null
afterEach(() => {
  if (dir) { rmSync(dir, { recursive: true, force: true }); dir = null }
  delete process.env.DOMAIN_REGISTRY_PATH
})

function useFixture(yaml: string): string {
  dir = mkdtempSync(join(tmpdir(), 'board-ownership-'))
  const p = join(dir, 'domain-registry.yaml')
  writeFileSync(p, yaml, 'utf8')
  process.env.DOMAIN_REGISTRY_PATH = p
  return p
}

const SAMPLE = `version: 1
updated: '2026-10-26'
domains:
- domain: swarm
  board: swarm
  profiles:
  - orchestrator
  - worker-coder
  owner_of_domain: orchestrator
  owner_label: 主管
  owner_account_env: BOARD_OWNER_SWARM
- domain: ops
  board: ops
  profiles:
  - ops-devops
  owner_of_domain: ops-devops
  owner_label: null
  target_skill: pending
`

describe('parseBoardOwnership（纯解析）', () => {
  it('正本结构投影：板/团队/负责人标签/账号环境变量名；残缺行跳过', () => {
    const parsed = parseBoardOwnership(SAMPLE)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.updated).toBe('2026-10-26')
    expect(parsed.entries).toHaveLength(2)
    const swarm = parsed.entries[0]!
    expect(swarm.board).toBe('swarm')
    expect(swarm.profiles).toEqual(['orchestrator', 'worker-coder'])
    expect(swarm.ownerLabel).toBe('主管')
    expect(swarm.ownerAccountEnv).toBe('BOARD_OWNER_SWARM')
    const ops = parsed.entries[1]!
    expect(ops.ownerLabel).toBeNull()
    expect(ops.ownerAccountEnv).toBeNull()
    expect(ops.ownerAccountConfigured).toBeNull()
  })

  it('ownerAccountConfigured 只报已配置与否，不透账号原值', () => {
    process.env.BOARD_OWNER_SWARM_TEST = 'should-not-leak'
    try {
      const parsed = parseBoardOwnership(SAMPLE.replace('BOARD_OWNER_SWARM', 'BOARD_OWNER_SWARM_TEST'))
      expect(parsed.ok).toBe(true)
      if (!parsed.ok) return
      expect(parsed.entries[0]!.ownerAccountConfigured).toBe(true)
      // 报告对象整体不含任何账号原值（脱敏门）
      expect(JSON.stringify(parsed)).not.toContain('should-not-leak')
    } finally {
      delete process.env.BOARD_OWNER_SWARM_TEST
    }
  })

  it('yaml 非法/缺 domains 数组 → 解析失败如实（不猜）', () => {
    expect(parseBoardOwnership('{{{').ok).toBe(false)
    expect(parseBoardOwnership('version: 1\nupdated: x\n').ok).toBe(false)
  })
})

describe('loadBoardOwnership（fail-soft 读模型）', () => {
  it('正本缺席 → available:false 带原因与路径', () => {
    process.env.DOMAIN_REGISTRY_PATH = join(tmpdir(), 'definitely-missing-registry.yaml')
    const r = loadBoardOwnership()
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toContain('缺席')
  })

  it('正本在位 → available:true 且 source 指向 env 覆盖路径', () => {
    const p = useFixture(SAMPLE)
    const r = loadBoardOwnership()
    expect(r.available).toBe(true)
    if (r.available) {
      expect(r.source).toBe(p)
      expect(r.entries.length).toBeGreaterThan(0)
    }
  })
})

describe('板级键口径同源（profiles=围栏契约键）', () => {
  it('entries[].profiles 与 board_team_keys.py 的 profiles 键语义一致（registry 即契约键载体）', () => {
    useFixture(SAMPLE)
    const r = loadBoardOwnership()
    expect(r.available).toBe(true)
    if (!r.available) return
    // swarm 板围栏=orchestrator+worker-coder（与 2026-10-26 校正批 board.json profiles 优先口径同源）
    expect(r.entries[0]!.profiles).toContain('orchestrator')
  })

  it('domainRegistryPath 支持 DOMAIN_REGISTRY_PATH 覆盖（测试/部署面）', () => {
    process.env.DOMAIN_REGISTRY_PATH = '/tmp/x.yaml'
    expect(domainRegistryPath()).toBe('/tmp/x.yaml')
  })
})
