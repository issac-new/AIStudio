# K19 新增端点响应形状收敛：modelcap 与 workitem 控制器

日期：2026-11-01
状态：implemented
触发：终态全量验证抓出 architecture-ratchet 红——新增 `custom/server/modelcap/controller.ts` 手写 `ctx.body`/失败体，且提交后 `git grep` 才把新文件计入棘轮（worktree 全量时新文件未跟踪，未暴露）。同时并行 RSI 批在 `harness/workbench/service.ts` 新增 1 处 `ok: false`，基线 874 被顶到 878。

## 变更

- `custom/server/modelcap/controller.ts`：响应改走 `lib/http.ts` 的 `ok()`/`fail()`/`bodyOf()`，不再手写 `ctx.body` 与 `ok:false`。
- `custom/server/modelcap/types.ts`/`route.ts`/`__tests__/route.test.ts`：`RouteDecision.ok` 更名为 `routed`——这是域决策字段，不是 HTTP 响应体；避免与 K19 的 `ok` 语义混淆，也消除棘轮的字面量误计。
- `custom/server/workitem/workitem-controller.ts`：两处错误体改走 `fail()`，作为棘轮下限的存量收敛（抵掉并行批新增的 1 处）。
- 计数：`ok:false` 878→873、`ctx.body=` 1190→1187（均低于基线 874/1193，只减不增）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 新端点统一走 `lib/http.ts` | K19 单一出口；新增代码不扩大手写面 | 手写后调基线（否决：棘轮只许降） | 是 |
| D2 | 域决策字段 `ok`→`routed` | 与 HTTP `ok` 解耦，避免把纯函数返回值算进响应形状指标 | 用常量/注释绕开字面量（否决：游戏指标） | 是 |
| D3 | 用存量 workitem 错误体收敛抵掉并行新增 | 保持基线不升的前提下清一笔小债 | 升基线到 875（否决：违反只减不增） | 是 |

## 验证

- `npx vitest run custom/__tests__/architecture-ratchet.test.ts custom/server/modelcap/__tests__ custom/server/workitem/__tests__` → **22 passed**（棘轮 7/7）。
- 手动计数：`ok:false` 873 ≤ 874；`ctx.body=` 1187 ≤ 1193。
- 全量 `npx vitest run`：以本轮终态日志为准（见交付说明）。
- 诚实边界：棘轮是字面量代理指标，不区分 HTTP 响应体与域对象；本轮选择改名解耦而不是扩展指标。

## 设计文档影响

DESIGN_SYNC: none

只收敛响应形状与字段命名，不改四层架构、阈值或数字总账；模型波动加固设计仍以 `2026-10-31-model-resilience-hardening.md` 为准。
