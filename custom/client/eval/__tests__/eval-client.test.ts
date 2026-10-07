// overlay/custom/client/eval M2 单测：i18n 双语键齐平 + A 类路由注册冒烟。
import { describe, it, expect } from 'vitest'
import { evalMessages } from '@/custom/eval/i18n'
import { registerEval } from '@/custom/eval'
import { getRegisteredRoutes } from '../../../../registries/client'

function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return v && typeof v === 'object' ? keyPaths(v as Record<string, unknown>, path) : [path]
  })
}

describe('eval i18n 双语键齐平', () => {
  it('zh 与 en 键路径完全一致（缺键即 UI 英文兜底裸键）', () => {
    const zh = keyPaths(evalMessages.zh).sort()
    const en = keyPaths(evalMessages.en).sort()
    expect(en).toEqual(zh)
  })
})

describe('eval A 类注册', () => {
  it('registerEval 注册 /app/eval（ia2.eval，fullscreen）', async () => {
    await registerEval()
    const route = getRegisteredRoutes().find((r) => r.name === 'ia2.eval')
    expect(route).toBeDefined()
    expect(route?.path).toBe('/app/eval')
    expect(route?.meta).toMatchObject({ fullscreen: true })
  })
})
