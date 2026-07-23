// overlay/custom/server/loop/graph/channel-store.ts
// ChannelStore — 分通道状态管理（LangGraph 模式）
// 每个 state key 有独立的 reducer，并行节点写不同通道不会互相覆盖

import type { StateSchema, StateValues, StateUpdate } from './types'

export class ChannelStore {
  private values: StateValues = {}
  private schema: StateSchema

  constructor(schema: StateSchema, initialValues?: StateValues) {
    this.schema = schema
    if (initialValues) {
      // 初始化时直接赋值（不走 reducer）
      this.values = { ...initialValues }
    }
    // 填充默认值
    for (const [name, channel] of Object.entries(schema)) {
      if (this.values[name] === undefined && channel.default !== undefined) {
        this.values[name] = channel.default
      }
    }
  }

  /** 应用部分更新 — 每个 key 走自己的 reducer */
  apply(update: StateUpdate): void {
    for (const [key, newValue] of Object.entries(update)) {
      if (newValue === undefined) continue
      const channel = this.schema[key]
      if (channel) {
        this.values[key] = channel.reducer(this.values[key], newValue)
      } else {
        // 无 schema 的 key 直接覆盖
        this.values[key] = newValue
      }
    }
  }

  /** 批量应用多个更新（super-step 内多个节点并行返回） */
  applyAll(updates: StateUpdate[]): void {
    for (const update of updates) {
      this.apply(update)
    }
  }

  getValues(): StateValues {
    return { ...this.values }
  }

  getValue<T = unknown>(key: string): T | undefined {
    return this.values[key] as T | undefined
  }

  /** 创建快照（用于检查点） */
  snapshot(): StateValues {
    return JSON.parse(JSON.stringify(this.values))
  }

  /** 从快照恢复 */
  restore(snapshot: StateValues): void {
    this.values = { ...snapshot }
  }
}
