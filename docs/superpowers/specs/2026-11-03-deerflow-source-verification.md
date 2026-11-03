# DeerFlow 2.0 源码级核对：撤回「四类子代理」，补报告契约与容量治理

日期：2026-11-03
状态：implemented
触发：用户质问「DeerFlow 2.0 是源码级别调研么？」。上一轮吸收只读公号解读文，不是源码级——违反仓内「调研源码级下限」。本批浅克隆实测并更正结论。

## 变更

- 浅克隆 bytedance/deer-flow（commit `1dd6d05`，2595 个 `.py`）核对：
  - **硬错更正**：`subagents/builtins/` 只有 `bash_agent.py`、`general_purpose.py` 两个内置，「Lead 委派四类子代理（Researcher/Coder/Reporter/Creator）」在 2.0 源码中不成立。
  - **补文章未写的四件**：`subagents/report_contract.py`（RFC #4651 PR3：要求 `[rN]` 引用执行记录、父侧对账、未引即 UNVERIFIED；`acceptance_criteria` 走不可信通道且限 20 条×500 字符）；`capacity.py`/`turn_budget.py`/`batch_lease.py`/`step_events.py`/`context_snapshot.py`（准入、预算、租约、步事件）；`skills/catalog.py` 的延迟发现（`describe_skill` 才给元数据）+ 密钥绑定/授权过滤/静态扫描；`sandbox/` 的租约与命令作用域（非「三档模式」一句话）。
  - **深度标注**：MASS 只到 arXiv 摘要级（39 页正文未读）。
- 更新 `docs/reports/2026-11-03-mass-deerflow-handoff.md`：新增 §五 源码级核对，正文「四类子代理」标注为文章口径。
- 结论修正：撤回「Lead + 四类子代理」概括，改为「报告契约 + 验收对账 + 容量准入 + 步事件」；并说明本仓交接账本测「结果」、DeerFlow 测「声明与执行记录一致性」，两者不重复，后者若要落应先查重 `custom/server/auditchain` 与 `custom/server/evidence`。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 直接在本轮更正报告并标注来源深度，不重写历史结论 | 调研报告是可追溯的事实记录；悄悄改会让后续引用失去基线 | 重写报告（否决：抹掉「曾按文章口径判断」的事实） | 是 |
| D2 | 本批只改文档，不顺手改代码 | 源码核对暴露的是「我方概括错了」，不是「我方实现错了」；交接账本的实现依据是看板事件，未被推翻 | 顺手加主张-证据对账（否决：未查重 auditchain/evidence，易造重复） | 是 |
| D3 | 「四类子代理」按文章口径保留但显式标注 | 便于读者对照原文与源码的差异 | 直接删（否决：读者无从知道为何改口） | 是 |

## 验证

- 源码核对锚点：`backend/packages/harness/deerflow/subagents/builtins/`（仅两文件）、`subagents/report_contract.py`、`skills/catalog.py:1-12`、`sandbox/` 文件清单、`backend/app/channels/`（feishu/dingtalk/discord/slack/telegram/wechat/wecom/qq）。
- MASS 摘要核对：arxiv.org/abs/2610.12176（39 页，2026-10-08，Qwen3.6-27B）。
- 文档改动无代码面：`npm test` 与前一轮一致（7428 通过），本批未新增断言。

## 设计文档影响

DESIGN_SYNC: none

只更正调研报告的来源深度与一处事实错误，不改架构、契约、阈值或数字总账；交接质量账本的设计依据（看板事件口径）未被源码核对推翻。
