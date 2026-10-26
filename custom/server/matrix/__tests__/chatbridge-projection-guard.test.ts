// 补丁 509 守门（2026-10-26 九段校正 Task 3）：ChatBridge 入向=纯投影。
// 落进本地群房的远端消息只持久化+广播；agent turn 唯一入口=本机 hermes gateway。
// 回归面=processMentions 曾是补丁 509 的入向编排尾段（第二套编排器旁路）。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../..')
const PATCH = readFileSync(resolve(ROOT, 'patches/509-server-groupchat-bridge-api.patch'), 'utf8')
const BRIDGE = readFileSync(resolve(ROOT, 'custom/server/matrix/chat-bridge.ts'), 'utf8')

describe('ChatBridge 入向投影化（patch 509 守门）', () => {
  it('补丁 509 不得再携带 processMentions 编排（投影只持久化+广播）', () => {
    expect(PATCH).not.toContain('processMentions')
    expect(PATCH).toContain('publishBridgeMemberMessage')
    expect(PATCH).toContain('不触发 agentClients 编排')
  })

  it('chat-bridge 入向仍投影（handleMatrixEvent 注入本地房）——收口编排≠砍投影', () => {
    expect(BRIDGE).toContain('handleMatrixEvent')
    expect(BRIDGE).toContain('publishBridgeMemberMessage')
  })

  it('审批远端通知通道保留（bridgeEvents 订阅面仍在）', () => {
    expect(PATCH).toContain('bridgeEvents')
    expect(PATCH).toContain('approval.requested')
  })
})
