# 设计文档同步：RSI 全量执行后的正本、工作台设计与数字总账

日期：2026-11-01
状态：implemented
触发：用户「更新下设计文档」。R1-R12 三批执行（`9dc13735d`）与残项清偿（`c41e576e6`）落地后，工作台专项设计与设计正本仍是执行前口径；核对中另发现两处存量失准，以及一处实现缺口（R11 任务态从未落盘）。

## 变更

- `2026-10-19-harness2-improvement-workbench.md`：§4 数据模型补 R1-R12 新增字段与 SQLite 渐进后端；§5 REST 补齐现行 26 个端点（原表 14 个）；§6 晋级门禁从「十类阻塞＋三类警告」改写为「硬阻塞 / 证据门（env 可升闸）/ 警告」三档现行全集；新增 §14 证据自动化（R1-R12 落点、缺省档位与开关）。
- `2026-10-23-rrsi-regularized-workbench.md`：补「机制扩展停止与证据自动化衔接」节——R1-R12 只做证据供给与运维面，不再新增正则化机制。
- `2026-10-23-swarmstudio-integrated-design.md`：§5.8 补七条设计约束（验证信号分层、三档独立证据、约束保持与单层消融、技能差分、任务族聚合、advisory 面人审应用、经验库加权检索与存储渐进）；§7.3 更正两处失准（v0.8.0 已升级、zcode 3.17.1 已同步）并记 R1-R12 完成；组件台账口径 37 行改为 41 行（3 红 / 10 黄 / 28 绿）。
- `2026-10-23-swarmstudio-design-ledger.md`：核实日改 2026-11-01；§A 增三行稳定参数（验证信号层级、RSI 独立证据档、证据门缺省档）；§C 删「未升级 / 未同步」失准说明。
- `2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec，标题计数 446→447（覆盖行原记 440 为存量滞后，同批归一）；`2026-10-31-rsi-exec-batch1` 行结论要点改为 R1-R12 全部完成。
- `custom/server/harness/workbench/service.ts`＋`store.ts`＋前端 DTO：R11 生命周期接线——同步时发现 `persistAutoJob`/`listOrphanAutoJobs` 无调用方（表与助手已建、任务态从不落盘），补 `startAutoProbe` 起跑写 running 行、收敛删行，overview 暴露 `interruptedProbes`（排除本进程在跑的）。
- `.swarm-yuan/hooks/precheck.conf`：`DESIGN_DOCS` 增列两份专项设计文档（工作台设计、RRSI 专题）——它们是设计对象而非治理 spec，改它们时须由治理 spec 声明，不应当选 governs。
- `.swarm-yuan/hooks/spec-first-lib.sh`＋资产副本：修 `spf_find_governing_spec` 排除表只取 `$6` 的缺陷——调用方以未加引号的多值展开传排除表时，仅第一条生效，其余静默丢弃（原本两值表恰好只靠首条就能工作，扩到四值立刻暴露）。改 `"${*:6}"` 取全部实参。
- 同批修 `store.ts` SQLite 连接缓存：原模块级 `dbCache` 不绑定路径，运行期换 `HARNESS2_STORE`（测试切临时目录、运维换库）会继续写旧库，旧库被删时报 `attempt to write a readonly database`；改为路径绑定＋换库时关闭旧连接。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 门禁章节改写为三档现行全集，不保留「十类」旧表述 | 设计与代码单一事实源；旧表述对应 10 条，实际 `loop.ts` 出现 64 个 code | 追加「补充说明」段保留两份口径（否决：读者须自行对账） | 是 |
| D2 | R1-R12 只写设计约束与缺省档位，不写测试数与批次流水 | 总账规则 4：动态计数不进设计正文 | 在正本列通过用例数（否决：每次全量后必滞后） | 是 |
| D3 | 组件台账口径以仓内台账文件为准（41 行 3/10/28） | 台账是唯一事实源，正本只作引用 | 正本自记 37 行旧值（否决：双份口径且无锚） | 是 |
| D4 | 更正 §7.3 的升级状态，不保留「只评估不升级」历史句 | 该句是当时计划，非最终事实；留着会让读者以为仍钉 0.7.39 | 加「后已升级」尾注（否决：句子自身仍错，需读者读到底） | 是 |
| D5 | 证据门缺省告警、五个 env 可升硬闸，如实写进设计 | 缺省不阻断既有工作流；升闸是运营决策，需可查 | 缺省即硬闸（否决：会让存量提案批量卡死） | 是 |
| D6 | 修排除表多值缺陷而不是拆分提交 | 缺陷在判定库自身：任何多值 DESIGN_DOCS 都会静默降级；绕过（`--no-verify`）会把真缺陷留在库里 | 拆分提交规避（否决：同一缺陷下次触发） | 是 |
| D7 | 专项设计文档（工作台设计、RRSI 专题）加入 `DESIGN_DOCS` | 它们是设计对象不是治理 spec；原配置下改它们会被选成 governing 而误报「缺设计文档影响声明」 | 给两份设计文档加 `DESIGN_SYNC` 段（否决：设计文档逐批累积批次声明必滞后） | 是 |

## 验证

- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`：A.1 与角色表并集精确等于 specs 直接根 Markdown 集合（447），标题计数与文件系统一致。
- 门禁口径核对：`loop.ts` 机械提取 64 个 code；`blockers.push` / `warnings.push` 各 34 / 21 个（8 个按配置两档切换），与设计文三档表逐条对应；env 可升闸五门（`HARNESS2_RSI_REQUIRE_{NOISE,ATTRIBUTION,CONSTRAINTS,COUNTERFACTUAL,HELDOUT}`）与 `loop.ts:873-877` 一致。
- 端点核对：`controller.ts` 26 个路由与 §5 表逐条对应。
- 台账核对：`tech-components-ledger.md` 行级机械计数 41（3🔴 / 10🟡 / 28🟢），与正本新口径一致。
- 全文 grep：正本无「只做兼容评估、不升级」「待独立升级轮」「37 行口径」残留。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§5.8 补七条证据与执行约束；§7.3 更正 v0.8.0/zcode 升级状态与台账 41 行口径。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：核实日 2026-11-01；§A 增三行稳定参数；§C 删失准说明。
- `docs/superpowers/specs/2026-10-19-harness2-improvement-workbench.md`：§4 数据模型、§5 REST、§6 门禁三档、新增 §14 证据自动化。
- `docs/superpowers/specs/2026-10-23-rrsi-regularized-workbench.md`：补机制扩展停止与证据自动化衔接节。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec，计数归一 447。

另含一处随批代码修正（R11 生命周期接线，见「变更」）——写设计时核对发现表建了但无人写，属实现缺口而非设计变更。
