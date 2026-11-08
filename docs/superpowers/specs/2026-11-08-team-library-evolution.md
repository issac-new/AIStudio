# 2026-11-08 团队库与团队作用域交接规则（EvoTeam 吸收批）

> 来源：微信文章《Multi-Agent持续进化！EvoTeam群体协同发力》（2026-11-08）及其一手材料 arXiv:2610.39813v2 与官方仓库 DEEP-JLU/EvoTeam（51 个 Python 文件、1.87 万行）。吸收口径＝只取「团队库/交接规则/多层反思」三件轻资产的数据模型与证据纪律，不引入其基准运行时、Docker 沙箱与 agent 实现；AIStudio 已有的板/派单/门禁/证据层保持为执行底座。

## 变更

1. **P1 团队库（读模型＋建议选择）**：新增 `team/shared/team-library.yaml`（家族＝适用范围描述＋四维身份＋候选名单＋版本史＋成败证据）与 `custom/server/team-library/`（`types.ts` 解析校验、`team-library.ts` 加载与确定性选择、`controller.ts` 只读 REST）。路由 `GET /api/harness/team-library`、`POST /api/harness/team-library/select` 挂进既有 `harness-controller`（不新增 bootstrap 补丁）。选择器只做确定性预筛，返回 reuse/cold_start 与候选名单；**不接管派单**。
2. **P2 团队作用域交接规则（建议注入）**：新增 `team/shared/handoff-rules.yaml`（规则＝from/to＋触发条件＋指令＋必带证据＋验证＋缺项处置＋版本/状态）与 `custom/server/handoff/handoff-rules.ts`。`handoff-controller` 增 `GET /rules`、`POST /rules/select`、`POST /rules/conformance`；`column-dispatch.ts` 在派单简报尾部按 (from,to) 注入一条命中规则，无命中不占行（NONE 语义）。注入为建议态：不阻断派发、不判失败，缺证据照常继续。
3. **P3 经验回流断点修复**：`simharness/aipay-scenario.sh` 在 G6 复盘入仓前调用 `mx-retro-sink.sh`，目标指向 `$DIRECTOR_CLONE/simharness/skills/aipaydev-dev/references/lessons.md`，随后二次 `repo_commit_main` 把教训文件单独入主；新建该 `lessons.md` 与技能内入口行。`expcandidates` 增可选 `scope{columns,specialists}` 与 `provenance{model,executor,at}`，注入按 scope 过滤；新增 `reflection-guard.ts`，在候选**审核批准**时按 EvoTeam 补丁校验纪律拒收泛泛陈述/文件行号级/与既有经验自相矛盾三类（422）。
4. **P4 跨模型 provenance**：新增 `custom/server/lib/provenance.ts`（模型/执行者/时刻读取与跨模型复测判定，缺值不猜）；组件库条目、交接规则、经验候选统一携带可选 provenance；组件库读面返回 `crossModelRetest` 三态（true/false/null）。

### 涉及文件

- 新增：`team/shared/team-library.yaml`、`team/shared/handoff-rules.yaml`、`custom/server/team-library/{types,team-library,controller}.ts`、`custom/server/handoff/handoff-rules.ts`、`custom/server/expcandidates/reflection-guard.ts`、`custom/server/lib/provenance.ts`、三个 `__tests__/` 文件、`simharness/skills/aipaydev-dev/references/lessons.md`
- 修改：`custom/server/harness/harness-controller.ts`（挂子路由）、`custom/server/handoff/handoff-controller.ts`（规则路由）、`custom/server/kanban/column-dispatch.ts`（简报注入）、`custom/server/expcandidates/{exp-types,exp-store,exp-inject,exp-controller}.ts`、`custom/server/harness/workbench/{component-library,service}.ts`、`custom/server/AGENTS.md`（域索引）、`package.json`（typecheck 点名清单）、`simharness/aipay-scenario.sh`、`simharness/skills/aipaydev-dev/SKILL.md`、`.qgate/scope.yaml`、spec 索引与附录 A

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | 只吸收数据模型与证据纪律，不复刻 EvoTeam 运行时 | 复刻基准运行时（Docker 沙箱/四基准适配）与 AIStudio 执行层重复且破坏单一事实源；论文消融的增益来自「团队组织＋交接规则」两件结构性资产 |
| D2 | 团队身份只认四维：工作类型、改动/排查范围、必需角色、验证策略；业务域、仓库名、文件名、主题不构成建队理由 | 照论文团队身份纪律；按域名建队会让团队库退化成第二份 domain-registry，失去跨域复用 |
| D3 | 交接规则以「建议注入」上线（用户裁决） | 回执必查会先造成存量任务误伤；先积累命中率与缺项分布，再评估升强制 |
| D4 | 选队用确定性关键词/四维预筛，不新增 LLM 调用 | LLM 选队不可离线判定且引入新模型依赖；预筛输出候选与理由，最终选队仍由派单方/Chairman 裁决 |
| D5 | 规则作用域用 `(from,to)` 列/角色对，不绑定 agent 实例 | 同一角色在不同部署由不同 profile 承担；绑实例会让规则不可移植（论文跨 backbone 迁移的同类前提） |
| D6 | 经验作用域复用约束卡口径 `columns/specialists`，不新造 team_family 字段 | 派单现场只拿得到列与 specialist；引入 team_family 需要跨模块解析团队库，先保留可判定的最小作用域 |
| D7 | 反思守卫在「审核批准」时硬拦（422），提取时不拦 | 提取期拦截会丢失证据；批准是人工决策点，守卫在此提供确定性判据并可先改陈述再批 |
| D8 | retro-sink 用 `MX_RETRO_SINK_TARGET` 指向导演克隆并二次 `repo_commit_main`，不改其单路径签名 | 改签名影响其他调用方；二次提交换来链路闭合且不动既有入口。技能 SKILL.md 的 lessons 入口当前为手加行，生成器 `UNIVERSAL_FILES` 未登记该文件——技能下次 `--upgrade` 可能重写该行，留给技能刷新批补登记（本 spec 留痕） |
| D9 | 本批不新增门禁/脚本/账本，机制预算零增量 | `config/mechanism-budget.json` 的 gates/scripts/ledgers 计数字段无变化；新增仅为服务端模块与配置表 |

## 验证

- `npx vitest run custom/server/team-library custom/server/handoff custom/server/expcandidates custom/server/kanban/__tests__/column-dispatch-brief.test.ts custom/server/harness/workbench/__tests__`——目标面全绿（含新增团队库解析/选择、规则解析/选择/注入、经验作用域与守卫、provenance 三态）。
- `npm run typecheck:harness`——新增服务端模块全部进点名清单并通过。
- `bash -n simharness/aipay-scenario.sh`＋`bash simharness/mux/tests/retro-sink.test.sh`——语法与沉淀四断言绿。
- `git diff --stat` 对账 `.qgate/scope.yaml` 声明面，无越界文件。
- 全量 `npx vitest run`（worktree 注入态）：8632 passed / 12 skipped / 0 断言失败；满载下 `scripts/__tests__/overlay-pristine-replay.test.ts` 的 `afterAll` git worktree 清理触发 10s hook 超时（同轮 vitest worker RPC 超时），单跑该文件 53s 通过——判定为并行资源竞争偶发，非本批引入，已如实记录不掩盖。
- `node scripts/maintenance/gen-doc-indexes.mjs --check`——0 problem；`custom/__tests__/docs-ssot-guard.test.ts`——7/7（附录 A 标题计数随批对齐 597→599）。

## 设计文档影响

DESIGN_SYNC: none——本批新增读模型、配置表与建议态文案注入，不修改既有稳定设计参数与数字总账；选队阈值、规则字段与 provenance 三态为局部实现常数，单一事实源在本 spec 与对应模块，暂不提升为稳定设计参数。若后续把交接规则升级为回执必查，需另批修订设计台账的「验收断言家族/门禁」口径。
