# 2026-11-21 P1 开工批：对账修正＋simrun router 契约测试补齐

> 背景：用户令「开工」（P1=串联能力产品化主对象）。开工对账发现路线图立案时盘点不足——**P1 两交付物已基本存在于产品**：①REST 面=`custom/server/simrun/`（2026-11-02 simrun 产品批：supervisor 进程监督＋router 三端点 status/start/stop，fail-soft 契约）＋`graph-rest` run 全套（list/detail/resume/fork/replay/export，run-ingest 已并 sim-* 条目）＋`controllers/sim/run-progress`（已有测试）；②前端面=`/app/sim` 路由族（SimCenterView 六面板：Director/DirectorRunDetail/Evidence 等）＋sim-observer 聚合并入日常（10-27 融合批）。真缺口仅一处：**simrun/router.ts 三端点无契约测试**（supervisor 有单测、router 层零测试——路线图验收判据「端点四绿」的欠账）。

## 变更

1. 新增 `custom/server/simrun/__tests__/router.test.ts`：三端点契约测试（vi.mock supervisor 单例注入面）——①status 投影（state/recentEvents 透传＋fail-soft enabled:false 空态）②start 未启用 409／runId 缺 400／启用后 ok 透传 state ③stop 幂等 ok。
2. 路线图修订（2026-11-21-sim-product-absorption-roadmap，SPEC_REBIND）：P1 状态更新——既有面盘点修正（simrun/ia2 sim center/graph-rest 三处入册）＋本批补齐验收「端点四绿」（router 三端点契约测试＋run-progress 既有测试=四）＋「前端走查」改为引用既有 /app/sim 面板（IA 视图活体在案）＋「SIM 重建后端到端」维持挂账（环境缺席，路线图已预期）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | P1 不新建端点/面板，只补测试与对账 | 单一事实源：产品面已存在（11-02 批），重复建设违反不变量；「开工」的正确首步=对账验收 |
| D2 | router 测试用 vi.mock 注入 supervisor 单例 | supervisor 单例由 env 驱动（OBS_SIM_ROOT/SIM_SUPERVISOR），env 操纵会与单例残留态互串；mock 面最小且契约清晰（断言 HTTP 形态，不重测 supervisor 内部——其单测在案） |
| D3 | 路线图 P1 标记「验收补齐完成、端到端挂账」而非「完成」 | SIM 实体缺席使端到端不可验；诚实状态=控制面/视图面产品在案＋协议契约已测＋驱动端到端待环境 |

## 验证

- [x] `npx vitest run custom/server/simrun/__tests__/router.test.ts` 全绿。
- [x] `npx vitest run custom/server/simrun/ custom/server/controllers/sim/` 域全绿（不破坏既有）。
- [x] K19：router 走 lib/http（已在案），测试断言响应形态不抬手写计数。

## 设计文档影响

DESIGN_SYNC: none 附理由——测试补齐＋路线图对账修订（spec 面文档），无产品行为/契约变化；simrun 域设计正本无触及。
