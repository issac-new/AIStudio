# completion-contract.md — kanban_complete 收尾解释标准（结构化学徒）

> 版本: v1.0 (2026-10-16)
> 来源: wx-fusion-20261016 子卡 C6 (t_6452bd55)。机制出处: 麦肯锡《The judgment bottleneck》§06 structured apprenticeships——AI 产出须列出每一步公式/数据/假设，成员须理解到足以回答追问。
> 分工: 本文件定义收尾 summary 的**解释质量**标准；summary/metadata 的**字段结构**仍由 `~/.hermes/profiles/_shared/02-org-orchestration/ontology.md` §3.2 CompletionHandoff 定义。两者互补，不重复。
> 维护方: platform 域（platform-ontology-curator）。修改走提案制；破坏性变更升大版本号并附迁移说明。

## 1. 为什么需要这个标准

worker 收尾 summary 只写「已完成/测试全过」时，验收方无从判断真懂假懂（FUSION-VERDICT-20261016 §2「结构化学徒: 完全缺位」）。本标准把结构化学徒机制落到 kanban_complete：**summary 必须自解释到足以回答追问**。验收方按 §3 追问清单抽查，答不上的步骤视为未验证。

## 2. self_explanation_steps 标准（核心条款）

T2/T3 卡的 `kanban_complete` summary 必须包含 **self_explanation_steps ≥3 步**，每步三问齐全：

| 问 | 判定线 |
|---|---|
| 做了什么 | 具体动作+对象（文件/命令/对象 id），可指认 |
| 为什么这么做 | 依据或取舍一句话（上游要求/机制理由） |
| 怎么验证的 | 真实工具输出（命令+关键结果），不是「已确认」 |

写法: summary 内用编号列表逐步展开，步骤覆盖任务主链路（如 侦察→变更→验证→收尾），不写凑数步骤。

**判定线**: 任一步缺「怎么验证的」，或验证语句没有真实工具输出支撑 = 该步未验证 = 验收方退回（kanban_request_changes 或 block）。

## 3. 关键数字必答追问

summary 涉及数字交付（得分/覆盖率/行数/耗时/用例数）时，该数字必须紧跟两条：

1. **怎么测的**: 口径一句话（哪个工具、哪个范围、从哪到哪）。
2. **实测命令**: 验收方可复制重跑的命令原文。

缺任一条 = 数字不可信 = 按未验证处理。

## 4. bad / good 对照

### bad（退回）

> summary: "重构完成，测试全过，任务完成。"

问题: 0 个步骤、0 条验证、数字无来源。验收方只能盲信或全量复跑。

### good（通过，三段式示范）

> summary: "登录超时 bug 已修复。步骤:
> 1. 定位: 读 auth.py 调用链+复现脚本，确认超时参数未透传（做）; 复现脚本优先于读码猜测，保证修的是真因（为什么）; 3 次稳定触发（验: `pytest tests/test_auth.py::test_timeout -x` → 3 passed）。
> 2. 修复: 超时参数从硬编码改为配置注入（做）; 改配置因运维要求免发版调整（为什么）; 变更面 2 文件 +14/-3（验: `git diff --stat`）。
> 3. 回归: 全量跑测（做）; 防同类回归（为什么）; `pytest -q` → 214 passed 0 failed，耗时 41s（验: 命令即上; 口径=全仓用例，计时含收集）。"

## 5. 与 decision-tiers 联动

分层定义见 `~/.hermes/shared/decision-tiers.yaml`（C1 产出 v1.0，2026-10-16 实读确认在盘）:

- **T3 重大后果人责层 / T2 人主导 AI 支持层**: 按本文件 §2 全量执行，完整 self_explanation_steps ≥3 步。
- **T1 常规自动化层**: 可精简为一句结论+一条核验命令（例: "配置已同步，`grep -c xxx file` → 12"）。数字交付仍按 §3 附口径与命令。

分层标记按 decision-tiers.yaml `dispatch.marker`（卡 body 首行 `tier=T1|T2|T3`）。**卡未标层时按 T2 执行**（从严默认，防漏标降级）。

## 6. 版本日志

- v1.0 (2026-10-16): 初版。收尾解释标准+数字必答追问+bad/good 对照+decision-tiers 联动。来源 wx-fusion-20261016 C6 (t_6452bd55)。
