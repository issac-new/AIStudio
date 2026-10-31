import { randomUUID } from 'node:crypto'

export const personExecutionSessionId = (executionId: string) => `person-task-${executionId}`

/** Account identity is independent of the Profile used to execute a model call. */
export const personSessionId = () => `person-main-${randomUUID()}`
export const personNotificationRoom = (userId: number) => `person-notifications:${userId}`
export const isPersonSession = (id?: string | null) => !!id?.startsWith('person-main-')
export const isPrivatePersonSession = (id?: string | null) => isPersonSession(id) || !!id?.startsWith('person-task-')
export function ownsPersonSession(userId: number | undefined, session: { id: string; studio_user_id?: string | number | null } | null | undefined) {
  return userId !== undefined && !!session && isPersonSession(session.id) && String(session.studio_user_id) === String(userId)
}
