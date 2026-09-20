// overlay/custom/client/__tests__/ia2-i18n-coverage.test.ts
// 守门：custom 组件里所有静态 'ia2.*' 文案键必须在 zh/en 词表中存在。
// 模式沿用 kanban-i18n-coverage.test.ts（2026-09-20 patch 324/325 先例）：
// v12.3 驾驶舱重构新增键多（通知下拉/会话工作台面板四块/栏控/左栏聚类），
// 组件在测试里 t→key 直返看不出缺键，装机后中文界面静默回退英文——本测试防复发。
// 动态键（t(`ia2.${x}`) 模板串）不在静态扫描范围，维持既有豁免。
// 补键流程：改 upstream locales/zh.ts + en.ts → 存为 overlay patches/3xx patch →
// npm run inject 重注入（upstream 目录禁止直改落盘，patch 是唯一正本）。
import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en'
import zh from '@/i18n/locales/zh'
import { buildIaRoutes } from '../ia2/routes'
import type { RouteRecordRaw } from 'vue-router'

type Messages = Record<string, unknown>

const components = import.meta.glob('../**/*.{vue,ts}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** 路由名集合（ia2.* 命名空间与词表同前缀但语义不同：跳转目标非文案）。
 *  buildIaRoutes 的 component 均为懒加载工厂，调用不触发组件加载。 */
function collectRouteNames(): Set<string> {
  const names = new Set<string>()
  const walk = (records: RouteRecordRaw[]): void => {
    for (const r of records) {
      if (typeof r.name === 'string' && r.name.startsWith('ia2.')) names.add(r.name.slice(4))
      if (r.children) walk(r.children)
    }
  }
  walk(buildIaRoutes())
  return names
}

function collectUsedKeys(): Map<string, string[]> {
  const used = new Map<string, string[]>()
  const pattern = /['"`]ia2\.([A-Za-z0-9_.-]+)['"`]/g
  for (const [file, source] of Object.entries(components)) {
    if (file.includes('__tests__')) continue
    let m: RegExpExecArray | null
    while ((m = pattern.exec(source)) !== null) {
      // 非文案语境豁免：路由跳转目标（name:）/路由名 switch（case）/存储键常量
      //（const KEY_* =）——三者均与词表无关，误报会逼着往 locale 里塞假键
      const before = source.slice(Math.max(0, m.index - 48), m.index)
      // name: 后到字面量之间允许三元条件（name: prefix === 'x' ? 'ia2.…'）
      if (/name\s*:[^'"\n]*$/.test(before)) continue
      if (/case\s+$/.test(before)) continue
      if (/KEY_[A-Z_]*\s*=\s*$/.test(before)) continue
      const list = used.get(m[1]) ?? []
      list.push(file)
      used.set(m[1], list)
    }
  }
  return used
}

function resolveKey(messages: Messages, dotted: string): unknown {
  let cur: unknown = messages
  for (const part of dotted.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Messages)[part]
  }
  return cur
}

describe('ia2 i18n 覆盖守门（驾驶舱组件静态键零缺漏）', () => {
  it("zh 与 en 词表覆盖全部静态 'ia2.*' 引用", () => {
    const routeNames = collectRouteNames()
    const used = new Map([...collectUsedKeys()].filter(([k]) => !routeNames.has(k)))
    expect(used.size).toBeGreaterThan(150)
    const gaps: string[] = []
    for (const [key, files] of used) {
      for (const [locale, messages] of [['zh', zh], ['en', en]] as const) {
        const resolved = resolveKey(messages as Messages, `ia2.${key}`)
        if (typeof resolved !== 'string') {
          gaps.push(`[${locale}] ia2.${key} (used in ${files[0]})`)
        }
      }
    }
    expect(gaps, `以下 ia2 键缺失（补齐走 overlay patch 328+ 同款追加流程）：\n${gaps.join('\n')}`).toEqual([])
  })
})
