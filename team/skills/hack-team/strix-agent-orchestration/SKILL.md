---
name: strix-agent-orchestration
description: "Use when hack team 多 Agent 协作作业（派卡编排/长会话压缩/工具错误契约设计）时加载——Strix(usestrix/strix) 编排纪律五条+渗透语义压缩两纪律+契约性错误 docstring 模式。"
version: 0.1.0
author: hack-auditor (orchestrator 代收, 卡 t_26e07e9d)
license: internal
metadata:
  hermes:
    tags: [hack-team, multi-agent, orchestration, compaction, error-contract, strix]
    source: "usestrix/strix main@2026-10-23 (Apache-2.0); FUSION-REPORT-20261023.md M1/M2/M7"
    target_profile: hack-team-shared
    staged: true
    staged_note: "R2 staged 提案，mark-active 待 orchestrator 人审"
---

# Strix 编排纪律（收缩吸收自 usestrix/strix）

> 来源裁决：strix-fusion-20261023 裁决矩阵 M1 收缩吸收 / M2 增强 / M7 收缩吸收。
> 运行时不引入 create_agent（本集群 kanban 派卡已等效）；只吸收可写进任务卡与 skill 的纪律。

## 一、编排纪律五条（M1，源码锚点 strix/agents/prompts/system_prompt.jinja + tools/agents_graph/tools.py）

1. **root 只编排，零亲手测试**（jinja:6-16）：编排者的每个回合只做——读范围/拆目标/spawn 与监视子 agent/跟踪 todo 与覆盖/聚合报告。「对已发现端点做一次快速测试」也越权。派卡时把这条写进 root 卡契约。
2. **wait 单发禁轮询**（jinja:31）：等待子任务=发一次等待调用然后停，「wait→view→wait」预写循环被判浪费回合。对位：等子卡完成时禁轮询查状态，靠 complete 回执驱动。
3. **生命周期工具是唯一终止路径**（jinja:56-57）：纯文本回合既不结束任务也不产出；收尾只有 agent_finish（带 open_items 未决清单）/finish_scan 两条通道。对位：kanban_complete（metadata.findings）/kanban_block（block_kind+reason）之外无第三条收尾路。
4. **收尾工具≠报告通道**（jinja:230）：漏洞/发现只经专用报告工具（create_vulnerability_report）落 ReportState，生命周期工具只做交接。对位：finding 走 target-scoped-workspace 的 findings/ 目录+复现链五件套，kanban_complete 只是收口不是 finding 载体。
5. **每漏洞三段式**（jinja:328）：Discovery→Validation→Reporting 三个独立 agent，发现者≠验证者≠报告者。对位：靶场作业多 agent 时验证卡与发现卡分派不同 worker（Diamond Checker 模式同源）。

## 二、渗透语义压缩两纪律（M7，源码锚点 strix/llm/compaction.py）

1. **战果逐条保留**（compaction.py:106-122）：长会话压缩时，凭据/密钥/API key/哈希/破解口令**逐条**写进摘要（One bullet per credential），禁整体概括吞细节——压缩丢战果=白打。
2. **切分点 snap 到无未闭合工具调用**（compaction.py:208-210）：摘要边界不得落在工具调用与结果之间，未闭合调用必须完整保留或完整划入保留区。

## 三、契约性错误 docstring 模式（M2，源码锚点 strix/tools/reporting/tool.py:1051 等）

工具/脚本出参含「重试无意义」失败态时，错误文本必须同时教 LLM 下一步：
- 实例 1 duplicate_of（reporting/tool.py:1051）：`get a duplicate_of response, do NOT retry — move on`。
- 实例 2 四档错误粒度（web_search/tool.py:193/208/210/229）：未配置/超时（附 narrow the request）/HTTPError/空查询，每档附自修建议。
- 实例 3 校验错误内联返回（load_skill/tool.py:29-30）：可读文本而非异常栈。
- 落地要求：本集群 hack 工具（scope_gate 拒绝/dedupe 命中/授权门外）出参格式=`{"success": false, "error": "<码>", "next": "<不要重试，改做什么>"}`，next 字段必填。

## 验收 grep（skill 有效性自检）

```bash
grep -c "jinja:\|compaction.py:\|tool.py:" ~/.hermes/skills/hack-team/strix-agent-orchestration/SKILL.md
# 预期 ≥8（每纪律至少一个 file:line 锚）
```
