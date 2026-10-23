// overlay/custom/client/ia2/__tests__/director-tech-default.test.ts
// 守门：六闸仪/26 步执行表默认可见（2026-10-24 用户裁定「恢复」，方案 F4/F7/F27）。
// 源码字面量断言模式（同 attention-strip.test.ts 守 max-width 的先例）——
// showTechnical 默认值回 false 会让运行总览再次藏进开关后，当场抓住。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const FILE = resolve(__dirname, '../views/sim/DirectorPanel.vue')

describe('DirectorPanel — 技术详情默认展开（方案完备性恢复）', () => {
  it('showTechnical 默认 true（26 步表/交付物/六道质量门不藏开关后）', () => {
    const src = readFileSync(FILE, 'utf-8')
    expect(src).toContain('const showTechnical = ref(true)')
    expect(src).not.toContain('const showTechnical = ref(false)')
  })
})

describe('EvidencePanel — 推演报告查看入口（方案 F32 恢复）', () => {
  it('有 run 时渲染报告链接（服务端 /report 透传，新窗打开）', () => {
    const src = readFileSync(resolve(__dirname, '../views/sim/EvidencePanel.vue'), 'utf-8')
    expect(src).toContain('data-testid="ev-report-link"')
    expect(src).toContain('/api/hermes/sim/report/')
  })
})
