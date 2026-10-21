# 安全审计流水线 + 评测判分纪律（两篇文章吸收）

日期：2026-10-21　分支：`feat/secaudit-eval-discipline`

## 1. 背景与来源

两篇 2026-10-21 的公众号文章，均已取全文核验（原文落 `/tmp/wechat-article-1.md`、`/tmp/wechat-article-2.md`）：

1. 《Cloudflare 开源安全审计 Skill：让编码 Agent 用六阶段流水线替你找漏洞》——六阶段审计流水线：侦察地图 → 覆盖账本（coverage-ledger.json）→ 覆盖引导狩猎 → 对抗性候选验证（发现者≠验证者）→ 结构化 findings（confirmed / needs_validation / rejected）→ 独立记录复核 → 目标中立报告。配套 16 类攻击面提示库、多轮增量运行、OS 级沙箱要求。
2. 《OpenAI Evals 技术拆解：Agent 评测的入门教科书》——Registry 资产解耦、Solver/CompletionFn 抽象、LLM-as-a-Judge 的 Rubric 四要素（角色、分段细则、CoT 优先、结构化输出）、Agent 轨迹评估三维（工具调用正确性、步骤效率、状态副作用）、偏差治理（位置偏差 swap test、冗长偏好、裁判降级）。

**本轮的判断**：SwarmStudio 已有相当完整的评测域（`custom/server/eval/`，164 例测试）与分散的安全扫描面（skillgov / mcpcatalog / auditchain / posture / reviewgov / clusterinspector），但存在两类结构性缺口：

- 安全侧：没有统一的目标与覆盖账本，没有三态判定，没有强制"发现者≠验证者"，没有报告期独立复核。分散扫描器各自出 severity，读者无法回答"哪些面根本没看"。
- 评测侧：裁判只回 noul 概率，判词理由由代码合成，没有行为锚点；轨迹只算工具序列相似度，不识别死循环与冗余步；没有裁判偏差检验。

本轮按"补结构缺口、不新建重复store、不新建spawner"的原则落地。

## 2. 变更清单

### 2.1 安全审计域（新增 `custom/server/secaudit/`）

- `types.ts`：审计项目 / 运行 / 覆盖账本 / 三态发现 / 验证记录 / 记录复核 / 报告类型。
- `catalog.ts`：面向 Agent 部署的 12 类审计面（攻击面分类），每条声明采集器与人工/自动属性。
- `coverage.ts`：账本构建、覆盖批评者（未检查 / 无证据 / 证据过期 / 攻击类未映射 / 全数否决）。目标指纹变化时历史证据降级为 partial。
- `validate.ts`：候选登记与三态裁决的硬约束——自证拒绝（409）、confirmed 需来源链+有界观察、needs_validation 必须写清唯一未解事实且不得评严重性、rejected 必须写清证伪理由、纵深防御缺口强制归为加固建议。
- `verify.ts`：报告期独立记录复核（复核人≠发现人，记录哈希绑定，内容改动后复核失效）。
- `report.ts`：目标中立报告（JSON + Markdown），零依赖 schema 校验。
- `store.ts`：单文件 JSON 存储（`SECAUDIT_STORE` 可覆写），原子写。
- `controller.ts`：REST，挂在既有 `/api/governance` 路由下（`/api/governance/secaudit/*`），不新增 patch。
- 采集器复用既有只读能力：skillgov 扫描、审批链校验、工具审计、posture。

### 2.2 安全审计工作台（客户端）

- ⑥治理新增页签"安全审计"，含：项目/运行、覆盖账本、候选与裁决、报告导出。

### 2.3 评测判分纪律（改造 `custom/server/eval/`）

- 新增 S0 轨迹规则：`required_tools`（必需工具）、`no_loop`（连续相同动作签名）、`redundant_ratio`（冗余步占比上限）。
- `ToolCallRecord` 增 `argsSig`（工具参数指纹），死循环判定按"同名同参"而非仅按工具名。
- 断言新增可选 `anchor: { yes, no }` 行为锚点，注入判定问句；问句统一加"证据篇幅不作为判断依据"的冗长偏差约束。
- 新增可选 `referenceLeakCheck`：去除 `expected_behavior` 再判一遍，与首轮结论不一致的断言置 unknown 并标记不稳定（参照答案锚定检验）。
- 聚合新增 `trajectoryDiscipline`（死循环 attempt 数 / 循环调用数 / 冗余率 / 最大连续重复）与 `judgeStability`（检验数 / 翻转数 / 翻转率）。

### 2.4 评审治理补口

- `verifyFinding` 拒绝"发现者验证自己的发现"（后端硬约束，REST 返回 409 `self_verification_forbidden`）。

## 3. 决策记录

1. **不新建 spawner / 不新建任务库**：审计的"狩猎"阶段由人工或各自助 agent 通过 REST 提交候选；产品只提供纪律与账本，不内置第二个 agent 调度器。理由：仓库已有三套 spawn 实现（hermes kanban worker、zcode mention dispatch、loop subagent dispatcher），第四套必然漂移。
2. **审计对象是"本机 Agent 部署"而非任意代码仓**：现有采集器读的是 profile/skill/审批/审计面。代码仓审计需要新的静态分析引擎，超出本轮；缺的面在账本里显式标 `unchecked`，这正是覆盖账本要暴露的东西。
3. **三态判定用硬约束而非提示词**：`confirmed` 缺来源链、`needs_validation` 带严重性、自证投票，全部在后端拒绝（409/400），不依赖 agent 自觉。
4. **纵深防御缺口不算漏洞**：`defenseInDepth=true` 的候选强制归入 `hardening_advice`，severity 置空。理由：把已有多层防御挡住的情形记为漏洞会稀释真问题。
5. **历史证据不计入已覆盖**：目标指纹变化后，上一轮账本条目标 `partial` 并注明"目标已变更"。理由：文章明确"旧证据不当作已覆盖"。
6. **裁判不做 CoT 文本**：判定端 `/v1/systemone` 只回 P(yes)，没有自由文本通道；本轮不伪造 rationale，改为行为锚点入问句 + 参照答案锚定检验 + 判词 reasons 保留机器可审计口径。要真 CoT 需换判定协议，另立任务。
7. **`referenceLeakCheck` 默认关闭**：每次运行判定成本翻倍，只在争议题/新集首轮显式开启；与既有 `crossValidate` 同级。
8. **报告 schema 零依赖**：按文章做法，schema 校验器不引入 ajv，纯函数返回问题清单，便于在 CI 与 qgate 门禁直接调用。

## 4. 验证

- 新增服务端测试：`custom/server/secaudit/__tests__/*.test.ts`（覆盖账本/裁决规则/自证拒绝/复核失效/报告校验/REST）。
- 新增评测测试：轨迹规则（必需工具、死循环、冗余率）、argsSig 提取、行为锚点问句、参照答案翻转置 unknown、聚合字段。
- 既有 `custom/server/eval/__tests__/*` 全量保持通过（判分默认行为不变）。
- `custom/server/reviewgov/__tests__/convergence.test.ts` 增自证拒绝用例。
- `npx vitest run` 定向路径 + `npm run typecheck:harness`（新文件加入脚本）+ 全量 `npm test`。
