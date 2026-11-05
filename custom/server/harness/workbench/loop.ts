// 改进闭环纯函数层兼容出口（v0.4 单文件体量治理：第三批拆分，行为不变）。
// 原 1515 行拆为 loop-core（校验/diff/行为对比）+ loop-report（晋级/帕累托/进化报告）。
export * from './loop-core'
export * from './loop-report'
