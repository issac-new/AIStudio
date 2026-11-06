// 专题开关语义诚实标注守门（2026-11-06 复盘 P0-1）。
// config/features.ts:8-12 的四个开关只门控导航、不卸载路由与端点；用户已裁决保留现名，
// 因此不改名、不删能力，只在未启用页如实告知「入口隐藏 ≠ 能力停用」。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const view = readFileSync(join(ROOT, 'custom/client/ia2/views/FeatureDisabledView.vue'), 'utf8')
const flags = readFileSync(join(ROOT, 'config/features.ts'), 'utf8')

describe('专题未启用页文案', () => {
  it('中英成对声明只隐藏入口、服务端能力仍在线', () => {
    expect(view).toContain('只隐藏导航入口，不关闭服务端能力')
    expect(view).toContain('直接访问此专题的网址或调用对应接口仍然可用')
    expect(view).toContain('server endpoints stay online')
    expect(view).toContain('Direct links and API calls still work')
  })

  it('告知真正停用方式，避免暗示开关已关闭能力', () => {
    expect(view).toContain('须撤下相关补丁或调整服务端配置')
    expect(view).toContain('remove the related patches or change the server configuration')
  })

  it('提示有独立 testid 且使用主题变量，不引入裸色值', () => {
    expect(view).toContain('data-testid="feature-disabled-notice"')
    expect(view).toContain('var(--bg-tertiary)')
    expect(view).toContain('var(--text-secondary)')
    expect(view).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  it('保留用户裁决的开关现名与既有语义（未改名、未删能力）', () => {
    expect(flags).toContain('用户裁决保留现名')
    expect(flags).toContain('VITE_CUSTOM_EVAL')
    expect(flags).toContain('VITE_CUSTOM_BPA')
    expect(flags).toContain('matrixAuth: import.meta.env.VITE_CUSTOM_MATRIX_AUTH')
  })
})
