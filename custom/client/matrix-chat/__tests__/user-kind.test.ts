// @vitest-environment jsdom
// overlay/custom/client/matrix-chat/__tests__/user-kind.test.ts
// 身份归类纯函数 + 徽标组件 + 服务端约定绊线（2026-10-19 群聊身份标识轮，spec D-1/D-6）。
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isAiUserId, AGENT_LOCALPART_SUFFIX, userKindMessages } from '../identity/user-kind'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k, locale: { value: 'zh' } }) }))

import MatrixUserKindBadge from '../components/MatrixUserKindBadge.vue'
import MatrixSenderProfile from '../components/MatrixSenderProfile.vue'

// 服务端正本（registry-admin.ts 建号模板）——客户端镜像绊线（spec D-6）
const registryAdminSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../server/governance/registry-admin.ts'),
  'utf-8',
)

describe('isAiUserId —— -agent 命名约定镜像（白名单式）', () => {
  it('命中后缀才判 AI；其余一律人类（宁可漏标不错标）', () => {
    expect(isAiUserId('@hu-qi-agent:matrix.test')).toBe(true)
    expect(isAiUserId('@hu-qi-agent')).toBe(true)
    expect(isAiUserId('@X-AGENT:matrix.test')).toBe(true)
    expect(isAiUserId('@agent:matrix.test')).toBe(false)
    expect(isAiUserId('@x-agents:matrix.test')).toBe(false)
    expect(isAiUserId('@zhang:matrix.test')).toBe(false)
    expect(isAiUserId('zhang:matrix.test')).toBe(false)
    expect(isAiUserId('')).toBe(false)
  })
})

describe('绊线：客户端镜像与服务端建号约定不漂移（spec D-6）', () => {
  it('registry-admin 建号模板仍产 -agent 号，且客户端后缀一致', () => {
    expect(registryAdminSrc).toContain('`@${name}-agent:${serverName}`')
    expect(AGENT_LOCALPART_SUFFIX).toBe('-agent')
  })

  it('服务端正本判定函数在位（isAgentMatrixUser 与客户端同语义）', () => {
    expect(registryAdminSrc).toContain('export function isAgentMatrixUser')
    expect(registryAdminSrc).toContain("endsWith('-agent')")
  })
})

describe('MatrixUserKindBadge —— 渲染两态', () => {
  it('自动归类：AI 账号显徽标（机器人图形 + AI 字样）', () => {
    const w = mount(MatrixUserKindBadge, { props: { userId: '@qi-agent:matrix.test' } })
    expect(w.find('[data-testid="mx-user-kind-ai"]').exists()).toBe(true)
    expect(w.text()).toContain('AI')
  })

  it('自动归类：人类账号不渲染（零错标）', () => {
    const w = mount(MatrixUserKindBadge, { props: { userId: '@zhang:matrix.test' } })
    expect(w.find('[data-testid="mx-user-kind-ai"]').exists()).toBe(false)
    expect(w.find('[data-testid="mx-user-kind-human"]').exists()).toBe(false)
  })

  it('强制模式：kind=human 显人类徽标（成员详情身份行两态都显）', () => {
    const w = mount(MatrixUserKindBadge, { props: { kind: 'human' } })
    expect(w.find('[data-testid="mx-user-kind-human"]').exists()).toBe(true)
    expect(w.text()).toContain(userKindMessages.zh.humanMember)
  })

  it('强制模式：kind=ai 用全称词条', () => {
    const w = mount(MatrixUserKindBadge, { props: { kind: 'ai' } })
    expect(w.text()).toContain(userKindMessages.zh.aiMember)
  })
})

describe('MatrixSenderProfile 接线 —— AI 发送者昵称旁带徽标', () => {
  vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
    useMatrixRoomStore: () => ({ roomVersion: 0, activeRoom: null, getUserAvatarUrl: () => null }),
  }))
  vi.mock('@/custom/matrix-chat/stores/matrix-right-panel', () => ({
    useMatrixRightPanelStore: () => ({ openMemberInfo: () => {} }),
  }))

  it('AI 发送者显徽标；人类发送者不显', async () => {
    const { default: Profile } = await import('../components/MatrixSenderProfile.vue')
    const ai = mount(Profile, { props: { userId: '@qi-agent:matrix.test' } })
    expect(ai.find('[data-testid="mx-user-kind-ai"]').exists()).toBe(true)
    const human = mount(Profile, { props: { userId: '@zhang:matrix.test' } })
    expect(human.find('[data-testid="mx-user-kind-ai"]').exists()).toBe(false)
  })
})
