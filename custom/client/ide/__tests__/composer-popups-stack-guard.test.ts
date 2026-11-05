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
// 2026-11-05 第六批拆分：脚本逻辑移入 useIdeChatPane.ts；点外关闭断言取 SFC+伴侣并集。
const paneAll = paneSrc + '\n' + readFileSync(resolve(__dirname, '../views/useIdeChatPane.ts'), 'utf8')

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

  it('IdeChatPane：模型清单锚 is-open 抬层 110 且清单 left:0 锚定按钮（防割裂回归）', () => {
    const z = /\.ide-chat__model-anchor[\s\S]{0,200}?&\.is-open\s*\{\s*z-index:\s*(\d+)/.exec(paneSrc)
    expect(z, '.ide-chat__model-anchor is-open 抬层规则缺失').toBeTruthy()
    expect(Number(z![1])).toBeGreaterThanOrEqual(110)
    expect(paneSrc).toMatch(/class="ide-chat__model-anchor"[^>]*:class="\{ 'is-open': modelPickerOpen \}"/)
    // 清单必须从按钮左缘向上弹（原 right:12px 挂大锚顶部＝飘右上角割裂）
    const picker = /\.ide-chat__model-picker\s*\{[^}]*\}/.exec(paneSrc)
    expect(picker).toBeTruthy()
    expect(picker![0]).toMatch(/left:\s*0/)
    expect(picker![0]).not.toMatch(/right:\s*12px/)
    // 清单必须住在 model-anchor 锚内（模板序：锚开始标记先于清单标记，锚闭合后无清单）
    const anchorIdx = paneSrc.indexOf('class="ide-chat__model-anchor"')
    const pickerIdx = paneSrc.indexOf('data-testid="ide-input-model-picker"')
    expect(anchorIdx).toBeGreaterThan(-1)
    expect(pickerIdx).toBeGreaterThan(anchorIdx)
  })
})

describe('composer 弹层点外关闭/互斥守门（文档级 pointerdown）', () => {
  it('IdeChatPane：三弹层（思考/⚙/模型）共享 handler 挂接 document pointerdown', () => {
    expect(paneAll).toContain('function onComposerMenuPointerDown')
    expect(paneAll).toMatch(/addEventListener\('pointerdown', onComposerMenuPointerDown\)/)
    expect(paneAll).toMatch(/removeEventListener\('pointerdown', onComposerMenuPointerDown\)/)
    expect(paneAll).toContain("'.ide-chat__model-anchor'")
    expect(paneAll).toMatch(/!within\[2\]\) modelPickerOpen\.value = false/)
  })

  it('IdePermissionSwitcher：⛨ 面板 handler 挂接 document pointerdown', () => {
    expect(permSrc).toContain('function onPermPointerDown')
    expect(permSrc).toMatch(/addEventListener\('pointerdown', onPermPointerDown\)/)
    expect(permSrc).toMatch(/removeEventListener\('pointerdown', onPermPointerDown\)/)
  })
})
