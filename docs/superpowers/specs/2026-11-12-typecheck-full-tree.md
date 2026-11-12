# typecheck:harness 收口 custom/server 全目录＋全量错误清零

日期：2026-11-12
状态：implemented
触发：用户令（2026-11-12）——把 `typecheck:harness` 从 249 文件点名清单收口为 custom/server 全目录并清零全量错误。点名清单是持续维护债：每新增服务端域都要手工补单（2026-11-04 userenv 四域即漏单实录），全目录展开后该债消失。

## 变更

1. **命令改造**（package.json `typecheck:harness`）：249 文件点名清单 → `$(find custom/server -type f -name '*.ts' ! -name '*.test.ts' | sort)` 内联展开（764 文件含 3 个 `.d.ts` 与 `__tests__` 内 3 个非测试源码模块），并加 `--strictNullChecks`（保留 `--strict false` 关闭 strict 家族其余项）。npm script 条目数不变（改既有条目内容）。
2. **Koa Request body 类型增强**（新增 `custom/server/types/koa-body.d.ts`）：单行 `import '@koa/bodyparser'`——上游 @koa/bodyparser 自带 `declare module 'koa'` 的 Request 增强（`body?: any; rawBody: string`），全目录编译面此前从未加载它（custom/server 无文件直接 import bodyparser，装载发生在 vendor 侧），150 处 `ctx.request.body` TS2339 全部由此消除。不重复声明 body，避免与上游增强的接口合并冲突。
3. **5 文件 8 处类型注解补齐**（strictNullChecks 开启后数组/空初始化推断不再退化成 any/never[]）：
   - `custom/server/expdual/dual-controller.ts:249`：`const signals = []` → 显式元素类型注解（premise-signal 投影行）。
   - `custom/server/harness/workbench/service-auto-probe.ts:97`：`let regressionSet = null` → `let regressionSet: EvalSet | undefined`（连同 :153 `regressionSet?.id` 一并消除）。
   - `custom/server/harness/workbench/service-shared.ts:230`：`let regression = null` → `let regression: RegressionEvidence | null = null`。
   - `custom/server/ontology/ontology-controller.ts:286`：`const related = []` → 显式元素类型注解。
   - `custom/server/report/acceptance.ts:178`：`html.match(...) || []` 联合回调参数塌缩 never → `const captions: string[] = ...`（该处在 strict false 下同样报错，非 SNC 引入）。
4. **不建 baseline**：全量 0 错达成，`config/typecheck-server-baseline.json` 无需存在（棘轮位留给未来真实需要时）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 实测口径修正：全目录 204 错 = 150 body＋53 判别联合窄化＋1 TS2352（非「203 body＋1 TS2352」） | 主会话按 `does not exist` grep 计数把 53 条 `problems/reason/error` 联合窄化错混入 body 计数；本批 worktree 内全量重跑逐条分组实测为准（与主树 /tmp/tsc-server-full.txt 204 行 diff 全等） | 沿用主会话口径（否决：ambient 文件只能消 150，剩 54 无解） | — |
| D2 | 加 `--strictNullChecks` 消 53 条窄化＋1 条 TS2352，而非改 53 处 `if (!r.ok)` 守卫 | 最小复现实证（tsc 6.0.3 与 5.9.3 行为一致，非版本回归）：strictNullChecks 关闭时 TS 禁用 falsiness 判别式窄化（`ok: true` 分支在无 SNC 下可被 undefined 命中），`r.ok === false` 等值比较才窄化。改守卫＝53 处改动且 `!ok`→`=== false` 在 ok 为 undefined 的运行时分支语义不同（进入/不进入失败分支）；开 SNC＝8 处纯类型注解零运行时变化，且门禁从此真拦空引用（2026-10-21 context-insights spec 已有「宽松档未拦、运行档拦下」先例） | 逐点改守卫（否决：改动面 53 vs 8、运行时语义风险）；留 baseline 53 条（否决：目标 0 且根治手段就在手边） | 是 |
| D3 | body 增强用 side-effect import 而非自写 `declare module 'koa'` | 上游 @koa/bodyparser 的增强是单一事实源（body 消息结构与 rawBody 一并声明）；自写声明与上游增强同程序加载时 `body` 两处类型不同会 TS2717 合并冲突 | 自写 `body?: unknown` 声明（否决：重复事实源＋合并冲突风险） | 是 |
| D4 | 文件面用 `find` 内联展开而非新增 wrapper 脚本 | 机制预算册 scripts 已 137/137 满（2026-11-12 补账后），新增脚本须登记 sunset＋配对退役；`find+sort` 在 npm script 内联可复现（macOS/Linux 通用），tsc 6 目录参数实测不支持（TS6231） | 新增 scripts/typecheck-harness.mjs（否决：预算满＋纯包装无增量） | 是 |
| D5 | CI governance workflow 的 typecheck 步骤本批不修 | `.github/workflows/governance.yml` 的 typecheck:harness 在 main 上已连红（TS2307：CI 只内联装 typescript+@types/node，custom/server 外部依赖 koa/@koa/router/yaml/matrix-js-sdk/ws/socket.io/cron-parser/pg/proper-lockfile/playwright/miniprogram-automator 共 11 包全部缺席，gh run 43169499446 实录）——先在 main 存量红，非本批引入；修复需改 CI 内联安装集且本地无法验证（本批禁 push），列待批清单 | 顺手改 workflow 安装行（否决：范围外＋不可验证的 CI 变更违反验证纪律） | — |

## 验证

- 前后对比：全目录（765 文件，含新 d.ts）改造前 **204 错**（150 TS2339 body＋53 TS2339 联合窄化＋1 TS2352）→ 改造后 `npm run typecheck:harness` **rc=0 / 0 错**；变异探针（临时注入类型错）实测 exit=2 拦下后还原复绿，门禁非空转。
- 守门：`node scripts/governance-lint.mjs --budget` 0 problem（38 warning 均为存量 sunset 自然语言提示；npmScripts 计数不变）；`node scripts/maintenance/gen-doc-indexes.mjs --write && --check` 0 problem（651 specs）；`node scripts/merge-invariants.mjs --check` pass。
- 相关测试：`npx vitest run custom/__tests__/` 30 文件 208 用例全过（1 个 vitest RPC onTaskUpdate 超时为已知噪声，非测试失败）。
- 全量 `npm test` 两轮（机器多会话负载态）：第一轮 8818 passed＋1 失败（secaudit 目标指纹 30s 超时）＋1 套件钩子超时（qgate-p5-p9 ensureDist 10s）；第二轮 8839 passed＋4 失败（secaudit 同款超时＋verify-release-manifest＋ia2 两客户端用例）。两轮失败集合不重叠，除 secaudit 复现超时外无同款；5 个失败文件隔离复跑全部通过（secaudit 11/11、qgate-p5-p9 24/24、四文件合计 47/47）——判定为负载型超时抖动，非本批回归（本批改动为纯类型注解＋命令配置，零运行时行为变化）。


## 设计文档影响

DESIGN_SYNC: none——`docs/DESIGN.md` §6.1 只引用命令名 `npm run typecheck:harness`（不含文件清单描述），命令名未变；类型检查覆盖面属工程配置非设计契约。
