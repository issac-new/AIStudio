---
name: orchestrator-fusion-closeout
version: 1.0.0
description: "Orchestrator 亲自执行文章源融合时的收口纪律：收卡闭合、新建落点挂接、转述源保真度、等效证据深度。"
metadata:
  hermes:
    tags: [orchestrator, fusion, closeout, kanban, evidence]
    related_skills: [article-methodology-fusion, orchestrator-lessons, kanban-orchestrator]
---

# Orchestrator 融合收口纪律

触发：orchestrator 亲自（不派 worker）执行文章/文档源融合——article-methodology-fusion 管融合流程本体，本 skill 管 orchestrator 特有的**收口与挂接**环节（会话实测缺口，母本默认 default 不可写故独立成册）。

## 一、收卡闭合：live-claim 拒绝后不重试工具

自持卡（即建即干，claim_lock=本会话 gateway）被 `kanban_complete` 拒绝「running under a live worker claim」时：

1. 工具错误信息自荐的 `force=True`/`expected_run_id` **不在工具 schema 里**——照错误文本重试只会撞 unknown parameter，错误文本本身就是误导；也不要换 metadata/summary 重试（同一路径第二次调用=纯浪费轮次）。
2. 正解=operator override 走 CLI（前置的 '--board' 是子命令级旗标）：`hermes kanban --board <slug> complete --force <id> --summary "..." --metadata '{...}'`。
3. **中途 kanban_comment 不是收口**：comment 只留痕，卡仍 running——不能因为「交接已写」就结束任务，必须收完 sqlite 验终态 done 才算闭合。
4. 工具参数清单以 `skill_view('orchestrator-cli-reference')` 为权威面；完整反模式表见 default 侧 `orchestrator-lessons` §六/§九（只读）。

## 二、新建 _shared 落点当轮挂接

新建 `_shared/` 文件（非追加节到既有文件）后立即：
1. 在消费方 SOUL 的「共享规则引用表」对应架构层行加文件名+一句何时过表（如观测治理层行加 `agent-governance-baseline.md（事故复盘/新 loop 上线审计时过表）`）。
2. 把该行纳入机械终验 grep——不挂接=孤儿文件，下个 session 无从发现；追加节到既有文件天然在表内，免此步。

## 三、源保真度：二手转述文标注回源条件

吸收自转述文（转述原报告/论文而非原文）时，边界声明必须显式写「原文未回源，引用原文具体数字/条目前须回源核验」——转述文支撑机制骨架，不支撑精确数字。多篇批次按来源分组编号（a1-1/a2-3 式），矩阵行、存档文件、边界声明共用同一编号，回源才可查。

## 四、「等效印证」同样要证据

判「集群已有等效物→只加引用不新增机制」前，读既有资产原文核对覆盖面——grep 命中只是定位器（关键词可能出现在否定/对比/待整改语境），命中词不等于机制等价。证据深度与「吸收」判定同级：读原文 > 读节头 > 只看 grep 计数。

## 五、直写 skill 文件后验双视图一致

patch/write_file 直写 skill 文件（skill_manage 跨 profile 拒写时的替代通道）前后用 `os.path.samefile()` 核对双路径同 inode——同一 skill 常以 symlink/hardlink 双路径存在（`profiles/<p>/skills` ↔ `~/.hermes/skills`）。「写入成功」不等于消费方视图也更新了；终验加一行 samefile 检查。

## 六、并行落地批次的收口（同卡双轨 + 子卡撞面）

同一张融合卡出现双执行轨（orchestrator 亲自干 + dispatcher 另派 worker；信号=orchestrator 的 complete 被「running under a live worker claim」拒绝——§一 的拒绝在此场景不是故障而是并发实况）时，双方产出=并行交付，收口三步：

1. **卡已终态不重跑**：先核时间线（谁先 complete、各交付了什么），终态卡只补对账评论——禁止重跑、禁止覆盖对方落点；对账评论里逐项实测双方落点在位情况，不采信回执文字。
2. **对账评论=合并约束前置下发**：不只留痕——逐条列出后续收卡人会撞的面（同域文件/相邻节/复述风险）并给合并指令（「并入 X，禁平行双文件」「作为 §Y 子项展开，勿另起节」「引用非复述」）。子卡 worker 收卡时读得到评论，会自收敛成互指结构，验收近零返工。
3. **同源双产物收敛**：双轨独立落地同一来源的同一收缩（同一 N→M 收缩表各落一份、字段微差；或裁决报告双份）时，指定其一为执行正本，另一份头部标注指向正本、原文降级为历史裁决记录保留——删除丢裁决语境，保留不收敛必漂移。收敛后机械终验加「互指双向」检查。
