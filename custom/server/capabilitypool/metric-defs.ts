// capabilitypool/metric-defs.ts —— 三项能力指标口径的单一事实源
//
// 只放字符串常量：metricpolicy 登记簿与 capabilitypool 派生读数共用，避免两处口径漂移。
export const CAPABILITY_SUPPLY_LEAD_TIME_DEFINITION =
  '带 skills 声明的任务从创建到首次 run 开始的中位时长（毫秒）/ 同口径任务数'
export const CAPABILITY_REUSE_RATE_DEFINITION =
  '被两个及以上看板调用过的能力标签数 / 至少被调用一次的能力标签数 ×100'
export const HUMAN_AI_TEAM_SUCCESS_DEFINITION =
  '同时含 person 与 agent 成员的 OutcomeTeam 中结算 verdict 为成功的团队数 / 同口径已结算团队数 ×100'
