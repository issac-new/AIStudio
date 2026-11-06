# 判词可用性分型与弃权回执（微信文章三 D 批）

## 变更

依据《如何构建一个真正可验证的自我改进的 Coding Agent》「Harness 可以呈现不确定性，而非掩盖它」「为不确定性预留明确路径」「记录每次回退的实际发生时间，避免将回退误统计为选择器的成功案例」三条主张，补齐 B 批（`2026-11-06-decision-receipts.md`）回执层的一处空白：判词服务不可达与「源里确实没有判词」此前都折叠成空字符串且零留痕，证据面无法区分「评审尚未出结论」与「判词服务挂了」。

- **可用性带内分型**（`simharness/mux/governance-client.sh`）：`gov_lc_verdict` 的 stdout 由三段 `verdict|room|card` 扩为四段 `verdict|room|card|availability`（`ok|unavailable`）。`_gov_lc_post` 失败、响应为空、jq 解析失败三种情形输出 `|||unavailable`；前三段保持全空，既有 `cut -f1/2/3` 消费者（等待环、`mx_gate_verdict_seen` 族、`mx_text_gate_verdict`）取值零变化。
- **弃权回执**（`simharness/mux/mx-scenario-lib.sh`）：`mx_verdict_receipt` 增第 6 参 `availability`；仅「空判词 + unavailable」落一行 `disposition: abstained` / `abstainReason: upstream_unavailable` / `verdict: ""`，幂等键 `run×gate×room_sha×card_sha×abstained:upstream_unavailable`。非空判词补 `disposition: accepted` 字段（纯加法，旧字段不动）。三个调用点（`mx_room_gate_verdict` / `kanban_card_gate_verdict` / `mx_gate_verdict_combined`）透传第 4 段。
- **B 批语义保留**：源文本为空（未调用判词服务）与「服务可达但响应判词为空」仍不落盘；判词返回语义、`mx_gate_verdict_seen` 族、`gate-verdicts.jsonl` 单一账本零变化。
- **守门**（`simharness/tests/decision-receipts.test.ts` 新增 ⑤ 组）：不可用分型、可用无判词不落盘、不可达落 abstain 行且同键幂等、服务恢复后追加 accepted 行、abstain 行 `verdict` 为空（按非空 verdict 统计的消费者天然不计为成功）。
- **调研正本**：新增 `docs/reports/2026-11-06-verifiable-self-improving-agent-research.md`，登记文章九条主张 × 仓内载体 × 差距 × 已吸收批次，防后续会话重复评估或误报「已实现」。
- **治理**：`config/mechanism-budget.json` 追加 `+0` changes 记录；附录 A 索引登记本 spec（A.1 行数与标题声明数同步 +1）。

## 决策记录

### 一、用第 4 段带内信号，不用全局变量或新状态文件

三个调用点都是 `_v=$(gov_lc_verdict ... | cut ...)` 形式的命令替换，管道与替换都在子 shell 执行——函数内设置的全局变量无法回传父 shell。新建状态文件则等于新增账本（`config/mechanism-budget.json` 的 `ledgers 6/6` 顶满），还要处理跨进程读写与清理。第 4 段走既有 stdout 通道是加法：前三段逐字不变，既有消费者不需要改判定；第 4 段缺省（测试 stub、旧镜像）按 `ok` 处理，向下兼容。

### 二、只把「看不见」变成「留得下」，不把空判词变成任何结论

不改 `governance-client.sh` 声明的 fail-closed 语义：不可达仍不假 PASS，等待环仍自然超时，本批不给 `mx_gate_verdict_seen` 族任何新结论。`gov_lc_reqjudge` 的 `issue_once ... fail-closed` 是同仓已有的「不可达显式化」先例，本批在判词面补上等价的留痕，但刻意不发问题单——问题单会进入清偿门，改变开跑行为。

### 三、保留 B 批「源缺席不落盘」，只新增「调用失败」这一决策事件

B 批已裁定「无判词≠决策事件」：源文本为空时连判词服务都没调用，不构成决策事件，落行只会给等待环刷无意义记录。文章要求记录的是「宿主准备执行却必须回退」的时刻——本批只把 `_gov_lc_post` 调用实际发生且失败记为弃权。两者边界由「是否发起过判词调用」机械区分，不靠模型解释。

### 四、abstain 行的 `verdict` 必须为空

文章明确要求「避免将回退误统计为选择器的成功案例」。让 `verdict` 保持空串是最省事的机械保证：现有及未来任何按 `verdict != ""` 统计判词的消费者都不会把弃权算成结论，无需为每个新消费者补丁。本批**不建聚合指标消费面**——B 批挂账「弃权/改判/时延聚合视图」仍挂账，等一轮真实 run 数据再定形态，不为空表建仪表盘。

### 五、零新增计数类目与配对降级

`config/mechanism-budget.json` 的 `scripts`/`npmScripts`/`ledgers` 计数类目处于实测抬位后的顶格值（数值以该册为单一事实源，不在本 spec 复写），新增即触 `governance-lint --budget` 失败。本批只改既有 lib、既有测试、既有索引与文档，**不新增脚本/门/账本/npm script/钩子**，因此不新增 `sunset` 条目。配对降级＝把 B 批「空判词一律不落」这条绝对规则降级为「仅源缺席不落」，回执沿用既有 `gate-verdicts.jsonl`，不产生第二套台账。

### 六、明确不做的事

- 不做 selector / focus→工具集：模型路由决策点在 hermes 运行时侧，`custom/server/decisiongraph/decision-recorder.ts:10` 已如实登记「studio 无决策点」；设计文档 §4.22 的 Laya 决策层载体在仓外 `~/.hermes/scripts/`，`research/laya_decision_receipt.py` 标注为 Exercised（本地 fixture）、未接入真实 Gateway。在仓内再造一套会是第三份实现。
- 不做「额外智能的总成本」计量（选择器耗时/重试/人工审查）：需先有稳定的 selector 调用点，当前没有。
- 不改审批权限路径：文章「选择≠授权、高置信度≠授权」由 `custom/server/toolpipeline/enforce-gate.ts` 与 `config/default-tool-policies.json` 既有边界保证，本批零触及。
- 不扩到 `gov_lc_uat_verdict` / `gov_lc_uat_coverage`（同样存在「不可达与未见同形」），避免同批改动两处判据面混淆归因。

## 验证

- `simharness/node_modules/.bin/vitest run --root simharness tests/decision-receipts.test.ts`：**18/18 全过**（B 批 ①-④ 11 例零回归 ＋ 新增 ⑤ 组 7 例）。根 `vitest.config.ts` 的 include 只含 `custom/**` 与 `scripts/**`，simharness 测试须用其自带配置。
- `bash -n simharness/mux/governance-client.sh simharness/mux/mx-scenario-lib.sh`：OK。
- `node scripts/governance-lint.mjs --budget`：**0 problem / 19 warning**（既有 legacy 形态与无机检判定器告警），计数类目零增长。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts custom/__tests__/qgate-acceptance-registry.test.ts`：**11/11**（附录 A 并集覆盖、声明数 = A.1 行数、四段与 DESIGN_SYNC）。
- `npx vitest run scripts/__tests__/budget-retirement.test.ts scripts/__tests__/governance-lint.test.ts`：**12/12**。
- `npx vitest run custom/__tests__/l2-kit-parity.test.ts`：**12/12**；`custom/__tests__/spec-fidelity-baseline.test.ts`：**9/9**（37.9s，新 spec 未拉低保真度基线）。
- 改动文件 `read_lints`：0 诊断。
- **`simharness/node_modules/.bin/vitest run --root simharness tests/harness-gate-integrity.test.ts`：131 passed / 1 failed** —— `② 硬闸打回熔断 > trip/check 委托治理客户端` 断言 `累计 2 轮未过` 缺失。该用例消费 `mx_gate_breaker_trip` 的 `note()`（A 批把 `log()` 改 stderr 后，`note` 的可见输出改走 stderr，而测试 `sh()` 只捕获 stdout）。本批 `git diff` 的 hunk 仅在 `governance-client.sh:30` 与 `mx-scenario-lib.sh:2122/2146/2192`，与熔断函数（:2516 之后）零交集，`simharness/mux/` 也只有本批两个文件为脏；判为 A/B 批遗留的存量失败，如实登记、不在本批越界修改他批已裁定的 `note()` 语义。
- 未做活体推演：本批不含真实 run 的 `gate-verdicts.jsonl` 数据，abstain 行的真实触发留待下一轮 SIM 运行观察。

## 设计文档影响

DESIGN_SYNC: none——本批是推演侧治理客户端的可用性分型与证据留痕，不改整合正本 `2026-10-23-swarmstudio-integrated-design.md` 与数字总账 `2026-10-23-swarmstudio-design-ledger.md` 的设计参数、六闸判据或版本容量基线；判词判据单一事实源仍为 `custom/server/governance/lifecycle`，判读口径零改动。§4.22 Laya 决策层正文未改，其「未接入真实 Gateway」边界声明保持成立。

## 挂账（下一轮）

- abstain 行的消费面（弃权率/回退率/判词时延）：与 B 批挂账合并，等一轮真实 run 数据后定形态。
- `gov_lc_uat_verdict` / `gov_lc_uat_coverage` 的不可达分型。
- 决策回执 → 可复现场景 → 基线对比 → 人工审批的闭环：文章 §04 的核心，需先裁决决策点归属（仓外运行时 vs 仓内），属独立设计项。
- `note()` 的 stdout 捕获面（本批实测发现，非本批引入）：A 批 `log()`→stderr 后 `mx_gate_breaker_trip` 的 note 输出在只捕获 stdout 的消费者里缺席，`harness-gate-integrity.test.ts` 的「累计 2 轮未过」断言因此存量红。`note()` 语义由 B 批明确「刻意不动」，须与 A/B 批属主会话一并裁决，不在本批越界修。
