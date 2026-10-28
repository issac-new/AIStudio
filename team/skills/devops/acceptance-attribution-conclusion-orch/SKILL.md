---
name: acceptance-attribution-conclusion-orch
version: 1.0.0
description: "Use when 验收涉卡外装机归因、蓝军全绿但结论存疑、原判断被证伪需修正块。"
tags: [verification, acceptance, attribution, research, orchestrator]
---

# 验收归因与结论层核验（orchestrator delta）

> **出处头**：本件是 orchestrator 侧 delta 落点（skill_manage 拒跨 profile 写 default 权威源时的应急落位），与 `acceptance-evidence-orch` 同模式。三条规则待前台 default 会话合入后本件删除，防双事实源漂移：规则一 → `worker-completion-independence-verification` 陷阱 Y（正向解法半边）；规则二 → 同 skill 新陷阱 Z；规则三 → `research-report-correction` 错型表+落改程序。

## 规则一：归因可解时先解——随件引用对象反查写入线，再谈追责

卡外副作用（skills 装机/配置写入）落在多写入方共享面时，先走正向归因程序把主体钉死；钉不死才按「窗口内发生、主体未定」收口（陷阱 Y 的措辞纪律仍然生效，本规则是其缺的解法半边）：

1. **随件文件引用对象反查**：装机副产物自带的 PROVENANCE/manifest 引用的对象名（sync 脚本、profile 文件、决策号）在本卡 workspace 与看板内容里都查无时，把对象名拿到并行工程根全盘 `find`——命中即定位写入线。本机常见并行写入方：外部工程 overlay 仓下 Claude Code worktrees 的 sync 脚本，hostRoot 直指 `~/.hermes`。
2. **commit 时刻对齐装机三层时间戳**：该线 worktree 的 `git log` commit 时刻逐段对齐「全局库目录 mtime → profile 侧 provisioning `at`」——逐段吻合即主体确定。
3. **同秒分发 = 被动无责**：worker profile 副本的 provisioning `at` 与验收方同秒 = 集群被动分发，worker 无操作责任；追责/回滚只对准真实写入线，共享面上的合法双写（外部工程线的设计动作）不按污染处置。

## 规则二：蓝军断言全 PASS ≠ 结论层成立——报告自洽单独抽查

独立核查（蓝军/recheck）验的是前提层：引用真实、数字可复算、file:line 可回放；不验结论层——建议节论据是否与报告自己的对照/事实章节一致。典型漏网：对照表已写明 A 与 B 是子集/补集关系，建议节却以「B 与 A 重叠」为由否决 B——前提层逐条全绿，结论自相矛盾。

**执行**：验收调研/评估类交付时抽 2-3 条关键建议，逐条回查报告自身证据章节是否支撑其论据；论据与自身证据矛盾时按误导性交付处置——原位修正块（规则三）留审计轨迹，不打回重做。

## 规则三：结论失效走原位修正块（五要素）

调研/评估报告的原判断被后续事实证伪、或与自身证据章节矛盾时，在原判断紧邻下方加【修正块】，五要素缺一不可：

1. **作废声明**——明确上条判断作废，不留两可表述；
2. **证伪证据锚**——commit/时间戳/路径等可回放证据；
3. **论据失效机制**——原论据为何不成立，指回报告自身矛盾章节；
4. **保留原判断原文**供审计——禁删原文改写，消灭审计轨迹的修正在下次对账时无法与初版区分；
5. **生效结论**——替代口径 + 与既有机制的分工边界（谁是权威、谁补集共存）。

**markdown 坑**：引用块（> 起行）末行直接跟列表项时，列表项会被吸进引用块渲染——修正块收尾补一个空行再恢复原列表。
