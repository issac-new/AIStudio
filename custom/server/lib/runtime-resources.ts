// runtime 资源单一解析器（P1 平台重写 Task 7）。
//
// 四消费点（pricing/roster 名册/列编排/治理台账）此前各自持路径解析：pricing 是
// 单一相对路径（打包态 __dirname 指向 dist、目标落应用外静默回空），roster 族走
// squad-protocol 的多候选探测——两种行为并存且互不感知。本模块收敛为一个事实源：
// 从 fromDir 向上逐级探测 <dir>/runtime/<rel>（覆盖 dist/server 同级 runtime/、
// 向上含 runtime/ 的应用根、源码仓根三类形态），全 miss 回 null（不猜）。
//
// 越界 rel（绝对路径、.. 段）直接抛错：探测面是受控部署形态，不是任意路径跳板——
// env 覆盖（HERMES_PRICING_TABLE 等）由调用侧先行判定，不走本解析器。
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

/** 向上探测的层数上限（与既有 squad-protocol resolveRosterFile 口径一致）。 */
const MAX_UP = 6

/**
 * 解析 runtime 资源文件路径。
 * @param relUnderRuntime runtime/ 下的相对路径（如 'pricing/models.yaml'）
 * @param fromDir 探测起点（缺省 __dirname；打包态传 dist/server）
 * @returns 命中的绝对路径；全 miss 返回 null
 * @throws rel 为绝对路径、含 .. 段或为空时抛错（越界输入不是「未找到」）
 */
export function resolveRuntimeResource(relUnderRuntime: string, fromDir: string = __dirname): string | null {
  const rel = String(relUnderRuntime ?? '')
  if (!rel) throw new Error('resolveRuntimeResource: rel 不能为空')
  if (isAbsolute(rel)) {
    throw new Error(`resolveRuntimeResource: 拒绝绝对路径 rel（${rel}）——env 覆盖由调用侧先行判定`)
  }
  if (rel.split(/[\\/]/).includes('..')) {
    throw new Error(`resolveRuntimeResource: 拒绝含 .. 段的 rel（${rel}）——探测面不允许越界`)
  }
  let dir = fromDir
  for (let i = 0; i <= MAX_UP; i++) {
    const candidate = resolve(dir, 'runtime', rel)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}
