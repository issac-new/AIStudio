// overlay/custom/client/loop/orchestrator/spec.ts
// P4 编排器 —— GraphSpec 校验/分析纯函数的 client 侧出口（薄 re-export 层）。
//
// 事实源在服务端 custom/server/loop/graph/graph-spec.ts（import 链纯依赖
// ./types + ./predicate，无 node API，可被浏览器侧安全引入）；参照
// custom/client/loop/types.ts 的跨根 re-export 模式：vite/vitest 按物理真实
// 路径解析不受符号链接影响。本文件是 orchestrator 模块唯一允许跨根 import
// 的位置，组件一律从 './spec' / '../spec' 取用。
export {
  validateGraphSpec,
  analyzeGraphSpec,
  collectBackEdges,
  GraphSpecError,
} from '../../../server/loop/graph/graph-spec'
export type {
  GraphSpec,
  NodeSpec,
  EdgeSpec,
  GraphSpecMeta,
  SpecContainer,
  SpecWarning,
} from '../../../server/loop/graph/graph-spec'
export type { PredicateExpr, LoopGuard } from '../../../server/loop/graph/predicate'

/** plan 节点三通道（append planResult / overwrite planDecision / overwrite planMode）。
 *  事实源：custom/server/loop/graph/spec-runtime.ts 的 PLAN_CHANNELS。
 *  spec-runtime 经 phase-nodes 引 child_process（浏览器侧不可 import），故此处
 *  镜像常量；两处同步由 orchestrator/__tests__/editor.test.ts 的通道脚手架
 *  用例锚定（plan 节点必须补齐这三个通道）。 */
export const PLAN_CHANNELS = ['planResult', 'planDecision', 'planMode'] as const

/** Best-of-N 默认通道对（bo-n-variant 收集 / converge 中选）。
 *  事实源：spec-runtime.ts 各工厂的 config 缺省值。 */
export const BO_N_COLLECT_CHANNEL_DEFAULT = 'boN.candidates'
export const BO_N_WINNER_CHANNEL_DEFAULT = 'boN.winner'

/** 编辑器节点类型全集（spec-runtime.ts 注册表键；agent 为画布语义占位） */
export type EditorNodeType =
  | 'function'
  | 'human'
  | 'plan'
  | 'fanout'
  | 'bo-n-variant'
  | 'converge'
  | 'gate'
  | 'agent'

export const EDITOR_NODE_TYPES: EditorNodeType[] = [
  'function', 'human', 'plan', 'fanout', 'bo-n-variant', 'converge', 'gate', 'agent',
]
