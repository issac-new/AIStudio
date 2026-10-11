# QGate 门禁 ↔ 推演技能 贯通对照表（2026-10-12 贯通轮，断点实锚版）

> 断裂诊断（双审计"56 门禁生成器与推演 7 个单文件技能断裂"的实测修正）：
> **aipaydev-dev 深度集成门禁（1150 处引用，研发自测 11 项门禁所在）——不断裂**；
> 真断点=defect-loop/requirements-analyst 等四技能零引用：QGate 门有 `task_close`/`pre_commit`/`release`
> 三类触发器，defect-loop 关缺陷卡正是 task_close 触发点却不知道要跑门——
> "安全裸奔"的机制形态=任务关闭触发面存在、执行技能不知情。本表+技能补段收口该断裂。

## 门禁体系事实

- 门总数 45（按 profile 三档裁剪：lite 当前显 5 门/vibe-fast；standard/compliance 全量）。
- 触发模型：每门声明 triggers（task_close|pre_commit|release），`qgate plan --trigger <t>` 列适用门。
- 推演侧消费点：QUALITY 段 `precheck --all-full`（56 项四族检查项，纪律 33）+G5 release-report（§4.4-4）。

## 七技能 × 门禁责任面

| 技能 | 门禁责任面 | 贯通状态（2026-10-12 起） |
|---|---|---|
| aipaydev-dev | 研发自测核心 11 项门禁（pre_commit 触发） | ✅ 原生集成（1150 处引用） |
| defect-loop | **缺陷卡关闭=task_close 触发点**：L0.requirement-trace/L0.registers/L0.scope-check | ✅ 本轮补段（SKILL.md 结卡门禁节，缺证据拦关禁 waive 绕行） |
| requirements-analyst | 需求可追溯一次自证：L0.requirement-trace（pre_commit 触发，AC 定稿后） | ✅ 本轮补段（自证证据入需求文档附录随 G1 冻结） |
| testing-shift-left | UC/INT/QUALITY 三段结论行（UC-DONE/INT-CASES-DONE/QUALITY-DONE） | ✅ 已接（3 处引用） |
| pm-planning | 无直接门禁责任（排期不触发门；交付门归 release 段） | — 登记即可 |
| capability-report | 无直接门禁责任（报告消费门禁输出不执行门） | — 登记即可 |
| inbox-dedup | 非交付类技能 | — 登记即可 |

## 维护纪律

- 新技能入 skills/ 时在本表登记门禁责任面（有/无+触发点）——同纪律入列声明测试状态（§4.3 编号说明）同款防遗忘。
- 门触发器新增（如新增 build 触发）时同步本表与对应技能段。
- 守门=mux/tests/discipline-v88-810-gates.test.sh 贯通断言组（四技能引用锚+本表存在性）。
