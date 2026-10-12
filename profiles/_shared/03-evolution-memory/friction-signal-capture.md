# 摩擦信号捕获协议（friction-signal-capture）

> 版本：v1.0（2026-09-17）
> 来源：Tencent/teamai-cli v0.22.0 摩擦信号评分机制（`src/types.ts:1140-1250` + `src/contribute-check.ts:246-358`）
> 融合路径：调研报告 `workspace/research/teamai-cli-research-report.md` §3.1 → 任务 t_10c3cf84（用户已裁决 P0 落地）
> **语境转译声明**：teamai-cli 由 hook 事件流（PostToolUse / Stop）逐事件机械计数；**Hermes 无此事件流**。
> 本协议将观测面转译为「收尾自省盘点 + 任务系统机械痕迹」——判据与数字照搬源码，观测方式是 Hermes 原生的。禁照抄 hook 机制。

---

## 一、定位：把「该不该沉淀经验」从自觉变成机械信号

源码设计哲学（contribute-check.ts:246-262）：

> "A session is worth documenting because it hit a real snag, not because it ran a lot of tools."

翻译：一个任务值得沉淀经验，是因为它**真的较劲过**（被打断、被拒绝、被纠正、反复踩错），不是因为它跑了多少工具。又长又顺的任务不触发沉淀。

在 Hermes 的挂载点：`routine-self-reflect` skill（`kanban_complete` 之前的反思环节）。本协议只回答一个问题——**这个任务要不要走反思闭环**；怎么反思、怎么 redact、怎么 retain 仍由该 skill 定义。

## 二、4 信号定义与 Hermes 等价物映射表

| 信号 | teamai-cli 定义（源码锚点） | Hermes 可观测等价物 |
|---|---|---|
| **toolReject** | 用户拒绝工具调用（显式阻断，types.ts:1224-1225） | 审批拒绝 / 审批超时：权限审批被 deny、单查询模式硬拦（如 execute_code 被拒）、kanban_complete 被门禁拦截（completion_blocked 等） |
| **interrupt** | 用户 ESC 打断输出——叫停错误方向（types.ts:1221-1222） | OUT-OF-BAND 用户消息打断当前 run / 纠正方向；kanban 中途 `kanban_block(kind="needs_input")` 等用户决策 |
| **correction** | 停止后紧跟纠正性重 prompt（types.ts:1227-1228） | 同任务纠正性重派（request_changes 后返工重做）；用户「重新分析」「不对，应该…」类反馈后换方案 |
| **toolError** | AI 反复重试失败的工具（types.ts:1230-1239） | terminal 命令非零退出后重试；acp_send 无响应/超时后重发；kanban_complete 被拒后修正重提；patch 失败重读后重试 |

盘点方式：收尾时回看本次 run 的对话上下文与工具结果，逐信号过一遍映射表右列。Hermes 没有计数器，靠收尾自省——这正是「禁照抄 hook」的含义：**机制靠纪律执行，不靠基础设施**。

## 三、权重与双门禁（数字照源码，禁自行调参）

### 3.1 信号权重（types.ts:1222-1239）

| 信号 | 计分规则 |
|---|---|
| toolReject | 每次 **20** 分 |
| interrupt | 每次 **20** 分 |
| correction | 每次 **20** 分 |
| toolError | 阶梯计分（按累计次数，取命中的**最高档**）：≥3 次 → **10** 分；≥5 次 → **18** 分；≥8 次 → **25** 分；<3 次 → 0 分（区分真实挣扎与偶发 fluke） |

**口径与冲突规则**：toolError 多档同时命中时**取最高档**（源码语义 "the highest matching tier wins"，types.ts:1233）；即 ≥8 次只计 25 分，不叠加 10/18。设计含义：任一**单次强信号**（一次打断 / 一次拒绝 / 一次纠正）即达阈值附近；toolError 需要连续多次才算挣扎。

### 3.2 规模加分（scale bonus，永不单独触发，types.ts:1241-1243）

- 用到 skill：+5 分
- 工具多样性加分：上限 +5 分
- 合计上限约 **10** 分 —— **规模永远无法单独触发沉淀**。任务大 ≠ 有经验。

### 3.3 双门禁（types.ts:1203, 1213）

同时满足才触发：

1. **score ≥ 20**（CONTRIBUTE_SMART_THRESHOLD）
2. **toolCount ≥ 15**（CONTRIBUTE_BASE_THRESHOLD，本次任务的工具调用总数）

第二条的含义：摩擦再重但只有一两个工具调用的微型任务，也不值得沉淀（一次性小坑，无复用样本）。

## 四、判定流程（Hermes 执行面，挂在 routine-self-reflect）

1. **盘点信号**：按 §二 映射表回看本次 run，数出 4 信号各自次数（全零即顺滑任务）。
2. **计分**：按 §三 权重求和 + 规模加分。
3. **过双门禁**：score ≥ 20 且 toolCount ≥ 15。
4. **Phase 2 调整**（见 §五）。
5. **判定**：过门禁 → 正常走反思闭环（填四键 → redact → retain）；不过 → **跳过沉淀**，只留常规 handoff。

判定纪律：**每任务最多判定一次**（源码用 `hinted` flag 保证，types.ts:1174-1177；Hermes 的等价纪律 = 判定点唯一，只在 `kanban_complete` 之前的反思环节判这一次，任务中途不反复判）。

## 五、Phase 2 调整（v0.22.0 转译，contribute-check.ts:328-358）

| 调整 | 源码条件 | 分值 | Hermes 转译 |
|---|---|---|---|
| **知识缺口加分** | recall 全 miss（hitCount=0 且有检索） | +20 | 本任务中 `hindsight_recall` 关键查询**全部 0 命中** → 暴露经验缺口，该任务踩的坑库里有记录价值，倾向沉淀 |
| **低质量召回加分** | 有召回但 topScore < 5.0 | +10 | recall 有返回但结果与本题**均不相关** → 同上，弱一档 |
| **已 commit 常规改动减权** | git commit 且 recall 有命中 | **−0**（中性） | 源码常量 `CONTRIBUTE_GIT_COMMIT_DOWNWEIGHT = 0`（types.ts:1262-1263，注释 "git commit is neutral"）——v0.22.0 实际是**中性占位**，设计意图预留减权。Hermes 侧转译：改动已 commit **不豁免**摩擦判定，也不额外减分 |

## 六、设计原则（照源码哲学，四条红线）

1. **又长又顺的 session 永不触发**——工作量不是沉淀理由，摩擦才是（contribute-check.ts:256-257 "that is the whole point of the rewrite"）。
2. **每任务最多提示一次**——判定点唯一，不重复打扰。
3. **信号宁缺勿滥**——偶发 1-2 次 toolError 不计分（阶梯门槛）；没有摩擦就不硬造反思。
4. **默认沉默，摩擦唤醒**——判定失败的方向是「跳过沉淀」，不是「随便写点」。

## 七、与既有机制的关系

- **routine-self-reflect**：本协议是其 Trigger 节的机械触发判据（该 skill 已加引用行回指本文）。
- **hindsight**：沉淀落点不变（`hindsight_retain` + redact 纪律），本协议只管「要不要触发」，不动写入格式。
- **自愈机制**（Hermes 侧补充判据，非上游转译）：toolError 的 ≤2 轮重试属正常自愈；累计 ≥3 次才升级为摩擦信号——两者不冲突，一个是「当次怎么救」，一个是「事后学什么」。
- **失败案例库 / memory**：本协议判定为「值得沉淀」的任务，其踩坑经验按 routine-self-reflect 既有格式入库；本协议自身不新建存储。
