// overlay/custom/client/ide/__tests__/i18n-missing-keys-round.test.ts
// patch 375 守门：全量 i18n 裸键清剿轮（2026-09-23 三轮审计汇总）。
// 覆盖面：ide.task.timeline / ide.briefing.* 全族登记 / RunTrace 禁用因 /
// 热力图失败态 / chat.deleteSessionFailed / cockpit 四键 / sidebar 两键（zh）/
// matrixChat.e2eVerified / common.open|clear|refresh。
// 环境：node（只读文件断言，无 DOM）。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const overlayRoot = resolve(__dirname, '../../../..')
const PATCH = '375-client-i18n-missing-keys.patch'

function readPatch(): string {
  return readFileSync(resolve(overlayRoot, `patches/${PATCH}`), 'utf8')
}

describe('patch 375：i18n 缺键清剿（zh/en 成对）', () => {
  it('series 已登记 375', () => {
    const series = readFileSync(resolve(overlayRoot, 'patches/series'), 'utf8')
    expect(series).toContain(PATCH)
  })

  it('ide 域：task.timeline / chatTabTraceDisabled / heatmapLoadFailed / briefing 全族', () => {
    const patch = readPatch()
    for (const key of [
      "timeline: '时间线'",
      "timeline: 'Timeline'",
      "chatTabTraceDisabled: '无活跃会话，暂不可用'",
      "chatTabTraceDisabled: 'Unavailable without an active session'",
      "heatmapLoadFailed: '热力图加载失败'",
      "heatmapLoadFailed: 'Failed to load heatmap'",
      'briefing: {',
      "title: 'Task Briefing'",
      "noActiveTask: '当前无激活任务：从看板或任务跳转进入后自动带入简报'",
      "auxPlaceholder: 'Free-form chat…'",
    ]) {
      expect(patch).toContain(key)
    }
    // briefing 族 zh/en 各 32 键：title/toggle/close/noActiveTask/headerBlock/taskTitle/
    // taskId/taskStatus/taskPriority/stage/branch/worktree/contextBlock/noContext/
    // raciLabel/workflowBlock/deps/blocked/blockedYes/blockedNo/retryCount/gitBlock/
    // noCommits/collabBlock/noCollab/recapSummary/recapDecisions/recapBlockers/
    // recapTodos/auxBlock/auxPlaceholder/auxSend
    expect(patch.match(/auxSend:/g)?.length).toBe(2)
  })

  it('跨域：chat/cockpit/sidebar/matrixChat/common 缺键补齐', () => {
    const patch = readPatch()
    for (const key of [
      "deleteSessionFailed: '删除会话失败'",
      "deleteSessionFailed: 'Failed to delete session'",
      "scheduleTitle: '日程'",
      "scheduleTitle: 'Schedule'",
      "yearLabel: '年'",
      "itemCount: '{count} 项'",
      "aggregateSessions: '聚合关联会话'",
      "swarmKanban: 'swarm 看板'",
      "matrixChat: 'Matrix 聊天'",
      "e2eVerified: '已通过加密验证'",
      "e2eVerified: 'Encryption verified'",
      "refresh: '刷新'",
      "refresh: 'Refresh'",
    ]) {
      expect(patch).toContain(key)
    }
  })

  it('注入态含 375 时 locale 已生效（防只登记不注入；未注入检出跳过）', () => {
    const manifestPath = resolve(overlayRoot, '.overlay-injected.json')
    if (!existsSync(manifestPath)) return
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!manifest.appliedPatches?.includes(PATCH)) return
    const zhPath = resolve(overlayRoot, '../upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts')
    if (!existsSync(zhPath)) return
    const zh = readFileSync(zhPath, 'utf8')
    expect(zh).toContain('briefing: {')
    expect(zh).toContain("chatTabTraceDisabled: '无活跃会话，暂不可用'")
  })
})
