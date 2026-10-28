---
name: design-doc-sync-closeout-checks
version: 1.0.0
description: "设计文档同步收尾三查：行内双写精确计数/gap节日期序列/跨仓commit互链。"
metadata:
  hermes:
    tags: [orchestrator, documentation, docsync, verification]
    related_skills: [design-doc-sync-audit, design-doc-sync-audit-orch, doc-runtime-consistency]
---

# 设计文档同步收尾三查

> 定位：整体设计文档（hermes-complete-design-doc.md）同步收尾段的机械三查，补 default 侧 `design-doc-sync-audit` 五件套未覆盖的三个收尾坑。
> 本件为 default 宿主不可跨 profile 写时的 orchestrator 侧独立成册（先例：orchestrator-fusion-closeout）；策展人可在 default 会话把三查并入原件「落地清单第 6 条 + 高频坑」后删本件防双源。

## 触发

机制级变更回写整体设计文档后、宣布「已同步」并 commit 前，三查逐条跑。

## 查一：长表格行中段插子句，先查行内双写

往单行长表格行（一个单元格已含多组职责子句）插入新子句前，读整行确认要插入的短语在行内其他位置不存在——长行常在行尾已带同义既有子句，中段插入=同短语行内两次、文档自相矛盾。

- 验收用精确计数，禁只用 `> 0`：预期只出现一次的锚（新段标题/新术语行/新表行）`grep -c` 必须 `= 1`；行内双写与双事实源残留都照样过 `> 0`，只有精确计数能抓住。
- 与「表格行尾 patch 吃前导管道符」是两种不同损坏：后者丢行首 `|` 成畸形行（`grep '^||'` 可查），前者行结构完好只是语义重复——结构检查抓不住，必须精确计数。

## 查二：文末 gap 收口节按日期序列复核

追加 `## gap-YYYYMMDD-*` 收口节后，提取全部该模式标题验证序列：

```bash
grep -E '^## gap-[0-9]{8}' <doc> | tail -5   # 日期递进、新节居末尾
```

日期重号或插错位置破坏台账时间线可读性。与 `### 4.N` 编号递进复核同法，两个序列都要过——既有验收只查 4.N，gap 节时间线是第二序列盲区。

## 查三：跨仓落地 commit 互链

机制落地跨两个 git 仓（载体仓如 `_shared` + 设计文档仓）时，两边 commit message 互引对方 commit 号：设计文档仓的 commit 写载体仓 hash，载体仓的 commit（或 gap 节）写文档仓 hash。否则日后从设计文档 gap 节回溯载体 diff 断链，只能靠日期猜。

### 真实 commit hash 验证

互链落笔前**实测取得两边真实 hash**，禁凭 message 文字里写的 hash 当事实——push 之前本地 commit 引用（如 `1a4f229d3`）只是仓库内 hash，到达远端前可能被 auto-backup cron 抢先收编或被重写。

- 设计文档仓侧：在仓根跑 `git log --oneline -1 -- <设计文档路径>` 拿到 HEAD commit sha 写进 gap 节
- 载体仓侧：在载体仓根跑同样命令；跨仓引用时注明仓名缩写避免歧义（如「载体 commit（_shared）`8260094`」）
- 双侧互引示例：本轮一卡跨三处（_shared 仓 / design-doc 仓 / default profile 共享 skill）时，gap 节正文应三处全列载体 commit hash 各自明确归属，不写「见载体 commit」式的含糊指代

## 顺带：结构三查一并跑（与原件落地清单第 6 条重叠部分不在此重复）

- 表格畸形行 `grep -c '^||'` 与 HEAD 基线比增量
- 代码围栏数为偶
- 尾字节 `0x0A`
