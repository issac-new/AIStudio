# 技能产出 Grader 环（spec 测试设计段语义评估）

> 来源：MTSC2026《AI Native 测试工程实践》吸收轮批 3-E。文章六阶段技能评估闭环（就绪检查→快照基线→并行派发→Grader 打分→聚合基准→人工评审）中，本仓 verifier/v1 已覆盖确定性断言面（退出码/golden/LOC/变异），缺「Grader 子 Agent 语义打分+基线对比」环。落点选 spec §19 测试设计段的语义质量（MAET 完备性/GWT 具体性这类语义判断正适合 LLM 判，且批 C 刚立了 MAET 契约——E 评契约执行质量，C/E 成闭环）。

## 变更

1. **`custom/server/eval/skill-grader.ts`（新模块，复用 judge 基建）**：
   - `gradeSpecDesign(specText, deps)`：提取 §19 测试设计段（§19.1 策略/§19.2 骨架/§19.3 声明），按四维 rubric 生成断言问句（MAET 四路径完备、GWT 步骤具体可执行、边界/异常覆盖、断言可验证），经注入的 `ask`（AskFn，同 judge.ts 通道）打分；
   - **反偏置纪律沿用**：问句只含 spec 文本断言，不携带「期望答案」；
   - `snapshotBaseline(runId, grades)` / `compareBaseline(runId, current)`：基线 jsonl 快照存取与通过率 delta 对比（并行派发两版对比的聚合件）；
   - fail-open：ask 不可用/熔断 → 全维 unknown，不抛错（judgeOnline=false 同构）。
2. **controller 端点**：`POST /api/eval/skill-grade`（入参 spec 文本+可选 baselineRunId，出参四维判定+对比 delta），按 eval 域现有 controller/路由注册模式接线。
3. **测试 `custom/server/eval/__tests__/skill-grader.test.ts`**：AskFn stub 注入（好 spec/坏 spec 对照样本：好样本=四路径齐+GWT 具体；坏样本=缺 Termination+Given 空泛），断言判分方向、基线对比 delta 符号、fail-open 降级——零模型调用成本。
4. `npm run typecheck:harness` 点名清单加 skill-grader.ts（新服务端模块纪律，package.json typecheck:harness 串）。

## 决策记录

1. **落 eval 域而非 scripts/**：复用 clefAsk 通道/TtlCache/Breaker/反偏置纪律与 controller 注册面（单一事实源不重造）；scripts 面无 TS 编译链与 LLM 通道。
2. **评估对象=spec §19 而非技能文档**：技能方法论文档的「可执行性」缺客观 rubric；spec 测试设计段有 MAET 契约（批 C）作锚，判定可解释、坏样本可构造。
3. **首版确定性 S0 + LLM S1 分层（对齐 judge 四步管线）**：S0 机械项（四路径行存在性/表列非空——可 grep）先判零费；S1 语义项（具体性/可验证性）走 ask。S0 全过而 S1 unknown= CONDITIONAL（非 PASS，防假绿）。
4. **基线快照 jsonl 不进 eval store**：技能评估快照是迭代工件非业务数据，独立 `custom/server/eval/.skill-grade-baselines.jsonl`？否——运行态不入库，放 `.qgate/` 运行态区或 env 可配路径，缺省 `.swarm-yuan/skill-grade-baselines.jsonl`（治理台账区，gitignore 态）。
5. **DESIGN_SYNC: none**——eval 域新增评估能力，不改既有判据/指标口径；Eval Studio 面板接线留后续批（端点先行）。

## 验证

- `npx vitest run custom/server/eval/__tests__/skill-grader.test.ts`（stub 全绿）
- `npm run typecheck:harness`（点名清单后整串绿）
- eval 域存量无回归：`npx vitest run custom/server/eval/__tests__/`

## 设计文档影响

DESIGN_SYNC: none——eval 域内新增；评测判据单一事实源（e2e-verdict/METRIC_DEFS）未动。
