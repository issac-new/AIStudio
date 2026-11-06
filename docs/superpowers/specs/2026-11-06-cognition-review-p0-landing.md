# 2026-11-06 cognition-lattice 复盘 P0 落地批

## 变更

依据同轮《AIStudio 全面批判性复盘》的优先级结论，本批只落地「本迭代可完成」的 P0 与必要治理适配，不动用户已裁决的产品语义。

- **P0-3 上游根解析收敛**：`scripts/inject.mjs` 导出 `resolveUpstreamRoots()`（env ＞ 仓内 `vendor/` ＞ 旧兄弟 `upstream/`，返回 root/source/studio/agent/zcode 五个明确语义），自身常量改用该函数；`scripts/build-dmg.mjs` 去掉只回落兄弟 `upstream/` 的必坏路径，改为复用共享解析；`scripts/build.mjs`、`scripts/serve-server.mjs`、`scripts/ensure-injected.mjs` 删除各自内联解析副本。`RELEASE-MANIFEST.json` 的 cockpit `buildCommand` 文案改为与新的缺省行为一致（不再要求必须设 `OVERLAY_UPSTREAM_ROOT`）。同时把 `isDirectRun` 判定提前，clean 探测与 `--check`/`--config-only` 分支加直跑守卫，使其它脚本 import 本模块不产生副作用。
- **P0-2 注入链校验**：`scripts/inject.mjs` 新增 `--check` 全链干跑（按目标树分组、按 series 顺序串成单个 stdin 流执行 `git apply --check`，只报告不改树；失败用前缀二分定位首个破坏者），并把 hermes-agent 补丁失败从逐条静默 `continue` 改为末端汇总 + `STRICT_INJECT=1` 可收紧；`scripts/verify-release-manifest.mjs` 新增 `patches/series` 引用完整性与 `runtime-manifest.json` 清单在场/结构对账。
- **P2-1 退役机可机检（最小切口）**：`scripts/governance-lint.mjs` 的 `checkBudget` 增加 `reviewBy` 过期判定、无 `check` 判定器的自然语言 `retireWhen` 告警、`pairedRemovals` 声称退役却仍在 sunset 册的拦截；`config/mechanism-budget.json` 修正 `org-governance-walkthrough` 的不实「已退役」声明并为该条补首个机检判定器 `filePresent`，追加本轮 `changes` 记录。
- **P0-1 开关语义（诚实标注，非服务端真门控）**：`custom/client/ia2/views/FeatureDisabledView.vue` 中英成对明确「关闭只隐藏入口，服务端能力仍在线，深链/直接调 API 仍可用」，保留 `config/features.ts` 现名与既有语义（用户 2026-10-28 裁决）。
- **守门测试**：新增 `scripts/__tests__/upstream-root-contract.test.ts`、`scripts/__tests__/inject-check.test.ts`、`scripts/__tests__/budget-retirement.test.ts`、`custom/client/__tests__/feature-disabled-copy.test.ts`。

## 决策记录

- **零新增脚本 / 零新增 npm script / 零新增门 / 零新增账本**：`config/mechanism-budget.json` 实测 `scripts 123/123`、`npmScripts 49/49` 已顶满，新增即触 `governance-lint --budget` 失败。共享解析因此落在 `inject.mjs` 既有导出面（`ensure-injected.mjs` 已有 import 先例），不新建 `.mjs`；配对降级 = 删除 4 处内联上游根解析副本与 `build-dmg` 的必坏回落，不删任何现有脚本文件（零引用探针多为人工走查工具，删除会影响用户）。
- **不改 `import.meta.env` 开关名、不删 reserved 能力**：`config/features.ts:8-12` 记载用户明确否决改名这一 breaking change。本批只消除「开关关闭=能力关闭」的 UI 误导；服务端真门控需改挂载补丁并可能影响现有直接调 API 的部署，属独立裁决项，挂账下轮。
- **`--check` 默认不进 `npm run inject`**：全链预检与每次注入解耦，做成显式 CLI 档，由上游升级预检 / PR 按需调用；避免拉长日常反馈回路。
- **`--check` 必须串联而非逐条**（落地中实测发现并修正）：初版逐条 `git apply --check` 在纯净基线上误报 203 条失败——series 是顺序重放链，逐条检查每次都从 pristine 起算，不累积前置补丁效果，把依赖前置补丁的正常补丁判为失配。改为按目标树分组、按 series 顺序把补丁串成单个 stdin 流一次性 `--check`；纯净基线实测 studio 368 + agent 91 全绿。失败时用前缀二分（约 log2(n) 次）定位首个破坏者，避免只报「整组失败」。这是复盘指出的「series 是顺序重放链」在实现层的直接印证。
- **WARN 分级默认不硬拦**：`STRICT_INJECT=1` 前默认行为不变（agent 补丁仍跳过），只把静默变成可见汇总，避免当前「带病可用」的构建突然全红；收紧档留给升级轮。
- **`serve-server.mjs` 的 `ncwkRoot` 祖先锚保留**：它用于 SIM_ROOT/GOVERNANCE_REPO 派生，语义是「工作区祖先」而非「上游根」，只替换其 `upstream` 常量。
- **不在本批创建分支/提交**：本地 `main`(e9235e68) 与 `origin/main`(66cd3bb43) 已分叉，工作区有 438 个注入态脏文件与 4 个活跃 worktree；在此检出切到 `origin/main` 会覆盖注入态并干扰并行会话。改动直接落在当前检出，正式提交须由属主会话从 `origin/main` 建 `refactor/<slug>` 分支并只携带本批文件（AGENTS.md 规则 3/12）。
- **本批不覆盖 P1/P2 全量**：HTTP 契约 1376 处收敛、I/O 异步化、长列表虚拟化、UX 组件替换、CI 分层、空壳注册表清理与补丁工厂路线评估均需压测基线、用户裁决或跨迭代分批，挂账到后续 spec，不冒充已落地。

## 验证

- `npx vitest run` 本批 4 个新守门 + 3 个既有回归（`verify-release-manifest` / `governance-lint` / `patches-series-guard`）：**7 文件 44 用例全过**。
- `npx vitest run scripts/__tests__/inject-absent-tree.test.ts`：**2/2**（真实 inject 到临时纯净树，11.03s），确认根解析与 `--check` 改动未影响注入主流程。
- `node scripts/inject.mjs --check` 在 `git archive HEAD vendor/*` 构造的纯净基线上（`OVERLAY_UPSTREAM_ROOT` 指向临时树）：**rc=0，459 条（studio 368 / agent 91），失败 0、跳过 0**，全程只读、不改树。
- `node scripts/inject.mjs --check` 在当前已注入检出：**rc=1，失败 2**（每组二分定位到首个失配补丁 `001-...` / `117-...`），并提示先 `npm run clean`；证明失配可检测且不刷屏。
- `node scripts/governance-lint.mjs --budget`：**0 problem / 19 warning**（5 条 legacy 形态 + 14 条 `retireWhen` 无机检判定器，如实暴露、不阻断）。
- `node scripts/verify-release-manifest.mjs`：四模块对账全绿（新增的 `patches/series` 引用完整性与 `runtime-manifest.json` 结构对账通过）。
- `npm run verify`：三棵 vendor 树注入态均判 OK；`node --check` 7 个改动 `.mjs` 全过；`read_lints` 12 个改动文件 0 诊断。
- `node -e "import('./scripts/inject.mjs')"`：导出 `resolveUpstreamRoots` / `checkPatchChain` 可用，模块导入无注入副作用，当前解析命中 `source=vendor`。

## 设计文档影响

DESIGN_SYNC: none——本批为构建链解析收敛、注入链可观测性、治理判定器与一处 UI 文案，未触及整合正本 `2026-10-23-swarmstudio-integrated-design.md` 与数字总账 `2026-10-23-swarmstudio-design-ledger.md` 的设计参数、六闸判据或版本容量基线；`RELEASE-MANIFEST.json` 是发布清单而非设计正本，其文案修订属实现与文档对齐。
