export type WorkDecision = 'conditional' | 'reject' | 'approve'

export interface DraftWorkItem {
  id: string
  taskId: string
  decision: WorkDecision
  riskTags: string[]
  opinion: string
  modifiedFiles: string[]
  score?: number
}

export interface A2uiTemplate {
  id: string
  name: string
  decision: WorkDecision
  riskTags: string[]
  opinion: string
  modifiedFiles: string[]
  score?: number
}

const DRAFT_KEY = (taskId: string) => `cockpit:workitem:${taskId}`
const TPL_KEY = 'cockpit:templates'

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* quota 失败静默 */ }
}
function safeRemove(key: string): void {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

export function loadDraft(taskId: string): DraftWorkItem | null {
  const raw = safeGet(DRAFT_KEY(taskId))
  if (!raw) return null
  try { return JSON.parse(raw) as DraftWorkItem } catch { return null }
}

export function saveDraft(taskId: string, patch: Partial<DraftWorkItem>): void {
  const cur = loadDraft(taskId) ?? {
    id: `w-${taskId}`, taskId, decision: 'conditional' as WorkDecision,
    riskTags: [], opinion: '', modifiedFiles: [],
  }
  const merged: DraftWorkItem = { ...cur, ...patch }
  safeSet(DRAFT_KEY(taskId), JSON.stringify(merged))
}

export function clearDraft(taskId: string): void {
  safeRemove(DRAFT_KEY(taskId))
}

export function loadTemplates(): A2uiTemplate[] {
  const raw = safeGet(TPL_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as A2uiTemplate[] : []
  } catch { return [] }
}

export function saveTemplates(list: A2uiTemplate[]): void {
  safeSet(TPL_KEY, JSON.stringify(list))
}
