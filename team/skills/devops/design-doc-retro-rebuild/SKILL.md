---
name: design-doc-retro-rebuild
description: "复盘窗口期变更全量重构设计文档时用：五路盘点变更源→落点清单→逐批入档→快照对账。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, documentation, design-doc, retro]
    related_skills: [design-doc-sync-audit, design-doc-sync-audit-orch]
---

# 设计文档复盘式全量重构（retro 模式）

> 定位：用户要求「复盘近期调研/变更，重构（整体）设计文档」时的工作流。与单变更同步方向相反——单变更是「已知改了什么，验证文档跟上」；本件是「先穷尽变更源，再逐批入档」。机械审计五件套、表格 patch 坑、计数重测等通用纪律在 `design-doc-sync-audit`（权威原件），本件不重复；委托 worker 收尾对账在 `design-doc-sync-audit-orch`。

## 触发

- 用户说「复盘近期调研/变更」「重构整体设计文档」
- 距上次文档收口已隔多日且期间无逐变更同步（变更源可能堆积多批）

## 流程

**第一步：定窗口**。窗口起点 = 文档文末上一条 gap 收口节的日期；无收口节时用 git 最近一次涉及文档的 commit 日期。

**第二步：五路盘点变更源（写一个字前跑完，逐路留证据）**：

1. git 时间线：涉及仓（shared 仓、workspace/*、profiles 目录）跑 `git log --oneline --since=<起点>` **加 `git status`**——未提交的工作区文件与已 commit 的批同权重，漏看 status 会把一整批变更当不存在。
2. 看板 done 卡：sqlite 各板 `SELECT id,title,result FROM tasks WHERE status='done' AND updated_at>'<起点>'`，逐卡读 handoff 摘要定位交付件路径。
3. gap 台账尾部：文末 gap 节 + 外置 gap-closure-ledger——确认上次收口点；旧遗留项可能已在本窗口落地，需销账。
4. 运行态重探：对文档已记载的活对象（本地服务端口、cron、LaunchAgent、现役模型/权重）重新探活（health 端点 / launchctl list / ps）——调研报告入档后的换装/停役不会自动反映回报告；报告的建议不是终局态，实机才是。文档口径与实机不一致那一刻 = 抓到一个未入档变更源。
5. 计数当场重测：规模表各计数（skill/治理规则/运维脚本）写前重跑验证命令取现值（禁沿用会话早前测得的值）。

**第三步：落点清单先行**。盘出的每个实体归入三类落点之一——机制新节 / 既有节口径刷新 / 文末 gap 收口节；先列全量清单再动笔，窗口内实体零漏项才算盘点完成。计数类数字全文有多份副本，逐处 grep 旧值全改，不能只改扫到的第一处。

**第四步：动笔与结构纪律**。新节接语义相邻节之后、编号顺延不重排；插完 `grep -n '^### \|^## '` 核对章节序列与 gap 区完整性双验（新章节追加禁用文末尾行当锚——详见原件高频坑）。

**第五步：快照对账收尾**。`diff 快照 正本` 逐 hunk 定性：新增行属计划面，删除行逐条给出「被替换/被吞并」说明；收尾按批报「X 批 Y 实体」与盘点清单对账。

## 两条专属坑

- **「已入库 commit X」引用须实测复现**：收尾要引历史入库 commit 前，当场 `git -C <正本目录> rev-parse --is-inside-work-tree` 且 `git cat-file -t <sha>` 命中——正本可能根本不在任何仓内（references/ 类目录非 git 仓，历史 commit 号无从复现）。发现正本无仓 = 回滚与备份双盲区：如实上报并给补仓建议（纳管既有仓或单独 init），禁拿历史 commit 号当入库证据，禁默认「之前能 commit 现在也能」。
- **非仓正本动手前先快照**：对不在 git 内的长文档做重构手术，落笔前 `cp <正本> /tmp/<名>-pre-<轮次>.md`——快照是唯一回滚面；无快照的重构一旦 patch 锚错位即不可逆。
