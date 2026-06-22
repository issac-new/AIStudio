import { type ComposerTranslation } from 'vue-i18n'
import { KnownMembership, type MatrixEvent } from 'matrix-js-sdk'

/**
 * 生成状态事件(m.room.create / m.room.member)的人类可读文案。
 * 对齐 element-web 的 TextForEvent.tsx → textForMemberEvent / stateHandlers。
 *
 * 返回的字符串用 {user} / {sender} / {target} / {reason} 占位,
 * 由调用方传给 i18n 的 t() 做插值。
 *
 * @returns 文案模板(null = 该事件不应显示,如 no-op member event)
 */
export function formatStateEvent(
  event: MatrixEvent,
  t: ComposerTranslation,
  getDisplayName?: (userId: string) => string,
): string | null {
  const type = event.getType()
  if (type === 'm.room.create') {
    const sender = event.getSender()
    const name = getDisplayName?.(sender) ?? sender
    return t('matrixChat.stateRoomCreated', { user: name })
  }

  if (type === 'm.room.member') {
    return formatMemberEvent(event, t, getDisplayName)
  }

  return null
}

/** 解析 m.room.member 事件,对齐 element-web textForMemberEvent。 */
function formatMemberEvent(
  event: MatrixEvent,
  t: ComposerTranslation,
  getDisplayName?: (userId: string) => string,
): string | null {
  const content = event.getContent() as any
  const prevContent = (event.getPrevContent?.() ?? {}) as any
  const membership = content?.membership
  const prevMembership = prevContent?.membership

  const sender = event.getSender() ?? ''
  const target = event.getStateKey?.() ?? ''
  const senderName = getDisplayName?.(sender) ?? sender
  const targetName = getDisplayName?.(target) ?? target

  // 邀请
  if (membership === KnownMembership.Invite) {
    // 接受邀请的三方邀请已在 prevContent 处理,这里只处理直接 invite
    if (prevMembership === KnownMembership.Invite) {
      // invite → invite:可能是改了 displayname(第三方邀请被接受),不显示
      return null
    }
    return t('matrixChat.stateInvited', { sender: senderName, target: targetName })
  }

  // 封禁
  if (membership === KnownMembership.Ban) {
    if (prevMembership === KnownMembership.Ban) return null // 已封禁,重复事件
    const reason = content?.reason ? t('matrixChat.stateReason', { reason: content.reason }) : ''
    return t('matrixChat.stateBanned', { sender: senderName, target: targetName, reason })
  }

  // 加入
  if (membership === KnownMembership.Join) {
    // join → join:profile 变更(displayname / avatar)。hasText 过滤逻辑:
    // 只在 displayname 或 avatar 变化时显示,且用专门的 "changed name" 文案
    if (prevMembership === KnownMembership.Join) {
      const nameChanged = content.displayname !== prevContent.displayname
      const avatarChanged = content.avatar_url !== prevContent.avatar_url
      if (!nameChanged && !avatarChanged) return null // no-op,不显示

      if (nameChanged) {
        const oldName = prevContent.displayname ?? targetName
        const newName = content.displayname ?? targetName
        return t('matrixChat.stateChangedName', { user: oldName, newName })
      }
      // avatar 变更不显示(太吵),返回 null
      return null
    }
    // leave/invite/none → join:正常加入
    return t('matrixChat.stateJoined', { user: targetName })
  }

  // 离开
  if (membership === KnownMembership.Leave) {
    // 自己主动离开(sender === target)
    if (sender === target) {
      if (prevMembership === KnownMembership.Invite) {
        return t('matrixChat.stateRejectedInvite', { user: targetName })
      }
      if (prevMembership === KnownMembership.Ban) {
        return null // 被 unban 了,下面有专门处理(实际 leave from ban 不会到这)
      }
      const reason = content?.reason ? t('matrixChat.stateReason', { reason: content.reason }) : ''
      return t('matrixChat.stateLeft', { user: targetName, reason })
    }
    // 被踢 / 被撤回邀请 / 被 unban(sender !== target)
    if (prevMembership === KnownMembership.Invite) {
      return t('matrixChat.stateWithdrewInvite', { sender: senderName, target: targetName })
    }
    if (prevMembership === KnownMembership.Ban) {
      return t('matrixChat.stateUnbanned', { sender: senderName, target: targetName })
    }
    // 被踢
    const reason = content?.reason ? t('matrixChat.stateReason', { reason: content.reason }) : ''
    return t('matrixChat.stateKicked', { sender: senderName, target: targetName, reason })
  }

  return null
}
