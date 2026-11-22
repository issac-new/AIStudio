// #22 端到端集成验证：显式隔离引擎走 engine-bridge 全握手
// （helloConversationV4/initialize/ProxyChannel）→ importSessionV4 写入并回读 imported 会话。
// 未显式配置时 skip；配置后只写调用者提供的隔离 HOME 与工作区，不触碰宿主引擎数据。
import { describe, it, expect } from 'vitest'
import net from 'net'
import { hostname } from 'node:os'
import { resolve } from 'node:path'
import { buildServerRemoteWorkspaceIdentity, remoteHostIdFromWorkspaceIdentity } from '../../../vendor/zcode/packages/shared/src/remote-workspace-identity.js'

const engineUrl = process.env.ZCODE_ENGINE_URL?.trim() || 'ws://127.0.0.1:3030/ws'
const intHome = process.env.ZCODE_ENGINE_INT_HOME?.trim()
const intWorkspace = process.env.ZCODE_ENGINE_INT_WORKSPACE?.trim()
const engineInt = process.env.ZCODE_ENGINE_INT === '1'
const serverId = process.env.ZCODE_SERVER_ID?.trim() || hostname()
const storageHostId = remoteHostIdFromWorkspaceIdentity(buildServerRemoteWorkspaceIdentity({ serverId, workspacePath: '/' }))!

if (engineInt && (!intHome || !intWorkspace)) {
  throw new Error('ZCODE_ENGINE_INT=1 时必须同时提供 ZCODE_ENGINE_INT_HOME 与 ZCODE_ENGINE_INT_WORKSPACE')
}

async function engineUp(url: string): Promise<boolean> {
  const target = new URL(url)
  const host = target.hostname.replace(/^\[|\]$/g, '')
  const port = Number(target.port || 3030)
  return new Promise((resolve) => {
    const s = net.connect({ port, host, timeout: 1200 })
    s.on('connect', () => { s.destroy(); resolve(true) })
    s.on('error', () => resolve(false))
    s.on('timeout', () => { s.destroy(); resolve(false) })
  })
}

// 旧引擎没有 importSessionV4 时 skip；其它异常不得被误记为 RPC 缺失。
async function engineHasImportRpc(): Promise<boolean> {
  try {
    const { connectZCodeEngine } = await import('../zcode/engine-bridge')
    const bridge = await connectZCodeEngine(intHome!, { url: engineUrl })
    try {
      await bridge.agent.importSessionV4({ workspacePath: intWorkspace!, source: 'claudeCode', sourceId: 'capability-probe', rows: [] })
      return true
    } catch (err) {
      return !/Method not found/i.test(String((err as Error)?.message ?? err))
    } finally {
      bridge.close()
    }
  } catch {
    return false
  }
}

const engineReady = engineInt && (await engineUp(engineUrl)) && (await engineHasImportRpc())
describe.skipIf(!engineReady)('importSession 端到端（隔离真引擎）', () => {
  it('归一化行 → importSessionV4 → listSessions 回读 imported 会话', async () => {
    const { connectZCodeEngine } = await import('../zcode/engine-bridge')
    const { TaskIndexRepo } = await import(resolve(__dirname, '../../../vendor/zcode/packages/services/src/session/taskIndexRepo.js'))
    const repo = new TaskIndexRepo(undefined, storageHostId)
    let projectId = ''
    try {
      const projectRepo = await repo.getProjectRepository()
      projectId = (await projectRepo.saveProject({ name: 'QA isolated import', roots: [intWorkspace!] })).id
    } finally {
      repo.close()
    }
    const bridge = await connectZCodeEngine(intHome!, { url: engineUrl })
    try {
      const result = await bridge.agent.importSessionV4({
        workspacePath: intWorkspace!,
        projectId,
        source: 'claudeCode',
        sourceId: `verify-import-${Date.now()}`,
        rows: [
          { role: 'user', text: '引擎重启验证：这是一条导入验证消息', at: Date.now() - 60_000 },
          { role: 'assistant', text: '导入验证回复（由 overlay importSessionV4 写入）', at: Date.now() - 30_000 },
          { role: 'tool', text: 'Bash: echo verify', at: Date.now() },
        ],
      })
      expect(result.sessionId).toMatch(/^import-claudeCode-/)
      expect(result.rowsWritten).toBe(3)
      const sessions = await bridge.agent.listSessions({ workspacePath: intWorkspace! })
      expect(sessions.some((session) => session.sessionId === result.sessionId)).toBe(true)
      // eslint-disable-next-line no-console
      console.log('[verify] imported session:', result.sessionId, 'rows:', result.rowsWritten)
    } finally {
      bridge.close()
    }
  }, 30_000)
})
