import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
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
    expect(manifest.stageTabs).toHaveLength(36)
    expect(new Set(names.filter(Boolean)).size).toBe(names.filter(Boolean).length)
    expect(manifest.routes.every((r: any) => r.visitPath && !r.visitPath.includes('/:'))).toBe(true)
    expect(manifest.routes.every((r: any) => r.kind === 'page' || r.kind === 'redirect')).toBe(true)
    expect(manifest.counts.visitStates).toBe(manifest.routes.length + manifest.stageTabs.length)
  })

  it('浏览器走查默认使用当前开发端口，WALK_BASE 仍可覆盖', async () => {
    const { BASE } = await import('./harness.mjs')
    expect(BASE).toBe('http://localhost:8649')
  })
})
