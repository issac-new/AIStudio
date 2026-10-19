// overlay/custom/client/ia2/__tests__/tab-intros-gate.test.ts
// 页签导语守门（2026-10-19 P3）：
// ① 已退场导语键不得复活——交付/追溯已迁到⑤验收阶段页，推演区只剩四签；
// ② SimCenterView 的 INTRO_KEY 每个值必须在 zh/en 两份字典里存在（缺键=英文裸键）；
// ③ 静态字面量 <TabIntroBanner tab="x"> 的键必须存在（拼写漂移当场红）。
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { TAB_INTROS } from '../i18n-tab-intros'

const IA2_ROOT = resolve(__dirname, '..')

function walkVue(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__tests__') continue
      out.push(...walkVue(p))
    } else if (name.endsWith('.vue')) {
      out.push(p)
    }
  }
  return out
}

describe('页签导语字典守门', () => {
  it('退场键 sim-delivery/sim-trace 不再存在（zh/en 同）', () => {
    for (const locale of ['zh', 'en'] as const) {
      expect(TAB_INTROS[locale]).not.toHaveProperty('sim-delivery')
      expect(TAB_INTROS[locale]).not.toHaveProperty('sim-trace')
    }
  })

  it('SimCenterView 的 INTRO_KEY 四值在 zh/en 都有导语', () => {
    const src = readFileSync(resolve(IA2_ROOT, 'views/sim/SimCenterView.vue'), 'utf8')
    const block = src.slice(src.indexOf('const INTRO_KEY'), src.indexOf('}', src.indexOf('const INTRO_KEY')))
    const keys = [...block.matchAll(/:\s*'([^']+)'/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThanOrEqual(4)
    for (const key of keys) {
      expect(TAB_INTROS.zh[key], `zh 缺 ${key}`).toBeTruthy()
      expect(TAB_INTROS.en[key], `en 缺 ${key}`).toBeTruthy()
    }
  })

  it('组件里的静态导语键都存在（动态 :tab 不算）', () => {
    const missing: string[] = []
    for (const file of walkVue(IA2_ROOT)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/<TabIntroBanner[^>]*\s(?<!:)tab="([^"]+)"/g)) {
        const key = m[1]
        if (!TAB_INTROS.zh[key] || !TAB_INTROS.en[key]) missing.push(`${file}: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })
})
