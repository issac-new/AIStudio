# 2026-11-12 CI typecheck 迁入 product-tests 链（governance 回归纯静态快门）

> 决策事实源。来源：P1-10 类型检查收口批（`518bcdf77`）的交付发现——governance.yml 的
> typecheck 步在 main 上**本来就红**（gh run 43169499446 等连续 failure）：该工作流只内联装
> typescript/@types/node，而 typecheck:harness 覆盖 custom/server 全目录后需要
> koa/@koa/router/@koa/bodyparser/yaml/matrix-js-sdk/ws/socket.io/cron-parser/pg/
> proper-lockfile/playwright/miniprogram-automator 共 11 个类型依赖（全在 vendor lock 内），
> 缺席即整片 TS2307。收口前点名清单恰好不含带外部类型的文件，才一直没暴露。

## 变更

1. `governance.yml`：删 typecheck 两步（内联安装＋运行），保留 lint+invariants 纯静态快门
   （<1min 定位不变）；头注改写分工。
2. `product-tests.yml`：注入步之后、Chromium 之前插 `npm run typecheck:harness`——该链
   npm ci+注入后 `node_modules` 软链到 vendor 树，类型依赖齐备，零额外安装成本。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 迁步而非补装依赖到 governance | 在 governance 内联装 11 个依赖需逐个钉 vendor lock 版本（漂移即假红/假绿），且把静态快门拖到 3 分钟级；product-tests 链类型天然齐备且同一提交已要装依赖 |
| D2 | typecheck 放 Chromium 安装前 | 快失败：类型错不必等浏览器下载（约 1 分钟） |

## 验证

- 两个 YAML 结构解析通过；步骤序＝checkout→node→cache→npm ci→ensure-injected→
  **typecheck:harness**→playwright→vitest。
- 本地等价链已证：主树 `npm run typecheck:harness` rc=0（f2a9e9bf3 合入后实测）。
- 未验证项（如实声明）：工作流改动待 push 后首次 Actions 运行确认；governance.yml
  删步后首跑应转绿（原红因已随步迁移消失）。

## 设计文档影响

DESIGN_SYNC: none

理由：四正本未改；CI 工作流分工调整属工程执行面，P1-7 spec 的分工声明（静态快门 vs 全量链）
语义不变，本批只是把 typecheck 归位到全量链。
