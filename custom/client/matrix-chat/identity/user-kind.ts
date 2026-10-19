// overlay/custom/client/matrix-chat/identity/user-kind.ts
// 群聊成员身份归类（2026-10-19 群聊身份标识轮，spec D-1）：AI = 命中产品建号
// 命名约定（localpart 以 -agent 结尾），未命中一律按人类——白名单式，宁可漏标
// AI 不可错标人类。约定正本 = 服务端 registry-admin.ts provisionMatrixAccount
// （`@${name}-agent`），本文件是客户端镜像；user-kind.test.ts 绊线钉住两端不漂移。

export type UserKind = 'human' | 'ai'

/** 产品建号命名约定镜像：AI 助理号 localpart 一律 `<name>-agent`。 */
export const AGENT_LOCALPART_SUFFIX = '-agent'

export function isAiUserId(userId: string): boolean {
  const local = (userId.startsWith('@') ? userId.slice(1) : userId).split(':')[0]
  return local.toLowerCase().endsWith(AGENT_LOCALPART_SUFFIX)
}

/** 身份行/徽标词条（模块内建词典 + computed locale，governance 先例——不 merge
 *  全局 i18n 树，避开 switchLocale 重建词条树的时序竞态，spec D-5）。 */
export const userKindMessages = {
  zh: { aiBadge: 'AI', aiMember: 'AI 员工', humanMember: '人类员工' },
  en: { aiBadge: 'AI', aiMember: 'AI Agent', humanMember: 'Human' },
} as const
