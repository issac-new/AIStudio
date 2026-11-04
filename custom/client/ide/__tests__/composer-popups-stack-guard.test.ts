// overlay/custom/client/ide/__tests__/composer-popups-stack-guard.test.ts
// 守门（2026-11-04 走查：composer 工具条弹窗「遮罩中断/位置不对/多开叠层」）：
//   1. 三锚根（.ide-chat__effort / .ide-chat__csettings / .ide-perm）is-open 时
//      z-index ≥110——弹层向上弹进 ChatInput 输入区（z-80）地盘，锚根不抬层会被
//      输入区整片盖住（可见残缺+点击落空=遮罩中断）。jsdom 无真实层叠，取源码级
//      断言（docs-ssot-guard / 状态栏裁剪守门同先例）。
//   2. 两组文档级 pointerdown 点外关闭接线在位（互斥由「点对方触发钮=点外」获得）。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const paneSrc = readFileSync(resolve(__dirname, '../views/IdeChatPane.vue'), 'utf8')
const permSrc = readFileSync(resolve(__dirname, '../components/IdePermissionSwitcher.vue'), 'utf8')

describe('composer 弹层抬层守门（is-open z≥110）', () => {
  it('IdeChatPane：思考/⚙ 两锚 is-open 抬层 110', () => {
    const m = /\.ide-chat__effort\.is-open,\s*\n\.ide-chat__csettings\.is-open\s*\{\s*z-index:\s*(\d+)/.exec(paneSrc)
    expect(m, 'is-open 抬层规则缺失（弹层会被输入区 z-80 盖住）').toBeTruthy()
    expect(Number(m![1])).toBeGreaterThanOrEqual(110)
  })

  it('IdeChatPane：模板两锚挂 is-open 绑定', () => {
    expect(paneSrc).toMatch(/class="ide-chat__effort"[^>]*:class="\{ 'is-open': effortOpen \}"/)
    expect(paneSrc).toMatch(/class="ide-chat__csettings"[^>]*:class="\{ 'is-open': composerSettingsOpen \}"/)
  })

  it('IdePermissionSwitcher：⛨ 锚 is-open 抬层 110', () => {
    const m = /\.ide-perm\.is-open\s*\{\s*z-index:\s*(\d+)/.exec(permSrc)
    expect(m, '.ide-perm.is-open 抬层规则缺失').toBeTruthy()
    expect(Number(m![1])).toBeGreaterThanOrEqual(110)
    expect(permSrc).toMatch(/class="ide-perm"[^>]*:class="\{ 'is-open': open \}"/)
  })
})

describe('composer 弹层点外关闭/互斥守门（文档级 pointerdown）', () => {
  it('IdeChatPane：思考/⚙ 共享 handler 挂接 document pointerdown', () => {
    expect(paneSrc).toContain('function onComposerMenuPointerDown')
    expect(paneSrc).toMatch(/addEventListener\('pointerdown', onComposerMenuPointerDown\)/)
    expect(paneSrc).toMatch(/removeEventListener\('pointerdown', onComposerMenuPointerDown\)/)
  })

  it('IdePermissionSwitcher：⛨ 面板 handler 挂接 document pointerdown', () => {
    expect(permSrc).toContain('function onPermPointerDown')
    expect(permSrc).toMatch(/addEventListener\('pointerdown', onPermPointerDown\)/)
    expect(permSrc).toMatch(/removeEventListener\('pointerdown', onPermPointerDown\)/)
  })
})
