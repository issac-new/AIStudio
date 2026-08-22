---
name: rule-system-verification
description: "规则系统验收方法论：双态 fixture（violating/compliant）+golden-vector 基线+环境 SKIP 如实登记。用于测试 skill/门禁/hook 等规则系统的行为等价。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, verification, fixture, golden-vector, testing-methodology, swarm-yuan-fusion]
    related_skills: [evaluating-llms-harness, loop-engineering-gates, test-driven-development]
---

# Rule-System Verification（规则系统验收方法论）

> 来源：swarm-yuan `/verifier/v1/`（双态 fixture + golden-vector + cli A/B 字节级等价 + SKIP 如实登记），适配 Hermes skill/hook/门禁的测试。
> 定位：**完成时防线**——Hermes 有模型评测（evaluating-llms-harness），缺**规则系统的行为等价验收**方法论，本 skill 补上。

## 触发条件 / When to Use

- 新写或修改任何"规则系统"：precheck 门禁脚本、skill 中的验证逻辑、hooks、kanban 内核校验
- 规则系统升级后需要回归验证"行为没变/按预期变"
- worker-tester 验收规则类产物时

## 核心内容

### 1. 三板斧

| # | 机制 | 说明 |
|---|---|---|
| 1 | **双态 fixture** | 每个规则配两个 fixture：`violating/`（违规则，期望 exit 1/报告失败）+ `compliant/`（合规则，期望 exit 0/通过）。只测 compliant 等于没测——规则可能对一切都放行 |
| 2 | **golden-vector 基线** | 关键输出（退出码向量/报告摘要）固化成基线文件。变更基线必须**单行说明理由 + 链 commit**，不得静默改值 |
| 3 | **环境 SKIP 如实登记** | 环境不满足导致的跳过**不记为通过**，单独登记 SKIP 及原因 |

### 2. 双态 fixture 目录约定

```
tests/
├── fixtures/
│   ├── violating/      # 违反规则的输入
│   │   ├── case-01-<name>/
│   │   └── ...
│   └── compliant/      # 符合规则的输入
│       ├── case-01-<name>/
│       └── ...
└── golden/
    └── exit-codes.vector   # 每行: <case-path> <expected-exit-code>
```

运行契约：
- violating 用例全 exit≠0 → 规则的"拒绝力"验证
- compliant 用例全 exit=0 → 规则的"放行力"验证
- 两个维度都绿才算规则健康

### 3. golden-vector 纪律

- 基线文件纳入版本控制
- 修改基线的 commit message 必须单行说明：`bump golden: case-03 now exits 2 because <理由>`
- diff 中基线变更无对应说明 → 审查直接打回
- 回归记录**只增不改**：历史结果追加，不改写（与 memlog 不变量同构）

### 4. SKIP 登记格式

```
SKIP <case> | reason: <环境缺什么> | detected_at: <时间>
```

- SKIP ≠ PASS，汇总时单独计数
- CI 中 SKIP 率 >20% 触发告警（规则没有被真实验证）

### 5. 与行为等价的 A/B 验证（规则系统重写时）

新旧实现并行跑同一 fixture 集，输出字节级对比：
- 完全一致 → 重构安全
- 差异逐个裁决：预期变化（更新 golden + 说明）/ 意外回归（修）

## 与其他 skill 的联动

- `loop-engineering-gates`：验收门中规则系统产物的验收标准
- `test-driven-development`：TDD 管代码正确性；本 skill 管**规则系统的拒绝力+放行力**
- `evaluating-llms-harness`：模型评测方法论；本 skill 面向确定性规则系统，互补
- `adversarial-review-lens`：审查规则系统产物时的验收 checklist

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| 新 skill 含验证脚本 | 必须配双态 fixture |
| kanban 内核/调度逻辑变更 | golden-vector 基线回归 |
| worker-tester | 按本方法论验收规则类任务卡 |
| CI | SKIP 率监控 |
