---
name: failure-mode-playbook
description: 任务失败/阻塞时的模式识别与对策速查。触发：kanban_block/kanban_request_changes 前，或连败压力升级 L2+ 时查表定模式、选对策、打标签。
version: 1.0.0
metadata:
  hermes:
    tags: [kanban, failure-mode, playbook, pmo-fusion]
---

# 失败模式对策库（failure-mode playbook）

> 来源：PMO前沿 53 篇调研融合 G3（2026-09-02，`research/pmo-frontier/REPORT.md` §三）
> 原型：PMO《史上最全项目风险清单》24 类（需求 9 / 人员 9 / 流程 6）的 agent 化改造
> 联动：`failure-label-check.py` 的四标签是**观测口径**，本表是**对策口径**——先打标签可观测，再按表选对策可行动
> 使用纪律：
> ① kanban_block / kanban_request_changes 前**必须先查本表定模式**，reason 首行打标签 + 模式编号（如 `[capability-gap] FM-R2`）
> ② 连败压力升级 L2+（pua-pressure-engine）时强制查表——同模式连败 = SPINNING，必须按「切换链」换对策
> ③ 本表只收录**实锤发生过的模式**（锚点=事故/审计/实测），假想模式不入表；新模式经复盘确认后增补

## 〇、结构化案例库（`_shared/failures/`，OpenExecutive failures/ 同构融合 2026-09-03）

> 来源：SenteLabsAI/OpenExecutive `knowledge/builtin/failures/`（frontmatter + 五段式结构）
> 关系：**本表 = 模式索引（what/对策）**，`_shared/failures/*.md` = 具体案例（why/how/教训全文）——模式表定标签，案例库给全文

### 案例文件格式（frontmatter + 五段式）

```markdown
---
domain: <process|resource|requirement|execution>
topic: <主题 slug>
date: <YYYY-MM-DD>
failure_type: [<类型标签列表>]
fm_modes: [FM-X1, FM-X2]   # 反向链接本表模式编号
severity: critical|major|minor
---

# <案例标题>

## Situation          —— 背景
## What Happened      —— 发生了什么
## Root Cause         —— 根因
## Key Decision Failures —— 关键决策失误
## Lessons            —— 教训
## 根治锚点           —— 修复任务/机制锚点
```

### 使用纪律

- kanban_block/request_changes 定 FM 模式后，**有对应案例时引用案例路径**（如 `_shared/failures/2026-09-01-evals-incident.md`）
- 新事故复盘后：先定模式入本表 → 再写案例入 `_shared/failures/`
- 案例检索：`grep -rl "fm_modes.*FM-P1" ~/.hermes/profiles/_shared/failures/`

### 已有案例

| 案例 | 模式 | 日期 |
|------|------|------|
| `_shared/failures/2026-09-01-evals-incident.md` | FM-P1/P4/P5/P6 | 2026-09-01 |

## 一、需求类（Requirement）

| 编号 | 模式 | 信号 | 对策 | 实锤锚点 |
|---|---|---|---|---|
| FM-Q1 | 卡 body 验收标准模糊，worker 自行脑补 | request_changes 循环 ≥2 次；评审词含「不符合预期」 | 阻断执行→orchestrator 补 frozen:true 验收清单；重型卡必含验收段（P0-6 冻结纪律） | HarnessEval `selection_modified==False` 教训 |
| FM-Q2 | 隐性诉求未澄清，交付后才发现方向错 | 用户回复「不是我要的」；返工率>50% | 编码前强制 `verify-prd` → 不清晰走 `rd-clarify`（清单式找信息缺口+苏格拉底诘问找隐藏预设）；grilling frontier 轮次榨干设计树 | devops-rd 8 阶段状态机 |
| FM-Q3 | 跨卡同名决策分叉（两子卡各自决定同一问题） | 合并报告时 schema/命名冲突 | 设计决策归属 orchestrator——命名/schema/API 形态派单前定死写进每个子卡 body | orchestrator 决策所有权纪律 |

## 二、资源类（Resource）

| 编号 | 模式 | 信号 | 对策 | 实锤锚点 |
|---|---|---|---|---|
| FM-R1 | provider 熔断/503（cc-switch 上游失效） | cc-switch 监控 503；circuit-breaker trip | `cc-switch-provider-troubleshooting` skill；切换备用上游；不裸 retry | cc-switch 熔断实锤（memory） |
| FM-R2 | 并发上限排队（Kimi 并发=4） | 并行子任务>4 时延迟陡增 | 派工控制并行度 ≤4；重型分解按波次派发 | risk-register R-02 |
| FM-R3 | 上下文溢出（SOUL 超限被截断） | profile 行为异常丢纪律；orchestrator SOUL 22,457>20,000 实测 | `orchestrator-soul-slimming` 瘦身；共享块外置 `_shared/` 引用化 | 设计文档 §四待裁决 |
| FM-R4 | tool_output 截断丢失关键数据 | stdout 超 50KB 被 head/tail 截断 | spill 文件路径落盘，`read_file(offset=...)` 分页读；不依赖 inline 全文 | execute_code spill 机制 |

## 三、流程类（Process）

| 编号 | 模式 | 信号 | 对策 | 实锤锚点 |
|---|---|---|---|---|
| FM-P1 | 护栏绕过：delegate 子代理 sqlite3 直写生产板 | 任务状态非预期变更；task_events 缺对应事件 | **禁止**子代理直连 kanban.db；守栏方案=ABORT 触发器+打标连接（guardrail-test 先行，t_086567b7/t_22399871） | evals 事故 2026-09-01 |
| FM-P2 | 留痕遗忘：Gateway 消息执行后忘记 kanban 留痕 | 复盘发现任务无 kanban 记录 | 硬性触发条件表（工具次数×文件写入数）机械判定；回复前过检查清单 | orchestrator 智能路由留痕纪律 |
| FM-P3 | 跨板 parent 哑链 | 跨板 parents 子卡被提前放行 | 跨板编排只用子卡 body 引用父卡 ID + `context_from`；**禁用** 跨板 parents | 蓝军 F-A 实锤 2026-08-27 |
| FM-P4 | scratch 证据蒸发 | 卡 done 后工作区清理，产物丢失 | workspace_kind 禁 scratch（SOUL 强制规则）；产物即时 `kanban_attach` 或 dir 模式 | evals 事故 2026-09-01 |
| FM-P5 | 长 base64 attach 字节错 | kanban_attach 报字节错误 | >2KB 走评论归档+小附件；附件 diff 校验 | evals 事故 2026-09-01（两次实测） |
| FM-P6 | 运行中卡被终态化（创建方 archive / orchestrator 并发代验 complete） | kanban_complete 被拒 "unknown id or already terminal"；heartbeat 静默 | 停止重试终态动作；先 kanban_show 定终态来源——他人已完成→独立核验其 findings 属实（log/db 实证）后 kanban_comment 背书即退出，勿二次 complete | 祭品卡事故 2026-09-01；t_fe9af6bf 并发代验完结 2026-09-07 |

## 四、执行类（Execution）

| 编号 | 模式 | 信号 | 对策 | 实锤锚点 |
|---|---|---|---|---|
| FM-E1 | SPINNING：同思路重复连败 | L0-L4 连败计数 ≥2，方案本质相同 | L1 强制切换**本质不同**方案（换技术路径/工具链/架构假设，换参数不算） | pua-pressure-engine |
| FM-E2 | 空口完成未验证 | 「已完成」但无 baseline-diff/sqlite 验证 | D4 证据强度纪律：sqlite 查行数/grep 查引用/文件实读；不信任自述 | worker-completion-independence-verification |
| FM-E3 | 规则入库≠机制生效 | 文档齐全但执行率 0%（GAP-0 病灶） | 停止堆规则→先量后治；protocol-adoption-audit.sh 月报；连续 2 月 0 执行即降级 | FDE GAP-0 实锤 |
| FM-E4 | 备份存在但覆盖盲区 | 恢复时发现备份缺失关键对象 | 备份必须演练（D7）；全量 tar -L 落外部盘 | 回滚演练事故 |

## 五、切换链（连败时按序尝试，不回头）

> 来源：pua-methodology-router 失败切换链 × PMO「多套解决方案」纪律融合

1. **同模式内换对策**（如 FM-R1：熔断→换上游→降级模型）
2. **换模式归因**（原判 FM-R1 资源类连败 2 次 → 重查是否实为 FM-Q1 需求类误判）
3. **升级取证**（L2 灵魂拷问：逐字读错误+search_files 搜完整报错+读失败源码 50 行）
4. **隔离复现**（L4 拼命模式：最小 PoC + 隔离环境 + 完全不同技术栈）
5. **认输上报**（kanban_block 带全部尝试记录——诚实报阻塞优于编造结果）

## 六、与四标签的映射

| 四标签（观测口径） | 本表模式域 |
|---|---|
| `[context-gap]` | 需求类 FM-Q1/Q2/Q3 |
| `[tool-failure]` | 资源类 FM-R1/R4 + 执行类 FM-E1 |
| `[routing-error]` | 流程类 FM-P2/P3 |
| `[capability-gap]` | 资源类 FM-R3 + 执行类 FM-E4 |

## 七、排除表复核周期（2026-09-07 提案3 增补，金书§1.5"记忆也会错误排除"）

> 控制论依据：记忆=把已证伪状态从可能性空间排除（有记忆的控制）；但排除本身可能出错（把正确方案误标失败后永不重试=错误排除）。排除表需要复核机制，否则从"记忆"退化成"偏见"。

- **复核对象**：本表全部实锤模式 + `_shared/failures/` 案例库条目
- **周期**：每月首周，与 failure-pattern 月报同批人工过一遍
- **逐条判据**：该模式当初的触发条件是否仍存在？（如 FM-R2 并发=4 的 provider 是否已扩容；FM-P1 触发器是否已迁移）条件已消失的模式标 `[stale?]`，连续 2 月无复发且条件消失 → 移入归档段（不删，保留考古价值）
- **输出**：复核结论追加到当月 failure-pattern 月报尾部（"排除表复核"节），不单独出报告
- **禁止**：复核轮次不新增模式（新增只走"复盘确认后增补"正门）
