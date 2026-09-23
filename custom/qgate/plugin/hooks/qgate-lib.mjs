// 插件钩子共享库：stdin 读取、CLI 解析、opt-in 检查、Stop 预算状态。
// 该文件被各 hook 脚本 import；不直接执行。
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function readStdinJson() {
  try {
    const raw = await new Promise((res, rej) => {
      let data = ''
      process.stdin.on('data', (c) => (data += c))
      process.stdin.on('end', () => res(data))
      process.stdin.on('error', rej)
    })
    return raw ? JSON.parse(raw) : {}
  } catch {
    return null // 解析失败一律放行，绝不破坏宿主
  }
}

export function projectRootOf(input) {
  const cwd = typeof input?.cwd === 'string' ? input.cwd : process.cwd()
  return existsSync(join(cwd, '.qgate')) ? cwd : null
}

/** qgate CLI 解析：开发态 plugin/../dist/cli.js；打包态 plugin/dist/cli.js。 */
export function resolveCli() {
  const pluginRoot = fileURLToPath(new URL('.', import.meta.url)) // .../plugin/hooks/
  const candidates = [
    resolve(pluginRoot, '..', '..', 'dist', 'cli.js'),
    resolve(pluginRoot, '..', 'dist', 'cli.js'),
  ]
  return candidates.find((c) => existsSync(c)) ?? null
}

export function emit(obj) {
  process.stdout.write(JSON.stringify(obj))
  process.exit(0)
}

/** Stop 续跑预算状态（会话内持久；block 两次后降级放行+登记 Risk，总阻断 ≤2 < 3 上限）。 */
const MAX_BLOCKS = 2

export function stopBudgetState(qgateDir, sessionId) {
  const file = join(qgateDir, 'stop-state.json')
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    if (raw && raw.sessionId === sessionId) return raw
  } catch { /* 新会话或坏文件 → 重置 */ }
  return { sessionId, blocks: 0 }
}

export function saveStopBudgetState(qgateDir, state) {
  try {
    mkdirSync(qgateDir, { recursive: true })
    writeFileSync(join(qgateDir, 'stop-state.json'), JSON.stringify(state))
  } catch { /* 预算状态写失败只影响降级计数，不影响放行语义 */ }
}

/** 计算下一次阻断决策：false=不再阻断（预算耗尽，降级）。 */
export function canBlock(state) {
  return state.blocks < MAX_BLOCKS
}

export function registerDegradedRisk(qgateDir, blocking) {
  try {
    mkdirSync(join(qgateDir, 'risks'), { recursive: true })
    const id = `risk-degraded-${Date.now()}`
    writeFileSync(
      join(qgateDir, 'risks', `${id}.json`),
      JSON.stringify(
        {
          id,
          gateId: undefined,
          severity: 'high',
          description: `Stop budget exhausted; agent finished with blocking gates: ${blocking}. Evidence incomplete by design §5.3 degradation ladder.`,
          status: 'open',
          createdAt: Date.now(),
          source: 'qgate-stop-hook',
        },
        null,
        2,
      ) + '\n',
    )
  } catch { /* no-op */ }
}
