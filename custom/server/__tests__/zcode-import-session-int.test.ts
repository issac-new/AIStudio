// #22 端到端集成验证（引擎重启验证轮）：真连 :3030 引擎走 engine-bridge 全握手
// （helloConversationV4/initialize/ProxyChannel）→ importSessionV4 写入 imported
// 会话。引擎不可达时 skip（手动验证场景专用）。
import { describe, it, expect } from 'vitest'
import net from 'net'

async function engineUp(port = 3030): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1', timeout: 1200 })
    s.on('connect', () => { s.destroy(); resolve(true) })
    s.on('error', () => resolve(false))
    s.on('timeout', () => { s.destroy(); resolve(false) })
  })
}

describe.skipIf(!(await engineUp()))('importSession 端到端（真引擎）', () => {
  it('归一化行 → importSessionV4 → imported 会话（sessionId+rowsWritten）', async () => {
    const { connectZCodeEngine } = await import('../zcode/engine-bridge')
    const bridge = await connectZCodeEngine(`${process.env.HOME ?? '/tmp'}/.hermes/zcode-engine`)
    try {
      const result = await bridge.agent.importSessionV4({
        workspacePath: '/Volumes/nvme2230/lab/ncwk',
        source: 'claudeCode',
        sourceId: 'verify-import-20260929',
        rows: [
          { role: 'user', text: '引擎重启验证：这是一条导入验证消息', at: Date.now() - 60_000 },
          { role: 'assistant', text: '导入验证回复（由 overlay importSessionV4 写入）', at: Date.now() - 30_000 },
          { role: 'tool', text: 'Bash: echo verify', at: Date.now() },
        ],
      })
      expect(result.sessionId).toMatch(/^import-claudeCode-/)
      expect(result.rowsWritten).toBe(3)
      // eslint-disable-next-line no-console
      console.log('[verify] imported session:', result.sessionId, 'rows:', result.rowsWritten)
    } finally {
      bridge.close()
    }
  }, 30_000)
})
