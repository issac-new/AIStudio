// overlay/custom/client/matrix-teams/stores/qgate-bridge-state.node.ts
// bridge-state 离线持久化（.qgate/bridge-state.json：caseId→roomId 镜像）。
// 独立成文件的原因：node:fs/node:path 依赖只允许在 node 侧（CLI/插件/测试）使用——
// 混进 qgate-bridge.ts 会被浏览器 bundle 打包，vite externalize 在 import 绑定即抛错
// （2026-10-08 吸收轮浏览器走查实锤）。浏览器侧 store 一律不 import 本文件。
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function loadBridgeState(qgateDir: string): Record<string, string> {
  try {
    const raw = JSON.parse(readFileSync(join(qgateDir, 'bridge-state.json'), 'utf8')) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return {}
  }
}

export function saveBridgeState(qgateDir: string, state: Record<string, string>): void {
  try {
    mkdirSync(join(qgateDir), { recursive: true })
    writeFileSync(join(qgateDir, 'bridge-state.json'), JSON.stringify(state, null, 2) + '\n', 'utf8')
  } catch { /* 镜像写失败不阻断上报 */ }
}

export function bridgeStateExists(qgateDir: string): boolean {
  return existsSync(join(qgateDir, 'bridge-state.json'))
}
