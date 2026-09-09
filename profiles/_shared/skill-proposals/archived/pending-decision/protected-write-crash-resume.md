# SkillProposal: protected-write-crash-resume [create]

> **产出**： platform-skill-miner · 2026-09-07 · 7 天窗口扫描（2026-08-31~2026-09-07，49 张 done 卡）
> **状态**： ⏳ 待图爸最终裁决（本 job 只提议不落地，未调 skill_manage）
> markings: [TLP:GREEN, EYES-ONLY:platform]

## 触发条件

当 worker 崩溃/超时被重派，**前一轮 run 已完成部分写入**（尤其对 child-profile.md、SOUL.md、报告文件等多条目写入），重试 worker 若不做「先核验已写集合」就直接重跑，会造成重复插入或状态覆盖时——加载本 skill。核心机制：**崩溃现场交接（crash-resume handoff）**——崩溃前 comment 留「已完成写入清单 + 崩溃阶段 + 下轮正确动作」，重试 worker 先 grep 核验再决定增量补写。

## 证据链

| # | task_id | board | assignee | snippet（可回溯 comment） |
|---|---------|-------|----------|---------------------------|
| 1 | t_313de14a | [已移除] | [已移除]-orchestrator | 「⚠️ 给本轮重试 worker 的关键提示（前一轮 run 20 崩溃现场）：**前一轮已完成的写入（勿重复插入！）**：run 20 心跳记录显示，崩溃前已完成全部 6 项写入：1.✅社交观察 9.4 条目…崩溃发生在『验收：file:line 锚点校验』阶段，即**写入已全部落盘**。**本轮正确动作**：1. **先 grep 核验** child-profile.md 是否已有 9.4 条目」 |
| 2 | t_018bf082 | swarm | worker-coder | 「orchestrator（TUI 主会话）安装进度同步 —— **部分安装已由本会话完成，避免重复操作**：以下步骤已在 17:58-18:02 由 TUI 主会话执行完毕，你不必重做：1.✅ 6×SOUL.staged.md → mv 改名 → cp 进 ~/.hermes/profiles」——跨执行体（TUI vs worker）的同构交接 |
| 3 | t_4b19ed0c | swarm | worker-coder | 「R1 重试结果：…**状态核实**：R2 已在位——config.yaml:117 command=…（真实存在）」——重试 run 先核验前轮成果在位，避免对已修项重复动手 |
| 4 | t_44f56a7c / t_dc3022bc（存量提案 protected-file-write-block-reroute 已引） | platform | platform-ontology-curator | 「复验确认（本回合独立查证）：任务在 run 40 已置为 done…验收标准三项全部达成」——前轮已完成但卡在 block 态，后轮独立核验破局，同一「先核验已写集合」机制 |
| 5 | t_19717c81 同批 5 张夜间差距卡（triage 提案已引） | swarm | platform-skill-miner | domain_closure.py 重派场景——若前轮 promote 后已部分执行，重派 worker 同样面临「哪些已做」问题（本窗口未实际发生重复插入，列为观察面） |

**频率**: 4 / 49（1 例 [已移除] 显式崩溃交接 + 1 例跨执行体进度同步 + 2 例重试先核验；另 protected-file-write-block-reroute 提案的 3 例 block 破局同机制，合并计数 7 次——跨板跨域复发）

## 四段式内容

### 1. 触发条件 → 具体信号
- 任务卡 `consecutive_failures ≥ 1` 或 comment 含「前一轮 run」「崩溃」「retry」「重派」。
- 任务 body 验收含**多条目文件写入**（≥3 条独立插入/段落），部分写入无法从文件 mtime 直观区分。
- kanban_show 显示本卡是 retry（prior attempts 非空）。
- 心跳记录（task_events / last_heartbeat_at）显示前轮 run 中途停止。

### 2. 标准步骤
1. **崩溃前留交接**（预防侧，所有多写入任务的 comment 纪律）：完成每条目写入后立即 `kanban_comment` 更新「已完成清单」（编号+文件+锚点）；崩溃不可预测，交接靠平时。
2. **重试第一动作 = 核验不重做**：`grep -n "<锚点>" <目标文件>` 逐条核对前轮清单（t_313de14a 范式：「先 grep 核验 child-profile.md 是否已有 9.4 条目」）。
3. **三态分流**：锚点已在位 → 标记「无需重写」；部分在位 → 只补缺失条目（增量）；全部缺失 → 全量重写（说明前轮写入根本没落盘）。
4. **核验结果留痕**：comment 写明「前轮 N 项写入核验：M 项在位 / K 项补写 / (N-M-K) 项缺失」，供下一轮与验收对账。
5. **验收阶段对账**：最终验收 = 前轮在位条目 + 本轮补写条目合并后逐条过验收标准，不重复计数也不漏计。

### 3. 陷阱
- **重复插入是静默的**：child-profile.md 类档案文件重复插入不报错，直到人工阅读才发现同一条目出现两次——[已移除] 档案的污染比任务失败更难清理。
- **「文件存在」≠「条目在位」**：必须 grep 具体锚点（日期+关键词，如「9.4」「张乐安」），不能只看文件 mtime。
- **心跳自报不可信**：t_cc655ecb run59 自报「代码完成 87 测试全过」实际交付失败——交接清单的每项都要有 grep/mtime 机械证据，不凭前轮心跳文字。
- **跨执行体进度会漂移**：TUI 主会话/orchestrator 可能已替 worker 完成部分步骤（t_018bf082 形态），worker 的 body 副本里没有这个信息——接手任何卡先全量读 comment 链，勿只读 body。

### 4. 验证（如何机械验证 skill 生效）
- 窗口内 retry 卡的 comment 链必含「核验」记录（grep 命令 + 结果计数），缺失 = 本 skill 未生效。
- 档案类文件（child-profile.md 等）抽查无重复条目：`grep -c "<唯一锚点>" <file>` == 1。
- 崩溃交接清单与最终验收对账表可回溯（comment 时间序）。

## 与既有 skill 关系

- **补充 `kanban-crash-recovery`**（devops，worker 崩溃后重试机制）：该 skill 覆盖「崩溃后任务如何回到队列」，本 skill 覆盖「重试 worker 如何处理前轮半成品写入」——崩溃恢复的**数据面**，链条下游。
- **与 `worker-completion-independence-verification` 互补**：该 skill 验收「完成自述是否属实」，本 skill 的核验步骤正好是它的输入材料。
- **与 `protected-file-write-block-reroute`（存量提案）共享「独立磁盘核验」机制**：对方用于 block 破局，本 skill 用于 retry 增量——同一机制的两种触发场景，curator 可考虑在两文档间交叉引用。
- 建议**独立 create**（[已移除] 档案场景是最高伤害面，独立 skill 便于 [已移除] 教师团队加载）。

## 预期收益

- 消除 retry 重复插入（[已移除] 档案污染类静默缺陷，清理成本 >> 预防成本）。
- 多写入任务获得标准崩溃交接格式，重试 run 的启动成本从「重新理解全任务」降为「对账增量」。
- 与既有三张恢复类 skill（crash-recovery / triage-stall / failure-triage）拼成完整故障恢复链：进程面→建卡面→数据面。
