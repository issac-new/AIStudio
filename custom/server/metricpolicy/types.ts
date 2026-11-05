/**
 * 度量纪律（C 组，2026-11-05 组织治理能力批）——类型定义。
 *
 * 来源：泊珩简澈《从规划未来到生成未来》下篇 Step6（四类核心指标 / 三个过程信号 /
 * 反向指标 / 指标双轨与古德哈特定律）与第七部分伪重建之「数据装饰化」。
 *
 * 两条不可让渡的纪律：
 *   1. 双轨隔离——`measure/*` 只进学习看板，`settle/*` 只进分配口径；结算指标引用
 *      测量指标在配置层直接报错（指标一旦进考核就会失真）。
 *   2. 装饰化判据——每个指标须登记「它改变过哪个决策」，没有消费者的指标标红。
 */

export type MetricNamespace = 'measure' | 'settle'

export const NAMESPACES: readonly MetricNamespace[] = ['measure', 'settle']

export interface MetricConsumer {
  /** 决策锚：因这个数字而改变的那次决策（如 spec 文件名、会议纪要、变更单号） */
  decisionRef: string
  changedAt: number
  note?: string
}

export interface MetricDef {
  /** 形如 measure/autonomy-rate；命名空间由前缀决定，二者必须一致 */
  key: string
  namespace: MetricNamespace
  title: string
  /** 口径一句话，含分子分母——写不出分母的指标不是指标 */
  definition: string
  sources: string[]
  consumers: MetricConsumer[]
  /** 派生自哪些指标 key（双轨隔离检查用） */
  derivedFrom?: string[]
  version: number
  /** 内置派生指标：可读、口径固定，不允许改 definition 之外的东西 */
  builtin?: boolean
}

export interface MetricIssue {
  severity: 'error' | 'warn'
  code: 'namespace-mismatch' | 'cross-track-reference' | 'empty-consumers' | 'missing-denominator' | 'settle-version-bump'
  detail: string
}

/** 派生读数：样本不足或无源时 available=false 并写明缺口，不猜数。 */
export interface DerivedReading {
  key: string
  title: string
  value: number | null
  unit: string
  /** 参与计算的样本量 */
  sample: number
  available: boolean
  gap?: string
  /** 口径（与登记簿 definition 一致，界面上直接显示） */
  definition: string
  sources: string[]
}
