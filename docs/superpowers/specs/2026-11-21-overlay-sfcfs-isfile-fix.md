# overlay 生产构建修复：sfcFs 钩子 fileExists 补 isFile 语义

## 变更

`scripts/inject.mjs` 生成的 `vite.config.overlay.mts` 模板中，`sfcFs` 适配器的
`fileExists` 由 `existsSync(f)` 改为 `statSync(f).isFile()`（miss 时 catch 回 false）。
`readFile`/`realpath` 不变。同批新增守门测试
`scripts/__tests__/inject-sfcfs-guard.test.ts`（文本锚定：模板必须含 isFile 语义，
防手改/重渲染回退）。

## 决策记录

- **根因（2026-11-21 定谳，最小复现实证）**：overlay 生产构建（`npm run build`）在
  `WorkflowConditionEdge.vue` 的 `defineProps<EdgeProps>()` 处报
  「Unresolvable type reference」。链条＝plugin-vue 6.0.7 已不再代调
  `compiler-sfc.registerTS`，compiler-sfc 3.5.44 走自带 node_modules 逐级探测解析
  `@vue-flow/core`（探针轨迹实测 101 条）；其 `resolveExt` 对星号再导出
  `export * from './types'` 逐段 `fileExists(filename)` 探测时，`existsSync` 对
  **目录**（`dist/types/`）返回 true → 目录被当文件命中 → `readFile` EISDIR 被吞 →
  scope 为空 → EdgeProps 不可解析。`fileExists` 补 `isFile()` 语义后目录不再误命中，
  回落到 `dist/types/index.d.ts` 正常解析（复现脚本编译通过、运行时 props 生成）。
- **为什么是模板而不是生成物**：`vite.config.overlay.mts` 是 inject 每次重生成的
  派生态（.gitignore 排除），真身只有 `scripts/inject.mjs` 内模板字面量——修生成物
  会被下次 inject 洗掉（模板↔产物双向同步纪律）。
- **B3 历史兼容**：该钩子本就是 B3 轮为绕 typescript 6.x `ts.sys` 探测失效而加的
  node:fs 适配器；本次只修正 `fileExists` 语义（TS ModuleResolutionHost 契约本就
  要求 fileExists 对目录返回 false、目录判定归 directoryExists——改后更贴契约），
  不动钩子存在性。vite dev 按需编译此前不触发此路径（workflow 视图未被走查路由
  引用），生产全量构建才暴露。
- **不上移 vendor**：`@vue-flow/core` 的 `export *` 结构与 plugin-vue 行为均为上游
  依赖事实，非本仓可控面；钩子模板是本仓自有代码，落点唯一。

## 验证

- 最小复现（已过）：`vendor/hermes-studio` 下 node 直调 `compileScript`，三种钩子
  对照——旧钩子 FAIL「Unresolvable」/ isFile 语义钩子 OK 且运行时 props 含
  edge 字段。
- 端到端（本批验收）：worktree 内 `npm run clean && npm run inject && npm run build`
  全绿（此前同链路红在 WorkflowConditionEdge）。
- 守门：`npx vitest run scripts/__tests__/inject-sfcfs-guard.test.ts`；既有回归
  `scripts/__tests__/inject-*.test.ts`；合并前全量 `npm test`。

## 设计文档影响

DESIGN_SYNC: none——纯构建链内部修复（inject 模板一行语义修正），不触及整合正本/
数字总账的任何条款与数字；行为面唯一变化是「生产构建由红转绿」，无用户可见契约变更。
