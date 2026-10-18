// overlay/custom/client/ide/__tests__/interface-mode.test.ts
// 守门：编程/工作（office/coding）双模式——归一化、效果表单一事实源、快捷键匹配、
// 编辑态过滤。语义锚点：zcode packages/ui/src/lib/interfaceMode.ts:1-8；
// App.tsx:997-998（隐藏终端/审查）；shortcutCommands.ts:98（CmdOrCtrl+Shift+u）。
import { describe, it, expect } from 'vitest'
import {
  normalizeInterfaceMode,
  interfaceModeEffects,
  isInterfaceModeToggle,
  isEditableTarget,
  INTERFACE_MODE_KEY,
  type IdeInterfaceMode,
} from '../utils/interface-mode'

describe('normalizeInterfaceMode（兼容 zcode 历史值）', () => {
  it('work/office/general/concise → work（大小写与空白容错）', () => {
    for (const v of ['work', 'office', 'general', 'concise', ' WORK ', 'Office']) {
      expect(normalizeInterfaceMode(v)).toBe('work')
    }
  })

  it('coding 与未知/空值 → coding（安全默认=全量能力）', () => {
    for (const v of ['coding', '', null, undefined, 'turbo', 42, {}]) {
      expect(normalizeInterfaceMode(v)).toBe('coding')
    }
  })

  it('存储键独立于 zcode 产品键（避免两产品偏好互串）', () => {
    expect(INTERFACE_MODE_KEY).toBe('hermes_ide_interface_mode')
    expect(INTERFACE_MODE_KEY).not.toBe('zcode-interface-mode')
  })
})

describe('interfaceModeEffects（模式差异单一事实源）', () => {
  it('编程模式：终端/审查可见、工具卡展开、代码不强制换行', () => {
    expect(interfaceModeEffects('coding')).toEqual({
      showTerminal: true,
      showReview: true,
      collapseToolDetails: false,
      wrapCode: false,
      defaultSideTab: 'files',
    })
  })

  it('工作模式：隐藏终端/审查、工具卡折叠、代码强制换行（zcode office 语义）', () => {
    expect(interfaceModeEffects('work')).toEqual({
      showTerminal: false,
      showReview: false,
      collapseToolDetails: true,
      wrapCode: true,
      defaultSideTab: 'files',
    })
  })

  it('两模式差异只体现在呈现层五个开关（不产生运行时/权限差异）', () => {
    const modes: IdeInterfaceMode[] = ['coding', 'work']
    for (const m of modes) {
      expect(Object.keys(interfaceModeEffects(m)).sort()).toEqual(
        ['collapseToolDetails', 'defaultSideTab', 'showReview', 'showTerminal', 'wrapCode'],
      )
    }
  })
})

describe('isInterfaceModeToggle（Cmd/Ctrl+Shift+U）', () => {
  it('Cmd 或 Ctrl + Shift + U 命中；带 Alt 不命中', () => {
    expect(isInterfaceModeToggle({ metaKey: true, shiftKey: true, key: 'u' })).toBe(true)
    expect(isInterfaceModeToggle({ ctrlKey: true, shiftKey: true, key: 'U' })).toBe(true)
    expect(isInterfaceModeToggle({ metaKey: true, shiftKey: true, altKey: true, key: 'u' })).toBe(false)
  })

  it('缺 Shift、无修饰键、其它字母都不命中', () => {
    expect(isInterfaceModeToggle({ metaKey: true, key: 'u' })).toBe(false)
    expect(isInterfaceModeToggle({ key: 'u' })).toBe(false)
    expect(isInterfaceModeToggle({ metaKey: true, shiftKey: true, key: 'i' })).toBe(false)
  })
})

describe('isEditableTarget（编辑态不劫持快捷键）', () => {
  it('input/textarea/select/contenteditable 视为编辑态', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'textArea' })).toBe(true)
    expect(isEditableTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('普通元素与 null 不视为编辑态', () => {
    expect(isEditableTarget({ tagName: 'DIV' })).toBe(false)
    expect(isEditableTarget(null)).toBe(false)
  })
})
