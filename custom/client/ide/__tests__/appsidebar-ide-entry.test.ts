// overlay/custom/client/ide/__tests__/appsidebar-ide-entry.test.ts
// 守门（V5 补遗⑤ 后口径）：主侧栏一级入口仅「驾驶舱」+系统折叠组——IDE 一级
// 入口已随 M2 移除（IDE 归一 /app/ide 子页面），系统组三入口（技能用量/主题/
// 宠物商店）已随 S1 摘除。
//
// 断言对象改为本仓 patch 文件（脱离共享注入树——注入态与检出分支不保证同步，
// 读共享树会随并行 clean/inject 翻树假红/假绿；2026-09-29 驾驶舱聚焦轮实测）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')

function readPatch(name: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, 'patches', name), 'utf8')
}

describe('AppSidebar 单一级入口守门（⑤ M2/S1 后口径，patch 072/519）', () => {
  const p072 = readPatch('072-cockpit-packages_client_src_components_layout_AppSidebar.vue.patch')
  // 519 残体文件已随 2026-10-04 patches 卫生清理删除（series 退役注记保留史实），
  // 本测试只依赖 072 整文件版与 series 注记，不再读取 519 文件。

  it('双栏根治（aa3e0bbe 用户裁定，压过 M2 旧口径）：IDE 一级入口在位——072 含 ide.shell 与高亮', () => {
    // M2 曾裁 "IDE 一级入口移除"；2026-09-30 双栏根治翻案为 驾驶舱+IDE 双入口，
    // unified-nav-guard（patch 299 守门）为现行口径，本用例对齐翻案后事实。
    expect(p072).toContain(`:to="{ name: 'ide.shell' }"`)
    expect(p072).toContain('isIdeShellArea')
  })

  it('驾驶舱唯一一级入口在位（ia2.collab）+ 系统折叠组结构不变', () => {
    expect(p072).toContain(`:to="{ name: 'ia2.collab' }"`)
    expect(p072).toContain('sidebar-system-toggle')
    expect(p072).toContain('sidebar-system-items')
  })

  it('S1：系统组三入口摘除——2026-10-01 0.7.26 迁移后 S1 语义折入 072 整文件版', () => {
    // 迁移口径：519 退役（series 注记在案），S1 收缩效果在 072 重生成版内验证——
    // 应用后态（+/上下文行）三名不在数组、入口块删除以 072 无三名路由链接为准。
    const after = p072.split('\n').filter(l => (l.startsWith('+') || l.startsWith(' ')) && l.includes('"hermes.'))
    const joined = after.join('\n')
    expect(joined).not.toContain('hermes.skillsUsage')
    expect(joined).not.toContain('hermes.theme')
    expect(joined).not.toContain('hermes.petdex')
    expect(joined).toContain('"hermes.logs"')
    expect(joined).toContain('"hermes.settings"')
    // 只看补丁后态（+ 行）：基线全文在 - 侧，含三名属预期（迁移前原版）
    const linked = p072.split('\n').filter(l => l.startsWith('+') && l.includes(':to=')).join('\n')
    for (const name of ['hermes.skillsUsage', 'hermes.theme', 'hermes.petdex']) {
      expect(linked.includes(`:to="{ name: '${name}' }"`), name).toBe(false)
    }
  })

  it('series 登记：519/520 在列（0.7.26 迁移后口径：519 退役注记亦算在列）', () => {
    const s = readFileSync(resolve(OVERLAY_ROOT, 'patches', 'series'), 'utf8')
    expect(s).toContain('519-client-appsidebar-system-trim.patch')
    expect(s).toContain('520-client-webpet-off.patch')
  })
})
