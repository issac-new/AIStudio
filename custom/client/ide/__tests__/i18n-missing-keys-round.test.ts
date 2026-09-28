// overlay/custom/client/ide/__tests__/i18n-missing-keys-round.test.ts
// i18n 缺键清剿守门（2026-09-23 三轮审计汇总）。
// 覆盖面：ide.task.timeline / ide.briefing.* 全族 / RunTrace 禁用因 /
// 热力图失败态 / chat.deleteSessionFailed / cockpit 四键 / sidebar 两键（zh）/
// matrixChat.e2eVerified / common.open|clear|refresh。
// 2026-09-28 P0 收敛：locale 单一事实源化（473 全量重基线）后，守卫从
// "读 patch 376 文件"改为"读注入态词表"（zh/en 成对直断，语义更强）。
// 环境：node（词表导入断言，无 DOM）。
import { describe, it } from 'vitest'
import { expectLocaleKeys } from '../../__tests__/helpers/locale-tree'

describe('i18n 缺键清剿（zh/en 成对 · 注入态词表直断）', () => {
  it('ide 域：task.timeline / chatTabTraceDisabled / heatmapLoadFailed / briefing 全族', () => {
    expectLocaleKeys('ide.task', ['timeline'])
    expectLocaleKeys('ide', ['chatTabTraceDisabled'])
    expectLocaleKeys('ide.usagePanel', ['heatmapLoadFailed'])
    // briefing 族 zh/en 各 32 键：title/toggle/close/noActiveTask/headerBlock/taskTitle/
    // taskId/taskStatus/taskPriority/stage/branch/worktree/contextBlock/noContext/
    // raciLabel/workflowBlock/deps/blocked/blockedYes/blockedNo/retryCount/gitBlock/
    // noCommits/collabBlock/noCollab/recapSummary/recapDecisions/recapBlockers/
    // recapTodos/auxBlock/auxPlaceholder/auxSend
    expectLocaleKeys('ide.briefing', [
      'title', 'toggle', 'close', 'noActiveTask', 'headerBlock', 'taskTitle',
      'taskId', 'taskStatus', 'taskPriority', 'stage', 'branch', 'worktree',
      'contextBlock', 'noContext', 'raciLabel', 'workflowBlock', 'deps',
      'blocked', 'blockedYes', 'blockedNo', 'retryCount', 'gitBlock',
      'noCommits', 'collabBlock', 'noCollab', 'recapSummary', 'recapDecisions',
      'recapBlockers', 'recapTodos', 'auxBlock', 'auxPlaceholder', 'auxSend',
    ])
  })

  it('跨域：chat/cockpit/sidebar/matrixChat/common 缺键补齐', () => {
    expectLocaleKeys('chat', ['deleteSessionFailed'])
    expectLocaleKeys('cockpit', ['scheduleTitle', 'yearLabel', 'itemCount', 'aggregateSessions'])
    expectLocaleKeys('sidebar', ['swarmKanban'])
    expectLocaleKeys('sidebar', ['matrixChat'])
    expectLocaleKeys('matrixChat', ['e2eVerified'])
    expectLocaleKeys('common', ['open', 'clear', 'refresh'])
  })
})
