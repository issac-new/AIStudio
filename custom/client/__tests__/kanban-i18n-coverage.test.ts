import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en'
import zh from '@/i18n/locales/zh'

// 守门：custom 组件里所有静态 t('kanban.*') 引用必须在 zh/en 词表中存在。
// 背景：组件模板带内联英文兜底（t('kanban.x', 'English')），键缺失时中文界面静默
// 显示英文（2026-09-20 实测 zh 缺 150 / en 缺 146，patch 324/325 补齐）。本测试防复发。
// 动态键（t(`kanban.${x}`)）不在静态扫描范围内，维持既有豁免。

type Messages = Record<string, unknown>

const components = import.meta.glob('../**/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function collectUsedKeys(): Map<string, string[]> {
  const used = new Map<string, string[]>()
  const pattern = /['"`]kanban\.([A-Za-z0-9_.-]+)['"`]/g
  for (const [file, source] of Object.entries(components)) {
    if (file.includes('__tests__')) continue
    let m: RegExpExecArray | null
    while ((m = pattern.exec(source)) !== null) {
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

describe('kanban i18n 覆盖守门（自定义组件静态键零缺漏）', () => {
  it("zh 与 en 词表覆盖全部静态 t('kanban.*') 引用", () => {
    const used = collectUsedKeys()
    expect(used.size).toBeGreaterThan(100)
    const gaps: string[] = []
    for (const [key, files] of used) {
      for (const [locale, messages] of [['zh', zh], ['en', en]] as const) {
        const resolved = resolveKey(messages as Messages, `kanban.${key}`)
        if (typeof resolved !== 'string') {
          gaps.push(`[${locale}] ${key} (used in ${files[0]})`)
        }
      }
    }
    expect(gaps, `以下 kanban 键缺失（补齐请走 overlay patch 324/325 同款追加流程）：\n${gaps.join('\n')}`).toEqual([])
  })
})
