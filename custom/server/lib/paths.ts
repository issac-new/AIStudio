// custom/server/lib/paths.ts
// Hermes 家目录解析单一事实源（2026-10-28 对账轮 K16 收敛）：
// 此前 `.hermes` / `.hermes-web-ui` 在 20+ 处内联回退，且存在三套行为不同的 helper
// （有的 trim、有的不 trim、有的直接 join）。本模块统一语义：
//   显式 env（trim 后非空）优先 → 缺省 $HOME/<name>
// 新增代码一律从这里取，不再各域自己 join(homedir(), '.hermes')。
import { homedir } from 'node:os'
import { join } from 'node:path'

const pick = (v: string | undefined): string => (v ?? '').trim()

/** hermes 运行根（HERMES_HOME），缺省 ~/.hermes */
export function hermesHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = pick(env.HERMES_HOME)
  return explicit || join(homedir(), '.hermes')
}

/** hermes-web-ui 状态根（HERMES_WEB_UI_HOME），缺省 ~/.hermes-web-ui */
export function hermesWebUiHome(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = pick(env.HERMES_WEB_UI_HOME)
  return explicit || join(homedir(), '.hermes-web-ui')
}

/** hermes 根下拼路径（统一走 hermesHome，避免各域重复实现） */
export function underHermes(...segments: string[]): string {
  return join(hermesHome(), ...segments)
}

/** web-ui 根下拼路径 */
export function underWebUi(...segments: string[]): string {
  return join(hermesWebUiHome(), ...segments)
}
