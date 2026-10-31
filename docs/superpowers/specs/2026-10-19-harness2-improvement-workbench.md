# Harness² 改进实验台设计：把「测量」接成「闭环」（2026-10-19）

> 状态：实施中（feat/harness2-workbench）。
> 调研源：InfoQ《谷歌开源Harness，支持 OpenCode 和 Codex：国内开发者接入Jev实测“真行”》（2026-10-19 14:24）+ EasyShip.AI《谷歌最新开源了自我改进框架：Harness²！》（2026-10-19 11:38）+ github.com/google-research/harness2 源码级调研（见同目录《2026-10-19-harness2-source-notes.md》）。

## 主旨三句话

唯一主旨：SwarmStudio 已有九层体检、能力目录、成本账、Eval Studio、审批与沙箱等「测量与安全」设施，本批补上 Harness² 的「闭环」——可编辑面登记、候选版本、提出-探测-组合、经验库、回归门、冠军/回滚。

受众：治理页的工程负责人与平台维护者。

读完促成：每个改进提案都能说清「改哪个面、凭什么证据、花了多少、回归有没有倒退、谁批准、怎么回滚」，而不是凭感觉改 prompt。

## 1. 调研结论（可落地的六个机制）

1. **八个可编辑面**：系统提示词、护栏、记忆、工具指导、子智能体、Skills、脚本、插件。
2. **任务级递归**：提出多个 Harness 修改 → 在同一任务上探测 → 依据执行行为差异重新组合；不要求标准答案。
3. **Harnessing 级递归**：跨任务维护 Improvement Harness，保存被采纳的 Harness 与有执行证据的经验，指导下一次提议。
4. **K 路探索**：`--k K --mode parallel` 并行探 K 个候选、产出 K 个组合；`sequential` 逐步加深。收益来自更多测试时计算，不是免费。
5. **证据与门禁**：只看答案对不够，工具调用、Trace、Token、时延、成本都要进评测；历史失败集必须回归；无收益要能删除。
6. **安全与成本**：官方 executor 默认放开网络、Codex 关闭沙箱；社区要求 `--max-usd`、人工参与选择与经验总结、候选代码不能只做 `compile()` 检查。

## 2. 现有能力与缺口

| Harness² 机制 | 本仓现状 | 本批处置 |
|---|---|---|
| 八面登记 | 能力目录/八原语只读；各面分散在 constraints、skillprovision、mcpconfig | 新增统一 `surface-registry`，只读扫描真实产物，标可写/建议、风险、修订号 |
| 候选版本 | 无 harness 候选版本 | 提案内建 K 个 variant（内容+摘要+diff 摘要） |
| 提出-探测-组合 | 只有任务级 best-of-N/并行评审 | 新增 proposal → probe → compose 状态机 |
| 经验库 | expcandidates 有候选但证据弱、无 UI、无版本链接 | 新增带 run/提案证据链接的经验库，并可导入已批准 expcandidate |
| 回归门 | Eval Studio 有回归样本库与发布门禁，但未绑候选 | 探测记录强制绑定评测运行；晋级要求回归运行 0 倒退 |
| 成本上限 | 有每日 USD 预算，无实验级上限 | 提案级 `budgetCapUsd`；探测创建前估算拦截、晋级前实测校验 |
| 冠军/回滚 | KG/本体/Skill 有各自回滚，无 harness 冠军 | 按面记录 champion 与 previous；可写面快照+原子写+回滚 |
| 审批绑定 | approval-log 有 scope/expiry；无候选摘要绑定 | 批准绑定 `variantSetDigest`；内容变更即失效 |
| 行为对比 | compareRuns 依赖真值；shadow-runner 只用于引擎迁移 | 新增 `behaviorContrast`：结果层判定优先，过程层给轨迹/Token/时延/成本对比；证据不足判 unknown |

## 3. 产品形态

位置：**⑥治理 → 改进实验**（`stage-tabs.ts` 新增 `improve` 页签）。不新增一级导航，避免 IA 再裂一层。

页面四段：

1. **总览条**：可编辑面数量、在途提案、已记录探测、冠军数、预算使用。
2. **可编辑面**：八面卡片；显示真实产物数、修订号、风险档、写入模式（可直接写入/只出建议）；产物缺席如实标「未发现」。
3. **改进提案**：新建表单（面、目标文件、假设、证据引用、K 个候选、预算上限）＋提案卡片；卡片展示状态、批准绑定、每个候选的探测结果与行为对比、组合与晋级门禁阻塞项；动作含提交/批准/驳回/建探测/记录探测/组合/晋级/回滚。
4. **经验库**：已采纳经验与候选；支持从 expcandidates 导入、人工新增、采纳/退役。

边界说明固定在页面底部：本页不替用户跑模型；探测必须绑定 Eval Studio 的真实运行；可直接写入的面仅系统提示词与 Skills，且需要 `HARNESS2_APPLY=1` + 人工批准；其余六面只出建议。

## 4. 数据模型

存储：`HARNESS2_STORE`（文件）或 `HERMES_WEB_UI_HOME|HERMES_WEBUI_STATE_DIR/harness-workbench/workbench.json`，原子写（tmp+rename），进程内串行化。
`HARNESS2_STORE_SQLITE=1` 切 SQLite 后端（`workbench.sqlite`，proposals/experiences/champions/auto_jobs 四表，显式事务，旧 JSON 首次自动迁移并改名 `.migrated` 保留）——R11，缺省仍 JSON，切换属独立迁移窗。

```
WorkbenchStore { version, nextSeq, proposals[], experiences[], champions[] }
Proposal {
  id, title, hypothesis, surfaceKey, targetPath?, risk, mode: 'parallel'|'sequential',
  status: 'draft'|'submitted'|'approved'|'rejected'|'probing'|'composed'|'promoted'|'rolled_back',
  budgetCapUsd, evidenceRefs[], experienceIds[], domain, treeRoot?,
  noise?: { runIds[≥2], setId, delta, method:'half-range', samples[], computedAt },   // S2→R2
  constraints?: { checks[{id,statement,status:'pass'|'fail'|'unknown',detail?}], actor, at }, // D5→R12b
  heldout?: { runId, n, passRate },                                                  // R6
  skillDifferential?: { withSkill, withoutSkill, delta },                            // R9
  base: { content, digest, revision, exists }, variants: Variant[],
  probes: Probe[], approval?, composition?, promotion?, rollback?,
  createdBy, createdAt, updatedAt
}
ProbeMetrics {
  evalRunId, setId, setRevision?, evidenceMode, k, passAt1, passAtK,
  resultPassRate, trajectoryPassRate, unknownRatio, riskVeto, judgeOnline,
  statisticallyInsufficient, tokens, costUsd, steps, latencyMs, regression?,
  equalBudgetBaseline?: { runId, setId, passAt1 },   // HDA→R2
  counterfactual?: { runId, setId, passAt1 },        // CHASE→R2③
  heldout?: { runId, n, passRate }                   // R6
}
PromotionRecord { actor, at, digest, applied, targetPath?, backupPath?,
                  verificationTier?: 'command'|'heldout'|'regression'|'judge'|'none',  // R12a
                  appliedVia?: 'false'|'via-workbench'|'via-surface' }               // R7
Variant { id, label, content, digest, diffSummary }
Probe {
  id, variantId, status: 'planned'|'recorded'|'failed',
  evalRunId?, regressionRunId?, evidence?: ProbeMetrics,
  contrast?: BehaviorContrast, recordedAt?, recordedBy?, note?
}
Experience { id, surfaceKey|null, domain?, statement,
             cue?, lesson?, evidenceText?, evidenceRefs[], confidence, status,
             sourceProposalId?, sourceCandidateId?, snapshot?{variantId,digest,targetPath,content}, createdAt }
Champion { id, surfaceKey, proposalId, variantId, digest, previousDigest|null, previousProposalId|null, promotedAt, promotedBy, applied, targetPath?, rolledBack? }
```

生命周期：

```
draft --submit--> submitted --approve--> approved --probe(全K记录)--> probing
probing --compose--> composed --promote(门禁全过)--> promoted --rollback--> rolled_back
submitted/approved --reject--> rejected
```

## 5. REST（挂 `/api/harness/workbench/*`，复用既有权）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/overview` | surfaces + counts + proposals + champions + experiences + meta |
| GET | `/proposals` | 列表（含探测/门禁摘要） |
| POST | `/proposals` | 新建草稿（K 个 variant，读基线与摘要） |
| POST | `/proposals/:id/submit` | 提交（要求假设、证据引用、目标解析成功） |
| POST | `/proposals/:id/decide` | 批准/驳回（批准绑定 variantSetDigest，写 approval-log） |
| POST | `/proposals/:id/probes` | 为全部 variant 建探测（预算估算前置拦截） |
| POST | `/proposals/:id/probes/:probeId/record` | 绑定真实 eval run（+可选回归 run），服务端拉取指标并计算行为对比 |
| POST | `/proposals/:id/compose` | 选冠军候选或合并内容，必填理由 |
| POST | `/proposals/:id/promote` | 晋级门禁 + 可选写盘 |
| POST | `/proposals/:id/rollback` | 回滚冠军与已写文件 |
| GET | `/surfaces` | 八类可编辑面清单与冠军态 |
| POST | `/proposals/suggest` | 起草建议（加权检索 top3＋stale 刷新清单，R8） |
| DELETE | `/proposals/:id` | 删除草稿（未提交前） |
| POST | `/proposals/:id/baseline` | 绑定基线运行 |
| POST | `/proposals/:id/noise` | 噪声 δ 标定（≥2 条同集未改动基线，半极差；δ 无调参入口） |
| POST | `/proposals/:id/heldout` | 绑定密封留出集读数（R6，只回 n/passRate） |
| POST | `/proposals/:id/constraints` | 记录约束保持断言（D5/R12b） |
| POST | `/proposals/:id/probes/auto-run` | 一键自动探测（含 R2 噪声/等预算/反事实三类证据自动供给） |
| GET | `/proposals/:id/probes/auto-status` | 自动探测任务态 |
| GET | `/proposals/:id/surface-artifacts` | advisory 面建议产物导出（memory=条目 JSON／tool_guidance=覆盖片段，R7） |
| POST | `/proposals/:id/surface-applied` | 标记建议已由既有管理面人审应用（appliedVia=via-surface，R7） |
| GET | `/gap-suggestions` | RSI 内核 gap_register capability 条目 → 提案 draft（只读桥，R5） |
| POST | `/gap-suggestions/import` | 批量导入缺口驱动提案（R5） |
| GET/POST | `/experiences` | 经验列表/新增 |
| POST | `/experiences/import` | 从 expcandidates 已批准项导入 |
| POST | `/experiences/:id/status` | 采纳/退役 |

写操作沿用 `writeDenied`：有认证主体时须 `super_admin`；单用户部署放行。

## 6. 晋级门禁（三档，逐条带 code）

判定在 `loop.ts` 纯函数层（`evaluatePromotion()`），service 只读证据与编排。分三档：**硬阻塞**（无条件拦）、**证据门**（同一份证据缺省只告警，对应 env 可升为硬闸）、**警告**（人裁决参考，不拦截）。`loop.ts` 现行 64 个 code 全部归入本节，新增 code 必须同时改本节与守门测试。

### 6.1 硬阻塞

| 组 | code |
|---|---|
| 流程完整性 | `not_composed`、`approval_missing`、`approval_stale`、`approval_rejected`、`variants_missing`、`title_missing`、`hypothesis_missing`、`baseline_missing`、`evidence_missing`、`target_missing`、`composition_unprobed`、`probes_incomplete` |
| 质量与回归 | `quality_regressed`、`regression_missing`、`regression_failed`、`budget_exceeded`、`cost_missing`、`champion_drift`、`target_drift`、`surface_not_managed`、`apply_env_disabled` |
| 泄漏与探索纪律 | `benchmark_leakage`、`pareto_dominated`、`gain_within_noise`（该面首个提案＝结构性探索，降 warning）、`gain_explained_by_compute`、`cost_unjustified`、`edit_budget_exceeded` |
| 约束保持 | `constraint_regression`（任一约束 fail 即拦——能力改进不得以行为约束退化为代价） |

### 6.2 证据门（缺省告警，env 升硬闸）

同一条证据缺席在不同环境该不该硬拦，取决于该环境对证据链的成熟度要求；五道门各配一个 env，缺省告警不阻断既有工作流。

| 门 | 缺省 code（warning） | 升闸 code（blocker） | env |
|---|---|---|---|
| 噪声地板 | `noise_uncalibrated` | `noise_missing` | `HARNESS2_RSI_REQUIRE_NOISE=1` |
| 增益归因 | `attribution_missing`（含 `attribution_set_mismatch`、`gain_mostly_compute`） | `attribution_missing` | `HARNESS2_RSI_REQUIRE_ATTRIBUTION=1` |
| 约束保持 | `constraint_unchecked`、`constraint_unverified` | `constraint_unchecked` | `HARNESS2_RSI_REQUIRE_CONSTRAINTS=1` |
| 反事实 | `counterfactual_missing`（含 `counterfactual_unreadable`） | `counterfactual_missing` | `HARNESS2_RSI_REQUIRE_COUNTERFACTUAL=1` |
| 密封留出 | `heldout_missing` | `heldout_missing` | `HARNESS2_RSI_REQUIRE_HELDOUT=1` |

`heldout_regression`（留出集通过率低于演化通过率−δ）与 `counterfactual_gain_collapse`（语义等价变换下增益崩塌）不受 env 影响，恒为 blocker。

### 6.3 警告（不阻塞）

| 组 | code | 判据 |
|---|---|---|
| 统计充分性 | `statistical_insufficient`、`pass_at_k_divergence` | k<2 恒告警；pass@1 高于 pass@k 说明有样本全败（抽样面未覆盖） |
| 探索健康度 | `candidate_collapse`、`parallel_single_candidate`、`surface_stalled`、`exploratory_within_noise` | 候选去重后不足 K 或逐行 Jaccard>0.9、并行单候选、连续 w 轮无采纳、结构性探索落在噪声带内 |
| 验证强度 | `weak_verification_streak`、`skill_undifferentiated`、`skill_negative_delta` | 该面连续 ≥3 轮最强验证层 ≤judge；skills 面无差分读数；差分 ≤0（装了反而更差） |
| 约束消融 | `constraint_ablation_due` | ≥2 项约束全 pass 且零 fail 历史＝零对抗证据，提示单层消融（防被其余护栏掩护的静默删除） |
| 其他 | `probes_incomplete`、`quality_unknown`、`prefix_cache_churn` | 证据未齐、判定端离线或未知占比过高、前缀缓存抖动 |

创建期硬拒绝（不进生命周期）：候选内容命中源文防泄漏标记（`deterministic_eval_summary`、`"pass_rate"` 等七个）时返回 400，并在 `blockers.markers` 给出命中清单——判词写进 harness 等于把答案喂给后续任务。

## 7. 安全边界

- **不自动跑模型**：探测只绑定真实评测运行；找不到运行即 400，拒绝手填指标冒充证据。
- **可写面白名单**：仅 `system_prompt`（`profiles/*/SOUL.md`）与 `skills`（`skills/*/SKILL.md`）；路径必须落在 `HERMES_HOME` 对应根内，拒绝 `..` 与根外路径；只允许已存在文件。
- **双闸**：写盘需 `HARNESS2_APPLY=1` 且提案已由人工批准；高风险的护栏/子智能体/脚本/插件只出建议。
- **快照与回滚**：写前全文存 store 与 `.bak`；回滚前校验当前文件仍等于晋级时摘要，外部改动则拒绝并说明。
- **审批绑定**：批准记录写入全局 `approval-log`（`targetKind='harness'`），摘要与候选集合绑定。

## 8. 测试与验收

- 后端纯函数：状态机、摘要、行为对比、门禁十类阻塞、写盘/回滚、路径逃逸拒绝。
- 后端 HTTP：overview/proposal/approve/probe(record)/compose/promote/rollback 全链，fixture 全 tmpdir。
- 前端：面板渲染八面/提案/经验/错误降级；页签守门更新。
- 验收命令：`npx vitest run` 目标文件 + `npm run build`（vue-tsc 由构建链覆盖）。

## 9. 决策记录

- 2026-10-19：产品位置选⑥治理页签而非一级导航——现有 IA 明确把 harness 治理收在⑥，新增一级会破坏「六阶段+少量主题岛」的单一事实源。
- 2026-10-19：探测不内置执行器——仓库已有 Eval Studio 承担真实运行与评分；工作台重复实现会造第二套执行与成本口径。工作台只做候选、绑定、门禁、冠军。
- 2026-10-19：可写面只放系统提示词与 Skills——其余六面已有各自管理面（constraints/skillprovision/mcpconfig 等）或风险过高；统一写入会绕过既有审计。只出建议并给出目标锚点。
- 2026-10-19：晋级强制「全 K 记录 + 回归运行 + 成本已记录」——对应源文「只看答案不够」「历史失败集回归」「--max-usd」三点；宁可严格，不用缺失数据放行。
- 2026-10-19：不引入 champion 自动选择算法——由人依据行为对比选组合；机器只给阻塞项与证据，避免把「机制存在」拔高成「能力提升」。

## 11. 源码级对照（Google Research harness2）

完整证据与行号见《2026-10-19-harness2-source-notes.md》。本批直接吸收了六条源码约束：

1. **八组件路径表**：OpenCode 为 `systemprompt.md`/`guardrails.md`/`LongTermMEMORY.md`/`tool_descriptions/tool_guidance.md`/`skills/<name>/SKILL.md`/`sub_agents/<name>/AGENT.md`/`scripts/<name>.py`/`plugin/<name>.ts`；Codex 合并为 `AGENTS.md`/`.agents/skills/...`/`sub_agents/...`/`scripts/...`/`.codex/hooks.json`（`core/prompts.py:424-430,475-480`、`substrate/opencode.py:42-88`）。
2. **递归预算语义**：并行是 2K 候选 + K 组合，顺序是 K 轮「INV+DOM → 组合」；账本恒等式 R=4k、P=3k（`core/recursion.py:343-566`、`core/ledger.py:26-33`）。
3. **选择不读分数**：成品匿名成 A/B/C，选择器读完整交付物后输出 `<choice>`/`<why>`，评分在选择之后（`core/selection.py:268-357`）。
4. **经验库四字段**：`cue/lesson/evidence/confidence` 三项齐备才入库；按域隔离、存整棵 harness（`core/selection.py:402-505`、`core/library.py:15-181`）。
5. **防泄漏标记**：七个评测判词 marker 不得进入 harness/证据树（`core/context.py:419-518`）。
6. **候选多样性**：逐行 Jaccard，塌缩可见（`core/tree.py:407-427`）。

本仓差异（有意为之）：不内置 Proposer/Aggregator 模型调用（候选由人或外部 agent 提供）；不实现匿名选择器（治理页需要可复核的候选标签）；用 Eval 运行的通过率/回归作为硬门（比源文的“选择后再评分”更严）；未移植常驻 24k 上限、技能触发、脚本编译、hooks schema 的完整树校验（这些留在 skillgov/qgate 面，避免双重事实源）。

## 12a. 多文件树候选（2026-10-19 第二批）

源文 harness 是整棵 c1..c8 树；第一批的候选只有单文件。本批把候选扩展为树：

- **数据模型**：`Variant.files[]`（path/content/digest）+ `deletions[]`；`digest` 由 `treeDigest(files, deletions)` 派生。单文件形态保留兼容（`content` 字段不变）。
- **树校验**（`validateTree`，源文 `tree.validate` 的映射）：技能必须有 `description:`、`name:` 与目录一致、且被常驻文本触发（否则=死技能）；脚本走真实 `python3 -m py_compile`（python3 缺席时不伪造判定）；hooks.json 校验 JSON 合法性、事件名（PreToolUse/PostToolUse/SessionStart）、`type: "command"` 与命令非空；常驻文本上限 24,000 字符；技能/常驻文件引用的脚本必须存在。树校验在**创建提案时**执行，失败即 400 带逐条 issues。
- **写盘边界**：树候选只受面的 `writableRoots` 约束（文件名格式放宽——Harness² 树本就跨组件）；单文件候选仍受 `writablePattern` 约束。新建文件允许（新技能主场景），权限 0600。
- **写盘与回滚三态**：apply 先解析全部路径（任一不可写整体不动），快照 `touched`（existed + oldContent + action + newContent）后执行新建/修改/删除；回滚逐文件核对晋级后状态，外部改动即拒，恢复=恢复旧内容/删除新建/恢复被删。
- **门禁**：树提案的 apply 检查不再要求单文件 `targetPath`；树校验不合格在创建期就被拒，不进生命周期。
- **前端**：候选表单支持单文件/多文件树切换，候选表展示文件清单与删除数。

## 12. 边界与挂账

- 不实现自动生成候选的 LLM Proposer（源文 Proposer 属研究件）；候选内容由人或外部 agent 写入。
- 不做跨机器的 harness 版本同步；冠军记录在本机 store。
- 不做统计显著性检验（置信区间/自助法）；单跑仅给警告。后续可接 Eval 的 k 采样与校准数据。
- expcandidates 导入只做证据链接，不改写原候选语义；来源仍标 expcandidate id。
- 未实现按域物理目录隔离与“整棵树多文件快照”；单文件面的快照已存，多文件面待后续。
- 未实现源文的 2K 候选自动生成、匿名选择器、R=4k/P=3k 账本对账；这些需要内置 Proposer/rollout，属下一阶段。
- 未移植常驻文本 24k 上限、技能触发行检查、脚本 compile、hooks schema 校验；本批只做 managed 面的路径安全、非空与防泄漏。

## 13. 一键自动探测（2026-10-19 第三批，用户裁定「做到批准后自动发起探测为止」）

批准范围：提案人工批准后，一键自动物化候选树并发起真实评测运行，回填运行号；不做自动提出候选。两道前置闸随批落地：

- **预算硬停**：自动探测按任务逐条记真实成本（trace usage 同源估算；价目缺失时用可配置单题估值并如实标注）。累计成本达到提案 `budgetCapUsd` 即停止派题，已完成部分照常回填，未跑任务如实标 `budget_stop`，不伪造全量。
- **可执行件禁跑**：候选树含 `scripts/`、`plugin/`、`.codex/hooks.json` 或任何 `.py/.js/.ts/.sh` 文件时，自动探测直接拒绝（该探测标 failed）。SKILL.md/AGENT.md/SOUL.md 等纯文本不受限。

### 执行模型

1. **物化**：在系统临时目录（`mkdtemp harness2-probe-*`）建隔离 HERMES_HOME——未触及条目符号链接，触及文件写实内容，删除项不落盘；目录由 OS 定期清理，v1 不接沙箱租约（探测 home 不含生产可写面，执行件已被禁跑闸挡在物化前）。候选含可执行件的树在物化前即被拒。
2. **驱动**：沿用 kanban 派发先例，子进程 `hermes -p <profile> --cli --accept-hooks chat -q <题面>`，env 重指 `HERMES_HOME=<隔离 home>` + `HERMES_RUN_TRACE_DIR=<隔离 traces>`，trace 不混生产目录。profile 由提案 `profile` 字段指定（缺省从 targetPath 的 profiles/<name> 推导）。
3. **判分**：任务完成后直读隔离 trace（`evidenceFromTraceLines`），以内联证据调 `runReplayEval`——不依赖全局 trace 目录。运行落 Eval Studio，`target.harnessRef=<提案>:<候选>`（EvalRunTarget 新增字段）保证可归因。
4. **回填**：`probe.evalRunId` 指向新运行，走既有 recordProbe 逻辑算行为对比；回归集可选同跑（`regressionSetId`），未提供则晋级仍被 `regression_missing` 拦，可手工绑定。
5. **任务形态**：探测在服务端进程内顺序执行（预算账本需要串行），同提案并发二次发起返回 409。每题默认上限 10 分钟、每提案默认 5 题（可调、上限 50）。服务重启后「running」任务判失联，需人工重新发起——v1 如实挂账，不做断点续跑。
6. **判分通道**：生产走本地 clef 裁判（EVAL_JUDGE_* 配置）；裁判离线时判词如实落 unknown（online=false），晋级门按既有 quality_unknown 警告处理。测试注入离线 ask，绝不在单元测试里触真实裁判服务。

### 边界

- 自动探测只消费**已批准**提案；未批准提案端点直接 409（批准仍是安全闸）。
- 判分沿用 Eval Studio 回放判分（S0/S1/人工三层），不新增判定逻辑。
- scripts/plugins/hooks 禁跑闸是 v1 保守线；沙箱化执行（sandbox-lease 真根 + rlimit）属下一阶段，不在本批。
- 密封集尝试计数照常生效（actor=workbench-auto）。

## 14. 证据自动化与执行面（R1-R12，2026-10-31～11-01 执行批）

机制扩展已停止（改进方向转为「让既有门禁拿得到证据、让实验可规模化」），本节是这一步的设计约束。执行细节与决策见 `2026-10-31-rsi-improvement-plan.md`、`2026-10-31-rsi-exec-batch1.md`。

### 14.1 三类独立证据与自动供给

晋级门要判的三件事——增益是否超过噪声、增益是否来自候选本身、增益是否依赖本次改写的表面特征——各需一份独立证据：

| 证据 | 语义 | 供给方式（`POST /probes/auto-run` 自动编排） |
|---|---|---|
| 噪声 δ | 未改动 harness 重复评测的离散度 | 同集未改动树跑 2 次，passAt1 半极差＝δ；足够预算时逐次追加 |
| 等预算基线 | 同等预算下未改动 harness 的读数 | 同集未改动树再跑 1 次，写 `equalBudgetBaseline` |
| 反事实 | 语义等价变换下的读数（改名/换路径/包装输出/注干扰） | 变换器产变体集→注册临时 eval 集（`cf-<set>-<id>-<ts>` 防撞名）→候选树跑同题→写 `counterfactual` |

约束：三类证据全部来自真实运行，禁止手填；预算不足或建集失败如实跳过并在任务态标注，不阻断主探测；反事实默认用 `rename_ids`（最不容易改变语义的一类），其余三类留给人工指定。变换器必须确定性——同输入同输出，否则「语义等价」无从谈起。

### 14.2 验证信号分层

晋级记录写 `verificationTier`，按证据强度取最高档：`command`（命令验收器）> `heldout`（密封留出）> `regression`（历史回归）> `judge`（仅裁判判分）> `none`。该面连续 3 轮最强层 ≤`judge` 时报 `weak_verification_streak`——分数在涨但证据没变强，等于在同一个判分器上自我强化。留出集只回聚合读数（`n`、`passRate`），题目与答案永不出库。

### 14.3 约束保持与单层消融

晋级前记录「不许退化」的行为约束（护栏/权限/审计/拒答），任一 fail 即 `constraint_regression` 硬拦。仅 pass 不等于有对抗证据：≥2 项约束全 pass 且历史上从未 fail 过时，报 `constraint_ablation_due`，要求做一轮单层消融（逐个约束关闭后复测）——多个相似护栏并存时，删掉其中一个会被其余掩护而在聚合分上不可见。

### 14.4 技能与任务族的横向校验

skills 面晋级要求 `skillDifferential`（同集有技能/无技能两态），缺读数告警、差分为负告警——「看似相关」的技能可致功能失效。评测集可带 `family` 标签；overview 按族聚合增益，面级平均增益为正而某族为负时告警 `family_specialization`（增益可能来自单任务特化）。

### 14.5 应用回路与提案来源

- **managed 面**（`system_prompt`/`skills`）：双闸齐备时工作台直接写盘，`appliedVia='via-workbench'`。
- **advisory 面**（`memory`/`tool_guidance`）：工作台不写盘，只导出结构化建议产物（记忆条目 JSON／工具描述覆盖片段）；人审应用后调 `surface-applied` 标记 `via-surface`。回读验证＝以新产物为基线新建提案。
- **提案来源**：除人工起草与经验检索（加权 top3：置信度×面域×domain，附 stale 刷新清单），可只读消费 RSI 内核的 capability 缺口登记（`/gap-suggestions`），映射为草稿；采纳回写走独立建议文件，不直写内核手工区。

### 14.6 缺省档位汇总

| 项 | 缺省 | 开启方式 |
|---|---|---|
| 证据门五门 | 告警 | `HARNESS2_RSI_REQUIRE_{NOISE,ATTRIBUTION,CONSTRAINTS,COUNTERFACTUAL,HELDOUT}=1` |
| 自动证据供给 | 随一键探测执行 | 无需开关（预算内自动跑） |
| 反事实变换类 | `rename_ids` | 其余三类待人工指定 |
| 存储后端 | JSON 文件 | `HARNESS2_STORE_SQLITE=1` |
| 断点续跑 | 关闭（重启后 running 判失联） | 后续接 `auto_jobs` 表恢复 |
