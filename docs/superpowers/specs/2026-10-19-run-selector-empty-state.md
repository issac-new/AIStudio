# 运行选择器空态与清场后旧运行残留（spec）

日期：2026-10-19
分支：`fix/runsel-empty`
来源：0→1 环境浏览器复验（runs/ 已清空后打开全流程推演）。

## 现象

选择器显示「2026 年 10 月 17 日运行」，运行总览随即返回
`/api/hermes/sim/run-state?run=2026-10-17-v8-run21 → 404 state.env 不存在`。
runs/ 已清空，旧运行来自 `localStorage['ia2.lastRun']`：`options` 无条件把当前值
补回列表，空列表时也补，于是选择器看似有选项、面板全 404。

## 变更

- `utils/run-options.ts` 新增纯函数 `buildRunOptions`：列表空且加载完 → 空；
  空但加载中 → 保留当前值避免闪空；非空且当前不在列表 → 补首位（显式深链仍可查看）。
- `RunSelector.vue` 改用纯函数；列表加载完为空时清 `ia2.lastRun` 并清 `?run`。
- `useRunContext` 的 query 监听改为「删除也跟随」，否则选择器清 query 后 ref 仍停在旧值。

## 决策记录

- D-1：空列表不补当前值。加载中例外（保留当前值防闪空），加载完仍为空说明运行记录确实不存在，必须清掉。
- D-2：清场后清 `localStorage['ia2.lastRun']`，不只清 query。否则下次进入推演区又会从记忆值复活。
- D-3：选择器仍允许把显式 deep-link 的 `?run=` 补进非空列表（可查看历史归档运行），只在列表整体为空时拒绝。
- D-4：纯函数承载规则，视图只做副作用（清存储/清 query），测试 4 例覆盖空/加载/补位/截断。

## 验证

- `npx vitest run custom/client/ia2/__tests__/run-options.test.ts` 与三个推演面板套件：43 通过。
- 浏览器：0→1 环境打开全流程推演，选择器显示「暂无历史运行」，无 run-state 404。
