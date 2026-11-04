# 2026-11-05 teardown afterAll 钩子签名类型修复

## 变更

`custom/server/test-support/teardown.ts` 的 `bindTeardownToSuite`：钩子参数签名由 `afterAllHook: (fn: () => void | Promise<void>) => void` 放宽为 `afterAllHook: (fn: () => any) => void`，函数体保持 `afterAllHook(() => scope.run())` 原样。`scope.run()` 返回 `Promise<TeardownResult>`（`{ran, failures}`），原 void 收窄签名在 `tsc --noEmit`（`npm run build:full` 第 3 步类型门）报 TS2322 拦死整条交付链构建；放宽后带值 Promise 合法穿透，运行时行为与该文件 2026-11-04 初版逐字节等价。

## 决策记录

- 发现路径：run27 前置 `npm run build:full` 重建 studio dist（发现 dist 停在 11-02，近三天产品批不在产物里），类型门首跑即红；该文件 2026-11-04 落地后仓内无渠道再跑过 build:full，类型错误滞留一天无人发现。
- 首修（`async () => { await scope.run() }` 丢弃返回值）被目标测试否决：`test-support.test.ts` 的「显式绑定契约」用例 `const { ran } = await hooks[0]()` 要求钩子函数返回 `TeardownResult`——丢弃返回值是被测契约破坏，首修方案作废（merge d56903598 的中间态，随后本批修正）。
- 终修取签名放宽为 `() => any`：需同时双向兼容 void 型钩子注册器（vitest `afterAll` 直传——`any` 绕开 strictFunctionTypes 的逆变死锁）与取值型收集器（测试直接 await 钩子函数）。任何更窄的返回类型（`void|Promise<void>`、`unknown`、`Promise<unknown>` 联合）都在某一方向编译不过，`any` 是该边界的唯一双通解，已在源码注释声明其刻意性。
- 运行时零变更：函数体与初版一致，仅类型声明变化。

## 验证

- `tsc --noEmit -p packages/server/tsconfig.json`（主树注入态实测）：0 错误。
- 目标测试 `npx vitest run custom/server/test-support/__tests__/test-support.test.ts`（主树实测）：6/6 全绿（含显式绑定契约用例）。
- `npm run build:full`（主树实测）：全链通过含 verify-dist 产物完整性门，dist 与终版源码一致。

## 设计文档影响

DESIGN_SYNC: none——类型层修复、运行时行为与初版逐字节等价，不触及整合正本/数字总账任何面；理由=被测契约（钩子函数返回 TeardownResult）与 `run()` 实现均未改动，仅消解签名与实现的类型缝隙。
