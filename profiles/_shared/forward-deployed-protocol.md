# Forward-Deployed Protocol（前线部署协议）

> 灵感来源：Palantir Forward Deployed Engineer (FDE) — 嵌入目标环境一线，获取隐性知识，快速产出可用原型
> 适用范围：所有 Hermes worker profile（headless 模式下用「前线侦察」步骤适配）
> 强制级别：🔴 所有 worker SOUL.md 的「标准作业循环」必须包含前线侦察步骤

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
**上游交接物**: <parent task 的 artifacts/findings/decisions>
**本地代码现状**: <相关文件、关键函数、现有测试>
**历史经验**: <同类任务历史会话要点 / hindsight 记忆>
**适用 skill**: <已加载或可加载的 skill>
**风险与约束**: <识别到的风险、依赖、权限限制>
**执行计划**: <基于侦察结果的具体执行步骤>
```

**机械执行点**：
- `kanban_comment` 必须含 `## 前线侦察摘要` 标题
- 摘要至少含上述 7 个字段中的 5 个
- 未写侦察摘要就开始执行 = 任务未完成

### 2.4 侦察失败的降级

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

### 3.4 紧急豁免

对于明显可逆或低风险的不可逆动作（如 `delegate_task` 派生只读调研子 agent），可豁免 staged：
- 在 SOUL.md 中声明豁免清单
- orchestrator 路由时对豁免清单内的 action 不强制 staged

---

## 四、Mission Coordinator（任务协调者）

### 4.1 与 Forward-Deployed 的关系

Forward-Deployed Worker 在前线执行；Mission Coordinator 在后方编排。对应 Palantir 的 FDE（前线）和 Deployment Lead（后方协调）。

### 4.2 Mission Coordinator 职责

`project-manager`（swarm）增强为 Mission Coordinator：

1. **接收 mission** — 从 orchestrator 或 requirement-analyst 接收高维目标
2. **前线侦察（自己也要做）** — 理解 mission 上下文
3. **组建虚拟 squad** — 从 8 个 worker profile 中选合适的人选
4. **设置依赖链** — `kanban_create(parents=[...])` 建立任务图
5. **监控进度** — 定期检查 squad 状态
6. **处理阻塞** — worker block 时协调解决
7. **完成汇总** — squad 全部完成后 `kanban_complete`

### 4.3 虚拟 Squad 编组

每个 mission 动态组建 squad（从 8 个 worker 中选）：

| Mission 类型 | 典型 squad |
|-------------|-----------|
| 功能开发 | architect + worker-coder + worker-reviewer + worker-tester |
| 部署发布 | worker-deployer + worker-tester + ops-sre |
| 技术调研 | worker-researcher + architect |
| 安全审计 | hack-auditor + worker-reviewer |
| 缺陷修复 | worker-coder + worker-tester + worker-reviewer |

编组通过 `kanban_create(parents=[mission_task])` 实现，每个 worker 任务是 mission 的子任务。

---

## 五、验证清单

### 5.1 前线侦察验证

```bash
# 验证所有 worker SOUL.md 含前线侦察步骤
grep -l "前线侦察" ~/.hermes/profiles/{architect,project-manager,requirement-analyst,worker-*,hack-*,product-*,ops-*,[已移除]-*}/SOUL.md | wc -l
# 期望: 29（所有非 orchestrator profile）
```

### 5.2 Staged Action 验证

```bash
# 验证所有 worker SOUL.md 含 staged action 协议
grep -l "staged-action" ~/.hermes/profiles/*/SOUL.md | wc -l
# 期望: 29
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
