---
name: failure-mode-playbook
description: 任务失败/阻塞时的模式识别与对策速查。触发：kanban_block/kanban_request_changes 前，或连败压力升级 L2+ 时查表定模式、选对策、打标签。
version: 1.3.0
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

## 〇-2、问题回顾五步（融合万事网联《生产问题回顾机制和流程》V0.1，2026-09-11）

> 触发：P2 级以上故障（= 集群里 blocked 复发 / gave_up / 看门狗命中 / 事故复盘需求）
> 原型：故障处置结束 → 时间线回顾 → 根因方编写整改 → 审议督办 → 效果验证

| 步 | 动作 | 集群形态 |
|---|---|---|
| 1 | 时间线回顾 | 运维方（incident-commander）依处置工单回顾 kanban task_events 时间线及关键节点 |
| 2 | 补充细节 | 各关联方依据时间线补充细节、反思不足（kanban_comment 汇总） |
| 3 | 根因整改 | 根因方（原 worker）编写根因分析+整改措施+计划（费曼标准：到 file:line，非「加强注意」；手法用**假设-反证**：列 ≥2 个候选根因假设，逐个找证据证实/证伪，全部证据指向唯一假设才定因——证据不足继续调查、不越界定因，防首因偏差定错根因。AgenticOps RCA 融合 2026-09-24） |
| 4 | 审议督办 | 协同团队（orchestrator）审议报告、督办整改落实（kanban_create 整改子卡，parents 挂链） |
| 5 | 整改验证 | 效果验证由独立方组织（worker-tester / 看门狗复跑），验证通过才算闭环——闭环记录写入 `_shared/failures/` 案例库（fm_modes 反链本表） |

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
- 新案例登记须过下方「BadCase 五要素模板」（2026-10-21 起）：五字段缺失 = 案例不可复跑，退回补齐后再入库

### BadCase 五要素登记模板（2026-10-21 增补，三账号调研融合）

> 来源：银翼AI评测室连载08（淘系把 badcase 当原料采买，进回归集的每条必须含五要素）+ 连载10 理论支撑（评测资产不是用例总数，是临界场景密度——kanban 卡失败/打回记录就是「生产环境写的测试用例」，不模板化就浪费了），存档 `research/wx-onto-ddd-20261021/reports/account3-silverwing-verdict.md` X1。
> 与上方五段式案例格式的关系：五段式管**复盘叙事**（Situation→Lessons），五要素管**可回放性**（每条案例能机械复跑）——两者并存，新案例两种结构都写，frontmatter 不变。

**登记模板**（`_shared/failures/` 新案例必含，五字段缺一 = 不可复跑，退回补齐）：

```markdown
## BadCase 五要素

1. **原始意图**：<用户/上游当初想要什么——原话或原始卡 body 目标句，不转述>
2. **变化字段**：<哪个字段/状态/文件与预期不一致——精确到字段名与期望值 vs 实际值>
3. **第一处错误工具调用**：<时间线上第一次偏离正确路径的工具调用——工具名+参数+所在文件/轮次，即「首次偏离位置」>
4. **实际副作用**：<这处错误实际造成了什么——写坏的文件/污染的状态/浪费的轮次，可观察>
5. **正确处置**：<当时应该怎么做——一步可执行的替代动作，供下次同型场景直接套用>
```

**配套原则**：每条案例遵循「最小失败证据 + 相邻合法样本」——保留最小可复现失败证据（日志切片/最小输入），并附一个只差关键步骤的合法对照样本，保证案例可判、可复跑；登记人不确定第 3 字段时按会话日志回放定位，禁止凭记忆填写。

### 案例晋级探针门（guardrail-regress 晋级通道，2026-10-23 京东融合 Y2）

> 来源：京东评测体系拆解「红队 200+ 攻击手法沉淀进平台资产 / badcase 当原料采买」——`_shared/failures/` 案例入库不能是终点，可机械化复放的向量要能晋级成护栏探针。裁决 `research/jd-agent-eval-20261023/VERDICT.md` Y2。
> 先例：P1/P2 探针源自 2026-09-01 事故，但当时无标准无留痕（derived_from 空）；本节把该人肉先例定成标准通道。

**晋级门四条件**（全过才入 manifest.probes，缺一登记为观察项不晋级）：

1. **机械可复跑**：案例含最小失败证据 + 相邻合法样本（BadCase 五要素第 3/5 字段可直接翻译成探针 expected_rc 与判分逻辑）；
2. **向量仍在现役**：攻击/故障面当前真实存在（过时向量不晋级，如已退役平台）；
3. **登记留痕**：manifest 探针条目必填 `derived_from`（来源案例/上线卡）+ 案例晋级时加 `promoted_from`（案例路径）——runner 对缺 derived_from 的探针打 warn（2026-10-23 起）；
4. **探针实现代码**：PROBES dict 逐条实现（manifest 加行不等于可跑）——这一步仍人写，写完跑 `run_probes.py --probe <id>` 实测判分。

**巡检入口**：`python3 ~/.hermes/evals/guardrail-regress/run_probes.py --promoted-only`（只跑案例晋级面）；复盘产出新案例后，收尾 checklist 加一问「本案例可否晋级探针」。

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
| FM-R5 | **timeout 恢复轮语义缺失**：goal_mode 卡单轮超时被当成终态失败直接 block 人工（超时 ≠ provider 终态失败） | goal_mode 判官二值判定（完成/未完成）；单轮超时即记 block；kanban 无 timeout-kind 轮记录（kanban_tools grep timeout 零轮级处理） | **超时记 invalid 轮不记终态**：单轮超时→kanban_comment 留痕「invalid 轮（timeout），保留部分产物轨迹」+ 下轮 worker 从**真实 workspace 状态**自恢复继续（re-read task-state.md/产物文件，不凭摘要记忆），不升格 provider 终态失败；**连续超时 ≥3 轮触发人工门**（repeated_failure 规则） | LHH 0.1.7 delta A2（manager.py:427-444 recoverable_timeout，2026-10-18 调研实读；`grep -c recoverable_timeout manager.py`=11） |
| FM-R6 | 工具链故障误判为 capability 缺口（半更新致模块缺失，收尾被拒后转 capability blocker，触发 R2 补全卡空转 + gap_register 污染） | blocked reason 含指纹 `No module named` / `cannot import name` / `partially-updated`；4 例实锤（09-26×3 + 10-03×1，同一次 update 半更新事故） | 先 import 冒烟核验工具链现状再定性；已修复则记「缺口不存在+时间线」不建卡；capability-gap-watchdog `_scan_blocked` 已带指纹过滤（.bak-20261003） | capability-gap-r2-handoff 提案裁决 t_64052c03 2026-10-03 |

## 三、流程类（Process）

| 编号 | 模式 | 信号 | 对策 | 实锤锚点 |
|---|---|---|---|---|
| FM-P1 | 护栏绕过：delegate 子代理 sqlite3 直写生产板 | 任务状态非预期变更；task_events 缺对应事件 | **禁止**子代理直连 kanban.db；守栏方案=ABORT 触发器+打标连接（guardrail-test 先行，t_086567b7/t_22399871） | evals 事故 2026-09-01 |
| FM-P2 | 留痕遗忘：Gateway 消息执行后忘记 kanban 留痕 | 复盘发现任务无 kanban 记录 | 硬性触发条件表（工具次数×文件写入数）机械判定；回复前过检查清单 | orchestrator 智能路由留痕纪律 |
| FM-P3 | 跨板 parent 哑链 | 跨板 parents 子卡被提前放行 | 跨板编排只用子卡 body 引用父卡 ID + `context_from`；**禁用** 跨板 parents | 蓝军 F-A 实锤 2026-08-27 |
| FM-P4 | scratch 证据蒸发 | 卡 done 后工作区清理，产物丢失 | workspace_kind 禁 scratch（SOUL 强制规则）；产物即时 `kanban_attach` 或 dir 模式 | evals 事故 2026-09-01 |
| FM-P5 | 长 base64 attach 字节错 | kanban_attach 报字节错误 | >2KB 走评论归档+小附件；附件 diff 校验 | evals 事故 2026-09-01（两次实测） |
| FM-P6 | 运行中卡被终态化（创建方 archive / orchestrator 并发代验 complete） | kanban_complete 被拒 "unknown id or already terminal"；heartbeat 静默 | 停止重试终态动作；先 kanban_show 定终态来源——他人已完成→独立核验其 findings 属实（log/db 实证）后 kanban_comment 背书即退出，勿二次 complete | 祭品卡事故 2026-09-01；t_fe9af6bf 并发代验完结 2026-09-07 |
| FM-P7 | skill 升级落地报告只报内容不报可见性——产物落库但零 profile 挂载，静默零效果 | 落地报告 grep 计数全绿；实际 isfile 穿透 0/47（devops-worker 类目全 fleet 无 symlink） | 升级既有 skill 必申报「变更前后可见性状态」（isfile 穿透计数）；变更前=0 属红线：先补链再交付或显式登记缺口；固化于 fusion-output-quality-gates 门 6 | pua 三 skill 3.5.1（t_8292467f 申报缺口，C4 回归 t_5dfc880a 实测 0/47）2026-10-03 |
| FM-P8 | 设计态-运行态漂移：文档/skill 声明的行为与运行时实测不一致，影子数据只落不查 | actions 白名单（设计态）与 action_gate_shadow.jsonl（运行态影子，13,318 条）长期零对照；落地报告只 grep 文档不实测运行态 | 双态对照抽查（对照白名单与影子记录的 gap，月度随 failure-pattern 月报）+ 事故复盘按轨迹 checklist 补 8 要素 | action_gate_shadow 影子数据 13,318 条从未被周期查询（机制正主 `_shared/06-observability/agent-observability.md` §二）2026-10-08 |

## 四、执行类（Execution）

| 编号 | 模式 | 信号 | 对策 | 实锤锚点 |
|---|---|---|---|---|
| FM-E1 | SPINNING：同思路重复连败 | L0-L4 连败计数 ≥2，方案本质相同 | L1 强制切换**本质不同**方案（换技术路径/工具链/架构假设，换参数不算） | pua-pressure-engine |
| FM-E2 | 空口完成未验证 | 「已完成」但无 baseline-diff/sqlite 验证 | D4 证据强度纪律：sqlite 查行数/grep 查引用/文件实读；不信任自述 | worker-completion-independence-verification |
| FM-E3 | 规则入库≠机制生效 | 文档齐全但执行率 0%（GAP-0 病灶） | 停止堆规则→先量后治；protocol-adoption-audit.sh 月报；连续 2 月 0 执行即降级 | FDE GAP-0 实锤 |
| FM-E4 | 备份存在但覆盖盲区 | 恢复时发现备份缺失关键对象 | 备份必须演练（D7）；全量 tar -L 落外部盘 | 回滚演练事故 |
| FM-E5 | 空跑伪成功（200-OK 流内错误） | worker 自述完成但产物痕迹过薄/覆盖记录全空；API 瞬断在 200 响应流内返回错误文本，被当成功记录（Cloudflare harness 实证：「看起来干净完成的任务」实为依赖 crash） | 验收先查**覆盖证据**（audit 卡查 coverage-ledger 是否全空，调研卡查来源文件数/字数）再信结论；工具调用返回须对响应文本显式分类异常，不只信异常类型 | cloudflare/security-audit-skill 融合 2026-10-21（CF14+Shallow 检测）；裁决矩阵 `workspace/research/wechat-swarm-teams-20261021/FUSION-VERDICT.md` |

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
| `[capability-gap]` | 资源类 FM-R3/R6 + 执行类 FM-E4 |

## 六-2、需求/缺陷问题源二分（Product Gap vs Implementation Gap，FDE 融合 2026-10-08）

> 来源：金融科技 FDE 模式（存档 `research/wechat-fusion-20261008/`，a6）。适用于：worker 交付物缺陷归因、能力缺口（capability-gap）定性、上游产品 vs 下游实施的责任切分。

把「交付/运行不符合预期」先二分为两个正交来源，再决定修复路径——**混淆两者是金融 FDE 领域实测的两大反模式来源**：

| 归类 | 判定 | 正确动作 | 错误动作（反模式） |
|------|------|----------|-------------------|
| **产品缺口**（Product Gap） | 缺陷源于通用能力/工具/产品本身缺失（换任何消费方都缺） | 登记产品侧问题：capability-ladder 补全卡 / skill 生成提案 / 上游 hermes 源码 issue | 在下游打临时 workaround 补丁——产品迭代后临时方案演变为**合规/漂移风险**（如绕过 update 机制的本地 hot-patch） |
| **实施缺口**（Implementation Gap） | 缺陷源于特定消费环境的一次性适配问题（配置错/集成缝/用法偏） | 当场修配置/补桥接/校正用法，不登记为产品问题 | 上报为产品 bug——研发资源被无效消耗，产品路线图被单客户特例劫持 |

集群判例对照：
- FM-R6（工具链故障误判为 capability 缺口→R2 补全卡空转）= **把实施问题误报为产品缺口**的反模式实锤；
- 反之，为单次任务在 skill 里硬编码某仓库特定路径 = **把产品缺口用实施 workaround 掩盖**，产品侧（skill 通用化）欠账仍在。
- 轨迹侧接线：双态漂移（FM-P8）与轨迹 8 要素勾稽是缺口双向判定的第一手输入——机制正主见 `_shared/06-observability/agent-observability.md` §四。

**二分自检问**：「这个问题换一个消费者/换一次任务还会出现吗？」——会=产品缺口走补全阶梯；不会=实施缺口就地修复。拿不准时：先按实施缺口最小修复恢复运转，同时 gap_register 登记观察项（标注「疑似产品缺口待二次复发确认」），二次复发即升级为补全卡——与 §七 排除表复核周期同构。

## 七、排除表复核周期（2026-09-07 提案3 增补，金书§1.5"记忆也会错误排除"）

> 控制论依据：记忆=把已证伪状态从可能性空间排除（有记忆的控制）；但排除本身可能出错（把正确方案误标失败后永不重试=错误排除）。排除表需要复核机制，否则从"记忆"退化成"偏见"。

- **复核对象**：本表全部实锤模式 + `_shared/failures/` 案例库条目
- **周期**：每月首周，与 failure-pattern 月报同批人工过一遍
- **逐条判据**：该模式当初的触发条件是否仍存在？（如 FM-R2 并发=4 的 provider 是否已扩容；FM-P1 触发器是否已迁移）条件已消失的模式标 `[stale?]`，连续 2 月无复发且条件消失 → 移入归档段（不删，保留考古价值）
- **输出**：复核结论追加到当月 failure-pattern 月报尾部（"排除表复核"节），不单独出报告
- **禁止**：复核轮次不新增模式（新增只走"复盘确认后增补"正门）

## 七-2、归因前先调 clef-jev 标类型（可选，2026-10-16 C-4 接入）

本节给「查表定模式」加一道结构化复核：模式编号由你从 §一~§四 的表里选，
归因是否成立交给本地 clef-flash 判。**它不是对策的来源，对策仍以本表为准。**

触发（满足任一才调，默认不调）：

- 信号跨两个模式域（如同时像 FM-R1 资源类与 FM-Q1 需求类），切换链第 2 步「换模式归因」卡住
- 准备 `kanban_block` / `kanban_request_changes` 打标签，但对标签正确性没有把握
- 连败 L2+ 已列 ≥2 个候选根因假设，需要第二意见排序

调用（请求契约、退出码、阈值口径见 skill `devops/clef-jev`）：

```bash
JEVDIR=~/.hermes/skills/devops/clef-jev
curl -s -m 5 http://127.0.0.1:8000/health                        # 必须 200
python3 "$JEVDIR/scripts/clef_jev.py" decide <request.json>       # choice 问模式归类
python3 "$JEVDIR/scripts/clef_jev.py" decide <request.json> --dry-run   # 先离线校验请求体
```

`state` 只放信号原文与候选模式描述，不放你的结论——把结论写进 state 会让复核变成回声。
判定结果与你的选择不一致时：两者都写进 `kanban_comment`，按 §五 切换链继续，不静默采纳任一方。

边界：

- clef 只产候选与置信，**不替代本表的对策与实锤锚点**；本表只收实锤模式，clef 标的新模式不入表。
- health 非 200 或 CLI rc=1 时按原路径继续，不得静默改成主 LLM 自评冒充 clef 结果。
- 决策回执自动落 `~/.hermes/logs/clef-decisions.jsonl`；积累后用 `devops/eval-calibration`
  做 ECE/Brier/NLL 体检，本机 clef 暂无自有校准跑数。
