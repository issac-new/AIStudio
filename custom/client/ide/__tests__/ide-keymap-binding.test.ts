// overlay/custom/client/ide/__tests__/ide-keymap-binding.test.ts
// useKeyBinding 键位解析守门（D5 回归）：该导出曾调用定义在 <script setup> 内的
// readOverrides（setup 作用域），模块作用域下运行时 ReferenceError 被 catch
// 吞成空串——⌘K 永不匹配，命令面板键盘入口整体失效（浏览器实测定位：
// pinia 直调 togglePalette 正常、window keydown 监听在、preventDefault 无）。
// Value: protects=全局键位（palette ⌘K）经 useKeyBinding 可解析出真实组合键; fails_when=readOverrides 回退 setup 作用域（解析恒空串）或覆盖读写链断裂; why_new=此前零测试触及该导出（命令面板套件只测面板组件本体）; seam=none
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useKeyBinding } from '../components/IdeKeymapCard.vue'

describe('useKeyBinding 键位解析（D5 回归：SFC 双 script 作用域）', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('无覆盖时解析出默认全局键位（palette=Cmd+K）——setup 作用域回归将得空串', () => {
    expect(useKeyBinding('global', 'palette')()).toBe('Cmd+K')
  })

  it('user 层覆盖生效：重映射 palette 后解析出覆盖值', () => {
    localStorage.setItem('sl:user:ide.keymapOverrides', JSON.stringify([
      { context: 'global', action: 'palette', key: 'Ctrl+P' },
    ]))
    expect(useKeyBinding('global', 'palette')()).toBe('Ctrl+P')
  })

  it('未知上下文/动作返回空串（显式语义，非吞错空串）', () => {
    expect(useKeyBinding('global', 'nope')()).toBe('')
    expect(useKeyBinding('ctx-x', 'palette')()).toBe('')
  })
})
