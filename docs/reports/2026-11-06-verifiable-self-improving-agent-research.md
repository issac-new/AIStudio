# 《如何构建一个真正可验证的自我改进的 Coding Agent》调研对照（2026-11-06）

## 一、文章档案

| 项 | 值 |
|---|---|
| 标题 | 如何构建一个真正可验证的自我改进的 Coding Agent |
| 公众号 | 今天也还行 AI Lab |
| 发布时间 | 2026-10-04 10:00 |
| 链接 | https://mp.weixin.qq.com/s/GAjP-Uvz57lbb8ORXb8lYw |
| 涉及系统 | Keel 0.2.0（macOS 本地优先编码应用，Rust/GPUI）、Jev（托管选择器）、Laya（本地选择器）、Agent Client Protocol（ACP） |
| 抓取方式 | `wechat-article-extractor` 解析原文 HTML，转纯文本约 9.9k 字，四节正文完整 |

文章的中心问题不是「怎么让 Agent 变强」，而是「怎么证明它变强了」。作者给出的答案是把决策压到一个极窄、极可校验的契约里，并让 Harness 承担全部执行与验证责任。

## 二、论点拆解

| # | 主张 | 原文要点 |
|---|---|---|
| M1 | 决策层只做单选 | 宿主预先准备有限候选清单，选择器只返回「选此项」或「无法决策」，返回类型化结果；模型不得发明新选项 |
| M2 | 过滤先于选择 | 宿主在把选项交给选择器之前，剔除未安装/未启用 Provider、查不到的模型、不支持的推理级别 |
| M3 | 两个决策点必须分边界 | 新任务路由（选 Worker）与内部循环焦点（inspect/implement/verify/answer → 宿主定义的工具集）是两类任务，失败模式不同；`answer` 对应零工具 |
| M4 | 选择与权限分离 | 选择不授予权限，高置信度≠授权；需用户批准时标准权限路径不可绕过 |
| M5 | 行动前二次校验 | 应用选择前重新核对任务状态、Provider 列表、工具定义；状态过期则拒绝并回退 |
| M6 | 弃权/回退有明确形态 | 「我无法选择」是合法输出；调用选择器前先定义回退策略；记录回退发生时间，避免把回退误统计为成功案例 |
| M7 | 决策事件/执行收据 | 记录候选方案、选择与弃权、宿主是否接受、是否回退、后续工具调用结果；最小必要信息，不是私有思维链 |
| M8 | Harness 呈现不确定性 | 「若选择器主动弃权，应明确展示；若宿主因操作过期而拒绝某次动作，也应如实呈现」，不输出整洁但失真的摘要 |
| M9 | 自改进的边界 | 只记录不静默自训练；一条记录 → 可复现测试场景 → 基线/候选对比 → 人工审批 → 新基线；保留失败样例与独立任务集；禁止无 diff、无可回滚的「因学习而变更」 |
| M10 | 额外智能要证明价值 | 比较整体任务成本：选择器耗时、Worker 耗时、重试次数、人工审查投入；作者明确「尚未在编码基准测试中证实这一收益」 |

## 三、AIStudio 逐条对照

判定口径：**已具备**＝仓内有确定性实现且有守门；**已吸收**＝本轮三篇调研批次中落地；**缺口**＝仓内无等价物；**不适用/仓外**＝决策点不在本仓控制范围。

| # | 仓内载体 | 判定 | 证据 |
|---|---|---|---|
| M1 | `runtime/hermes-records/design/hermes-complete-design-doc.md:2291` 已完整设计「决策层只做可校验的选择、禁发明选项、弃权阈值 0.60、`disposition: accepted｜abstained｜fallback_used`、选择≠授权」；载体在仓外 `~/.hermes/scripts/`，`:2304` 的 `research/laya_decision_receipt.py` 标注 Exercised（本地 fixture）、**未接入真实 Gateway 路由**。仓内 `custom/qgate/src/core/decision.ts:10-21` 的 `Decision` 是判据结论，不是有限候选单选 | 部分具备（设计在仓内、执行在仓外） | 设计文档 §4.22；`custom/server/decisiongraph/decision-recorder.ts:10` 明确「模型路由决策不在此列，studio 无决策点」 |
| M2 | `custom/server/toolpipeline/contract-guard.ts:86-110` 在 `preExecute` 用 `resolveToolContract` 的 `inputSchema` 拒绝；工具契约表 `custom/server/toolcontract/contract.ts:222-304`；`config/default-tool-policies.json:7-60` | 已具备（工具面） | `tool-hooks.ts:384` 钩子序 `[auditHook, contractGuardHook(), …]` |
| M3 | 无 focus→工具集映射；`docs/reports/2026-10-16-agent-security-check-report.md:58,69` 记录「49 个 profile 全部挂全量工具集、启动后不可收窄」 | 缺口（且属上游运行时面） | 同上；仓内 `custom/server/orchestrator/decision.ts:4` 明确「本模块只记录，不执行」 |
| M4 | `custom/server/toolpipeline/enforce-gate.ts:13,99,106` 的 strict-deny / insight 档只放 read；`config/default-tool-policies.json` 的 `require_approval` | 已具备 | `custom/server/approval-inbox/human-gate.ts` 人工批准域 |
| M5 | B 批 `custom/server/approval-inbox/human-gate.ts` 的 `recheckTaskRevision`：批准前重取任务重算 revision，不符即 409 `revision_mismatch`；不可达 fail-soft 放行并留 `revisionRecheck: unavailable` | 已吸收（B 批） | `simharness/tests/decision-receipts.test.ts:170-220` 三态守门 |
| M6 | B 批 `mx_verdict_receipt` 幂等键含 `verdict`（改判追加新行）；此前**空判词一律不落盘**，服务不可达与源缺席同形 | 本轮修复前为缺口 | `simharness/mux/mx-scenario-lib.sh:2146-2159`；`simharness/tests/decision-receipts.test.ts:75-79` |
| M7 | B 批 `gate-verdicts.jsonl` 记录 `{id,ts,gate,verdict,source,room,room_sha,card,card_sha}`；另有 `custom/server/toolpipeline/policy-decisions.ts:15-34` 的策略决策哈希链、`.swarm-yuan/decisions.jsonl` 的 `alternatives` 字段 | 部分具备：候选集、宿主校验、回退、下游结果未同记录 | `docs/superpowers/specs/2026-11-06-decision-receipts.md:7,32,51` 把「弃权/改判/时延聚合」列为挂账 |
| M8 | 见 M6；`governance-client.sh:33-39` 把服务不可达折叠为空判词，报告只能看到「判词 0 条」 | 本轮修复前为缺口 | 对比同文件 `:41-48` 的 `gov_lc_reqjudge` 已有 `issue_once ... fail-closed` 显式化先例 |
| M9 | C 批 `custom/server/eval/golden-set.ts` 30 例黄金集＋10/10/10 配比校验＋`EvalRun.judgeFingerprint` 裁判指纹冻结；`--update-baseline` 棘轮、qgate `waive` 必填 approver、`human-gate` 人工批准域 | 部分具备：资产/校验/审批各自在位，**缺「回执 → 可复现场景」的接线** | `docs/superpowers/specs/2026-11-06-eval-golden-set.md:42-47` 挂账 G4 接黄金集、Rubric Loop 校准 |
| M10 | `config/mechanism-budget.json:3-10` 的机制预算与 `sunset` 退役条件是治理层的同构物（每次新增机制都要证明值得存在），但无 selector 耗时/重试/回退率计量 | 缺口（B 批明确挂账） | `docs/superpowers/specs/2026-11-06-decision-receipts.md:32`「避免为空表建仪表盘」 |

## 四、本轮之前已吸收的三批

三篇文章在本仓已有一轮系统吸收，避免重复造轮子：

- **A 批**（文章二，AI 如何调用工具）：`2026-11-06-ai-friendly-cli-contract.md` —— `config/cli-contract.json` 单一事实源、三语言薄镜像、三试点迁移、GAP 退出码 2→4 根治 G4 fail-open、静态棘轮。
- **B 批**（本文，决策与执行收据）：`2026-11-06-decision-receipts.md` —— 判词回执落盘、批准前版本复核、组织自派发实算、A 批挂账 3 清偿。
- **C 批**（文章一，评测平台）：`2026-11-06-eval-golden-set.md` —— 30 例黄金集、配比校验、裁判指纹冻结、规模披露。

三批共同的取舍是「先落数据、不建空消费面」，与文章 M10「额外调用必须证明其价值」一致。

## 五、本轮定位的真实缺口与修复

**缺口**：`gov_lc_verdict`（`simharness/mux/governance-client.sh:33-39`）在 `_gov_lc_post` 失败时 `printf ''` 返回空；服务可达但响应中判词为空时也返回空。B 批 `mx_verdict_receipt` 对空判词直接 `return 0` 不落行，导致证据面无法区分：

1. 评审尚未给出结论（正常等待）；
2. 治理服务不可达 / 响应损坏（宿主实际发生了回退）。

两者在报告里都是「判词 0 条」，下游等待环同样超时。这正撞上文章 M8「Harness 应呈现不确定性，而非掩盖它」和仓内「fail-soft 不造假」不变量（源缺席应返回 `available:false`，不猜数）。

**修复**（详见 `docs/superpowers/specs/2026-11-06-verdict-availability-receipt.md`）：

- `gov_lc_verdict` stdout 扩为四段 `verdict|room|card|availability`，不可达输出 `|||unavailable`，前三段仍全空 → 所有 `cut -f1/2/3` 消费者取值零变化，fail-closed 语义不动。
- `mx_verdict_receipt` 增第 6 参，仅「空判词 + unavailable」落 `disposition: abstained` 行，`verdict` 保持空串 → 任何按非空 verdict 统计的消费者都不会把回退算成成功（M6）。
- 保留 B 批「源缺席不落盘」：边界是「是否发起过判词调用」，机械可判，不靠解释。
- 零新增脚本/门/账本/npm script（`config/mechanism-budget.json` 的计数类目已顶格，数值以该册为单一事实源），不建聚合指标消费面。

## 六、剩余差距与明确不做

| 项 | 状态 | 理由 |
|---|---|---|
| M1/M3 仓内 selector + focus→工具集 | 不做（本轮） | 决策点在 hermes 运行时侧，设计文档 §4.22 已有 Laya 决策层且载体在仓外、未接真实 Gateway；仓内再建一套是第三份实现。须先裁决归属 |
| M7 候选集/宿主校验/回退/下游结果同记录 | 挂账 | 需要真实的「宿主备菜单」调用点才有意义；当前 `gate-verdicts.jsonl` 的候选只有房间/卡面双源 |
| M9 回执 → 可复现场景 → 基线对比 → 人工审批 | 挂账（最高价值） | 资产已在（黄金集、棘轮、人工批准域），缺的是接线；属独立设计项，须连同 M1 归属一起裁决 |
| M10 总成本计量 | 挂账 | B 批已明确「等一轮真实数据后定形态」，不为空表建仪表盘 |
| `gov_lc_uat_verdict` / `gov_lc_uat_coverage` 的不可达同形 | 挂账 | 同批改两处判据面会混淆归因 |

文章自身的诚实边界同样适用于本仓：作者明确说「本次发布并未证明存在科幻意义上的自改进 Agent」「我们尚未在此处的编码基准测试中证实这一收益」。本轮交付的是**一处可机检的不确定性留痕**，不构成「AIStudio 已具备自我改进能力」的证据。

## 七、结论

文章对 AIStudio 最有价值的不是 Jev/Keel 的具体组件，而是三条判据：

1. **决策与执行必须分边界**，且边界画在「代码能强制执行」的地方；
2. **失败/弃权/回退必须各有形状**，不能被折叠成同一个空值；
3. **记录的价值在于可重放、可对比、可人工批准**，不在于先建仪表盘。

第 2 条在本仓找到了一处真实违例并已修复；第 1、3 条的剩余部分登记为挂账，不以文档表述冒充实现。
