// 双看板合一守门（495）：/hermes/kanban 深链重定向 /app/board。
// 用真实 vue-router 实例化（上游 router 模块含守卫副作用——devAutoLogin 等，
// 故只加载路由表本身：经 vitest alias '@' 读源码模块不行（副作用），改为
// 源码静态断言 + resolve 语义测试双保险。
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

// 私有上游流程优先（OVERLAY_UPSTREAM_ROOT），否则共享树（与 base-runtimes 守门同口径）
const UPSTREAM = process.env.OVERLAY_UPSTREAM_ROOT
  ? process.env.OVERLAY_UPSTREAM_ROOT + '/hermes-studio/packages/client/src'
  : resolve(__dirname, '../../../../../upstream/hermes-studio/packages/client/src')

describe('495 双看板合一：/hermes/kanban → /app/board', () => {
  it('上游 router 记录为 redirect（非组件挂载）', () => {
    const src = readFileSync(resolve(UPSTREAM, 'router/index.ts'), 'utf8')
    expect(src).toContain(`path: '/hermes/kanban'`)
    const seg = src.slice(src.indexOf("path: '/hermes/kanban'"), src.indexOf("path: '/hermes/kanban'") + 400)
    expect(seg).toContain(`redirect: '/app/board'`)
    expect(seg).not.toContain('KanbanView.vue')
  })

  it('redirect 语义：resolve /hermes/kanban 落 /app/board（ia2.board 存在时）', async () => {
    const routes: RouteRecordRaw[] = [
      { path: '/hermes/kanban', name: 'hermes.kanban', redirect: '/app/board' },
      { path: '/app/board', name: 'ia2.board', component: { template: '<div />' } },
    ]
    const router = createRouter({ history: createWebHistory(), routes })
    await router.push('/hermes/kanban')
    expect(router.currentRoute.value.name).toBe('ia2.board')
    expect(router.currentRoute.value.fullPath).toBe('/app/board')
  })
})
