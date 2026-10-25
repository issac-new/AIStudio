import { defineStore } from 'pinia'
import { readSetting, writeSetting, adoptLegacySetting } from '@/custom/settings-layers'
import { computed, ref } from 'vue'
import * as kanbanApi from '@/api/hermes/kanban'
import { probeAuthViaRest } from '@/api/client'
import type { KanbanTask, KanbanTaskStatus, KanbanStats, KanbanAssignee, KanbanBoard, KanbanProject, KanbanCapabilities, KanbanDiagnosticsOptions, KanbanDispatchOptions, KanbanBulkUpdateRequest, KanbanCreateRequest, KanbanDiagnostic, KanbanOrchestration, KanbanAttachment } from '@/api/hermes/kanban'

export const KANBAN_SELECTED_BOARD_STORAGE_KEY = 'hermes.kanban.selectedBoard'
// overlay[#539-batch4/patch 540]: 选板偏好走 settings-layers user 层（遗留裸键一次性收养）
export const DEFAULT_KANBAN_BOARD = 'default'

const BOARD_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

export function normalizeBoardSlug(board?: string | null): string {
  const trimmed = board?.trim().toLowerCase()
  if (!trimmed) return DEFAULT_KANBAN_BOARD
  return BOARD_SLUG_RE.test(trimmed) ? trimmed : DEFAULT_KANBAN_BOARD
}

export const useKanbanStore = defineStore('kanban', () => {
  const tasks = ref<KanbanTask[]>([])
  const stats = ref<KanbanStats | null>(null)
  const assignees = ref<KanbanAssignee[]>([])
  const boards = ref<KanbanBoard[]>([])
  // HERMES_CUSTOM[v020] BEGIN
  const projects = ref<KanbanProject[]>([])
  // HERMES_CUSTOM[v020] END
  const capabilities = ref<KanbanCapabilities | null>(null)
  const loading = ref(false)
  const boardsLoading = ref(false)
  const boardWarning = ref<string | null>(null)

  // Advanced features state
  const diagnostics = ref<KanbanDiagnostic[]>([])
  const orchestration = ref<KanbanOrchestration | null>(null)
  const attachments = ref<Record<string, KanbanAttachment[]>>({})

  adoptLegacySetting('kanban.selectedBoard', KANBAN_SELECTED_BOARD_STORAGE_KEY)
  const _boardPref = readSetting('kanban.selectedBoard', '')
  const selectedBoard = ref(normalizeBoardSlug(_boardPref.value || null))

  const filterStatus = ref<string | null>(null)
  const filterAssignee = ref<string | null>(null)
  const selectedIds = ref<Set<string>>(new Set())
  const searchQuery = ref('')

  let boardGeneration = 0
  let boardsRequestSeq = 0
  let tasksRequestSeq = 0
  let statsRequestSeq = 0
  let assigneesRequestSeq = 0
  let loadingRequestSeq = 0
  let eventStreamSeq = 0
  let eventSocket: WebSocket | null = null
  let eventReconnectTimer: ReturnType<typeof setTimeout> | null = null
  let eventRefreshTimer: ReturnType<typeof setTimeout> | null = null
  let eventStreamEnabled = false
  let eventConsecutiveFailures = 0
  let eventMaxBackoffMs = 30_000
  // Failures beyond this threshold trigger an authoritative REST auth probe.
  // The WebSocket close code (1006) cannot distinguish auth rejection from
  // transient network/upgrade issues, so we defer to REST for the verdict.
  const eventAuthProbeThreshold = 3
  let eventAuthProbeInFlight = false

  const activeBoards = computed(() => {
    const visible = boards.value.filter(board => !board.archived)
    if (!visible.some(board => board.slug === DEFAULT_KANBAN_BOARD)) {
      return [{
        slug: DEFAULT_KANBAN_BOARD,
        name: 'Default',
        description: '',
        icon: '',
        color: '',
        created_at: null,
        archived: false,
        counts: {},
        total: 0,
      }, ...visible]
    }
    return visible
  })

  function isCapabilitySupported(key: string): boolean {
    if (!capabilities.value) return false
    const detail = capabilities.value.capabilities?.find(capability => capability.key === key)
    if (detail) return detail.status === 'supported'
    if (capabilities.value.missing?.includes(key)) return false
    return capabilities.value.supports?.[key] === true
  }

  function assertCapability(key: string): void {
    if (!isCapabilitySupported(key)) {
      throw new Error(`Kanban capability "${key}" is not supported by the current Hermes backend`)
    }
  }

  function hasCapabilityStatus(key: string, statuses: Array<'supported' | 'partial' | 'missing'>): boolean {
    const detail = capabilities.value?.capabilities?.find(capability => capability.key === key)
    if (detail) return statuses.includes(detail.status)
    if (statuses.includes('supported')) return isCapabilitySupported(key)
    return false
  }

  function assertCapabilityStatus(key: string, statuses: Array<'supported' | 'partial' | 'missing'>): void {
    if (!hasCapabilityStatus(key, statuses)) {
      throw new Error(`Kanban capability "${key}" is not available with the required status`)
    }
  }

  function boardExists(board: string): boolean {
    return activeBoards.value.some(item => item.slug === board)
  }

  function resolveAvailableBoard(candidate?: string | null): string {
    const normalized = normalizeBoardSlug(candidate)
    if (boards.value.length > 0 && !boardExists(normalized)) return DEFAULT_KANBAN_BOARD
    return normalized
  }

  function clearBoardScopedState() {
    tasks.value = []
    stats.value = null
    assignees.value = []
  }

  function clearEventTimers() {
    if (eventReconnectTimer) clearTimeout(eventReconnectTimer)
    if (eventRefreshTimer) clearTimeout(eventRefreshTimer)
    eventReconnectTimer = null
    eventRefreshTimer = null
  }

  function closeEventSocket() {
    if (!eventSocket) return
    const socket = eventSocket
    eventSocket = null
    socket.onclose = null
    socket.onerror = null
    socket.onmessage = null
    try { socket.close() } catch { }
  }

  function stopEventStream() {
    eventStreamEnabled = false
    eventStreamSeq++
    eventConsecutiveFailures = 0
    eventAuthProbeInFlight = false
    clearEventTimers()
    closeEventSocket()
  }

  function scheduleEventRefresh(board: string, generation: number, seq: number) {
    if (eventRefreshTimer) clearTimeout(eventRefreshTimer)
    eventRefreshTimer = setTimeout(() => {
      if (!eventStreamEnabled || seq !== eventStreamSeq || generation !== boardGeneration || board !== selectedBoard.value) return
      void Promise.all([fetchBoards(), fetchTasks(true), fetchStats(), fetchAssignees()])
    }, 100)
  }

  function scheduleEventReconnect(board: string, generation: number, seq: number) {
    if (eventReconnectTimer) clearTimeout(eventReconnectTimer)
    const delayMs = Math.min(3000 * Math.pow(2, eventConsecutiveFailures), eventMaxBackoffMs)
    eventReconnectTimer = setTimeout(() => {
      if (!eventStreamEnabled || seq !== eventStreamSeq || generation !== boardGeneration || board !== selectedBoard.value) return
      connectEventStream(board, generation, seq)
    }, delayMs)
  }

  function connectEventStream(board: string, generation: number, seq: number) {
    closeEventSocket()
    let socket: WebSocket
    try {
      socket = kanbanApi.openKanbanEventStream({ board })
    } catch (err) {
      console.error('Failed to open kanban event stream:', err)
      eventConsecutiveFailures++
      scheduleEventReconnect(board, generation, seq)
      return
    }
    eventSocket = socket
    socket.onmessage = (event) => {
      if (!eventStreamEnabled || seq !== eventStreamSeq || generation !== boardGeneration || board !== selectedBoard.value) return
      try {
        const payload = JSON.parse(String(event.data))
        if (payload?.type === 'event') scheduleEventRefresh(board, generation, seq)
      } catch {
        scheduleEventRefresh(board, generation, seq)
      }
    }
    socket.onerror = () => {
      if (eventSocket === socket) console.error('Kanban event stream error')
    }
    socket.onclose = (ev: CloseEvent) => {
      if (eventSocket !== socket) return
      eventSocket = null
      eventConsecutiveFailures++

      // 1006 = abnormal close (no close frame — server rejected the upgrade).
      // After sustained failures, ask REST for an authoritative verdict: the
      // WebSocket close code alone cannot tell auth rejection apart from
      // transient network issues. The probe returns false only on a confirmed
      // 401 (auth expired); 200 or inconclusive errors keep us reconnecting.
      if (ev.code === 1006 && eventConsecutiveFailures >= eventAuthProbeThreshold && !eventAuthProbeInFlight) {
        eventAuthProbeInFlight = true
        console.warn(
          `Kanban event stream closed abnormally (code=${ev.code}) after ${eventConsecutiveFailures} ` +
          `consecutive failures. Probing REST to determine whether auth has expired.`,
        )
        void probeAuthViaRest().then((ok) => {
          eventAuthProbeInFlight = false
          if (!ok) {
            // REST returned 401 — auth has expired. The probe already cleared
            // the token and redirected to login. Stop the WS reconnect loop.
            console.warn('Kanban event stream: REST probe confirmed auth failure; stopping reconnect.')
            return
          }
          // REST is healthy (or the probe itself was inconclusive, e.g. 5xx /
          // network error). Treat as a WS-only channel problem and resume
          // reconnecting, but only if the stream is still meant to be active.
          if (eventStreamEnabled) scheduleEventReconnect(board, generation, seq)
        })
        return
      }

      scheduleEventReconnect(board, generation, seq)
    }
    // Reset failure counter once the WebSocket is open — a successful handshake
    // proves the credentials and connection are good.
    socket.onopen = () => {
      eventConsecutiveFailures = 0
    }
  }

  function hasEventStreamCapability(): boolean {
    const status = capabilities.value?.capabilities?.find(capability => capability.key === 'events')?.status
    return status === 'supported' || status === 'partial' || isCapabilitySupported('events')
  }

  function startEventStream() {
    if (!hasEventStreamCapability()) return false
    eventStreamEnabled = true
    const seq = ++eventStreamSeq
    const generation = boardGeneration
    const board = selectedBoard.value
    clearEventTimers()
    connectEventStream(board, generation, seq)
    return true
  }

  function restartEventStreamIfActive() {
    if (eventStreamEnabled) startEventStream()
  }

  function setSelectedBoard(board?: string | null): string {
    const resolved = resolveAvailableBoard(board)
    const changed = selectedBoard.value !== resolved
    selectedBoard.value = resolved
    writeSetting('user', 'kanban.selectedBoard', resolved)
    boardWarning.value = null
    if (changed) {
      clearBoardScopedState()
      boardGeneration++
      restartEventStreamIfActive()
    }
    return resolved
  }

  function recoverSelectedBoard(candidate?: string | null): { board: string; recovered: boolean } {
    const normalized = normalizeBoardSlug(candidate)
    const resolved = resolveAvailableBoard(normalized)
    const recovered = resolved !== normalized
    setSelectedBoard(resolved)
    if (recovered) {
      boardWarning.value = `Board "${normalized}" is unavailable; fell back to "${resolved}".`
    }
    return { board: resolved, recovered }
  }

  function nextRequestContext(nextSeq: () => number) {
    const seq = nextSeq()
    const generation = boardGeneration
    const board = selectedBoard.value
    return { seq, generation, board }
  }

  function isCurrentRequest(seq: number, generation: number, board: string, currentSeq: number): boolean {
    return seq === currentSeq && generation === boardGeneration && board === selectedBoard.value
  }

  async function fetchBoards(includeArchived = false) {
    const seq = ++boardsRequestSeq
    boardsLoading.value = true
    try {
      const nextBoards = await kanbanApi.listBoards({ includeArchived })
      if (seq !== boardsRequestSeq) return
      boards.value = nextBoards || []
      const resolved = resolveAvailableBoard(selectedBoard.value)
      if (resolved !== selectedBoard.value) recoverSelectedBoard(selectedBoard.value)
    } catch (err) {
      if (seq === boardsRequestSeq) console.error('Failed to fetch kanban boards:', err)
    } finally {
      if (seq === boardsRequestSeq) boardsLoading.value = false
    }
  }

  async function fetchCapabilities() {
    try {
      capabilities.value = await kanbanApi.getCapabilities()
    } catch (err) {
      console.error('Failed to fetch kanban capabilities:', err)
    }
  }

  async function refreshAll() {
    await Promise.all([fetchBoards(), fetchTasks(), fetchStats(), fetchAssignees()])
  }

  async function createBoard(data: { slug: string; name?: string; description?: string; icon?: string; color?: string; switchCurrent?: boolean; project?: string; defaultWorkdir?: string }) {
    const board = await kanbanApi.createBoard(data)
    await fetchBoards()
    if (data.switchCurrent !== false) setSelectedBoard(board.slug)  // overlay[#680]: 尊重表单「创建后切换」开关（默认开；取消勾选不再强切）
    await refreshAll()
    return board
  }

  async function archiveSelectedBoard() {
    const board = selectedBoard.value
    if (board === DEFAULT_KANBAN_BOARD) throw new Error('Cannot archive the default kanban board')
    await kanbanApi.archiveBoard(board)
    await fetchBoards()
    setSelectedBoard(DEFAULT_KANBAN_BOARD)
    await refreshAll()
  }

  async function fetchTasks(silent = false) {
    const { seq, generation, board } = nextRequestContext(() => ++tasksRequestSeq)
    const loadingSeq = silent ? 0 : ++loadingRequestSeq
    if (!silent) loading.value = true
    try {
      const nextTasks = await kanbanApi.listTasks({
        board,
        status: filterStatus.value || undefined,
        assignee: filterAssignee.value || undefined,
        includeArchived: true,
      })
      if (isCurrentRequest(seq, generation, board, tasksRequestSeq)) tasks.value = nextTasks || []
    } catch (err) {
      if (isCurrentRequest(seq, generation, board, tasksRequestSeq)) console.error('Failed to fetch kanban tasks:', err)
    } finally {
      if (!silent && loadingSeq === loadingRequestSeq) loading.value = false
    }
  }

  async function fetchStats() {
    const { seq, generation, board } = nextRequestContext(() => ++statsRequestSeq)
    try {
      const nextStats = await kanbanApi.getStats({ board })
      if (isCurrentRequest(seq, generation, board, statsRequestSeq)) stats.value = nextStats || null
    } catch (err) {
      if (isCurrentRequest(seq, generation, board, statsRequestSeq)) console.error('Failed to fetch kanban stats:', err)
    }
  }

  async function fetchAssignees() {
    const { seq, generation, board } = nextRequestContext(() => ++assigneesRequestSeq)
    try {
      const nextAssignees = await kanbanApi.getAssignees({ board })
      if (isCurrentRequest(seq, generation, board, assigneesRequestSeq)) assignees.value = nextAssignees || []
    } catch (err) {
      if (isCurrentRequest(seq, generation, board, assigneesRequestSeq)) console.error('Failed to fetch kanban assignees:', err)
    }
  }

  async function createTask(data: KanbanCreateRequest) {
    const board = selectedBoard.value
    const task = await kanbanApi.createTask(data, { board })
    if (board === selectedBoard.value) {
      tasks.value.unshift(task)
      await Promise.all([fetchStats(), fetchBoards()])
    }
    return task
  }

  async function completeTasks(taskIds: string[], summary?: string) {
    const board = selectedBoard.value
    await kanbanApi.completeTasks(taskIds, summary, { board })
    if (board === selectedBoard.value) {
      await Promise.all([fetchTasks(), fetchStats(), fetchBoards()])
    }
  }

  async function blockTask(taskId: string, reason: string) {
    const board = selectedBoard.value
    await kanbanApi.blockTask(taskId, reason, { board })
    if (board === selectedBoard.value) {
      await Promise.all([fetchTasks(), fetchStats(), fetchBoards()])
    }
  }

  async function unblockTasks(taskIds: string[]) {
    const board = selectedBoard.value
    await kanbanApi.unblockTasks(taskIds, { board })
    if (board === selectedBoard.value) {
      await Promise.all([fetchTasks(), fetchStats(), fetchBoards()])
    }
  }

  async function assignTask(taskId: string, profile: string) {
    const board = selectedBoard.value
    await kanbanApi.assignTask(taskId, profile, { board })
    if (board === selectedBoard.value) {
      const task = tasks.value.find(t => t.id === taskId)
      if (task) task.assignee = profile
      await Promise.all([fetchStats(), fetchAssignees()])
    }
  }

  async function addComment(taskId: string, body: string, author?: string) {
    assertCapability('commentsWrite')
    return kanbanApi.addComment(taskId, { body, author }, { board: selectedBoard.value })
  }

  async function linkTasks(parentId: string, childId: string) {
    assertCapability('links')
    const board = selectedBoard.value
    const result = await kanbanApi.linkTasks({ parent_id: parentId, child_id: childId }, { board })
    if (board === selectedBoard.value) await Promise.all([fetchTasks(true), fetchStats(), fetchBoards()])
    return result
  }

  async function unlinkTasks(parentId: string, childId: string) {
    assertCapability('links')
    const board = selectedBoard.value
    const result = await kanbanApi.unlinkTasks({ parent_id: parentId, child_id: childId }, { board })
    if (board === selectedBoard.value) await Promise.all([fetchTasks(true), fetchStats(), fetchBoards()])
    return result
  }

  async function bulkUpdateTasks(data: Omit<KanbanBulkUpdateRequest, 'ids'> & { ids: string[] }) {
    assertCapabilityStatus('bulk', ['supported', 'partial'])
    const board = selectedBoard.value
    const result = await kanbanApi.bulkUpdateTasks(data, { board })
    if (board === selectedBoard.value) await Promise.all([fetchTasks(true), fetchStats(), fetchBoards(), fetchAssignees()])
    return result
  }

  async function archiveTasks(taskIds: string[]) {
    const result = await bulkUpdateTasks({ ids: taskIds, archive: true })
    const failure = result.results.find(item => !item.ok)
    if (failure) {
      throw new Error(failure.error || `Failed to archive kanban task ${failure.id}`)
    }
    return result
  }

  async function getTaskLog(taskId: string, tail?: number) {
    assertCapability('taskLog')
    return kanbanApi.getTaskLog(taskId, { board: selectedBoard.value, tail })
  }

  async function getDiagnostics(opts: Omit<KanbanDiagnosticsOptions, 'board'> = {}) {
    assertCapability('diagnostics')
    return kanbanApi.getDiagnostics({ ...opts, board: selectedBoard.value })
  }

  async function reclaimTask(taskId: string, reason?: string) {
    assertCapability('reclaim')
    const board = selectedBoard.value
    const result = await kanbanApi.reclaimTask(taskId, { board, reason })
    if (board === selectedBoard.value) await Promise.all([fetchTasks(true), fetchStats(), fetchBoards()])
    return result
  }

  async function reassignTask(taskId: string, profile: string, opts: { reclaim?: boolean; reason?: string } = {}) {
    assertCapability('reassign')
    const board = selectedBoard.value
    const result = await kanbanApi.reassignTask(taskId, profile, { board, ...opts })
    if (board === selectedBoard.value) {
      const task = tasks.value.find(t => t.id === taskId)
      if (task) task.assignee = profile === 'none' ? null : profile
      await Promise.all([fetchStats(), fetchAssignees()])
    }
    return result
  }

  async function specifyTask(taskId: string, author?: string) {
    assertCapability('specify')
    const board = selectedBoard.value
    const result = await kanbanApi.specifyTask(taskId, { board, author })
    if (board === selectedBoard.value) await Promise.all([fetchTasks(true), fetchStats(), fetchBoards()])
    return result
  }

  async function dispatch(opts: Omit<KanbanDispatchOptions, 'board'> = {}) {
    assertCapability('dispatch')
    const board = selectedBoard.value
    const result = await kanbanApi.dispatch({ ...opts, board })
    if (board === selectedBoard.value) await Promise.all([fetchTasks(true), fetchStats(), fetchBoards()])
    return result
  }

  function setFilter(key: 'status' | 'assignee', value: string | null) {
    if (key === 'status') filterStatus.value = value
    else filterAssignee.value = value
  }

  function setBoard(board?: string | null) {
    return setSelectedBoard(board)
  }

  function setStatusFilter(status?: string) {
    filterStatus.value = status || null
    fetchTasks()
  }

  function setAssigneeFilter(assignee?: string) {
    filterAssignee.value = assignee || null
    fetchTasks()
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query
  }

  function clearSelection() {
    selectedIds.value.clear()
  }

  function toggleSelection(taskId: string) {
    if (selectedIds.value.has(taskId)) {
      selectedIds.value.delete(taskId)
    } else {
      selectedIds.value.add(taskId)
    }
  }

  async function moveTask(taskId: string, status: string) {
    const board = selectedBoard.value
    switch (status) {
      case 'done':
        await kanbanApi.completeTasks([taskId], undefined, { board })
        break
      case 'blocked':
        await kanbanApi.blockTask(taskId, '', { board })
        break
      case 'ready':
        // ready is the canonical "unblock" target
        await kanbanApi.unblockTasks([taskId], { board })
        break
      case 'todo':
      case 'scheduled':
      case 'triage':
      case 'archived':
        // These statuses need an explicit PATCH via bulkUpdate, NOT unblock
        // (unblock always sets status=ready server-side, which would desync)
        // HERMES_CUSTOM[v126]: bulk 对单条失败返回 200 + results[].ok=false——
        // 不回检则拖拽假成功（服务端状态未变，聚合刷新即回跳）。
        {
          const bulk = await kanbanApi.bulkUpdateTasks({ ids: [taskId], status: status as any }, { board })
          const failed = bulk.results.find(r => !r.ok)
          if (failed) throw new Error(failed.error || `bulk status ${status} failed for ${taskId}`)
        }
        break
      default: {
        const bulk = await kanbanApi.bulkUpdateTasks({ ids: [taskId], status: status as any }, { board })
        const failed = bulk.results.find(r => !r.ok)
        if (failed) throw new Error(failed.error || `bulk status ${status} failed for ${taskId}`)
        break
      }
    }
    if (board === selectedBoard.value) {
      const task = tasks.value.find(t => t.id === taskId)
      // HERMES_CUSTOM[v126]: todo/triage 的落点由父子门禁决定（可能落 ready），
      // 不做乐观写入，拉真值回填
      if (task && status !== 'todo' && status !== 'triage') task.status = status as KanbanTaskStatus
      if (status === 'todo' || status === 'triage') await fetchTasks(true)
      await Promise.all([fetchStats(), fetchBoards()])
    }
  }

  async function bulkComplete(taskIds: string[]) {
    return completeTasks(taskIds)
  }

  async function bulkBlock(taskIds: string[]) {
    const board = selectedBoard.value
    for (const id of taskIds) {
      await kanbanApi.blockTask(id, '', { board })
    }
    if (board === selectedBoard.value) {
      for (const id of taskIds) {
        const task = tasks.value.find(t => t.id === id)
        if (task) task.status = 'blocked'
      }
      await Promise.all([fetchStats(), fetchBoards()])
    }
  }

  async function bulkUnblock(taskIds: string[]) {
    return unblockTasks(taskIds)
  }

  async function bulkArchive(taskIds: string[]) {
    const board = selectedBoard.value
    await kanbanApi.bulkUpdateTasks({ ids: taskIds, archive: true }, { board })
    if (board === selectedBoard.value) {
      for (const id of taskIds) {
        const task = tasks.value.find(t => t.id === id)
        if (task) task.status = 'archived'
      }
      await Promise.all([fetchStats(), fetchBoards()])
    }
  }

  async function deleteTask(taskId: string) {
    const board = selectedBoard.value
    await kanbanApi.deleteTask(taskId, { board })
    if (board === selectedBoard.value) {
      tasks.value = tasks.value.filter(t => t.id !== taskId)
      selectedIds.value.delete(taskId)
      await Promise.all([fetchStats(), fetchBoards(), fetchAssignees()])
    }
  }

  async function patchTask(taskId: string, patch: kanbanApi.KanbanTaskPatch) {
    const board = selectedBoard.value
    const updated = await kanbanApi.patchTask(taskId, patch, { board })
    if (board === selectedBoard.value) {
      const idx = tasks.value.findIndex(t => t.id === taskId)
      if (idx >= 0) tasks.value[idx] = updated
      await Promise.all([fetchStats(), fetchBoards(), fetchAssignees()])
    }
    return updated
  }

  async function decomposeTask(taskId: string, author?: string) {
    const board = selectedBoard.value
    const result = await kanbanApi.decomposeTask(taskId, { board, author })
    if (board === selectedBoard.value) {
      await Promise.all([fetchTasks(true), fetchStats(), fetchBoards()])
    }
    return result
  }

  async function fetchDiagnostics(opts: Omit<KanbanDiagnosticsOptions, 'board'> = {}) {
    // overlay[kanban-diag-order]: 能力表已加载且 diagnostics 缺失时安静跳过——断言在自身
    // try/catch 之外抛出会形成未捕获 pageerror（2026-10-20 M3 走查实证）；能力表未加载
    // 时维持旧行为（尝试+失败如实 console.error）。
    if (capabilities.value && !isCapabilitySupported('diagnostics')) return
    const board = selectedBoard.value
    try {
      const result = await kanbanApi.getDiagnostics({ ...opts, board })
      if (board === selectedBoard.value) diagnostics.value = result
    } catch (err) {
      console.error('Failed to fetch kanban diagnostics:', err)
    }
  }

  async function fetchOrchestration() {
    const board = selectedBoard.value
    try {
      const result = await kanbanApi.getOrchestration({ board })
      if (board === selectedBoard.value) orchestration.value = result
    } catch (err) {
      console.error('Failed to fetch kanban orchestration:', err)
    }
  }

  async function saveOrchestrationSettings(patch: kanbanApi.KanbanOrchestrationPatch) {
    const board = selectedBoard.value
    const result = await kanbanApi.saveOrchestration(patch, { board })
    if (board === selectedBoard.value) orchestration.value = result
    return result
  }

  async function fetchAttachments(taskId: string) {
    const board = selectedBoard.value
    try {
      const result = await kanbanApi.listAttachments(taskId, { board })
      if (board === selectedBoard.value) attachments.value[taskId] = result
    } catch (err) {
      console.error('Failed to fetch attachments:', err)
    }
  }

  async function uploadTaskAttachment(taskId: string, file: File) {
    const board = selectedBoard.value
    const result = await kanbanApi.uploadAttachment(taskId, file, { board, uploadedBy: 'dashboard' })
    if (board === selectedBoard.value) {
      const list = attachments.value[taskId] || []
      list.push(result)
      attachments.value[taskId] = list
    }
    return result
  }

  async function uploadTaskAttachmentFromUrl(taskId: string, url: string, opts?: { filename?: string; contentType?: string }) {
    const board = selectedBoard.value
    const result = await kanbanApi.uploadAttachmentFromUrl(taskId, url, { board, filename: opts?.filename, contentType: opts?.contentType })
    if (board === selectedBoard.value) {
      const list = attachments.value[taskId] || []
      list.push(result)
      attachments.value[taskId] = list
    }
    return result
  }

  async function deleteTaskAttachment(taskId: string, attachmentId: number) {
    const board = selectedBoard.value
    await kanbanApi.deleteAttachment(attachmentId, { board, taskId })
    if (board === selectedBoard.value) {
      const list = attachments.value[taskId] || []
      attachments.value[taskId] = list.filter(a => a.id !== attachmentId)
    }
  }

  function connectEvents() {
    return startEventStream()
  }

  async function downloadTaskAttachment(taskId: string, attachmentId: number): Promise<Blob> {
    return kanbanApi.downloadAttachment(taskId, attachmentId, { board: selectedBoard.value })
  }

  async function saveProfileDescription(name: string, description: string) {
    const board = selectedBoard.value
    const result = await kanbanApi.saveProfileDescription(name, { description }, { board })
    if (board === selectedBoard.value) await fetchOrchestration()
    return result
  }

  async function autoGenerateProfileDescription(name: string, overwrite = false) {
    const board = selectedBoard.value
    const result = await kanbanApi.autoGenerateProfileDescription(name, { board, overwrite })
    if (board === selectedBoard.value) await fetchOrchestration()
    return result
  }

  // ─── HERMES_CUSTOM[v020] BEGIN: estimate / projects / board project
  async function listProjects() {
    const list = await kanbanApi.listProjects()
    projects.value = list
    return list
  }

  async function estimateTask(taskId: string) {
    return kanbanApi.estimateTask(taskId, { board: selectedBoard.value })
  }

  async function estimateText(title: string, body?: string) {
    return kanbanApi.estimateText(title, body)
  }

  async function patchBoardProject(slug: string, projectId: string | null) {
    await kanbanApi.patchBoard(slug, { project_id: projectId })
    await fetchBoards()
  }
  // ─── HERMES_CUSTOM[v020] END

  return {
    tasks,
    stats,
    assignees,
    boards,
    // HERMES_CUSTOM[v020]
    projects,
    capabilities,
    activeBoards,
    isCapabilitySupported,
    loading,
    boardsLoading,
    boardWarning,
    selectedBoard,
    filterStatus,
    filterAssignee,
    selectedIds,
    searchQuery,
    // Advanced features
    diagnostics,
    orchestration,
    attachments,
    fetchBoards,
    fetchCapabilities,
    fetchTasks,
    fetchStats,
    fetchAssignees,
    createTask,
    // HERMES_CUSTOM[v020]
    listProjects,
    estimateTask,
    estimateText,
    patchBoardProject,
    createBoard,
    archiveSelectedBoard,
    completeTasks,
    blockTask,
    unblockTasks,
    assignTask,
    addComment,
    linkTasks,
    unlinkTasks,
    bulkUpdateTasks,
    archiveTasks,
    getTaskLog,
    getDiagnostics,
    reclaimTask,
    reassignTask,
    specifyTask,
    dispatch,
    setFilter,
    setSelectedBoard,
    setBoard,
    setStatusFilter,
    setAssigneeFilter,
    setSearchQuery,
    clearSelection,
    toggleSelection,
    moveTask,
    bulkComplete,
    bulkBlock,
    bulkUnblock,
    bulkArchive,
    connectEvents,
    deleteTask,
    patchTask,
    decomposeTask,
    startEventStream,
    stopEventStream,
    recoverSelectedBoard,
    resolveAvailableBoard,
    clearBoardScopedState,
    refreshAll,
    // Advanced methods
    fetchDiagnostics,
    fetchOrchestration,
    saveOrchestrationSettings,
    downloadTaskAttachment,
    saveProfileDescription,
    autoGenerateProfileDescription,
    fetchAttachments,
    uploadTaskAttachment,
    uploadTaskAttachmentFromUrl,
    deleteTaskAttachment,
  }
})
