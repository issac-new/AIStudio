# SkillProposal: patch-rederive-on-upstream-rebase [create]

> **产出**： platform-skill-miner · 2026-10-05 · 补跑窗口扫描（2026-09-20~10-05，220 张 done 卡，7 board 全量；补 0921/0928 两轮缺失窗口）
> **状态**： ⏳ 待图爸最终裁决
> markings: [TLP:GREEN, EYES-ONLY:platform]

### SkillProposal: patch-rederive-on-upstream-rebase [create]

**触发条件**: `hermes update` 或上游 rebase 后，`~/.hermes/patches/` 存量补丁 forward-apply CONFLICT/锚点位移/live 树测试红——需要对旧补丁做逐 hunk 重新裁决与再生成（re-derive）。既有 `hermes-source-patch-persistence`（三件套：标记区块→git-diff patch→watchdog）覆盖**创建与持久化**，`source-tree-drift-triage`（三态定性）覆盖**诊断**，两者的空白区间「诊断完成后的 re-derive 执行流程」无人覆盖。

**证据链**（8/220，3 个独立事件，swarm/platform 两板）:
  - task_id=t_c744bfdb/t_86509779/t_f613a4fb/t_5c416885/t_06ff5543/t_89ce5fb7, board=swarm, 2026-10-01 同日 6 卡：weixin-local / gateway-multiplex-active-primary / gateway-noise-filter-layer7 / skills-sync-fence-aware / update-fleet-foreign-unmapped / kanban-local 六补丁适配新 upstream（a4bd966aeee2）；t_89ce5fb7 典型：936 行旧补丁 16 hunk→11 保留/5 弃置逐 hunk 论证+缩圈 5→3+1+raci 权威源取自 stash@{0}+HFHS 零污染沙箱验收+真实板库 migration 实测
  - task_id=t_5c416885, board=swarm, snippet="17 老测试红 = 旧补丁语义 × 新测试基设的结构性冲突（非 re-derive 偏差）"——home_io_guard 拒 Path.home() 探测；修复=语义等价改写为 `_profiles_root()` accessor（production 逐值等价+测试可沙箱），三方测试 pristine 35/0→+tests 37/2→+main 39/0
  - task_id=t_62b2af6b, board=platform, 2026-10-03：kanban 写护栏+域隔离门禁移植当前 HEAD（4 文件 marker 包裹+新 patch+apply-source-patches.sh SPECS 换条目+11/11 板武装 21 触发器），同 mechanics 的手工 re-port
  - task_id=t_933e48fe, board=platform, 2026-10-03：guardrail-rearm.patch 再生成（补 skipped_out 计数），独立 re-derive 事件

**频率**: 8 / 220（6 卡为 10-01 单次 upstream 更新脉冲 + 2 卡为 10-03 独立事件）；跨 2 板 2 assignee。脉冲特性如实申报：核心场景每次 hermes update 必复发（历史更新 08-25/09-02/09-05/09-07/10-01 均触发过补丁维护）。

**四段式内容**:
  1. 触发条件 → update 后 apply-source-patches.sh 日志现 CONFLICT；或 `grep -c <marker>` 归零经 source-tree-drift-triage 定性为「基线真丢」；或 live 树测试红且锚定旧补丁语义。
  2. 标准步骤 → ①前线侦察（HEAD hash / live 树现状 / marker grep / 旧补丁 hunk 清单）②逐 hunk 裁决：保留（锚点在 HEAD 原样）/ 变形（语义保留形态变，如删无调用方形参采纳注释）/ 弃置（功能被 HEAD 吸收或模块不在树），每 hunk 留论证③权威源回采：stash@{} / .bak 历史 / 上游等价实现，禁 pop/drop stash（orchestrator 统一裁决）④缩圈决定：功能已覆盖/无本地化语义的文件 0 hunk 移除，契约按「逐 hunk 功能论证」⑤语义等价改写：环境探测硬编码换 live accessor（production 逐值等价证明）⑥pristine worktree 三方测试：pristine / +tests / +tests+main 数字对比⑦git apply --check + reverse-check 幂等 + py_compile + marker 计数=期望值⑧patch 落盘+旧版 .bak+SPECS 条目接线⑨live 树 forward --check 后 apply+commit。
  3. 陷阱 → 锚点位移≠语义冲突（上游在锚点间插 helper 只需重锚，勿误判弃置）；测试红先判基设冲突（home_io_guard/隔离 HERMES_HOME 要求）再判补丁偏差，17 红可能是结构冲突非 re-derive 错误；no-newline 尾 hunk 常是无功能 diff 工件；worker 进程内跑 kanban selftest 会继承产线 DB pin=沙箱假隔离（先剥 HERMES_KANBAN_DB 等 5 pin）；双会话并发写源码树→patch 管线旧基线回写留 .bak.<epoch> 孪生（写入前好版可 cp 恢复）；完成即 commit——patch 管线不覆盖未 commit 工作树改动。
  4. 验证 → 三方测试数字（pristine N/0 → +tests 红数可解释 → +main N+Δ/0）；`git apply --check new.patch tests.patch` 共存 rc=0；reverse-check rc=0（幂等）；marker `grep -c` = 期望值；HFHS 零污染沙箱冒烟（隔离 HERMES_HOME 实测新行为）；真实板库 migration 实测（涉及 schema 时）。

**与既有 skill 关系**: 补充 `hermes-source-patch-persistence`（其「三件套流程」止步于 patch 生成与 watchdog；本提案覆盖 update 冲突后的 re-derive 执行面）+ `source-tree-drift-triage`（其三态定性止步于诊断选路；本提案承接「基线真丢/需重放」分支的具体执行）。备选形式：作为 patch 并入 hermes-source-patch-persistence 新增「上游 rebase 后 re-derive」章节——独立 create 与章节 patch 二选一，交 curator/图爸裁决（先例：provider-meltdown 提案最终以「已实现否决」收口，裁决倾向合并入既有载体）。

**预期收益**: 每次 hermes update 后 6-8 个存量补丁的 re-derive 从逐卡摸索变标准流程；10-01 六卡实测每卡 3-5 run，标准化预计省 30-50% 轮次；防两类已发生的误诊——「锚点位移误判语义冲突导致整 hunk 弃置」与「测试基设冲突误判为 re-derive 偏差导致无效返工」（t_5c416885 实证基设改写后 +17 修复 0 回归）。
