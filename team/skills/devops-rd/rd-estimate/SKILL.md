---
name: rd-estimate
description: 研发工作量估算 —— 基于 GB/T 36964-2018 与 COSMIC 方法推导的 AI agent 任务规模度量
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [rd, estimate, workload, cost, kanban]
    related_skills: [rd-decompose, rd-apply, rd-validate, verify-requirement]
---

# /rd:estimate — 研发工作量估算

> **对应文章命令**：`/rd:estimate`（工作量估算，输出规模/工作量/预算）  
> **触发**：rd-decompose 完成，需基于拆解结果给出可解释的规模、工作量和预算估计  
> **作用**：读取拆解结果，计算 AFP → UF，输出符合契约的 JSON

---

## 一、定位与调用时机

rd-decompose 负责应用边界、依赖和轻量 effort_tier；rd-estimate 负责在拆解结果之上给出可解释的规模、工作量和预算估计。调用顺序固定为：

1. rd-analyze：形成需求摘要
2. rd-decompose：生成每个应用的 requirement.md，并给出 effort_tier（S/M/L/XL/unknown）
3. rd-estimate：读取已确认的拆解结果，补齐可计量输入、估算工作量，并输出估算对象
4. 人工/编排器确认估算与不确定性后，才进入 rd-apply

rd-estimate 不得隐式创建任务、修改代码、读取密钥或联网；它是纯估算步骤。估算无法成立时必须显式返回 unknown/拒绝，而不是补猜数字。

---

## 二、方法论

### 2.1 原理来源

| 标准 | 章节 | 贡献 |
|------|------|------|
| GB/T 36964-2018 | 规模→工作量→成本三步流程框架 | 估算流程骨架 |
| COSMIC Methods | 4 类数据移动（Entry/Exit/Read/Write） | 规模度量模型 |
| 本技能 | Agent Function Point (AFP) 映射 | AI agent 任务适配 |

### 2.2 适配映射

| 传统概念 | AI Agent 等价 | 说明 | 度量方式 |
|----------|--------------|------|----------|
| ILF/EIF | N/A | Agent 无持久化数据层 | - |
| EI/EO/EQ | Entry/Exit | Agent 的工具调用/输出 | 计数 tool_call/exit |
| CFP | AFP | 最小单元：1 次 tool_call 或 1 次文件 patch | 基于工具类型归类 |

### 2.3 计量模型

**基准权重（Base Weight）**：小心遵循契约 §3 定义。

| 功能类型 | low | med | high |
|----------|-----|-----|------|
| ILF | 7 | 10 | 15 |
| EIF | 5 | 7 | 10 |
| EI | 3 | 4 | 6 |
| EO | 4 | 5 | 7 |
| EQ | 3 | 4 | 6 |

**复用因子（reuse）**：high → 1/3，mid → 2/3，low → 1

**变更因子（change_type）**：add → 1，modify → 0.8，delete → 0.2

**UF = Σ(BaseWeight)**（不乘复用/变更系数，仅用于规模度量）

**US = Σ(BaseWeight × reuse × change_type)**（用于工作量估算）

**质量因子**：`qf = 1 + 0.025 × Σ(quality_factors)`，每个 factor ∈ [0,4]

**工作量**：`hours = US × productivity × qf × workload_share`

**人天**：`person_months = hours / hours_per_month`（默认 160h/月）

**成本**：`cost = person_months × rate_per_person_month`（rate 可为 null）

---

## 三、接口实现

### 3.1 输入契约

见 `/tmp/rd-estimate-contract.md` §2 输入契约。

### 3.2 输出契约

见 `/tmp/rd-estimate-contract.md` §3 输出契约。

### 3.3 使用示例

```bash
# 成功样例
python3 estimate.py input.json > output.json   # rc=0

# 典型输入（简化版）
{
  "schema_version": "rd-estimate/v1",
  "task_id": "t_123456",
  "decomposition": {
    "app": "my-service",
    "goal": "实现用户登录",
    "acceptance": ["接口返回 200", "用户可查询 profile"]
  },
  "scope": {
    "system_boundary": "auth 服务边界",
    "users": [{"type": "program", "name": "login_api"}]
  },
  "functions": {
    "data": [{"id": "d1", "kind": "ILF", "complexity": "med"}],
    "transactional": [{"id": "t1", "kind": "EI", "complexity": "low"}]
  },
  "adjustment": {
    "reuse": "mid",
    "change_type": "add",
    "quality_factors": {"reliability": 1, "performance": 0},
    "workload_share": 1.0
  },
  "workload": {
    "productivity_hours_per_size": 6.46,
    "hours_per_month": 160,
    "rate_per_person_month": 30000,
    "evidence_class": "observed",
    "productivity_source": "t_5c5c7d5a"
  },
  "budget": {
    "goal_max_turns_estimate": 15,
    "history_anchor": "t_123456"
  }
}
```

---

## 四、验证清单

| 项目 | 检查方式 | 期望结果 |
|------|----------|----------|
| 语法检查 | `python -m py_compile estimate.py` | exit_code=0 |
| 成功估算 | 运行 test_success_estimate 用例 | rc=0, JSON 完整 |
| 缺字段校验 | 运行 test_missing_top_level | rc=2, INVALID_INPUT |
| 外部示例禁用 | 运行 test_external_example_forbidden | rc=4, FORBIDDEN_RUNTIME_BASIS |
| 区间校验 | 运行 test_out_of_range_quality_factor | rc=2, quality_factors 越界 |
| 空功能点 | 运行 test_insufficient_evidence | rc=3, INSUFFICIENT_EVIDENCE |

---

## 五、错误码

| rc | 错误码 | 含义 | 处理建议 |
|----|--------|------|----------|
| 0 | - | 估算成功 | 输出 JSON 到 stdout |
| 2 | INVALID_INPUT | 输入结构损坏、字段非法、数值为无限 | 检查 schema/字段/值 |
| 3 | INSUFFICIENT_EVIDENCE | data/transactional 均为空，无法计数 | 补充功能点或返回 unknown |
| 4 | FORBIDDEN_RUNTIME_BASIS | evidence_class=external_example 用作预算 | 用 observed 或 user_input |
| 5 | INTERNAL_ERROR | 脚本异常，未伪造结果 | 查看 stderr 排查，反馈 bug |

---

## 六、部署验证

```bash
# 1. 语法检查
python -m py_compile ~/.hermes/skills/devops-rd/rd-estimate/estimate.py

# 2. 单元测试
cd ~/.hermes/skills/devops-rd/rd-estimate/tests
pytest test_estimate.py -v

# 3. 完整构建（可选）
python -m build  # 若声明 wheel/sdist，则需 pyproject.toml
```

---

## 七、变更记录

| 版本 | 日期 | 变更内容 | 变更人 |
|------|------|----------|--------|
| 1.0.0 | 2026-09-22 | 初版，完成方法论落地、接口实现、测试覆盖 | worker-coder |