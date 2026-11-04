# 2026-11-05 teardown afterAll 适配器类型修复

## 变更

`custom/server/test-support/teardown.ts` 的 `bindTeardownToSuite`：afterAll 回调由 `() => scope.run()` 改为 `async () => { await scope.run() }`。`scope.run()` 返回 `Promise<TeardownResult>`（`{ran, failures}`），而钩子签名 `afterAllHook: (fn: () => void | Promise<void>) => void` 只收 void——原写法把带值 Promise 塞进 void 位，`tsc --noEmit`（`npm run build:full` 第 3 步类型门）在 `teardown.ts(57,22)` 报 TS2322，拦死整条交付链构建。

## 决策记录

- 发现路径：run27 前置 `npm run build:full` 重建 studio dist（发现 dist 停在 11-02，近三天产品批不在产物里），类型门首跑即红；该文件 2026-11-04 落地后仓内无渠道再跑过 build:full，类型错误滞留一天无人发现。
- 修法取 `await` 丢弃返回值而非 `void scope.run()` 浮 Promise：`run()` 内部已按步 try/catch 把失败落 `failures` 并 `console.error`（不抛出），`await` 只保 afterAll 完成时序、语义不变；浮 Promise 写法丢完成时序且属 lint 坏味。
- 行为零变更：仅类型适配，钩子签名与 `run()` 契约均未动。

## 验证

- `tsc --noEmit -p packages/server/tsconfig.json`（主树注入态实测）：0 错误。
- `npm run build:full`（主树实测）：全链通过含 verify-dist 产物完整性门。
- 目标测试 `npx vitest run custom/server/test-support/__tests__/test-support.test.ts`（主树实测）：全绿。

## 设计文档影响

DESIGN_SYNC: none——纯类型适配、行为零变更，不触及整合正本/数字总账任何面；理由=钩子签名与 `run()` 契约均未改动，仅消解两者类型缝隙。
