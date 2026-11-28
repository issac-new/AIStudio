# 2026-11-28 设计文档整合同步：吸收制度合一批与德勤方法论批落地后的正本缺口补齐

> 状态：实施中（用户 2026-11-28 指令「合入 main 清理无用分支，更新整体设计文档」）。实测结果在「验证」一节回填。
> **这份文档让读者做的决定**：补齐后的设计正本能否当作 2026-11-28 两批合入之后的现行陈述使用；哪些边界仍然只是登记、没有闭合。
> **读者**：文档维护者、之后做吸收批或治理批的会话、审查本批的审查者。
> **缘起**：两批由属主会话自行合入并推送，分别是吸收制度合一（合并提交 `0871927eb`，01:05）与德勤 AI 落地方法论吸收（合并提交 `03d0f5676`，03:29）。收尾时把两批的规格、代码与 `docs/DESIGN.md` 逐条对账，查出正本两处陈述与代码不符、三处已落地机制没有入档。执行单元框架对齐批（`feat/workunit-framework-align`）由用户在属主会话里裁决暂停合入，等三项裁决，不在本批。

## 变更

### 一、事实订正：读者照原来的说法会判断错的两处

1. **工具执法总闸的默认值**（§4.9 与 §6.4「工具执法」行）。正本写「总闸与 strict 均为显式配置」。代码里总闸自 2026-11-05 起默认开启：环境变量未设或为 1 即执法，显式置 0 才关闭，组织托管配置可以锁死；策略文件缺席时回落仓内默认策略包。只有 strict 姿态仍须显式开启。依据 `custom/server/toolpipeline/enforce-gate.ts:21-24,27-31,285-290`。德勤批把治理姿态、九层体检、评分卡三处的总闸读数统一到这个判据（`custom/server/governance/posture.ts:154-156`、`custom/server/harness/nine-layers.ts:491`、`custom/server/harness/ai-native-scorecard.ts:67-70`），此前三处把「未配置」读成关，面板显示与实际执法相反。正本同步改写，并写明读数与执法正身同判据。
2. **人机团队成功率已是实算**（§2.6 能力供需）。正本写它「在 OutcomeTeam/Settlement 落地前返回 `available:false`」。结果团队与结算已落地，德勤批起该指标按结果域实算：同时含人与 Agent 成员且已有有效结算的团队中，结论为「达成」的占比；部分达成不算成功，未知结算进分母；结果存储读不到、没有已结算团队或样本不足 2 支时返回 `available:false` 并写明缺口。依据 `custom/server/capabilitypool/metrics.ts:122,150-216`（结果工作台未启用是第四种不可用情形，`:157-160`）。

### 二、补入已落地但没有入档的机制（三处）

3. **流程架构的场景准入**（§2.6 工作台表与表后新增一段）。业务主责缺失、无法提供基线、数据无合法依据、重大影响无人复核四条排除规则，各给命中、未命中或无法判定；系统只推导「可进入」或「需补条件」，任一规则命中或无法判定即需补条件；四条全清时由在岗自然人签署「进入试点」或「暂缓」，连同当时的规则判定快照追加式保存。只披露不设门，命中不阻断结果合同创建；规则不打分、不加权。依据 `custom/server/bpa/bpa-admission.ts:1-57,104-116`、`custom/server/bpa/bpa-admission-store.ts:13,52-53`、`custom/server/bpa/bpa-controller.ts:229,249`、`custom/server/AGENTS.md:42`（决策 D7）。
4. **「无法评估」口径与单位成本可得率**（§2.6 度量纪律）。机制在位而统计窗口内没有事件时，九层体检把检查项标为无法评估：不计入分母，也不进差距与整改动作；全部无法评估时该层分数为空，关键检查项无法评估时该层不得判已覆盖。五流诊断读库失败时整体给未知并写明读不到的原因。依据 `custom/server/harness/nine-layers.ts:12,43,60-67,235-253`、`custom/server/governance/org-diagnosis.ts:94-103,166-170`。单位成本可得率：可估出成本的 Studio 会话数占同窗口 Studio 会话总数的比例；看板任务的执行用量不进 Studio 用量表，不在该读数覆盖内。依据 `custom/server/metricpolicy/store.ts:144-152`、`custom/server/metricpolicy/derive.ts:387`、`custom/server/metricpolicy/controller.ts:138`。
5. **术语三条**（附表 B）：吸收总账、场景准入、无法评估。

### 三、§6.4 增两行，登记边界

6. **吸收制度合一（2026-11-28）**：规程正本一份、总账一本、按域登记机制退役；边界是 hermes 夜间自主轮次当前不入账。依据 `team/skills/devops/article-methodology-fusion/SKILL.md:4,21,27-29`、`AGENTS.md:23`、规格 `2026-11-27-absorption-regime-unify.md` 的「不在本批的事」一节。
7. **AI 落地方法论吸收批（2026-11-28）**：读数不造假七项、场景准入、单位成本可得率；边界是场景准入尚无真实签署、六问第 3 与第 5 问仍无真实数据源、准入规则不阻断。依据规格 `2026-11-28-ai-adoption-admission-gates.md`「验证」节的遗留未做两条与「变更」节批 A、批 B。

### 四、本批不做的

| 事项 | 为什么不做 |
|---|---|
| 执行单元责任台账（§4.6）的扩写与开放问题 | 随 `feat/workunit-framework-align` 分支自带，该分支已写好 §4.6；分支被用户裁决暂停合入，等三项存量影响裁决 |
| 设计文档导读的文档角色表加「吸收总账」一行 | `docs/design-alignment-1128` 批正在改同一张表；留给该批或下一次导读刷新（挂账 G1） |
| 两份已合入规格抬头仍写「待合入」「实施中」 | 已合入规格有内容收据，改写须 `SPEC_REBIND=1`；属属主收口事项，本批只登记（挂账 G2） |
| 规模数字（规格份数、总账行数） | 正本不承担计数账本职责，份数读机械索引头部 |

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 单独成小批现在合入，不并入集群设计对齐批 | 两批内容不相交：对齐批只动 §1.1 与集群相关段落（见其规格 `2026-11-28-design-alignment-cluster-doc.md`）；对齐批合入前本来就要变基；跨会话派工未经用户授权 | 并入对齐批（否决：越权）；等对齐批落地后再做（否决：两处事实订正要多悬几个小时） | 是 |
| D2 | 只写代码里核实过的事实，行号取自合并目标 `5a67b8753` | 行号核对必须在合并目标分支做（2026-11-25 教训） | — | — |
| D3 | 不改写德勤批「设计文档影响：不触及正本」的声明，缺口由本批补 | 已合入规格改写须重绑收据；补缺口不需要改动对方的声明 | — | — |
| D4 | 不代合 `feat/workunit-framework-align` | 用户在属主会话里裁决暂停；试合并会在规格收据账本与设计索引两处冲突，仓规第 12 条规定冲突由属主解 | 代合并代解冲突（否决：违背用户裁决与仓规） | — |
| D5 | 正本只写机制与边界，不写总账行数、规格份数 | 这些数字每批都变，正本不是计数账本 | 写「22 轮、21 条待定」（否决：下次吸收即过期） | 是 |

## 验收判据

验收方式：提交前在工作树里逐项核对，命令与结果见「验证」一节。

- 正本七处改动（事实订正 2、补入 3、§6.4 两行）的每句陈述都能在「变更」节列出的锚点找到对应；锚点行号在本批分支尖上复核一次。
- `node scripts/maintenance/gen-doc-indexes.mjs --check` 0 问题；`node scripts/merge-invariants.mjs --check` 通过；`node scripts/governance-lint.mjs --budget` 0 问题。
- `npx vitest run scripts/__tests__/gen-doc-indexes.test.ts` 与读正本的守门测试全过；`npm run docs:check` 通过。
- 合并档回归按回归工具的判定收口；单面超时的单面复跑并如实记录。
- 合入 main 推送时推送前门全过；推送后按字节归还另一会话的任务卡。

## 验证

以下为本批实测结果（2026-11-28，工作树 `docs/design-integration-sync-1128`，起点 `5a67b8753`）。

- 锚点复核：「变更」节列出的行号在本批分支尖上逐个复核，全部命中（`enforce-gate.ts:21-23,27,285-290`、`posture.ts:154-156`、`nine-layers.ts:12,43,60-67,235-253,491`、`ai-native-scorecard.ts:67-70`、`metrics.ts:122,150-216`、`org-diagnosis.ts:94-103,166-170`、`bpa-admission.ts:104-116`、`bpa-admission-store.ts:13,52-53`、`bpa-controller.ts:229,249`、`metricpolicy/store.ts:144`、`derive.ts:387`、`controller.ts:138`、`SKILL.md:4,21,27-29`、`AGENTS.md:23,42`）。
- 校对时对着代码改准了三处措辞：场景准入里「需补条件」是系统推导态，人只签「进入试点」或「暂缓」（`bpa-admission-store.ts:13`）；人机团队成功率多一种不可用情形「结果工作台未启用」（`metrics.ts:157-160`）；执法的留痕针对每次拒绝，不是针对异常本身（`enforce-gate.ts:24`）。
- `node scripts/maintenance/gen-doc-indexes.mjs --write` 之后 `--check`：791 份、0 问题。
- `node scripts/merge-invariants.mjs --check`：通过。工作树里没有构建 qgate 发行包，qgate-health 一项跳过；主干上该项是存量提示（5 个面 stale），与本批无关。
- `node scripts/governance-lint.mjs --budget`：0 问题。43 条警告是决策台账的存量格式警告，与本批无关。
- `npx vitest run scripts/__tests__/gen-doc-indexes.test.ts scripts/__tests__/regression-matrix.test.ts custom/__tests__/interactive-training-manual.test.ts custom/__tests__/absorption-ledger.test.ts`：4 个文件 79 例全过。
- `npm run docs:check`：手册投影块与真实载体一致（routes=130）。
- 合并档回归、推送前门、任务卡归还：待回填。

## 设计文档影响

DESIGN_SYNC: touched —— 本批修订对象即整合设计正本 `docs/DESIGN.md`：§2.6（工作台表、能力供需段、度量纪律段、新增场景准入段）、§4.9（执法总闸默认值）、§6.4（「工具执法」行改写，增两行）、附表 B（增三条术语）。同批重生成 `docs/manuals/aistudio-design-document-index.md`（`scripts/maintenance/gen-doc-indexes.mjs --write`）。

## 挂账

| 编号 | 事项 | 验收判据 |
|---|---|---|
| G1 | 设计文档导读 `docs/manuals/aistudio-design-document-guide.md` 的文档角色表补「吸收总账」一行 | 表里有该行且链接可达；与集群设计对齐批不冲突 |
| G2 | 两份已合入规格抬头状态回填：`2026-11-27-absorption-regime-unify.md` 写「待合入」、`2026-11-28-ai-adoption-admission-gates.md` 写「实施中」 | 属主会话以 `SPEC_REBIND=1` 回填为「已实施」并注明合并提交 |
| G3 | `scripts/__tests__/overlay-pristine-replay.test.ts` 的临时检出在测试进程被杀时会残留并留在 `git worktree list` 里（2026-11-28 03:08 实例，本批已按 git 通道清除） | 该测试开头自清理不属于任何存活进程的同名残留，或有守门发现；未立项 |
