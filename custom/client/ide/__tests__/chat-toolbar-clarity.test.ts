// overlay 会话头部工具栏清晰化守门（2026-11-16 用户反馈批）：
// IdeChatPane 挂载依赖过重，沿用本仓源码级守门先例（composer-popups-stack-guard /
// ide-work-mode-wiring）断言分组结构、高频按钮文字与六面板外壳接线。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const pane = readFileSync(resolve(__dirname, '../views/IdeChatPane.vue'), 'utf8')
const i18n = readFileSync(resolve(__dirname, '../i18n.ts'), 'utf8')

describe('会话头部工具栏分组', () => {
  it('actions 分三组容器，各自带 role=group 与 aria-label，组间有分隔线类', () => {
    expect(pane).toMatch(/class="ide-chat__group"[^>]*role="group"[^>]*aria-label="会话"/)
    expect(pane).toMatch(/class="ide-chat__group"[^>]*role="group"[^>]*aria-label="查找与回顾"/)
    expect(pane).toMatch(/class="ide-chat__group"[^>]*role="group"[^>]*aria-label="工具"/)
    expect(pane).toMatch(/ide-chat__group-divider/)
    // 恢复按钮在「会话」组内、查找在「查找与回顾」组内（组顺序约束）
    const groups = pane.split('ide-chat__group')
    const sessionIdx = pane.indexOf('aria-label="会话"')
    const findIdx = pane.indexOf('aria-label="查找与回顾"')
    const toolsIdx = pane.indexOf('aria-label="工具"')
    expect(sessionIdx).toBeGreaterThan(-1)
    expect(findIdx).toBeGreaterThan(sessionIdx)
    expect(toolsIdx).toBeGreaterThan(findIdx)
    expect(groups.length).toBeGreaterThanOrEqual(4)
  })

  it('高频动作（新建/恢复/查找）为图标+短文字按钮，其余仍纯图标', () => {
    for (const [testid, labelKey] of [
      ['ide-chat-new', 'chatActionLabels.newLabel'],
      ['ide-chat-recovery', 'chatActionLabels.recoveryLabel'],
      ['ide-chat-find', 'chatActionLabels.findLabel'],
    ] as const) {
      const testidIdx = pane.indexOf(`data-testid="${testid}"`)
      expect(testidIdx).toBeGreaterThan(-1)
      // 回溯到本按钮的 <button 起始（class 写在 data-testid 之前）
      const btnStart = pane.lastIndexOf('<button', testidIdx)
      const btnEnd = pane.indexOf('</button>', testidIdx)
      const btn = pane.slice(btnStart, btnEnd)
      expect(btn).toMatch(/ide-chat__action--label/)
      expect(btn).toMatch(new RegExp(labelKey.replace('.', '\\.')))
    }
    // 纯图标组代表（历史/侧问）不带文字标签类
    const histIdx = pane.indexOf('data-testid="ide-chat-history"')
    const histStart = pane.lastIndexOf('<button', histIdx)
    expect(pane.slice(histStart, pane.indexOf('</button>', histIdx))).not.toMatch(/__action--label/)
  })

  it('短文字与分组名落在 IDE_LOCAL_TEXT.chatActions（中英双语）', () => {
    expect(i18n).toMatch(/chatActions:\s*{/)
    for (const key of ['newLabel', 'recoveryLabel', 'findLabel']) {
      expect((i18n.match(new RegExp(`${key}:`, 'g')) ?? []).length).toBe(2) // zh + en
    }
  })
})

describe('六面板统一外壳接线', () => {
  const panels = [
    'components/IdeRecoveryDialog.vue',
    'components/IdeVideoFramesDialog.vue',
    'components/IdeHistoryBrowser.vue',
    'components/IdeBtwPanel.vue',
    'components/IdeBgTasksPanel.vue',
    'components/IdeSideSessionPane.vue',
  ]
  for (const rel of panels) {
    it(`${rel} 使用 IdePanelShell 承载容器/头部`, () => {
      const src = readFileSync(resolve(__dirname, '..', rel), 'utf8')
      expect(src).toMatch(/IdePanelShell/)
      // 旧的自制头部标题行不再并行存在（外壳接管）
      expect(src).not.toMatch(/__head">\s*<span[^>]*__title"/)
    })
  }
})
