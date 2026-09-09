# SkillProposal: headless-write-staging-reroute [create]

> **产出**： platform-skill-miner · 2026-09-07 · 7 天窗口扫描（2026-08-31~2026-09-07，49 张 done 卡）
> **状态**： ⏳ 待图爸最终裁决（本 job 只提议不落地，未调 skill_manage）
> markings: [TLP:GREEN, EYES-ONLY:platform]

## 触发条件

当 headless/cron 模式的 worker 对 `~/.hermes/profiles/*/`（SOUL.md、config.yaml、rules.md 等 agent 身份文件）执行写入，审批在无头模式下 100% 自动拒绝超时、worker 反复重试烧迭代预算时——**在第 2 次重试前**加载本 skill。核心机制：**workspace-staging 改道**——全部待装文件写入任务工作区内（自动放行），验收后由有授权的通道（TUI 主会话 / orchestrator / 用户）一步安装。

## 证据链

| # | task_id | board | assignee | snippet（可回溯 comment） |
|---|---------|-------|----------|---------------------------|
| 1 | t_018bf082 | swarm | worker-coder | 「orchestrator steer（审批门绕行指令）：你在写 `~/.hermes/profiles/aiteam-*/SOUL.md` 时触发写审批（工作区外 + agent 身份文件 = 无头模式自动拒绝超时），继续重试只会烧迭代预算。改道：**全部待安装文件写到工作区内** aiteam-deploy/ 下按 profile 组织」→ 二次升级「🔴 强制改道令（第二次，**此前 steer 未被读到**——写 profiles 目录的审批在无头模式下 100% 自动拒绝，你已被拒 3+ 次）」 |
| 2 | t_4b19ed0c | swarm | worker-coder | 「R1 被写保护门禁拦截 ⏸」「R1 重试结果：保护门禁再次拦截（审批超时），**未做任何写入** ⏸」→ 最终 R3「7/8 全绿，剩 1 项需用户一次人工动作」——改道为交人工清单而非硬写 |
| 3 | t_cc655ecb | swarm | worker-coder | 「hotspot: ~/.hermes/profiles/*/SOUL.md — 受保护文件写入需逐次用户审批，本次 2 处模板副本清理因审批超时未落地」+ run59 心跳自报完成但 4 次连续 protocol_violation（rc=0 未调 kanban_complete）——受保护写阻塞从「写入失败」升级为「完成声明失败」 |
| 4 | t_5a115d3a | swarm | orchestrator | 「orchestrator（TUI 主会话）安装进度同步 —— 部分安装已由本会话完成，避免重复操作：6×SOUL.staged.md → mv 改名 → cp 进 ~/.hermes/profiles」——**staging 产物的合法安装通道实证**：TUI 会话有审批能力，cp 一跳完成 |
| 5 | t_67f398c9 | swarm | worker-coder | 「46 个脚本批量 + worker-coder/orchestrator 走 CLI」修复 49 份 config——受保护 config 批量写走脚本/CLI 通道（有授权执行体）是既有惯例，佐证「分通道写」是集群既定模式而非新发明 |
| 6 | t_6b9af369 | swarm | platform-skill-miner | 「本卡差距分析判定 TRACK 无机制变更故未触碰」hotspot 留痕——识别到「我不该碰这个受保护文件」后主动绕行的正面案例 |

**频率**: 6 / 49（4 例 headless 受保护写被拒 + 1 例 staging→TUI 安装通道实证 + 1 例主动绕行正面案例；跨 worker-coder/orchestrator/platform-skill-miner 三类 profile）

## 四段式内容

### 1. 触发条件 → 具体信号
- headless/cron worker 写 `~/.hermes/profiles/**` 或 `_shared/**` 被拒：「审批超时」「自动拒绝」「protected agent-instruction file」。
- 同一写入第 2 次被拒（第 1 次可能是瞬时，第 2 次即结构性）。
- orchestrator steer 指令含「改道」「staging」「写工作区内」字样。
- worker 心跳自报完成但 kanban_complete 4+ 次失败（t_cc655ecb 形态：受保护写把任务卡死在交付前）。

### 2. 标准步骤
1. **第 2 次被拒即停写**：无头模式审批自动拒绝是**结构性**的，重试 N 次结果相同（t_018bf082 已被拒 3+ 次后 steer 才到达）。把「stop-hook」写在第 2 次失败：不再发起同名写。
2. **改道 workspace-staging**：全部待装文件写入 `$HERMES_KANBAN_WORKSPACE/<bundle>/`，按目标路径组织目录结构（`aiteam-deploy/aiteam-orchestrator/SOUL.md` 形态），文件名用 `.staged.md` 后缀标记未安装态。
3. **机械自验 staged 产物**：写 verify 脚本断言文件存在性 + 结构完整性（t_018bf082 的 `verify_deploy.py`：14 文件 5 大结构断言 exit 0）。产物未经自验不得交接。
4. **交接安装通道三选一**（按可用性降序）：
   - **TUI 主会话**（t_5a115d3a 范式）：staging 目录 + 安装清单 comment 留痕，TUI 会话 `mv` + `cp` 一跳完成；
   - **orchestrator CLI/脚本通道**（t_67f398c9 范式）：批量 config 类走有授权的执行体；
   - **人工清单**（t_4b19ed0c R3 范式）：「7/8 全绿，剩 1 项需用户一次人工动作」——明确列出用户要做的一条命令。
5. **comment 标注受保护事实**：写明「X 为 protected，本 run headless 无权写，已 staging + 交接」，防后续 run 重复撞墙（对齐 protected-file-write-block-reroute 提案第 4 步）。

### 3. 陷阱
- **headless 审批拒绝 ≠ 故障，是设计**：无头会话无人在终端点批准，fail-closed 是正确行为。错误反应是重试，正确反应是改道。
- **steer 可能读不到**：t_018bf082 中 steer 未被 worker 读到（已被拒 3+ 次后才升级为「强制改道令」）——子代理 transcript 冻结或 mid-turn steer 丢失时，**防呆必须内置在初始 context**（delegation-brief-format 纪律），不能赌 steer 及时到达。
- **受保护写阻塞会级联到完成声明**：t_cc655ecb 里写不进去 → 自报完成 → complete 被拒 → 记 protocol_violation 顶熔断。链条下一环的故障常被误诊为 worker 违规。
- **staging 不等于完成**：staged 文件未安装前任务不算达标；但安装动作属于有授权通道的职责，worker 侧验收 = staging 产物自验通过 + 交接清单明确。
- **绕过保护（terminal 直写）= 违规**：与 protected-file-write-block-reroute 提案同一红线，staging 是改道不是绕道。

### 4. 验证（如何机械验证 skill 生效）
- 窗口内 headless 受保护写被拒的卡，第 2 次被拒后的 comment 必含「staging」或「交接人工/TUI」字样（不再有第 3 次裸重试）。
- staging 交付的卡，workspace 内 staging 目录 + verify 脚本输出（exit 0）可回溯。
- `hermes prompt-size --json` / 文件 mtime 证明安装动作由有授权通道完成且产物在位。

## 与既有 skill 关系

- **与 `protected-file-write-block-reroute`（存量提案，同目录）高度互补但视角不同**：该提案聚焦「被 block 后先独立核验是否其实已达标 + 三选一 reroute」；本提案聚焦「headless 场景结构性拒绝的预判 + workspace-staging 完整作业流（staging→自验→三通道交接）」。**建议 curator 裁决合并**：两提案的四段式有 ~30% 步骤重叠（第 2 次即停、标注受保护事实、禁绕过红线），合并为一张「受保护写 headless 作业流」skill 更利于 worker 加载；若保持两张，须在双方 When to Use 写明互斥边界（本提案=预判+staging 流；对方=block 后核验破局）。
- **补充 `agent-soul-patching`**（怎么批量改 SOUL）与 `delegation-brief-format`（初始 context 内置防呆）：本 skill 是二者之间的执行侧环节。
- 相邻：`orchestrator-scheduling-audit`（调度侧诊断，非执行侧）。

## 预期收益

- 消除 headless 受保护写无效重试（t_018bf082 烧掉 3+ 次迭代预算的形态不再发生）。
- staging→自验→交接 成为标准交付形态后，「受保护写导致 rc=0 但 complete 失败」级联故障（t_cc655ecb 形态）消失。
- TUI/orchestrator/人工三通道职责清晰，安装动作可审计（staging 目录 + verify 脚本 + mtime 证据链）。
