// 编排器执行边界词条：与运行时的真实能力一致，不使用占位或已派发暗示。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const ORCHESTRATOR_TEXT = {
  zh: {
    gateHint: 'gate 在真实服务端受信目录中以 sandbox 执行，仅允许目录内命令。',
    agentHint: 'Agent 节点在本批次不可执行，不会派发任务。',
  },
  en: {
    gateHint: 'Gates execute in a sandbox from the trusted server catalog; only cataloged commands are allowed.',
    agentHint: 'Agent nodes are unavailable in this batch and are never dispatched.',
  },
} as const

export type OrchestratorText = Record<keyof typeof ORCHESTRATOR_TEXT.zh, string>

export function useOrchestratorText() {
  const i18n = useI18n()
  return computed<OrchestratorText>(() => {
    const locale = String((i18n as unknown as { locale?: { value?: string } }).locale?.value ?? 'zh')
    return locale.startsWith('zh') ? ORCHESTRATOR_TEXT.zh : ORCHESTRATOR_TEXT.en
  })
}
