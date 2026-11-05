import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const root = resolve(__dirname, '../..')
const manifestScript = resolve(root, 'scripts/regression/route-manifest.ts')

describe('全功能路由清单生成器', () => {
  it('从真实注册链发现页面、重定向、专题和全部阶段页签', () => {
    expect(existsSync(manifestScript), 'route-manifest.ts 必须存在').toBe(true)
    const result = spawnSync(process.execPath, [
      resolve(root, 'node_modules/vite-node/vite-node.mjs'),
      '--config', resolve(root, 'vitest.config.ts'),
      manifestScript,
    ], { cwd: root, encoding: 'utf8', timeout: 60_000 })
    expect(result.status, result.stderr || result.stdout).toBe(0)
    const manifest = JSON.parse(result.stdout)
    const names = manifest.routes.map((r: any) => r.name)
    expect(names).toEqual(expect.arrayContaining([
      'matrix.client', 'matrix.clientRoom', 'ide.shell',
      'ia2.eval', 'ia2.bpa', 'ia2.ontology', 'ia2.skillgov',
    ]))
    // 37 个阶段页签=STAGE_TABS 实数（分布 ①6/②4/③4/④5/⑤6/⑥12；第 37 项=⑥proactivity，
    // 2026-10-26 主动性治理页签批）；sim/map 是推演壳层独立页路由，不占阶段页签位
    expect(manifest.stageTabs).toHaveLength(37)
    expect(new Set(names.filter(Boolean)).size).toBe(names.filter(Boolean).length)
    expect(manifest.routes.every((r: any) => r.visitPath && !r.visitPath.includes('/:'))).toBe(true)
    expect(manifest.routes.every((r: any) => r.kind === 'page' || r.kind === 'redirect')).toBe(true)
    expect(manifest.counts.visitStates).toBe(manifest.routes.length + manifest.stageTabs.length)
  })

  // 2026-11-04 Windows 离线回归批固化判定口径：expect 字段四类枚举 + 声明路由真实在册
  it('expect 声明面只使用合法枚举且声明的路由/页签真实存在', () => {
    const LEGAL = ['roleGate', 'failClosed', 'negative404', 'offline']
    const result = spawnSync(process.execPath, [
      resolve(root, 'node_modules/vite-node/vite-node.mjs'),
      '--config', resolve(root, 'vitest.config.ts'),
      manifestScript,
    ], { cwd: root, encoding: 'utf8', timeout: 60_000 })
    expect(result.status, result.stderr || result.stdout).toBe(0)
    const manifest = JSON.parse(result.stdout)
    const routeNames = new Set(manifest.routes.map((r: any) => r.name))
    const tabNames = new Set(manifest.stageTabs.map((t: any) => t.name))
    for (const entry of [...manifest.routes, ...manifest.stageTabs]) {
      const expectList: string[] = Array.isArray(entry.expect) ? entry.expect : []
      expect(expectList.every(e => LEGAL.includes(e)), `${entry.name} expect 含非法枚举`).toBe(true)
      if (expectList.length > 0) {
        expect(routeNames.has(entry.name) || tabNames.has(entry.name), `${entry.name} 不在册却带 expect`).toBe(true)
      }
    }
    // 口径锚点：回归定谳的 4 个声明必须存在（settings 角色门/sim 族 fail-closed/
    // loop 负向 404/govern 页签 fail-closed）
    expect(manifest.routes.find((r: any) => r.name === 'hermes.settings')?.expect).toContain('roleGate')
    expect(manifest.routes.find((r: any) => r.name === 'ia2.sim')?.expect).toContain('failClosed')
    expect(manifest.routes.find((r: any) => r.name === 'ia2.loopCanvas')?.expect).toContain('negative404')
    expect(manifest.stageTabs.find((t: any) => t.name === 'ia2.stage6')?.expect).toContain('failClosed')
  })

  it('浏览器走查默认使用当前开发端口，WALK_BASE 仍可覆盖', async () => {
    const { BASE } = await import('./harness.mjs')
    expect(BASE).toBe('http://localhost:8649')
  })

  // P2 Task 3 集成例：真注册链输出 → 文档投影生成器 --check 对真仓手册对账绿。
  // 手册 marker 块与真实路由集任何漂移（路由增删/计数/版本）在此非零。
  it('真链投影与培训手册 marker 块一致（docs:check 同口径对账）', () => {
    const result = spawnSync(process.execPath, [
      resolve(root, 'node_modules/vite-node/vite-node.mjs'),
      '--config', resolve(root, 'vitest.config.ts'),
      manifestScript,
    ], { cwd: root, encoding: 'utf8', timeout: 60_000 })
    expect(result.status, result.stderr || result.stdout).toBe(0)
    const tmpManifest = resolve(tmpdir(), `route-manifest-docs-${Date.now()}.json`)
    const { writeFileSync, rmSync } = require('node:fs') as typeof import('node:fs')
    writeFileSync(tmpManifest, result.stdout)
    try {
      const check = spawnSync(process.execPath, [
        resolve(root, 'scripts/platform/docs/sync-training-docs.mjs'), '--check',
      ], {
        cwd: root, encoding: 'utf8', timeout: 60_000,
        env: { ...process.env, DOCS_PROJECTION_MANIFEST_FILE: tmpManifest },
      })
      expect(check.status, check.stdout + check.stderr).toBe(0)
    } finally {
      rmSync(tmpManifest, { force: true })
    }
  })
})
