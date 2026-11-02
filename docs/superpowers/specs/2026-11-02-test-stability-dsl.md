# 测试稳定性 DSL 三件套（Selector / Callback / Teardown）

> 来源：MTSC2026《AI Native 测试工程实践》（极智嘉）方法论吸收轮，方案 A。调研报告见会话记录；对照结论——本仓「流程编排化」（六闸+qgate）强于文章方案，「框架 DSL 化」是真实短板：走查探针与服务端测试无统一的「数据选型 / 异步等待 / 状态恢复」语义接口，各域测试自行 setup，用例脆弱的根因（文章坑 1/坑 3 同源）未被系统性消除。

## 变更

三件套按「零依赖纯逻辑 + 就近 re-export」分两面落地，存量测试零改动（新件只供新测试受益）：

1. **走查面 `scripts/regression/dsl.mjs`（新文件，零依赖）**：
   - `waitFor(predicate, opts)`——通用谓词轮询（Callback 件）：async 谓词、`timeoutMs`/`intervalMs`/`label`，超时抛错带 label 与轮询次数（对齐 waitForApp 的「判据用应用状态而非时间」纪律，harness.mjs:86 注释）。
   - `Teardown` 类——状态恢复（Teardown 件）：`register(name, fn)` 收集、`run()` 逆序执行、单条失败不阻断后续、失败清单汇总返回；走查脚本在 finally 调用。
   - `pick(items, opts)`——数据选型（Selector 件）：`where` 条件过滤 + `random` 随机打散（避免总打同一记录），空结果抛错带条件描述。
   - `harness.mjs` re-export 三件（存量走查脚本 import 路径不变）。
2. **vitest 服务端面 `custom/server/test-support/`（新目录）**：
   - `wait-for.ts`：与服务端轮询习惯对齐的 waitFor（同语义）。
   - `teardown.ts`：`createTeardownScope()` + `bindTeardownToSuite()`（vitest afterAll 自动执行注册项）。
   - `index.ts` 单一导出面。
3. **守门测试**：`scripts/__tests__/regression-dsl.test.ts`（waitFor 成功/超时/异步、Teardown 逆序/失败不阻断/幂等、pick 过滤/随机/空报错）+ `custom/server/test-support/__tests__/test-support.test.ts`（bindTeardownToSuite 挂 afterAll 语义、waitFor 超时错误信息锚）。

不迁移存量测试（967 文件不动）；不做业务域 fixture 工厂（留各域按需建，本批只落通用件）。

## 决策记录

1. **纯逻辑拆独立 dsl.mjs 而非塞进 harness.mjs**：harness.mjs import @playwright/test，守门测试导入它会拉浏览器链；拆零依赖模块后测试只测纯逻辑（对齐 board-staleness-watchdog.test.ts 的「纯函数直测」模式）。
2. **waitForApp 不重构为基于新 waitFor**：已稳定且被 8+ 走查脚本依赖，重构风险大于收益；新件与它并存，语义一致（判据用状态非时间）。
3. **Teardown 逆序执行 + 失败不阻断**：资源释放序（后注册先释放）是业界惯例（pytest fixture/junit @AfterEffect 同构）；单条失败必须继续跑完其余，否则环境残留放大排查成本。
4. **bindTeardownToSuite 而非全局 afterEach**：显式绑定避免隐式全局钩子污染所有测试文件；调用方一个文件挂一次。
5. **不做业务 DSL（Biz 件）**：文章 Biz 件对应「业务操作封装」，本仓走查面已有 domClick/gotoHash/bootApp 语义件覆盖交互面；服务端业务操作分散在 148 个域，通用层无法预定义，强建反而造空中楼阁——各域 fixture 由域内测试按需沉淀。
6. **DESIGN_SYNC: none**——本批纯新增测试基建（零生产行为变更），不触及整合正本/数字总账的任何事实声明；若后续存量测试迁移至三件套，再按批评估。

## 验证

- `npx vitest run scripts/__tests__/regression-dsl.test.ts`（新增守门全绿）
- `npx vitest run custom/server/test-support/__tests__/test-support.test.ts`（新增守门全绿）
- `npx vitest run scripts/__tests__/`（存量 scripts 守门无回归）
- 合并前 `npm test` 全量（junit minTotal:100 防缩水口径不变）

## 设计文档影响

DESIGN_SYNC: none——纯测试基建新增，无产品行为/契约/数字变更；方法论吸收背景已由本 spec 承载。
