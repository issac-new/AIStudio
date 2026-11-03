# DeerFlow 2.0 源码级核对：撤回「四类子代理」，补报告契约与容量治理

日期：2026-11-03
状态：implemented
触发：用户质问「DeerFlow 2.0 是源码级别调研么？」。上一轮吸收只读公号解读文，不是源码级——违反仓内「调研源码级下限」。本批浅克隆实测并更正结论。

## 变更

- 浅克隆 bytedance/deer-flow（commit `1dd6d05`，2595 个 `.py`）核对：
  - **硬错更正**：`subagents/builtins/` 只有 `bash_agent.py`、`general_purpose.py` 两个内置，「Lead 委派四类子代理（Researcher/Coder/Reporter/Creator）」在 2.0 源码中不成立。
  - **补文章未写的四件**：`subagents/report_contract.py`（RFC #4651 PR3：要求 `[rN]` 引用执行记录、父侧对账、未引即 UNVERIFIED；`acceptance_criteria` 走不可信通道且限 20 条×500 字符）；`capacity.py`/`turn_budget.py`/`batch_lease.py`/`step_events.py`/`context_snapshot.py`（准入、预算、租约、步事件）；`skills/catalog.py` 的延迟发现（`describe_skill` 才给元数据）+ 密钥绑定/授权过滤/静态扫描；`sandbox/` 的租约与命令作用域（非「三档模式」一句话）。
  - **深度标注（2026-11-03 二轮更新）**：MASS 已下载 39 页 PDF 精读主体（p1–p10）：形式化定义、内层精英规模 1 进化、外层 18 候选/Bradley-Terry/2:1 采样、两个假设的互信息与 token 效率证据、优化器瓶颈消融、行为内化表；**发现公号文漏报两个编码基准为退**（Terminal-Bench 0.96×、SWE-bench 0.94×）。
  - **DeerFlow 代码级二轮**：确认两层验证栈（L1 `report_contract` 回执核验、L2 `acceptance_checks` 确定性验收：`file_*` 家族 + `tests_passed` 对账、不可判定项落 `unchecked` 且 `all_hold=false`），以及 capacity/turn_budget/step_events 的派活治理、skills 延迟发现与密钥授权、sandbox 租约与命令作用域。
- 更新 `docs/reports/2026-11-03-mass-deerflow-handoff.md`：新增 §五 源码级核对，正文「四类子代理」标注为文章口径。
- 结论修正：撤回「Lead + 四类子代理」概括，改为「报告契约 + 验收对账 + 容量准入 + 步事件」；并说明本仓交接账本测「结果」、DeerFlow 测「声明与执行记录一致性」，两者不重复，后者若要落应先查重 `custom/server/auditchain` 与 `custom/server/evidence`。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 直接在本轮更正报告并标注来源深度，不重写历史结论 | 调研报告是可追溯的事实记录；悄悄改会让后续引用失去基线 | 重写报告（否决：抹掉「曾按文章口径判断」的事实） | 是 |
| D2 | 本批只改文档，不顺手改代码 | 源码核对暴露的是「我方概括错了」，不是「我方实现错了」；交接账本的实现依据是看板事件，未被推翻 | 顺手加主张-证据对账（否决：未查重 auditchain/evidence，易造重复） | 是 |
| D3 | 「四类子代理」按文章口径保留但显式标注 | 便于读者对照原文与源码的差异 | 直接删（否决：读者无从知道为何改口） | 是 |
| D4 | 二轮只补分析不实施三条差距 | 验收断言/回执核验/准入拒绝都要动证据源或派发链，需单独 spec 与查重（auditchain/evidence 已存在） | 同批硬上（否决：未查重易造第二套事实源） | 是 |

## 验证

- MASS 正文精读：`/tmp/mass/paper.txt`（39 页，p1-10 主体），关键数字与本报告 §六.4 表格一一对应。
- DeerFlow 代码级：`subagents/acceptance_checks.py:2155` `check_acceptance_criteria`、`subagents/report_contract.py`、`skills/catalog.py:1-12`、`subagents/capacity.py`。

- 源码核对锚点：`backend/packages/harness/deerflow/subagents/builtins/`（仅两文件）、`subagents/report_contract.py`、`skills/catalog.py:1-12`、`sandbox/` 文件清单、`backend/app/channels/`（feishu/dingtalk/discord/slack/telegram/wechat/wecom/qq）。
- MASS 摘要核对：arxiv.org/abs/2610.12176（39 页，2026-10-08，Qwen3.6-27B）。
- 文档改动无代码面：`npm test` 与前一轮一致（7428 通过），本批未新增断言。

## 设计文档影响

DESIGN_SYNC: none

只更正调研报告的来源深度与一处事实错误，不改架构、契约、阈值或数字总账；交接质量账本的设计依据（看板事件口径）未被源码核对推翻。
