// overlay/custom/client/ia2/i18n-observatory.ts
// 运行观测吸收批词条（会话轨迹账本 / goal-loop 常驻意图面板，2026-10-01）。
// 独立小事实源 + locale 切换（同 i18n-run-surface.ts 先例）——注入链漂移期
// 不动 patch 473；漂移治理后收编（届时本模块退役）。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const OBSERVATORY_TEXT = {
  zh: {
    trajTabTitle: '轨迹',
    trajNodes: '节点',
    trajErrors: '错误',
    trajHotspot: '热点',
    trajHotspotHint: '按耗时降序（默认时间线序）',
    trajQueryHint: '过滤：kind:tool  err:  >10s  >500ms  文本（AND 组合）',
    trajLoading: '加载轨迹…',
    trajNoTrace: '本会话无轨迹文件（run-trace 插件未启用或非 agent 会话）',
    trajNoSession: '未选择会话',
    trajNoMatch: '无匹配节点',
    // —— 生产失败回流轮：轨迹转回归入口 ——
    trajReflowSession: '本会话转回归',
    trajReflowSpan: '此节点转回归',
    trajReflowHint: '把该会话的证据转成回归题（人工确认问题/期望/断言后入回归样本库）',
    trajReflowUnsupported: '无法识别的轨迹格式或会话未收尾，暂不能转回归',
    goalLoopTitle: '常驻意图',
    goalLoopGoal: '目标',
    goalLoopLoop: '循环',
    goalLoopHeartbeat: '心跳',
    goalLoopEmpty: '当前无常驻目标/循环',
    goalLoopJudge: '判定',
    goalLoopGate: '门禁',
    goalLoopInterval: '间隔',
    goalLoopTimes: '次数',
  },
  en: {
    trajTabTitle: 'Trajectory',
    trajNodes: 'nodes',
    trajErrors: 'errors',
    trajHotspot: 'Hotspot',
    trajHotspotHint: 'Sort by duration desc (default: timeline)',
    trajQueryHint: 'Filter: kind:tool  err:  >10s  >500ms  text (AND-combined)',
    trajLoading: 'Loading trajectory…',
    trajNoTrace: 'No trace file for this session (run-trace plugin off or non-agent session)',
    trajNoSession: 'No session selected',
    trajNoMatch: 'No matching nodes',
    // —— production trace reflow round: trajectory → regression entry ——
    trajReflowSession: 'Turn session into regression case',
    trajReflowSpan: 'Turn this span into regression case',
    trajReflowHint: 'Turn this session’s evidence into a regression case (confirm problem/expectation/assertion, then add to the regression library)',
    trajReflowUnsupported: 'Unrecognized trace format or session still writing; cannot turn into a regression case yet',
    goalLoopTitle: 'Standing intents',
    goalLoopGoal: 'Goal',
    goalLoopLoop: 'Loop',
    goalLoopHeartbeat: 'Heartbeat',
    goalLoopEmpty: 'No standing goals/loops',
    goalLoopJudge: 'judge',
    goalLoopGate: 'gate',
    goalLoopInterval: 'interval',
    goalLoopTimes: 'times',
  },
} as const

// 值放宽为 string（as const 字面量互斥 TS2322）；键完整性由 Record 强制。
export type ObservatoryText = Record<keyof typeof OBSERVATORY_TEXT.zh, string>

/** 运行观测词条（locale 响应式跟随） */
export function useRunSurfaceText() {
  const i18nCtx = useI18n()
  return computed<ObservatoryText>(() => {
    const loc = String((i18nCtx as unknown as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return loc.startsWith('zh') ? OBSERVATORY_TEXT.zh : OBSERVATORY_TEXT.en
  })
}
