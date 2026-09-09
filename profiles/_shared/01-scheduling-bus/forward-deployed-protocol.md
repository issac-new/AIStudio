# Forward-Deployed Protocol（前线部署协议）

> 灵感来源：Palantir Forward Deployed Engineer (FDE) — 嵌入目标环境一线，获取隐性知识，快速产出可用原型
> 适用范围：所有 Hermes worker profile（headless 模式下用「前线侦察」步骤适配）
> 强制级别：🟡 提示性纪律（依赖 worker 自律；无工具层 fail-closed）——所有 worker SOUL.md 的「标准作业循环」应包含前线侦察步骤

---

## 一、核心理念

### 1.1 Palantir FDE 模式

Palantir 的 FDE（Forward Deployed Engineer）模式核心：
- 每周 3-4 天驻场客户现场
- "先上飞机，再问问题"
- 获取难以言传的隐性知识（context is scarce）
- 2 周内做出"能真正用起来的产品"
- 代码以"能跑起来"为目标，容忍技术债

### 1.2 Hermes headless 适配

Hermes worker 在 headless 模式下无法物理驻场，但可通过**前线侦察步骤**获取等价的隐性知识：

| FDE 物理驻场 | Hermes 前线侦察 |
|-------------|----------------|
| 观察客户业务流程 | `read_file` 用户原始请求 + 相关代码 + AGENTS.md |
| 与客户交谈获取隐性知识 | `search_files` 搜索仓内已有上下文 |
| 了解客户组织历史 | `session_search` 查历史相关会话 |
| 深入行业专业语言 | `hindsight_recall` 查团队共享记忆 |
| 快速原型交付 | 先产出"上下文摘要"再执行 |

---

## 二、前线侦察步骤（标准作业循环第 2 步）

### 2.1 所有 worker 的标准作业循环修改

**修改前**（当前 SOUL.md）：
```
1. kanban_show()
2. 读本地相关代码/文档
3. 执行任务
...
```

**修改后**：
```
1. kanban_show()
2. 前线侦察（见下）        ← 新增
3. 执行任务
...
```

### 2.2 前线侦察清单

worker 接到任务后，**在执行任何实质操作前**，必须完成以下侦察（尽可能并行）：

#### 2.2.1 读取任务上下文
```python
# 读取上游交接物
task = kanban_show()
# 读 body 中的 context / ontology_refs
# 读 parents 的 CompletionHandoff
```

#### 2.2.2 读取本地代码库（并行）
```python
# 读 AGENTS.md / CLAUDE.md / .cursorrules
read_file("AGENTS.md")
# 搜索仓内相关代码
search_files(pattern="<相关关键词>", target="content")
# 搜索仓内相关文件
search_files(pattern="*<相关模式>*", target="files")
```

#### 2.2.3 查历史会话（并行）
```python
# 查同类任务的历史会话
session_search(query="<任务相关关键词>", limit=3)
```

#### 2.2.4 查团队共享记忆（并行）
```python
# 查团队 hindsight bank
hindsight_recall(query="<任务领域关键词>")
```

#### 2.2.5 查相关 skill（并行）
```python
# 查已安装 skill 中是否有相关
skills_list()
```

### 2.3 上下文摘要

侦察完成后，**必须**将摘要写入 `kanban_comment`：

```markdown
## 前线侦察摘要

**任务目标**: <一句话复述>
**任务复述**: <费曼式用自己的话重构本任务：目标是什么、冻结验收标准逐条对应（每条验收项在复述中有对应句子，可用 `- [x] 验收项N → 复述句` 勾选表达）、边界与不做什么。禁止照抄任务卡原文——与 body 的 8-gram 重叠 >50% 判为照抄，照抄 = 未通过>
**上游交接物**: <parent task 的 artifacts/findings/decisions>
**本地代码现状**: <相关文件、关键函数、现有测试>
**历史经验**: <同类任务历史会话要点 / hindsight 记忆>
**适用 skill**: <已加载或可加载的 skill>
**风险与约束**: <识别到的风险、依赖、权限限制>
**执行计划**: <基于侦察结果的具体执行步骤>
**领域知识地图**: <仅当 §2.3.1 触发条件命中时必填：基础概念/结构逻辑/应用场景/关联依赖/拓展方向 五模块各一行；触发条件未命中可省略>
```

**机械执行点**（三段独立检查，非单一「N 中取 M」，2026-08-28 认知融合修订）：
- `kanban_comment` 必须含 `## 前线侦察摘要` 标题
- **基础 7 字段**（任务目标/上游交接物/本地代码现状/历史经验/适用 skill/风险与约束/执行计划）至少含 **5 个**
- **任务复述必填**，且满足验收项覆盖率：任务 body 中冻结验收标准每一条在复述中有对应句子；照抄检测：与 body 原文的 8-gram 重叠 >50% = 照抄 = 打回重侦察
- **领域知识地图条件必填**：§2.3.1 触发条件命中时必填，但不计入基础 7 字段计数
- 未写侦察摘要就开始执行 = 任务未完成

#### 2.3.1 领域知识地图触发启发式（FDE 融合认知方法，2026-08-28）

「陌生领域」由机械启发式判定（满足其一即触发必填），不由 worker 自评自由裁量：

1. 侦察时「适用 skill」字段为空（无可加载的领域 skill）
2. `search_files` 在仓内搜不到相关本地文件/术语
3. 任务涉及该 worker profile 首次出现的 board 或 ontology 域
4. 任务标题/正文含明显新领域关键词（与该 profile 历史 task 对比无命中）

知识地图五模块与 §2.4 六层上下文映射互补：地图是**语义层的结构化产出物**——写地图 = 把散落的语义上下文组织成先大纲后细节的框架，后续执行中新知识点归入对应模块，迷失时回看地图。

### 2.3.2 照抄检测参考脚本（机械层，LLM 不目测）

```bash
# 8-gram 重叠率：复述与 body 的 8 连词重叠 >50% 判照抄（阈值可按语言调整）
python3 - <<'EOF'
import re, sys
def ngrams(t, n=8):
    w = re.findall(r'\S+', t)
    return set(tuple(w[i:i+n]) for i in range(len(w)-n+1))
body, restyle = open(sys.argv[1]).read(), open(sys.argv[2]).read()
b, r = ngrams(body), ngrams(restyle)
print(f"overlap: {len(b & r)/max(len(r),1):.0%}")
# >50% → 照抄，打回重侦察
EOF
```

### 2.4 六层上下文映射（FDE 融合 P2-E，2026-08-25）

FDE 上下文框架把"当前任务所需的业务上下文"拆成六层。前线侦察四件套已覆盖大半，按此映射**缺哪层补哪个工具**：

| 上下文层 | 含义 | 侦察工具 |
|---|---|---|
| 数据上下文 | 有哪些数据/文件、来自哪里 | `read_file` + `search_files`（2.2.2） |
| 语义上下文 | 字段/状态/术语意味着什么 | `_shared/02-org-orchestration/ontology.md` + 领域 skill |
| 知识上下文 | 历史案例、专家经验、既有规则 | `skills_list`（2.2.5）+ `hindsight_recall`（2.2.4） |
| 运行上下文 | 任务当前状态、之前发生过什么 | `kanban_show`（2.2.1）+ `session_search`（2.2.3） |
| 用户上下文 | 请求者是谁、偏好、权限 | memory（注入）+ `hindsight_recall(query="用户偏好")` |
| 任务上下文 | 这次到底要完成什么 | `kanban_show` body + 验收标准 |

**缺层信号**：侦察后发现某层完全空白（如语义层——看不懂领域术语），先补该层（查 ontology/skill/询问上游），不要带着空白层硬执行。

### 2.5 侦察失败的降级

如果某项侦察失败（如无历史会话、无 hindsight 记忆）：
- 在摘要中标注"未找到"
- 不阻塞执行，但标注"基于有限上下文执行"

---

## 三、Staged Action 协议（不可逆动作的暂存机制）

### 3.1 与前线侦察的关系

前线侦察是**执行前**的上下文获取；Staged Action 是**执行不可逆动作前**的暂存确认。两者互补。

### 3.2 Staged Action 触发条件

当 worker 即将执行 `ontology.md` 中 `reversible=false` 的 action 时：

| Action | 触发 staged |
|--------|------------|
| `kanban_complete` | ❌ 不触发（完成是正常流程） |
| `acp_send` | ✅ 触发（外部调用） |
| `delegate_task` | ✅ 触发（派生子 agent） |
| `cronjob` | ✅ 触发（定时任务） |
| `computer_use` | ✅ 触发（桌面操作） |
| `browser_*` | ✅ 触发（浏览器操作） |
| `terminal` (不可逆命令) | ✅ 触发（如 `git push`, `rm`, 部署） |

### 3.3 Staged Action 流程

```
步骤 1: worker 提议动作
  → kanban_comment(body="<staged-action-proposal>")
  提案格式：
    ## Staged Action Proposal
    **动作**: <action 名 + 参数>
    **意图**: <为什么执行>
    **影响范围**: <哪些文件/服务/用户受影响>
    **回滚命令**: <如何回滚>
    **预计后果**: <成功和失败分别会怎样>

步骤 2: 等待确认
  - shared_state 级别 → orchestrator 或 reviewer 确认
  - high_risk 级别 → 用户确认（headless 下 kanban_block）

步骤 3: 执行
  - 真实执行 → 记录 exit_code + 输出
  - 前线侦察摘要中的执行计划应有此步骤

步骤 4: 验证
  - 成功 → kanban_complete
  - 失败 → 回滚 → kanban_block(reason="staged action 失败，已回滚")
```

### 3.4 源码改动 staged 协议增补

凡改 hermes 本体源码的 staged-action-proposal，除 3.3 通用字段外，必须额外包含以下两字段：

| 字段 | 内容 |
|------|------|
| **预期改动文件清单** | 列出所有预期修改的文件路径；实际 `git diff` 文件清单必须 ⊆ 该清单，超出需在 comment 显式说明理由 |
| **自测基线对比承诺** | 承诺交付前自跑相关测试，并给出「改动前失败数 vs 改动后失败数」的基线对比数据 |

机械核查点：`git diff --name-only` 输出 ⊆ staged 声明清单；基线对比数据存在于 `kanban_comment` 或 `kanban_complete` metadata。

### 3.5 紧急豁免

对于明显可逆或低风险的不可逆动作（如 `delegate_task` 派生只读调研子 agent），可豁免 staged：
- 在 SOUL.md 中声明豁免清单
- orchestrator 路由时对豁免清单内的 action 不强制 staged

---

## 四、Mission Coordinator（任务协调者）

> ⚠️ **2026-09-01 FDE 融合审计修正**：本节原引用的 5 个 profile（project-manager / architect / worker-reviewer / worker-deployer / requirement-analyst）经 `ls ~/.hermes/profiles/<name>` 机械验证**全部不存在**——属文档腐烂（引用了从未落地或已删除的实体，正是文14「三条接缝」判据中"语义上下文断裂"的本地实例）。现按集群实际 27 profile 重写本节；旧 squad 表以删除线保留一轮供 diff 对照，下轮审计可清。

### 4.1 与 Forward-Deployed 的关系

Forward-Deployed Worker 在前线执行；Mission Coordinator 在后方编排。对应 Palantir 的 FDE（前线）和 Deployment Lead（后方协调）。

### 4.2 Mission Coordinator 职责（由真实存在的 profile 承担）

Mission Coordinator 不是独立 profile，而是**编排职能**，由以下真实 profile 按场景承担：

| 场景 | Coordinator 承担者（已验证存在） | 前线 worker |
|---|---|---|
| 跨 team 编排 | `orchestrator` | 各 team worker |
| [已移除] 领域编排 | `[已移除]-orchestrator` | [已移除]-* 六师 |
| 功能开发 mission | `worker-coder`（自编排子任务） | worker-tester |
| 技术调研 mission | `worker-researcher` | — |
| 安全审计 mission | `hack-recon`（侦察）+ `hack-auditor`（审计） | hack-exploit |
| 缺陷修复 mission | `worker-coder` + `worker-tester` | — |
| 部署发布 mission | `ops-devops` + `ops-sre` | worker-tester |

职责不变：1) 接收 mission 2) 自己也做前线侦察 3) 组建 squad（只选下表真实 profile）4) `kanban_create(parents=[...])` 建依赖链 5) 监控进度 6) 处理阻塞 7) 汇总完成。

**机械校验（派单前必跑）**：
```bash
# 派单前验证 assignee 真实存在——防止 dispatcher 静默丢弃（看板纪律，此处二次强调）
test -d ~/.hermes/profiles/<assignee> || echo "✗ assignee 不存在，禁止派单"
```

### 4.3 虚拟 Squad 编组（仅限真实 profile）

~~每个 mission 动态组建 squad（从 8 个 worker 中选）：~~

~~| 功能开发 | architect + worker-coder + worker-reviewer + worker-tester |~~
~~| 部署发布 | worker-deployer + worker-tester + ops-sre |~~
~~| 技术调研 | worker-researcher + architect |~~
~~| 安全审计 | hack-auditor + worker-reviewer |~~
~~| 缺陷修复 | worker-coder + worker-tester + worker-reviewer |~~

修正后的合法 squad（全部经 `ls` 验证存在，2026-09-01）：

| Mission 类型 | 合法 squad |
|---|---|
| 功能开发 | worker-coder + worker-tester（review 走 kanban review 通道，无独立 reviewer profile） |
| 部署发布 | ops-devops + ops-sre + worker-tester |
| 技术调研 | worker-researcher |
| 安全审计 | hack-recon + hack-auditor（+ hack-exploit 按需） |
| 缺陷修复 | worker-coder + worker-tester |
| [已移除] 调研/实现 | [已移除] / [已移除] / [已移除] / [已移除] 按域选 |
| [已移除] 教学 | [已移除]-orchestrator → [已移除]-* 六师 |

编组通过 `kanban_create(parents=[mission_task])` 实现，每个 worker 任务是 mission 的子任务。**引用不存在的 assignee = dispatcher 静默丢弃**（卡片永久滞留 ready）——这是比 squad 设计错误更严重的故障模式。

---

## 五、验证清单

### 5.1 前线侦察验证

```bash
# 验证所有 worker SOUL.md 含前线侦察步骤（数量动态化，2026-08-24 修正：原期望值 29 与集群实际 27 profile 漂移）
total=$(ls -d ~/.hermes/profiles/*/SOUL.md | wc -l | tr -d ' ')
wired=$(grep -l "前线侦察" ~/.hermes/profiles/*/SOUL.md | wc -l | tr -d ' ')
echo "$wired / $total profiles wired"
# 期望: wired == total（orchestrator 作为路由入口可豁免 1）

# 验证 SOUL 不内嵌侦察摘要模板全文（防止第二事实源漂移，2026-08-28 认知融合增补）
# SOUL 只允许引用标题 "## 前线侦察摘要" + 指向 _shared/01-scheduling-bus/forward-deployed-protocol.md 的指针，
# 不允许内嵌 **任务目标** 等字段模板全文（领域定制走「领域字段追加」而非全文复制）
drift=$(grep -l '任务复述\*\*' ~/.hermes/profiles/*/SOUL.md 2>/dev/null | wc -l | tr -d ' ')
echo "SOUL 内嵌模板全文数: $drift"
# 期望: 0（内嵌 = 第二事实源，模板演进时必漂移——2026-08-28 蓝军 F1 判例）
```

### 5.1.1 模板演进同步校验（2026-08-28 增补）

```bash
# 模板演进后校验：引用方 SOUL 无需改动（引用标题自动继承），
# 但需确认含"标准作业循环"的 SOUL 仍引用同一标题，且无 SOUL 自创字段清单：
grep -rn '前线侦察摘要' ~/.hermes/profiles/*/SOUL.md | grep -v 'kanban_comment\|详见\|forward-deployed'
# 期望: 无输出（残留的字段清单式引用 = 待清理副本）
```

### 5.2 Staged Action 验证

```bash
# 验证所有 worker SOUL.md 含 staged action 协议（数量动态化，2026-08-24 修正）
grep -l "staged-action" ~/.hermes/profiles/*/SOUL.md | wc -l
# 期望: 等于 profile 总数（ls -d ~/.hermes/profiles/*/SOUL.md | wc -l）
```

### 5.3 Mission Coordinator 验证

```bash
# 验证 project-manager 含 mission coordinator
grep -l "Mission Coordinator" ~/.hermes/profiles/project-manager/SOUL.md | wc -l
# 期望: 1
```

---

## 版本

- v1.0 (2026-07-31): 初始版本
- v1.1 (2026-08-24): §五验证脚本修正——期望值 29 与集群实际 27 profile 漂移导致恒假，改为动态统计（ls + grep 对比）
- v1.2 (2026-08-28): 认知方法融合（微信文章《6大学习法则》×《6套思辨范式》+ 蓝军 5-lens 评审修订）——§2.3 新增「任务复述」（费曼技巧，判据=验收项覆盖率+8-gram 照抄检测）与「领域知识地图」（全局知识地图，条件必填）字段；§2.3.1 触发启发式；§2.3.2 照抄检测脚本；机械执行点改三段独立检查；§5.1 增补内嵌模板漂移校验；§5.1.1 模板演进同步校验


---

## 附录：reportDelivery 唤醒机制（原 reportdelivery-protocol.md，2026-08-25 F6 并入，同属 FDE/子代理交互域）

> 来源：DeepSeek Harness rc.8 `reportDelivery: 'next-step'` + Job Panel 统一管理
> 融合日期：2026-08-21
> 原则：零代码等效——全部走 prompt/规则层，不改 ACP 协议、不改 Python 源码
> 核心痛点解决：ACP `acp_send` 超时后父任务不知子代理状态（5.5 小时悬挂案例）

---

## 1. 核心概念

### reportDelivery（子代理报告投递）

DSH RC8 引入 `reportDelivery: 'quiet' | 'next-step'` 机制：
- **next-step**（默认）：子代理通过 `report` 工具主动向父代理投递消息，父代理在**最近 step 边界**被唤醒
- **quiet**：子代理报告加入上下文但不唤醒父代理，父代理等待其他输入

### Hermes 等价物

Hermes 没有 `reportDelivery` 原生机制，但可通过以下组合等效实现：
- **kanban_comment**：子代理在阶段性发现时向任务卡投递评论
- **kanban_heartbeat**：子代理定期心跳，父任务轮询检查
- **delegate_task steer**：父任务向子代理发送 course-correction

---

## 2. 触发条件（何时子代理应中途上报）

子代理在以下情况**必须**通过 `kanban_comment` 中途上报，而非等任务结束：

| 场景 | 上报内容 | 紧急度 |
|---|---|---|
| **阶段性发现改变父决策** | 发现关键证据/风险/机会，父任务可能需要调整方向 | 🔴 高 |
| **遇到阻塞无法继续** | 缺少凭据/权限/信息，需要父任务或人类决策 | 🔴 高 |
| **任务范围膨胀** | 发现实际工作量远超预期，需要重新评估 | 🟡 中 |
| **完成关键里程碑** | 阶段性成果已产出，可供父任务预览 | 🟢 低 |
| **预计超时** | 任务执行时间将超 `max_runtime_seconds` | 🟡 中 |

---

## 3. 上报协议（kanban_comment 格式）

```markdown
## reportDelivery: next-step

**阶段**: [1/3] 调研阶段完成
**发现**: <一句话核心发现>
**影响**: <对父任务决策的影响>
**建议**: <建议父任务采取的动作>
**附件**: <如有文件路径>

---
**子代理状态**: running（预计剩余 30 分钟）
**下一步**: <子代理接下来的工作计划>
```

### 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `reportDelivery` | 是 | 固定值 `next-step`（唤醒父任务）或 `quiet`（仅记录） |
| `阶段` | 是 | 当前阶段标识（如 [1/3]） |
| `发现` | 是 | 核心发现的一句话摘要 |
| `影响` | 是 | 对父任务决策的影响分析 |
| `建议` | 是 | 建议父任务采取的动作 |
| `子代理状态` | 是 | running / blocked / completed |
| `下一步` | 否 | 子代理接下来的工作计划 |

---

## 4. 父任务响应协议

父任务（orchestrator / 发起 worker）收到 `reportDelivery: next-step` 评论后：

1. **立即评估**：发现是否改变当前任务方向？
2. **决策**：
   - **继续**：子代理建议合理，不干预，等最终完成
   - **调整**：`delegate_task(action='steer', subagent_id=..., message=...)` 发送 course-correction
   - **停止**：`delegate_task(action='stop', subagent_id=...)` 终止子代理，记录原因
   - **升级**：`kanban_block(kind="needs_input", reason=...)` 请求人类决策
3. **留痕**：`kanban_comment` 记录决策理由

---

## 5. Job Panel 等效机制（kanban 看板）

DSH RC8 的 Job Panel 提供统一的子代理任务管理视图。Hermes 等价物：

| DSH Job Panel | Hermes 等价物 | 说明 |
|---|---|---|
| `job_list` | `kanban_list(status="running")` | 查看运行中任务 |
| `job_output` | `kanban_show(task_id=...)` | 查看任务详情+评论 |
| `job_kill` | `kanban_block(kind="cancelled")` | 终止任务 |
| `session/jobs` 帧 | `kanban_heartbeat` | 任务心跳 |

**统一视图**：orchestrator 可通过 `kanban_list` 跨 board 查看所有运行中任务，实现 Job Panel 的统一管理功能。

---

## 6. 自激链预算（防无限唤醒）

DSH RC8 引入 `maxConsecutiveWakes`（默认 3）：同一 owner 由完成唤醒开启的 turn 数上限，超出降级为 inject。

**Hermes 等效规则**：
- 同一任务 1 小时内最多 3 次 `reportDelivery: next-step` 唤醒
- 超出后子代理应使用 `reportDelivery: quiet`（仅记录不唤醒）
- 父任务可在 `kanban_create` 时设置 `max_reports: N` 限制

---

## 7. 反模式

- ❌ **子代理每 5 分钟发一次 next-step**（报告通胀，父任务被频繁打断）
- ❌ **子代理完成后才发报告**（失去了中途唤醒的意义）
- ❌ **父任务收到报告后不响应**（子代理不知道是否该继续）
- ❌ **用 next-step 报告琐碎进展**（"已完成 10%" 不构成唤醒理由）

---

## 8. 与现有机制的关系

| 机制 | 关系 | 说明 |
|---|---|---|
| `kanban_comment` | 载体 | reportDelivery 的投递通道 |
| `kanban_heartbeat` | 互补 | heartbeat 是"我还活着"，reportDelivery 是"我有重要发现" |
| `delegate_task steer` | 响应 | 父任务调整子代理方向的通道 |
| `kanban_block` | 升级 | 子代理阻塞时的升级路径 |
| `acp_send` | 底层 | ACP 长任务悬挂问题的上层缓解 |

---

## 9. 落地检查清单

- [ ] 子代理 SOUL.md 包含 reportDelivery 触发条件
- [ ] 子代理 SOUL.md 包含 kanban_comment 上报格式
- [ ] orchestrator SOUL.md 包含父任务响应协议
- [ ] 自激链预算规则（1 小时 3 次上限）已记录

---

## SOUL 内单行引用

```
reportDelivery 唤醒（详见 _shared/01-scheduling-bus/forward-deployed-protocol.md 附录）：子代理阶段性发现必须 kanban_comment 中途上报（next-step），父任务评估后 steer/stop/继续/升级，1 小时 3 次唤醒上限。
```
