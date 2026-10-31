import { personSessionId } from '../../contracts/person-session'
import { personError, personRevision, personText } from '../../contracts/person'
import { isAbsolute, join } from 'node:path'
import { getWebUiHome } from '../../public/config'
import { ensureDirectory, normalizeDirectoryTarget } from '../workspace/directory'
import { personHasPendingWork } from '../../repositories/person-history-store'
import { createSession } from '../../repositories/session-store'
import { assertPersonBotNameAvailable, beginPersonSessionDeletion, listPersonSessions, requirePersonSession } from '../../repositories/person-session-store'
import { clearPersonHistory } from '../../repositories/person-history-store'
import { personUpdated } from '../../repositories/person-updates'
import { getChatRunServer } from '../../public/chat-run'
import { effectivePersonSettings, personUser, personModelSelection, validatePersonSelection, PERSON_REASONING_EFFORTS } from './catalog'
import { ensurePersonSession, personChatBusy } from './chat-agent'
import { personWorkspace } from './workspace'
import { stopPersonSessionTasks } from './tasks'
import { stopPersonSessionFlows } from './stage-flows'
import { DEFAULT_PERSON_BOT_TYPE, personBot } from '../../../../../../shared/person-bots'
import { personDb, personSettings, personTransaction, savePersonSettingsInTransaction } from '../../repositories/person-store'

export function personConversations(userId: number, query = '', offset = 0) {
  personUser(userId)
  const sessions = listPersonSessions(userId, query.slice(0, 200), offset, 51)
  return { sessions: sessions.slice(0, 50), next_offset: sessions.length > 50 ? offset + 50 : null }
}

export async function createPersonConversation(userId: number, title: unknown, input: Record<string, unknown> = {}) {
  personUser(userId)
  const name = personText(title, 'conversation name', 100)
  assertPersonBotNameAvailable(userId, name)
  const bot = personBot(input.bot_type ?? DEFAULT_PERSON_BOT_TYPE)
  if (!bot) throw personError('Unknown bot type')
  const stored = personSettings(userId)
  const initial = { ...stored.settings }
  if (input.workspace !== undefined) {
    if (typeof input.workspace !== 'string' || input.workspace.length > 4000) throw personError('Invalid workspace')
    initial.workspace = normalizeDirectoryTarget(input.workspace.trim())
    if (initial.workspace && !isAbsolute(initial.workspace)) throw personError('Workspace must be an absolute path')
  }
  const workspaceChanged = initial.workspace !== stored.settings.workspace
  const checkWorkspaceChange = () => {
    if (!workspaceChanged) return
    if (personChatBusy(userId) || personHasPendingWork(userId)) throw personError('Wait for Person tasks and replies before changing workspace', 409)
    if (personSettings(userId).revision !== personRevision(input.expected_revision)) throw personError('Settings changed; reload and retry', 409)
  }
  checkWorkspaceChange()
  if (input.model !== undefined) {
    if (!input.model || typeof input.model !== 'object' || Array.isArray(input.model)) throw personError('Invalid model')
    initial.model = await personModelSelection(userId, input.model as Record<string, unknown>)
    await validatePersonSelection(userId, initial.model)
  }
  if (input.reasoning_effort !== undefined) {
    if (typeof input.reasoning_effort !== 'string' || (input.reasoning_effort !== '' && !PERSON_REASONING_EFFORTS.includes(input.reasoning_effort as any))) throw personError('Invalid reasoning effort')
    initial.reasoningEffort = input.reasoning_effort
  }
  const { settings, reasoning_efforts } = await effectivePersonSettings(userId, { ...stored, settings: initial })
  if (input.reasoning_effort && !reasoning_efforts.includes(input.reasoning_effort as any)) throw personError('Model does not support this reasoning effort')
  if (workspaceChanged && initial.workspace) await ensureDirectory(initial.workspace)
  personUser(userId)
  const id = personSessionId()
  const workspace = workspaceChanged ? initial.workspace || join(getWebUiHome(), 'person', String(userId), 'workspace') : personWorkspace(userId)
  personTransaction(() => {
    // Recheck after model/directory awaits, under the same write lock as insertion.
    assertPersonBotNameAvailable(userId, name)
    checkWorkspaceChange()
    if (workspaceChanged) savePersonSettingsInTransaction(userId, initial, personRevision(input.expected_revision), workspace)
    createSession({ id, user_id: userId, studio_user_id: userId, title: name, bot_type: bot.type,
      source: 'builtin_agent', agent: 'ekko-agent', agent_preset: 'person', agent_mode: 'scoped',
      profile: settings.model?.profile || 'default', workspace, push_enabled: false })
    if (input.model !== undefined || input.reasoning_effort !== undefined) {
      personDb().prepare('INSERT INTO person_conversation_settings VALUES (?,?,?)')
        .run(id, userId, JSON.stringify({ model: initial.model, reasoningEffort: settings.reasoningEffort }))
    }
  })
  personUpdated(userId)
  return (await ensurePersonSession(userId, id)).session
}

export async function deletePersonConversation(userId: number, sessionId: string, expectedRevision: unknown) {
  personUser(userId)
  const session = requirePersonSession(userId, sessionId)
  const revision = personRevision(expectedRevision)
  if (session.history_revision !== revision) throw Object.assign(new Error('Conversation changed; reload and retry'), { status: 409 })
  const release = beginPersonSessionDeletion(userId, sessionId)
  try {
    await stopPersonSessionFlows(userId,sessionId)
    const server = getChatRunServer()
    await server?.abortSession?.(sessionId, 'Person conversation deleted', { waitForTermination: true })
    await stopPersonSessionTasks(userId, sessionId)
    personUser(userId)
    const result = clearPersonHistory(userId, sessionId, revision, true)
    for (const id of result.sessionIds) await server?.disposeSession?.(id)
    personUpdated(userId)
    return { deleted: true, session_id: sessionId }
  } finally { release() }
}
