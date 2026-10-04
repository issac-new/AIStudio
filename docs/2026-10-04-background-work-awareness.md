# 后台任务执行感知三件套（2026-10-04，用户裁决：驾驶舱对后台任务无感知=失控感）

## 问题

全链路追踪设计（需求→派发→**执行**→交付→评审）中，「执行」环在驾驶舱层是盲区：agent 静默干活期（写文档/写码，单段 25-80 分钟）聊天零消息、看板卡躺 doing 无任何活动信号——run8 期间用户在 8802 驾驶舱完全看不出推进，需依赖 harness 侧巡检才能确认存活。

## 三件套

| # | 面 | 实现 | 数据源 |
|---|---|---|---|
| ① | 看板卡「执行中」活体徽章 | KanbanTaskCard：assignee 有 working 会话时显示脉冲点+最近产出秒数 | 既有 `/api/hermes/fleet/sessions`（15s 轮询，组合式单例引用计数） |
| ② | 顶栏「N 路执行中」chip | BackgroundWorkStrip（IaGlobalTop 页头下），chip+逐 agent 最近产出，点击跳看板 | 同上聚合 |
| ③ | 推演运行态条 | 同条内 `run8 · 11/26 段 · 最近完成 devimpl · 更新 Xs 前`（>5 分钟未更新标陈旧） | 新端点 `GET /api/sim/run-progress`（patch 562 挂载） |

## 契约：run-progress.json（harness↔产品唯一接缝）

- **单写方**：simharness `sset`（mx-scenario-lib）每次状态写入后同步刷 `$HERMES_ROOT/run-progress.json`；完成步按 `MX_STEP_ORDER`（mx-lib 单一事实源，relay 接力序同源）计数。
- **只读方**：server `custom/server/controllers/sim/run-progress.ts`，`HERMES_HOME` 根下读文件，坏载荷/缺文件一律 `{ok:false,run:null}` fail-soft——宿主 studio（无推演）拿空态隐藏 widget。
- 生效链：overlay 合入后，**下一轮 `mx-setup` 重建 product-dist 快照**时进入 SIM studio；宿主 studio 走正常升级装机。

## 验证

- server 端点 4/4 用例（契约解析/坏载荷拒绝/HERMES_HOME 覆盖/fail-soft 空态）。
- patch 562 干净树全序列注入 **249/249** 应用通过（v0.7.29 基底）。
- 全量 vitest 见合并记录；i18n 走本地小字典（`ia2/i18n-bgwork.ts`，漂移期通道先例），未动 473 locale 面。
