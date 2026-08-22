---
name: adversarial-review-lens
description: "对抗评审纪律：多 lens 并行+severity 父定+发现五分类+空结果重查+Goal-Backward FORCE 立场+逻辑剃刀谬误图谱+abstain 弃权语义。用于 code-review 与 kanban 验收。"
version: 1.1.0
metadata:
  hermes:
    tags: [devops, code-review, adversarial, logic-razor, bmad-fusion, swarm-yuan-fusion]
    related_skills: [code-review, requesting-code-review, pua-harness-governance, loop-engineering-gates]
---

# Adversarial Review Lens（对抗评审镜头纪律）

> 来源：BMAD-METHOD v6 `bmad-review` 多 lens 架构 + 并行对抗评审 + swarm-yuan `gsd-patterns.md` Goal-Backward + `logic-razor.md` 逻辑剃刀 + `review-methodology.md` Honest Verifier Abstain，适配 Hermes code-review。
> 增补（2026-08-16）：LongHorizon-Harness（arXiv:2608.01964）三行控制头协议 + 验收约束反查，详见 `~/.hermes/profiles/_shared/task-contract-guard.md`。
> 定位：**完成时防线**——防止"看起来做完了"被验收通过，给 reviewer 一套对抗性思维纪律。

## 触发条件 / When to Use

- worker-reviewer 审查代码变更时
- kanban 任务 `kanban_complete` 前的验收复核
- worker-coder 自审 ACP 产出时
- reviewer 报告"零发现"时的可疑信号处理

## 核心内容

### 1. Goal-Backward FORCE 立场（swarm-yuan 核心）

> "假设阶段目标**未达成**，直到代码库证据证明它。"

| 纪律 | 表述 |
|---|---|
| 不信任 SUMMARY | SUMMARY 记录的是"说了什么"；审查验证"代码里实际存在什么" |
| 证据标准 | 每个 pass 判定必须能引用 file:line / 测试输出 / 构建退出码 |
| 发现分类 | 只有 BLOCKER / WARNING 两级（不设 nitpick，避免审查噪音） |
| 记录软化 | "记录审查者如何变软"—— reviewer 自己也要被审计 |

### 2. 并行 lens 架构（BMAD 核心）

多个 reviewer lens **并行发出、同步等待全部返回后才 triage**：

| lens | 审查焦点 |
|---|---|
| edge-case-hunter | 边界条件、空值、并发、溢出 |
| verification-gap | 声称做了但无测试/无验证证据的部分 |
| intent-gap | 代码与任务卡验收标准的偏差 |
| security-lens | 注入、密钥泄漏、越权 |
| mechanical-separation | LLM 判断是否泄漏到该走脚本的机械层 |

**严重度由父 agent（triage 者）定，lens reviewer 无权定级**——
"operate under by-design information asymmetry"，lens 只报告发现，不排序。

### 3. 发现五分类（BMAD triage 输出）

| 分类 | 含义 | 动作 |
|---|---|---|
| intent_gap | 代码与任务意图不符 | 打回重做 |
| bad_spec | 任务卡本身有缺陷 | `kanban_block(kind="needs_input")` |
| patch | 小修可解决 | 直接 patch |
| defer | 值得做但不在本卡范围 | deferred-work 记录 + 子任务 |
| reject | 误报 | 记录理由丢弃 |

### 4. 空结果重查纪律（BMAD M6）

- **对抗性 lens 零发现 = 可疑信号**，强制复查一次
- 对抗 lens（edge-case/security）期望产出 ≥10 条发现才算充分审查（视代码量调整）
- 编辑性 lens（typo/style）允许零发现

### 5. 逻辑剃刀（swarm-yuan 论证质量维度）

审查**论证结构**而非仅代码行为——四类谬误图谱（26 条，详见 swarm-yuan logic-razor.md:30-77）：

| 谬误类 | 典型 | 审查动作 |
|---|---|---|
| 偷换概念 | "性能提升了"（未说哪个指标） | 要求量化基线 |
| 循环论证 | "这个设计好因为它是最佳实践" | 要求独立证据 |
| 幸存者偏差 | "上次这么做没出问题" | 要求失败案例分析 |
| 虚假二分 | "要么这么做要么推翻重来" | 要求第三方案 |

**≥10% 瑕疵铁律**：审查对象中谬误密度 ≥10% → 整体打回，不接受"大体是对的"。
与 cognition-lattice 的分工：逻辑剃刀审**论证对象**，cognition-lattice 审**自身偏差**；
重叠部分（如确认偏误）以 cognition-lattice 239 偏差库为准。

### 6. Honest Verifier Abstain（弃权语义）

证据不足时**弃权**，不强行挑刺也不放行：

```
verdict: abstain
reason: insufficient_spec | insufficient_access | insufficient_evidence
needs: <什么补齐后才能审>
```

弃权映射到 `kanban_block(kind="needs_input", reason="review-abstain: ...")`。
razor↔abstain 裁决：证据完备 → 用逻辑剃刀判定；证据不足 → abstain，两处记录同步登记。

### 7. Reviewer Gate 分层呈现（BMAD C2）

审查报告呈现顺序固定：
1. **一句 gate verdict**（APPROVED / NEEDS_REVISION / REJECTED / ABSTAIN）
2. critical/high findings 逐条（file:line + 证据）
3. 中低合并一句 "plus N more in <file>"

### 8. 三行控制头 + 验收约束反查（LongHorizon-Harness 融合）

> 完整协议见 `~/.hermes/profiles/_shared/task-contract-guard.md`。本节是 reviewer 的执行摘要。

**输出格式**：验收报告前三行必须是三行控制头（缺头 = 无效报告，必须重出）：

```
状态: complete | incomplete | blocked
完整性: clean | suspect | violation
契约审计: aligned | unknown | needs_revision | invalid
```

**验收约束反查**（状态 complete 的前置条件）：不默认任务卡正确，从原始任务独立重建约束：
- `契约结论` 必须与第三行控制头一致，只有 aligned 允许 complete
- `逐项反查`：每条约束标注 verified / unknown / violated / not_applicable + 独立证据。**worker 自述和任务卡自述不是独立证据**
- 任何 blocking unknown → 契约结论 unknown；任何 blocking violated → needs_revision/invalid
- 存在阻断约束或契约结论 ≠ aligned → 即使局部成功也必须 incomplete

**完整性 suspect/violation 判据（防审计膨胀）**：
- 缺 worker 完整命令记录 ≠ 篡改证据，不能单独导致 suspect
- 只有正面矛盾、来源冲突、伪造证据、意外产物、禁用动作的直接证据才用 suspect/violation
- 不可观察的历史否定（"没法证明历史上没发生"）默认非阻断残余风险

**裁决矩阵**：`complete + clean + aligned` 三者同时成立才允许 kanban_complete；`violation 或 ≠aligned 时报 complete` → 强制降级 incomplete。

## 与其他 skill 的联动

- `code-review`：本 skill 是其对抗性增强——code-review 提供 APPROVED/NEEDS_REVISION/REJECTED 框架，本 skill 注入 FORCE 立场 + lens 并行 + 逻辑剃刀 + abstain 语义
- `requesting-code-review`：请求审查时声明需要哪些 lens
- `pua-harness-governance`：四权分离中"评分权"的执行细则
- `loop-engineering-gates`：验收门的审查环节调用本纪律

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| worker-reviewer profile | 审查任务卡时加载本 skill |
| `kanban_block(reason="review-required: ...")` | 附上 gate verdict + findings 分层 |
| `kanban_comment` | 审查报告按分层呈现结构写 |
| `delegate_task` | 多 lens 并行 = 并行 delegate 多个审查子任务，同步等全部返回再 triage |

## 机械工具：workspace_audit.py（只读审计防伪）

审查只读任务时，审计开始前拍快照、结束后 diff（照抄 LongHorizon-Harness `claude_permissions.py` 算法）：

```bash
PY=~/.hermes/skills/devops-worker/adversarial-review-lens/scripts/workspace_audit.py
python3 "$PY" snapshot --root <工作区> --out /tmp/ws_before.json   # 审计开始前
# ...执行只读审查...
python3 "$PY" diff --before /tmp/ws_before.json --root <工作区>    # 审计结束后
# exit 0=clean；exit 1=mutation detected → 完整性: violation，报告作废
# exit 2=运行错误（路径不存在/快照损坏），不是篡改信号
# 输出 JSON 含 added/changed/deleted/type_changed 四类清单
```

任何 diff 非空 = 审计者篡改了工作区 → 三行控制头第二行强制 `完整性: violation`，该报告不能支撑任何 completed 判定。已验证：clean 工作区 exit 0；改+增+删三动作全部检出 exit 1。
