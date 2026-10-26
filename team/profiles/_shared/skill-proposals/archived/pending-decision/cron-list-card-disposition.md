# SkillProposal: cron-list-card-disposition [create]

## 评审意见（skill-mining cron 评审通道 · 2026-10-19（第 2 轮 02:2x，评审通道））

**判定：批准（新增 create，条件=证据链笔误先修，本轮已代修）**——模式真实且频度门槛按卡计 ≥5 张独立成立（t_6e3e47de 12 条/t_90d968f2 6 条/t_a8112398 5 条/t_a366dff2 10 条/t_9bd43d77 12 条），提案自算 3/142 系保守口径，不构成障碍。

代修记录（评审侧实测）：
1. **task_id 笔误**：原引 t_90d68f2 经 10 板全查不存在，实为 **t_90d968f2**（platform 板，[triage] gap_register aiteam 域 6 条，done），数字转置笔误，已改正。
2. **「46 条全核销」系复制残留**：t_f9ede138 的处置 comment 被原样粘贴到多张 triage 卡首行，各卡实际条数 12/6/5/10 不等；证据行已改写为逐卡实际数，引用时以各卡自身核验 comment 为准。

理由：
1. **正交性已核实**：kanban-blocked-card-disposition 全文「清单」仅 2 处且均为 blocked/gave_up 语境（管卡自身状态），不覆盖「清单数据源已死、卡内容整体作废」形态；gateway-notification-disposition 管 done/blocked 回执判性。填充真空。
2. **上游回声是本提案的核心增量**：t_f9ede138 根治卡的存在本身证明——根治完成时不主动作废下游在途清单卡，cron 就持续产生僵尸卡。落地时「根治侧回声」步骤必须保留，不得在精简中删除。
3. 落地条件：①作废判定禁凭根治卡自述批量关闭，须逐卡独立核验（陷阱节已有，保留）；②「旧副本可能比正本新」的 md5 核对步骤保留（t_a366dff2 实证正本与收口登记不一致场景）。


> **产出**： platform-skill-miner cron · 2026-10-19 · 7 天窗口（2026-10-12 ~ 10-19，142 张 done 卡，10 板）
> **状态**： ✅ 已评审（批准）· 待图爸终裁
> markings: [TLP:GREEN]

### SkillProposal: cron-list-card-disposition [create]

**触发条件**: cron 定时派生的清单型/巡查型任务卡（triage 分诊卡、巡检卡、盘点卡——标题多为「[triage] X 域 N 条存量分诊」「[夜间差距]」类）在开工前发现：清单来源数据库已被合并/根治/迁移，或清单项在唯一事实源中已终态——需要判定「按清单照做」还是「作废收口」，而不是重跑一遍过时清单。

**证据链**（3 事件，全 platform 板，同一根因链）:
- task_id=t_90d968f2/t_6e3e47de/t_9bd43d77/t_a8112398/t_a366dff2, board=platform（W42/W43 triage 卡群，算 1 事件；注：原稿 t_90d68f2 为笔误，评审轮已代修）: cron 读旧副本 gap_register（596 条）筛出清单派卡；正本已由 t_f9ede138 三库合一（633 条）；worker 收卡后逐条对正本核验——t_a8112398「本卡 5 条在 canonical 正本终态均 dropped，本 worker 不重跑分诊，独立实测核实」；t_90d968f2 6/6 已终态逐条回写落账后关闭（原稿「46 条」系根治卡处置 comment 复制残留）
- task_id=t_6e3e47de, board=platform, snippet="12/12 当前 status=dropped（非 open），均已落地；kanban_task_id 均指向 t_248ea776 清账卡；本卡清单筛自已废弃的旧寄存器副本"——worker 主动停跑、逐条证据留痕、作废收口
- task_id=t_f9ede138, board=platform: 根因根治卡本体——「gap_register.yaml 双副本分叉——triage cron 读旧副本持续生成僵尸分诊卡」；根治后下游卡群全部作废
- （邻接，同形态佐证）task_id=t_7890dbef, board=platform: gap_register CLI selftest 固定日期 fixture 过龄必挂——cron 侧数据源未随根治同步维护，属同一「清单源老化」族

**频率**: 3 / 142（triage 卡群 1 事件 + 根治卡 1 + selftest 老化 1；W42/W43 两轮 cron 持续产生）

**四段式内容**:
1. 触发条件 → 清单卡开工时满足任一：①卡内清单来源路径已不存在/已归档；②抽查 3 条在唯一事实源中已终态（done/dropped/merged）；③卡引用的 CLI 脚本已迁走（`gap_register.py` 归档即实例）；④根治卡 ID 在场且覆盖本卡清单
2. 标准步骤 →
   1. 定位唯一事实源（根治卡 comment 登记的 canonical 路径，如 `life-workbench/gap_register.yaml`），`ls`+计数核对
   2. 抽查→全查：先 3 条抽样核 status，全 dropped 则全量核对并记终态分布
   3. 判作废：100% 已终态 → comment 留「逐条 ID + 终态 + evidence 字段锚点」作废证据表，直接收口，禁重跑分诊
   4. 部分在途 → 只处理真 open 项，已终态项在 comment 标记跳过
   5. 上游回声：给根治卡回 comment（下游 N 卡作废已核），供 dispatcher 停派同类卡
3. 陷阱 →
   - cron 与根治赛跑：根治完成的同一小时 cron 仍可能已派出一批旧清单卡——作废判定必须逐卡独立核验，禁凭根治卡自述批量关闭
   - 旧副本可能比正本「新」：核对 md5 与登记值，偏差即 comment 报 followup（t_a366dff2 实测正本 md5 与收口卡登记不一致，留 followup 未影响判性）
   - 裁决可能记在 evidence 字段而非 resolved_fix 字段——核验命令要按实际 schema 写（t_a366dff2 实证）
4. 验证 → 作废收口 comment 含：事实源路径+条目总数+抽查/全查条数+终态分布+每条 ID 的锚点；dispatcher 侧无同类卡再派（下一 cron 周期验证）

**与既有 skill 关系**: `kanban-blocked-card-disposition`（blocked/gave_up 卡三分法）、`gateway-notification-disposition`（done/blocked 回执判性）均处置「卡自身的状态」，不覆盖「清单数据源已死、卡内容整体作废」形态；`kanban-task-REDACTED` 覆盖 triage 父卡连锁死锁但非清单作废。本提案填补「清单卡 × 数据源分叉」交叉形态。**备选形态**：并入 kanban-blocked-card-disposition 增「清单作废分支」章——create 与 patch 二选一交 curator/图爸裁决。

**预期收益**: 本窗 6 张卡（5 triage + 1 根治）合计 ~15+ run 花在「接卡→核验→作废」流程上，其中每张 triage 卡都重新推导了一遍「先查正本再决定跑不跑」；标准化后接卡 worker 有既定判废流程。t_f9ede138 根治卡的存在本身证明：不做上游回声（根治完成时主动作废下游在途卡）就会持续产生僵尸卡——根治侧也需此清单作废协议。
