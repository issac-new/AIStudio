// overlay/custom/server/services/hermes/__tests__/task-workspace-cache.test.ts
// coding-agent 工作区放行守门（2026-10-21 Ycode 环境修复）：
// IDE coding 会话默认根在 <webuiHome>/coding-agent/workspace/，不在 hermes base
// （~/.hermes）内；files/download 的 root 沙箱需按段边界放行该目录。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isWithinCodingAgentWorkspace } from '../task-workspace-cache'

const savedHome = process.env.HERMES_WEB_UI_HOME
const savedState = process.env.HERMES_WEBUI_STATE_DIR

beforeEach(() => {
  delete process.env.HERMES_WEB_UI_HOME
  delete process.env.HERMES_WEBUI_STATE_DIR
})

afterEach(() => {
  if (savedHome === undefined) delete process.env.HERMES_WEB_UI_HOME
  else process.env.HERMES_WEB_UI_HOME = savedHome
  if (savedState === undefined) delete process.env.HERMES_WEBUI_STATE_DIR
  else process.env.HERMES_WEBUI_STATE_DIR = savedState
})

describe('isWithinCodingAgentWorkspace', () => {
  it('放行 webuiHome/coding-agent/workspace 内的会话根', () => {
    process.env.HERMES_WEB_UI_HOME = '/tmp/ncwk-webui'
    expect(isWithinCodingAgentWorkspace('/tmp/ncwk-webui/coding-agent/workspace')).toBe(true)
    expect(isWithinCodingAgentWorkspace('/tmp/ncwk-webui/coding-agent/workspace/default/global')).toBe(true)
  })

  it('段边界：workspace-evil 等兄弟目录不放行', () => {
    process.env.HERMES_WEB_UI_HOME = '/tmp/ncwk-webui'
    expect(isWithinCodingAgentWorkspace('/tmp/ncwk-webui/coding-agent/workspace-evil/x')).toBe(false)
    expect(isWithinCodingAgentWorkspace('/tmp/ncwk-webui/coding-agent/other')).toBe(false)
    expect(isWithinCodingAgentWorkspace('/tmp/ncwk-webui/other')).toBe(false)
  })

  it('HERMES_WEBUI_STATE_DIR 回退（一级覆盖缺席时）', () => {
    process.env.HERMES_WEBUI_STATE_DIR = '/tmp/ncwk-state'
    expect(isWithinCodingAgentWorkspace('/tmp/ncwk-state/coding-agent/workspace/a')).toBe(true)
  })
})
