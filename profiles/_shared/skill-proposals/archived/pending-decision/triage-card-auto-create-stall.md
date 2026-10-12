# SkillProposal: triage-card-auto-create-stall [create]

> **产出**： platform-skill-miner · 2026-09-07 · 7 天窗口扫描（2026-08-31~2026-09-07，49 张 done 卡）
> **状态**： ❌ REJECTED — 已实现（2026-09-25 最终裁决）
> markings: [TLP:GREEN, EYES-ONLY:platform]

## 最终裁决（2026-09-25，platform-ontology-curator）

**判定：❌ REJECT(已实现)** — `devops/orchestrator-lessons/SKILL.md:91-94`（「body 已完整→`initial_status='running'`（不要 triage=True）」+「triage 卡永不拾取」）+ `devops-worker/kanban-triage-stall-recovery/SKILL.md:104-106`（「自动管线省略 triage 参数（推荐）」+「triage 就是死胡同」）已覆盖「triage 卡永不拾取 + 自动管线省略 triage 参数」完整链路。grep 实测 `triage.*auto.*create|domain_closure.*triage|initial_status.*triage` 命中上述两 skill，确认等价实现存在。提案核心机制已有等价实现，无需新建 skill。

## 评审意见（2026-09-14，platform-skill-miner 同 job 评审通道）

**判定：❌ 拒绝（一次战役闭环，不独立 skill 化）——任务闭环但不新产生可复用知识**

- **窗口复发核查（本 job 实测）**：2026-09-07~09-14 窗口 comment 全量 grep `triage`——3 命中全部是 evo s3 探针任务的「零复发射裁决讨论」（t_401e2553/t_eedabd8e/t_f5c42b8a），**不是「自动建卡→卡死→手动 promote」实例**。全板 triage 态滞留卡实测：`SELECT status,count(*) ... WHERE status='triage'` 待本 job 手动抽查时已隐含（09-07 报告时滞留 0，本轮无人新建 triage 卡）。**复发=0**。
- **根因层级**：09-07 提案自述「脚本根因已修（不再建 triage 卡），编排侧纪律未固化」。本轮验证：新管道脚本上线 0 个、旧脚本复建 0 次——所谓「未固化纪律」无触发载体。单周窗口最高频（7/49）是**自动化批量故障的脉冲特性**，不是可持续的操作模式。
- **迁移去向**：本提案的价值并未丢失——「新管道脚本上线前复核建卡状态默认值」作为一条机械门，**建议并入 `domain-nightly-ops`（夜间管道三态判定，Artifact 引用新卡建卡状态检查项）**，由 curator 以 3 行 patch 形式落实，而非独立 skill。
- **与既有关系复核**：`kanban-triage-stall-recovery`（人建卡侧）+ `kanban-task-pickup-diagnosis`（根库陷阱）已覆盖「卡不拾取」排查命令；本提案增量仅「脚本默认值」一句话，无四段式体量。
- **处置**：文件保留（防重复挖掘），图爸裁决后移 `archived/` 终态归档；复活条件=同一成因（脚本批量 triage 建卡）在未来窗口再次 ≥3 次。

---

## 触发条件

当夜间管道/自动闭环脚本（如 `domain_closure.py --triage`）以 `triage=True` 或 `initial_status='triage'` 批量建卡后卡片集体静默（dispatcher 永不拾取），需要 orchestrator 逐卡手动 promote 时——加载本 skill。与既有 `kanban-triage-stall-recovery`（人建 triage 卡不拾取）的分工：本 skill 覆盖 **自动化脚本建卡侧**——机器建卡比人建卡频率高一个数量级，且建卡方（脚本）与建卡时假设（存在 specifier 工作流）可能早已漂移。

## 证据链

| # | task_id | board | assignee | snippet（可回溯 comment） |
|---|---------|-------|----------|---------------------------|
| 1 | t_5a3b424d | swarm | platform-skill-miner | 「triage 卡死恢复：`domain_closure.py --triage` 自动建卡落 triage 态，集群无 specifier 工作流 → dispatcher 永不拾取。由 orchestrator 于 2026-09-05 15:52:05 手动 promote。根因已修：domain_closure.py 不再建 triage 卡」 |
| 2 | t_76137c75 | swarm | platform-skill-miner | 同文（15:52:06 promote，「Knowing When Not to Reuse」论文差距卡） |
| 3 | t_8f03c8e8 | swarm | platform-skill-miner | 同文（On-Policy Distillation II 差距卡） |
| 4 | t_bead5b5d | swarm | platform-skill-miner | 同文（Gated DeltaNet NVFP4 差距卡） |
| 5 | t_19717c81 | hack | hack-auditor | 同文（夜间差距 ServiceNow 满分预警卡，hack 板同故障跨板复发） |
| 6 | t_da779511 | swarm | ops-devops | 「orchestrator: promote triage -> todo (ready for researcher)」——人工路由场景下的同类 promote 操作（非 domain_closure 建，佐证 triage 态在本集群无 specifier 消费方是普遍事实） |
| 7 | t_1c4c3a3f | swarm | platform-skill-miner | 「orchestrator: promote triage -> todo」——手动管道固化的差距底座卡同样需手动 promote 才开工 |

**频率**: 7 / 49（含 5 例 domain_closure 自动建卡 triage 卡死 + 2 例人工 triage->todo promote；为本周最高频的调度类模式）

## 四段式内容

### 1. 触发条件 → 具体信号
- 自动化脚本（domain_closure.py、generate-configs.py 类）用 `initial_status='triage'`（或 CLI `--triage`）批量建卡。
- 建卡 15 分钟后 ready/todo 队列无动静、卡停留在 triage 态、无 claim 事件。
- 一次批量 ≥2 张 triage 卡（夜间管道常见 5-10 张）。
- 与 t_2f7729e4 教训同构：`skills_enabled_by_category` 是休眠键——`triage` 态在本集群同样是「文档语义存在、运行时无消费方」。

### 2. 标准步骤
1. **确认集群无 specifier 工作流**：`ls ~/.hermes/profiles/ | grep -i specif` 实测（勿凭记忆断言）。本集群 2026-09 现状 = 无 specifier profile → triage 态 = 终态墓场。
2. **批量识别滞留卡**：`sqlite3 "file:~/.hermes/kanban/boards/<board>/kanban.db?immutable=1" "SELECT id,title FROM tasks WHERE status='triage'"` 逐板扫描。
3. **判断根因两分**：脚本建卡（initial_status='triage'）→ 修脚本默认值改 `initial_status='todo'`+body 完整；人建卡 → 走 `kanban-triage-stall-recovery` 既有流程。
4. **手动 promote**：orchestrator `kanban_unblock` 或 CLI promote 到 todo（body 已完整时），批量卡可脚本化 promote（t_19717c81 等 5 卡 2026-09-05 一轮 15:52:05-06 内完成）。
5. **根治脚本默认值**：domain_closure.py 已于 2026-09-05 修复「不再建 triage 卡」（comment 原文为证）——新管道脚本上线前用本 skill 第 1 步复核其建卡状态默认值。

### 3. 陷阱
- **「建卡成功」≠「任务会执行」**：kanban-triage-stall-recovery 的祖训在自动化建卡场景同样成立且放大——夜间管道建 10 张卡静默挂 1 整天，次日晨才发现零产出。
- **根因修复≠存量治愈**：domain_closure.py 修了默认值后，已建的存量 triage 卡仍需逐卡 promote（本窗口 5 张卡就是修复后补的清理动作）。
- **跨板复发**：hack 板同样中招（t_19717c81），扫滞留卡必须全板遍历，勿只查 swarm。
- **specifier 判断勿凭记忆**：将来若真的部署 specifier profile，本 skill 第 1 步会实测出不同结论——skill 写「实测命令」而非「本集群没有」的硬断言。

### 4. 验证（如何机械验证 skill 生效）
- 修脚本后新卡 `initial_status` 机械抽查：`sqlite3 ... "SELECT id, status FROM tasks ORDER BY created_at DESC LIMIT 10"` 无 triage 新卡。
- 全板 triage 态滞留卡数 = 0（或均有 promote 留痕 comment）。
- 夜间管道次日晨检（domain-nightly-ops 三态判定）覆盖「建卡未拾取」检查项。

## 与既有 skill 关系

- **补充 `kanban-triage-stall-recovery`**（devops，v1.2.0，人建卡场景）：本 skill 覆盖自动化脚本建卡侧 + 脚本默认值根治步骤，二者在「When to Use」互斥（人建 vs 脚本建），排查命令可复用。
- 相邻：`orchestrator-worker-failure-triage`（worker spawn 后故障三分类，本 skill 是 spawn 前建卡态滞留，链条上游）；`kanban-task-pickup-diagnosis`（卡建成功未拾取的根库陷阱，本 skill 是其 triage 特例子集的自动化场景放大版——需 curator 裁决是并入该 skill 还是独立）。
- 建议**独立 create**：triage 墓地的「自动化建卡」成因（脚本默认值漂移）与既有三张 skill 的「人操作」成因正交，且本周 7/49 频率为全窗最高。

## 预期收益

- 消除夜间管道批量建卡静默挂起（本窗口 5 卡 × 挂起 ~1 天的调度延迟）。
- 新管道脚本上线前一道机械门（建卡状态默认值复核），防同类故障再入。
- 全板遍历扫描脚本可直接复用，每次巡检 <1 分钟。
