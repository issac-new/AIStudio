// overlay/custom/client/__tests__/agent-status-caller-whitelist.test.ts
// 守门：普通用户可达界面零调用 /api/agents/status（fetchAgentStatusSnapshot）。
//
// 根因背景（run13 步18 实锤）：status 端点上游挂 requireSuperAdmin（泄漏本地
// 安装 path 等），matrix 登录账号=普通 admin → 403 → 全局「无权限」toast。
// 根治=普通界面一律吃开放端点 availability（fetchAgentAvailabilitySnapshot，
// 587/589 两补丁完成消费面迁移），超管面 AgentManagerView（路由带
// requiresSuperAdmin: true）保留 status 属正当调用。
// 本测试静态扫全客户端源码：新代码再引入 status 直调（且不在白名单）即红。
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const OVERLAY_ROOT = resolve(__dirname, '../../..')
const CLIENT_ROOTS = [
  resolve(OVERLAY_ROOT, '../upstream/hermes-studio/packages/client/src'),
  resolve(OVERLAY_ROOT, 'custom/client'),
]

/** 超管门内或 API 定义自身，允许出现 fetchAgentStatusSnapshot 的文件（相对各自根） */
const WHITELIST = new Set([
  'api/agent-status.ts', // 定义与 availability 双导出
  'views/hermes/AgentManagerView.vue', // 路由 meta.requiresSuperAdmin=true 的超管面
])

function walk(dir: string, base: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules' || name.endsWith('.d.ts')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, base, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(full)
  }
  return out
}

describe('fetchAgentStatusSnapshot 调用方白名单（普通用户面 403 清零守门）', () => {
  it('status 直调仅存在于白名单（超管面/API 定义）', () => {
    const offenders: string[] = []
    for (const root of CLIENT_ROOTS) {
      if (!existsSync(root)) continue
      for (const abs of walk(root, root)) {
        if (WHITELIST.has(abs.slice(root.length + 1))) continue
        const src = readFileSync(abs, 'utf8')
        if (src.includes('fetchAgentStatusSnapshot')) offenders.push(abs)
      }
    }
    expect(offenders, `以下文件直调了超管端点 status（普通用户访问即 403 toast），应改吃 fetchAgentAvailabilitySnapshot：\n${offenders.join('\n')}`).toEqual([])
  })

  it('series 已注册 587+589（消费面迁移双补丁在位）', () => {
    const series = readFileSync(join(OVERLAY_ROOT, 'patches/series'), 'utf8')
    expect(series).toContain('587-agent-status-availability-for-all.patch')
    expect(series).toContain('589-client-agent-status-availability-workflow-linkview.patch')
  })
})
