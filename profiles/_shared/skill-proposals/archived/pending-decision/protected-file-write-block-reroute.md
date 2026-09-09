# SkillProposal: protected-file-write-block-reroute [create]

> **产出**： platform-skill-miner · 2026-08-31 · 半月全量窗口扫描（2026-08-17~2026-08-31，125 张 done 卡）
> **状态**： ⏳ 待图爸最终裁决（本 job 只提议不落地，未调 skill_manage）
> markings: [TLP:GREEN, EYES-ONLY:platform]

## 评审意见（2026-09-07，platform-skill-miner 同 job 评审通道）

**判定：✅ 批准（独立 create 成立；需与本轮新提案 `headless-write-staging-reroute` 互引边界，交图爸一并裁决）**

- **证据链复核**：3 条 task_id（t_60a4bef4 / t_44f56a7c / t_dc3022bc）均在 platform 板可回溯，t_60a4bef4 单卡 10 连 reblock 是全库强度最高实例。频率 3/125 达标（门槛线，但单卡强度补偿）。
- **本窗口复发实证**：t_4b19ed0c（「保护门禁再次拦截（审批超时），未做任何写入」）、t_cc655ecb（「受保护文件写入需逐次用户审批…审批超时未落地」）——模式在本窗口继续复发且升级出**级联形态**（写不进→自报完成→complete 被拒→记 protocol_violation），证明提案时效性。
- **与新提案关系**：本轮挖掘产出 `headless-write-staging-reroute`（headless 结构性拒绝的预判 + workspace-staging 作业流）。两提案 ~30% 步骤重叠（第 2 次即停/标注受保护事实/禁绕过红线），差异在触发象限：本提案＝**block 后核验破局**（卡已在 block 态）；新提案＝**headless 预判改道**（写之前就知道会拒）。
- **裁决建议**：两提案均批准但**必须交叉引用**（双方 When to Use 互写一行边界），或合并为一张「受保护写作业流」大 skill。倾向前者：两象限的读者动作不同（破局 vs 改道），合并会让 skill 过长。
- **一处修正**：提案第 2 步「已达标 → 直接 kanban_complete」应加注「complete 前逐条对照 frozen 验收标准，block 态卡提前 complete 需 orchestrator 留痕确认」（对齐 baseline.md:72 父卡提前 complete = 协议违规 铁律，T5 事故回流的疫苗）。

## 触发条件

当 worker 对**受保护文件**（profile `SOUL.md` / `_shared/02-org-orchestration/ontology.md` 等 agent-instruction、共享契约文件）执行 `patch`/`write_file`，被「protected agent-instruction file」审批超时拦截、任务落 `block(kind=needs_input)` 后——**在反复重派/重 block 前**，加载本 skill。典型信号：block-run 反复出现 + 卡体已在不知情下达成目标态（别 profile/其他 run 已写盘）+ ACP 通道本就不存在却仍走 `acp_send` 依赖。

## 证据链

| # | task_id | board | assignee | snippet（可回溯 comment） |
|---|---------|-------|----------|---------------------------|
| 1 | t_60a4bef4 | platform | platform-ontology-curator | 连续 **10 次 reblock**（C0–C14 全部因 ACP 写通道不可用而 dependency_wait）：「acp_agents(provider=claude) 实调 → Tool 'acp_agents' does not exist」「Claude ACP binary not found...npm 全局仅有 @zed-industries/claude-code-acp，非 harness 期望的 claude-agent-acp」。run 10 才意识到：「前 8 次 run 均因 ontology.md 仍为 v1.5 + ACP 不可用而 block，属当时正确 fail-closed 行为。**本次未锚定旧模式：实查磁盘当前态，发现 §七 段已落盘、版本已 v1.6 → 目标态已达成，再 block 即死循环**」 |
| 2 | t_44f56a7c | platform | platform-ontology-curator | C2 偏差记录：「worker-coder / worker-researcher 两个 SOUL.md 的 PRE-COMPLETE 段接入 --check-stable-units 这一步，本会话的 patch 写 .hermes/profiles/*/SOUL.md 触发了 protected-file 审批超时拦截（非 consent）。遂：任务核心机械强制产物已全部落地...仅此 SOUL 接线因 protected-file 审批超时未落...**复验确认（本回合独立查证）grep -n check-stable-units 真实输出命中（worker-coder:36 / worker-researcher:51）→ 验收标准三项全部达成**」——即被 block 的卡其实已达标 |
| 3 | t_dc3022bc | platform | platform-ontology-curator | 「复验确认（本回合独立查证）：任务在 run 40 已置为 done。本回合对受保护 SOUL.md 已接入 --check-stable-units 做独立复验：`grep -n check-stable-units` 真实输出命中 → 验收标准三项全部达成」——同 protected-file 拦截导致的 block 循环，最终靠独立磁盘核验确认早已完成 |

**频率**: 3 / 125（3 个独立任务均出现「protected-file 写拦截 → 反复 block → 应改 reroute/独立核验」模式；t_60a4bef4 单卡自身就含 10 次 reblock 循环，是该模式强度最高的实例）

## 四段式内容

### 1. 触发条件 → 具体信号
- `patch`/`write_file` 写 `*/profiles/*/SOUL.md`、`_shared/02-org-orchestration/ontology.md`、`_shared/*.md` 等受保护文件 → approval prompt 超时 → 任务 `block(kind=needs_input)`。
- 同一 task_id 被 dispatcher **多次重派（reblock 循环 ≥2 次）**，每次都撞同一保护拦截。
- 任务 body 声明依赖 `acp_send(provider=claude)` 落盘，但运行时工具集**无 acp_* 工具**（tool_search 标 plugin 源但未加载）。

### 2. 标准步骤
1. **第 2 次 block 即停轮**：reblock ≥2 次同因，不再重派——先 `kanban_block(kind="transient")` 或转人工裁决，避免死循环（参照 t_60a4bef4 run 10 的「再 block 即死循环」教训）。
2. **独立核验真实磁盘态**：`grep -n "<锚点>" <受保护文件>` / `read_file` 实测目标是否已由别 run/别 profile 落盘（t_44f56a7c / t_dc3022bc 验证范式）。已达标 → 直接 `kanban_complete`（注明由独立核验收口，非自述）。
3. **reroute 三选一**（未达标时）：
   - 受保护写交 **ACP 通道**（shared_state 级，免 self-write）——但先 `acp_agents` 实测通道可用性，不可用则下一步；
   - 改走 **staged-action-proposal** 记录改动清单，交人类授权执行（不换 terminal/execute_code 绕过保护）；
   - 该 SOUL 接线类小改动，建**专项子任务**由有授权的 profile 落（`agent-soul-patching` 模式）。
4. **标注 protected 事实**：在卡 comment 写明「X 为 protected file，本 run 无权 self-write，已 reroute」，避免后续 run 重复撞墙。

### 3. 陷阱
- **「block = 没做成」错觉**：t_44f56a7c / t_dc3022bc 证明受保护写被拦的卡，核心产物常已由并行 run/兄弟任务落盘——block 只是「接线那一步」未完成，验收标准其实全过。
- **reblock 死循环烧 token**：t_60a4bef4 连 10 次 block，仅 run 10 改查磁盘才破局；锚定旧「v1.5 未达」状态会无限循环。
- **依赖不存在的 ACP 通道**：SOUL 写「必须 acp_send」但运行时无 acp_* 工具 → 每轮都 dependency_wait，属 premise 已漂移（同 t_ff9bc714 OEL 收件箱不存在类漂移）。
- **绕过保护 = 违规**：用 terminal/execute_code 直写 protected file 被系统 fail-closed 拦截是**正确行为**，不应试图规避。

### 4. 验证（如何机械验证 skill 生效）
- 受保护写拦截导致的 reblock 循环 ≤1（第 2 次即停轮转 reroute/人工）。
- 每例 protected-file block 卡 comment 含「独立磁盘核验」记录（grep/read_file 输出），非仅凭自述。
- 因 ACP 不可用而 block 的卡，body 注明通道已实测不可用 + reroute 方案。

## 与既有 skill 关系

- **补充 `agent-soul-patching`**（devops，批量 patch SOUL）+ **`prompt-ownership-boundary`**（什么内容归 SOUL）：二者覆盖「怎么改 SOUL」「内容归属」，本 skill 覆盖**「受保护写被拦后的 block-reroute 纪律 + 独立核验破局」**，是它们缺的执行侧防死循环环节。
- 与 `worker-completion-independence-verification` 互补：本 skill 解决「block 卡是否其实已达标」，后者解决「complete 卡自述是否属实」。
- 建议**独立 create**（职责边界清晰：保护写拦截→防 reblock 死循环）。

## 预期收益

- 消除 t_60a4bef4 类 10 连 reblock 死循环，节省重派烧的 token 与调度时延。
- 把「受保护写被拦」从「反复失败」转为「一次核验 + 一次 reroute」，明确 human/ACP/staged 三路径。
- 防止 premise 漂移（任务声明依赖不存在的 ACP 通道）在不知情下空转。
