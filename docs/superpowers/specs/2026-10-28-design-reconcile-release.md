# 设计与发布对账轮：六域一致性修正 + 版本升版发布

日期：2026-10-28 ｜ 分支：feat/design-reconcile-release ｜ 触发：用户要求「汇总设计规范、设计文档、模块功能、组织衔接、决策记录、组件清单，确保无遗漏、错谬、冲突、歧义，然后更新并发布版本」。

## 变更

全量发现与逐条处置见 `docs/reports/2026-10-28-design-reconciliation-report.md`（65 条：修正 52、已知限制 13）。本 spec 只记决策与验证。

| 组 | 内容 |
|---|---|
| 版本 | cockpit `0.7.39-studio.1→0.7.39-studio.2`；agent-teams `v0.22.5-team.1→v0.22.5-team.2`；yuan-skill `v2.95.0→v2.96.0`；ycode 保持 `3.16.2`；整体包 `1.0.0-overlay→1.0.1-overlay`（新 tag `v1.0.1-overlay`） |
| 发布口径 | cockpit 包补 `runtime/pricing`、`runtime/roster`；`includes` 改纯路径；`release:packages` 串联 `release:check`；清单增 `repoLevelPaths` 与 `fullPackage.tag` |
| 校验器 | `verify-release-manifest.mjs`：cockpit 取版本节首行严格比对、yuan 取 CHANGELOG 首个版本标题、`npm run <script>` 存在性、`includes` 非路径即红 |
| 工程修复 | `vendor-sync.sh` 默认源改仓内 `upstream/` + 同路径自删守卫；L2 pre-commit 钩子改按检出根三级候选定位 |
| 文档纠偏 | 团队编制/看板数（30 / 9）、SOUL 行数、组件台账判级（6/7/23=36）与三条版本锚、附录 A 重复段与缺登、附录 C/D 路径与端口、README 第四条边界、AGENTS 四行、intro 命名与 42 口径、USAGE 两条绝对表述 |

## 决策记录

- **D1 版本号只按「哪段变了」进位**：底座段（hermes-studio 0.7.39 / hermes-agent 0.22.5）未升级不动；本轮只累加扩展序 `-studio.2` / `-team.2`。ycode 版本恒等 vendor 包字段，vendor 与补丁零变更故不动——避免为「发个版」而臆造版本号。
- **D2 整体包换 tag 而不是复用 `v1.0.0`**：既有 `v1.0.0` tag 指向 2026-07-01 的提交，与 2026-10-27 打出的资产不是同一份源码；同版本两内容会让消费方无法区分。本轮 `1.0.1-overlay` + 新 tag，并在清单里把「tag 必须指向打包 commit」写成契约。
- **D3 优先修正「机器可验的事实」，其次「读者会误解的表述」，最后才是风格**：65 条里凡能被 `file:line` 证伪的数字/路径/版本一律本轮改；涉及组织建模（roster 三义、三范式字段、EDA 编制）与内容创作（12 份 profile.yaml）的 13 条记为已知限制，给理由与入口，不在文档里编造。
- **D4 历史 spec 的旧路径不回写**：与既有 D4 一致（`2026-10-28-repo-structure-tidy.md`）。历史文档记录的是当时的仓内位置，回写等于伪造。
- **D5 校验器只做「能机械判定」的严格化**：版本节首行、CHANGELOG 首条、npm script 存在性、includes 路径合法性——都能一句话说清判据；不引入需要人判断的规则（如「notes 措辞是否准确」），避免门禁变成误报源。
- **D6 组件台账判级以表格机械重算为准**：汇总、标题、勘误表三处口径不一（29 / 9 / 35），以分域表行级计数 36 为唯一口径，并写入「汇总由表格重算」的约束，防止再手写。

## 验证

- `npm run release:check`：四模块对账全绿（`cockpit=0.7.39-studio.2 agent-teams=v0.22.5-team.2 ycode=3.16.2 yuan-skill=v2.96.0`）。
- `npx vitest run scripts/__tests__/verify-release-manifest.test.ts`：15/15（含 packageIncludes 的 git archive 可取性）。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`：6/6（附录 A 覆盖与计数一致）。
- `bash scripts/vendor-sync.sh hermes-studio <repo>/vendor`：自删守卫实测 exit 1 并给出同路径原因。
- `bash -n` 覆盖改动的 shell（`vendor-sync.sh`、`.swarm-yuan/hooks/pre-commit`）。
- 全量 `npx vitest run`、五件包与 SHA256SUMS、GitHub release 资产核对结果见交付说明。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§7.3 基线升级补 zcode 例外并把版本核对权威改指 `vendor/VENDOR.md` 与发布清单；附表 C 的领域/岗位归属改指 `team/shared/`。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：本轮无数字变更（§A/§C 口径未动）；其 §C 引用的 VENDOR.md 表述已在同一批修正，故声明 touched 以覆盖引用面一致性。

## 遗留

见对账报告「五、已知限制」13 条（K1-K13），每条已给不修理由与后续入口。
