// 改进闭环纯函数层兼容出口（v0.4 单文件体量治理：第三/四批拆分，行为不变）。
// 1515 行拆为 core（校验/diff/行为对比）+ config（RSI）+ pareto（帕累托）+ report（晋级门禁）+ advice（建议/泄漏/进化）。
export * from './loop-core'
export * from './loop-config'
export * from './loop-pareto'
export * from './loop-report'
export * from './loop-advice'
