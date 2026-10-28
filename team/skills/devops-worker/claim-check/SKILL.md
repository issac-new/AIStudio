---
name: claim-check
description: "汇报语真实性自查：收卡前对照「完成声明动词 × 本 run 工具调用记录」，flag 无对应写操作的完成声明。四层漏斗（词法预筛→机械对照→逐字复验→单轮 nudge），fail-open 不阻塞交付。用于 worker kanban_complete 前 self-check 与 orchestrator 收卡抽查。"
version: 1.0.0
metadata:
  hermes:
    tags: [verification, honesty, kanban, completion-check, openexec-fusion-20261018]
    related_skills: [kanban-worker, worker-completion-independence-verification, mutate-test-acceptance]
---

# 汇报语真实性自查（claim check）

> 来源：openexec（OpenExecutive）#487 claim_check 机制，上游源码 `openexec-src/packages/core/openexecutive/orchestrator/claim_check.py:1-212`
>（本地全文：/Volumes/nvme2230/lab/hermes-docker-sandbox/workspace/research/openexec-delta-20261018/ 下同路径；调研报告 §四 N1/P1）。
> 落地：2026-10-19 t_00911dde，四层漏斗语义复述（非粘贴）。

## 解决什么问题

worker 汇报「已修复」「测试通过了」「文件已写入」，但本 run 实际没有对应写操作。环境终态判定（G6/产物验收）能拦住产物缺失，拦不住无验收痕迹的纯声明——「测试过了」但没跑过，不留任何可核对的东西。claim-check 在收卡前把回复原文与工具调用记录做一次机械对照。

## 定位与 G6 的互补关系

- **G6（环境终态判定）**：管环境终态——产物在不在、测试绿不绿。
- **claim-check（本 skill）**：管汇报语对照——回复里说做了的事，操作记录里有没有。
- 互补不重叠：G6 拦得住产物缺失，拦不住对话中的「说做了其实没做」。

## 四层漏斗（语义复述自上游 claim_check.py）

1. **词法预筛**（上游 CLAIM_RE :35-42）：回复中出现完成声明动词才进入下一层。词表（中英）：
   - 英文：done / did it / removed / deleted / dropped / closed / cancelled / marked / updated / changed / saved / noted / added / set up / scheduled / booked / sent / moved / archived / cleared / fixed / taken care of / handled / treated as / I've / I'll remind / won't show / no longer / going forward
   - 中文：已修复 / 已删除 / 已新增 / 已写入 / 已保存 / 已通过 / 已验证 / 已归档 / 测试通过 / 全绿 / 搞定 / 处理完毕
   - 纯陈述回复（「数字如下…」）无命中 → 直接放过，零成本。
2. **机械对照**（替代上游 ROUTING_MODEL 小模型层 :52-69）：逐条完成声明 × 本 run 工具调用记录——声明的变更必须有对应的**写操作**：terminal 命令实际执行且退出码可查 / write_file、patch 落盘 / 测试命令跑过。
   - **与上游的差异（须注明）**：上游用 ROUTING_MODEL 小模型做语义判定（本侧无该基础设施），本侧改为确定性规则「完成声明动词 × 工具调用记录无对应写操作 → flag」，是等效表达的降级实现。
   - 上游豁免项同样适用，不 flag：早前轮次或他人已完成的变更；纯提问/提议（「要我删掉吗？」）；建议；对问题的直接回答；明确说做不到；承诺改变说话/写作方式（无需工具）。
   - 上游「失败或被拒的调用不支撑声明」同样适用：命令非零退出后未修复 ≠ 已修复。
3. **逐字复验**（上游 accept_claim :127-137）：被 flag 的声明句必须逐字出现在回复原文（空白/大小写/弯引号差异容忍）。flag 的是回复里真实写了的话，不是检查者脑补的意图。
4. **单轮 nudge**（上游 nudge() :177-184）：flag 命中后给一次提醒——「现在用工具做，或明说做不到」。每轮一次防循环。

## fail-open 边界

与上游一致（:171-173）：检查本身失败、记录缺失、无法对照 → 放行，不因检查挂掉阻塞交付。claim-check 是防虚报增效层，不是交付闸门。

## 何时用

- worker `kanban_complete` 前 self-check：summary/metadata 里的完成声明逐条对照。
- orchestrator 收卡抽查：对 worker handoff 的关键声明抽查 1-2 条。
- review 打回争议时：对「说做了」的声明做对照取证。

## 不适用

- 纯调研类汇报（无写操作声明）。
- 需要语义级判定的场景（本侧无 ROUTING_MODEL 层，见第 2 层差异说明，只能机械对照）。

## 执行口径

1. 取本 run 回复原文（kanban_comment / kanban_complete 的 summary+metadata）。
2. 词法预筛：按上方词表 grep 完成声明动词。
3. 机械对照：每个命中的声明找到对应写操作证据（命令+退出码 / 文件路径+修改时间）。
4. 逐字复验：flag 的声明回查原文确实存在。
5. 有 flag → 单轮 nudge：现在补做（并留操作记录）或明说做不到，再重新收卡；无 flag → 正常收卡。

## 与既有机制的关系

- **G6 环境终态判定**：互补关系见上；接线总述在 `_shared/03-evolution-memory/output-contract.md` §2.9。
- **worker-completion-independence-verification**：那个管收卡侧（验收 worker 自述时独立核验），本 skill 管交卡侧（worker 自查汇报语）。
- **mutate-test-acceptance / code-review §2.1e 单探针**：测试质量侧；本 skill 汇报真实性侧。

## 变更历史

| 版本 | 日期 | 变更内容 |
|---|---|---|
| 1 | 2026-10-19 | 初版（openexec claim_check #487 四层漏斗语义复述落地，t_00911dde） |
