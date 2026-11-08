# 2026-11-08 EvoTeam 收尾批（未做项清偿：lessons 保留面＋P5 可观测面＋D8 定谳）

> 来源：EvoTeam 吸收批（`2026-11-08-team-library-evolution.md`）交付总结列出的四项未做，用户令「完成未做项」。四项中两项无代码面：推送已补齐（27cccee6a 已达 origin）；记忆已补写。本批清偿其余两项＋一项定谳修订。

## 变更

1. **lessons.md 生成器保留面登记**：`skills/swarm-yuan/scripts/generate-skill.sh` 的 `PROJECT_SPECIFIC_FILES` 与 `_validate_generator_writes` 只读保留 case 均补 `references/lessons.md`。实测定谳（见决策 D1）：现状 upgrade 已不触碰该文件与 SKILL.md 手加行，本登记是防将来 SKILL.md 重写策略重构时静默丢失的显式声明。新增夹具测试 `skills/swarm-yuan/tests/test-lessons-preserve.sh`：真实 create→手写 lessons.md＋SKILL.md 标记行→upgrade，断言两文件字节级保留。
2. **P5 可观测面（建议态数据积累）**：`custom/server/governance/dispatch-ledger.ts` 的 `DispatchLedgerEntry` 增可选 `handoffRule?: string`（`<familyId>/<ruleId>`，命中注入时随 column 条目入账）；`custom/server/kanban/column-dispatch.ts` 的 `ColumnDispatchResult` 增 `handoffRules` 数组（逐 entry 触发列的选择结果：命中给 familyId/ruleId/version/reason，NONE/歧义给 ruleId:null＋原因）——REST 调用方每次可读，台账跨调用可积累命中率。零新增账本/门/脚本（复用 dispatch-ledger）。
3. **D8 定谳（修订原 spec 决策）**：原 D8 备选栏「生成器未登记该文件——下次 --upgrade 可能重写」经源码级＋夹具实测证伪：upgrade 走 RESUME=1，SKILL.md 整体跳过重写（`_fg_emit_guides` 存在性守卫），UNIVERSAL_FILES 外文件不被模板触碰。原 spec 该处以 SPEC_REBIND 随批修订为实测结论。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | lessons.md 登记进 PROJECT_SPECIFIC_FILES（防御性显式声明）而非仅记录实测结论 | 实测虽安全，但保留语义靠两条间接机制（RESUME 守卫＋UNIVERSAL 清单外）；显式登记让「这是项目内容文件」成为单一事实源，将来重写策略重构时守门测试即拦截 |
| D2 | P5 命中率落 dispatch-ledger 现有账本（handoffRule 字段）而非新建 jsonl | 新账本触发机制预算登记＋配对删除义务（AGENTS.md 规则 13）；dispatch-ledger 已是 column 派发唯一留痕面，加可选字段零迁移（jsonl 逐行 JSON 解析，旧读端容忍新字段） |
| D3 | `handoffRuleLineFor` 拆为选择＋渲染两层（`selectHandoffRuleForDispatch` 返回 line/ruleId/reason） | 可观测需要 ruleId 与原因而不仅是渲染文本；两层拆分不改变调用方行为（原函数签名保留为薄壳） |
| D4 | conformance 缺项分布不做被动埋点 | conformance 的调用方是回执侧（人工/编排决策点），无自然流量可积累；先让注入命中率积累，升「回执必查」时缺项分布由该执法面自带 |
| D5 | K19 超限根治＝两解析器进棘轮排除列（golden-gate 先例）＋/extract 残留转 fail()＋注释字面量避让，非抬基线 | 排除是口径归位（内部 Result 联合非 HTTP 面，两域 HTTP 出口均已走 ok/fail）且同批净降 2；抬 874 基线属验收变更须另裁 |
| D6 | 首批 K19 漏检定谳：git grep 不数未跟踪文件，首批全量跑在 git add 前——提交后 main 实为 896>874 隐性红 | 教训＝含棘轮的全量必须在提交态复跑；本批随合并把 main 修回 871 |

## 验证

- `bash skills/swarm-yuan/tests/test-lessons-preserve.sh`——create→upgrade 全链路 lessons.md/SKILL.md 标记行字节级保留断言。
- `bash skills/swarm-yuan/tests/test-upgrade-hygiene.sh`——升级路径既有回归不破（态1-8 全过）。
- `npx vitest run custom/server/kanban/__tests__/ custom/server/handoff custom/server/team-library custom/__tests__/docs-ssot-guard.test.ts custom/__tests__/architecture-ratchet.test.ts`——含新增可观测断言（命中入账 handoffRule、NONE 透出原因、A/B 简报差恰一行）与 K19 修复后棘轮（带排除 871≤874）。
- `npm run typecheck:harness`——0 错。
- 全量 `npx vitest run`（注入态 worktree，合并前）：8637 过/11 跳/K19 修复前 1 红（ratchet 883>874，本批根治）＋pristine-replay afterAll 超时为已知并行竞争偶发（单跑过）。K19 计数注意：git grep 不数未跟踪文件——含棘轮的全量必须在提交态跑（本批教训，D6）。

## 设计文档影响

DESIGN_SYNC: none——生成器保留面与派发台账可选字段均为局部实现常数，不触及整合正本与数字总账；原 spec D8 修订属决策记录勘误（SPEC_REBIND 随批），非设计参数变更。
