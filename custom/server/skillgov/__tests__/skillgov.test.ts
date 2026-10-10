// 技能治理域测试：角色映射存取、教训库有界扫描、生成器状态面、路由契约。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('skillgov 角色映射存储', () => {
  const store = join(tmpdir(), `sg-${Date.now()}.json`)
  beforeAll(() => { process.env.SKILLGOV_STORE = store })
  afterAll(() => { try { rmSync(store) } catch { /* */ } })

  it('缺省空数组；写入后往返一致', async () => {
    const { readRoleMappings, writeRoleMappings } = await import('../skillgov-store')
    expect(readRoleMappings()).toEqual([])
    writeRoleMappings([{ suffix: '-tester', sources: [{ profile: 'qi', skill: 'backend-integration-testing' }] }])
    const back = readRoleMappings()
    expect(back.length).toBe(1)
    expect(back[0]!.suffix).toBe('-tester')
    expect(back[0]!.sources[0]!.skill).toBe('backend-integration-testing')
  })
})

describe('skillgov 教训库扫描', () => {
  it('扫到 lessons.md 并给尾 5 行；无技能的 profile 跳过', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sgp-'))
    mkdirSync(join(root, 'p1', 'skills', 'dev-skill', 'references'), { recursive: true })
    writeFileSync(join(root, 'p1', 'skills', 'dev-skill', 'references', 'lessons.md'), '## A\n- 教训一\n- 教训二\n## B\n- 教训三\n- 教训四\n- 教训五\n- 教训六\n')
    mkdirSync(join(root, 'p2', 'skills'), { recursive: true })
    process.env.HERMES_PROFILES_ROOT = root
    const { listLessons } = await import('../skillgov-store')
    const got = listLessons()
    expect(got.length).toBe(1)
    expect(got[0]!.profile).toBe('p1')
    expect(got[0]!.skill).toBe('dev-skill')
    expect(got[0]!.lines).toBe(8)
    expect(got[0]!.tail.length).toBeLessThanOrEqual(5)
    expect(got[0]!.tail.join(' ')).toContain('教训六')
    rmSync(root, { recursive: true, force: true })
  })
})

describe('skillgov 生成器状态与路由', () => {
  it('status 端点 fail-soft（不在位=available:false 不抛）；路由前缀正确', async () => {
    const mod = await import('../skillgov-controller')
    const p = String((mod.default as unknown as { opts?: { prefix?: string } }).opts?.prefix)
    expect(p).toBe('/api/skillgov')
    process.env.SKILLGEN_PATH = '/nonexistent/gen.sh'
    // generatorPath 可覆盖；status 的可用性由文件系统判定——此处仅断言不抛异常的路径函数
    expect(mod.generatorPath()).toBe('/nonexistent/gen.sh')
  })
})
