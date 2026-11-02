# 方案同步：Eval 技能评估环（第八页签）

## 变更

1. 方案正本 `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`：
   - §2.5 评测面由七页签改八页签（增「技能评估」）。
   - §2.6.3 增第 13 条「技能产出 Grader 环」：S0 机械结构四判＋S1 反偏置四维＋基线 delta＋CONDITIONAL 语义，端点 `POST /api/eval/skill-grade`，报告证据八新增技能评估行（无 §19 工件则 no_data），不进 G4-E 判据。
   - §1.3 能力清单增技能评估；§5.4.4 口径三增第⑨项；§5.8.3 增测试词汇规范（受控动词表）行。
2. 程序 `simharness/mux/mx-prelaunch-check.sh` ㉓ 扩为同时断言技能评估面板与端点（防旧 dist 缺第八页签）。
3. 守门 `simharness/mux/tests/plan-program-sync.test.sh` 增三条断言（方案八页签/技能评估环/prelaunch skill-grade）。

## 决策记录

- **只登记消费面，不接管评测采集**：Grader 评估对象是 spec §19 测试设计段，推演本轮不必然产出该工件；报告证据八按 no_data 如实呈现，不把产品面板当轮次读数硬凑。
- **S0/S1 分层照产品实现**：S0 机械四判（MAET 四路径行/路径类型列/GWT 列/§19.3 checklist 非空）零费用；S1 四维经 AskFn，问句不含期望答案；S0 全过而 S1 全 unknown＝CONDITIONAL 非 PASS。
- **prelaunch 只加产品在位断言**：第八页签与端点属产品面能力，旧 dist 缺位会让方案描述失真；不因此新增推演必采分母。
- **词汇规范入 §5.8.3 而非纪律**：受控动词是写作规范，机械拦截会误伤自然语言；守门只锁词表条目与模板注记结构面。

## 验证

- `bash simharness/mux/tests/plan-program-sync.test.sh`（新增三条后全过）。
- `bash simharness/mux/tests/jargon-source-gate.test.sh`（HARD=0）。
- `bash simharness/tests/run-gates.sh`（sh+vitest 全量）。
- 方案渲染与格式检查（八页签/技能评估/词汇规范在位，stale 词零命中）。

## 设计文档影响

DESIGN_SYNC: none —— 仅方案与 harness 门禁同步；产品 Grader 环不改评测判据单一事实源（e2e-verdict/METRIC_DEFS 未动）。
