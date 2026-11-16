import type { InjectionKey } from 'vue'
import type { EkkoUIJsonValue, EkkoUINode, EkkoUIState } from './protocol'

/** 渲染器向下传递的上下文：状态、交互开关与事件入口。 */
export interface EkkoUISurfaceContext {
  state: EkkoUIState
  interactive: boolean
  /** 字段错误：nodeId -> 可读文案。 */
  errors: Map<string, string>
  setValue(path: string, value: EkkoUIJsonValue): void
  runEvent(node: EkkoUINode, eventName: string): void
}

export const EKKO_UI_SURFACE_CONTEXT: InjectionKey<EkkoUISurfaceContext> = Symbol('ekko-ui-surface')
