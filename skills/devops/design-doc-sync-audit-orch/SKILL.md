---
default-domain: true
name: design-doc-sync-audit-orch
description: "委托融合卡收尾后 orchestrator 侧设计文档对账：双侧分工补欠项+旧值残留判性。"
version: 1.0.0
metadata:
  hermes:
    tags: [orchestrator, documentation, docsync, fusion]
---

# 委托融合收尾的设计文档对账（orchestrator 侧增量）

> 权威源声明：五件套口径扫描、双份落盘、接线验证、表格 patch 坑等完整审计配方在 default profile 的 `design-doc-sync-audit`（原件）。本件只补原件未覆盖的增量——委托 worker 执行融合/落地后，orchestrator 收尾时必然落在自己手上的对账面。两件并行读，禁把本件当全套。

## 触发

- 委托卡（融合/调研落地/能力建设类）done 且验收通过后，执行「更新整体设计文档」时
- worker 报告里声称「设计文档已同步」时——它的同步面与 orchestrator 的不同（见下）

## 一、双侧分工：worker 落的 ≠ 全部落了

worker 完成卡时只写它直接改到的文件：调研报告 + 它碰的机制节段落。以下 orchestrator 侧落点永远不被 worker 覆盖，必须自己补：

- **规模基线表计数**（skill 库/profile/看板数——写前当场重测，禁沿用会话早前测得的值）
- **相邻机制表的 references/资产行**（如运行时接入表加新参照行）
- **流程步骤描述的增强**（如需求五步法的某步追加新追问型/新判据）
- **台账 fusion 条目**（融合过程经 gap_register 登记过 → gap-closure-ledger 加「## gap-…-fusion」独立条目，新行独立不并入旧条目；纯调研且全程零登记不入台账）
- **文末收口节**（来源/裁决分点/设计影响/成色/状态）

**对账程序**：拿本次新增关键词（新 skill 名、新 references 文件名、新机制名）逐个 `grep -c` 设计文档——命中即「worker 已落」，零命中即「欠在自己手上」，欠项自己补。禁把 worker 的「已同步」自述当全量事实——它不知道 orchestrator 侧清单。

## 二、skill 内部新增 references 文件的落位

不为 skill 内部新增的 references/ 文件新建设计文档专节：

- 该 skill 在文档里有相邻机制表 → 表内加一行（载体/为什么/验收锚点三列齐全，含「不吸收什么」的裁决说明）
- 无相邻机制表 → 只在文末收口节记录一行

专节是机制级变更的待遇；references 参照是知识级增量，开专节会稀释结构。

## 三、旧值残留的判性：命中 ≠ 必改

更新计数后对旧值全文 `grep -n`，残留命中逐处判性再动手：

- **合法保留**：漂移叙事链（「历史上 A→B→C 漂移过」）与时间线快照里的旧值——它们记录的就是历史，改了等于毁证据链
- **必须替换**：「声称当前值」的正文口径（规模表当前行、机制节当前描述）

禁见命中就全量 sed——会把漂移叙事链改坏。判据一句话：这一处是在「讲历史」还是在「报现值」。

## 与原件的分工边界

原件管「怎么扫、怎么落盘、怎么防丢」；本件管「委托场景下哪些落点必然在 orchestrator 手上、收尾怎么对账」。经验若属通用 docsync 纪律，回原件（前台 `hermes -p default` 会话直改）；属委托收尾分工，回本件。若原件后续吸收了本件内容，删本件防双源。
