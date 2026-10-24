# 验收三态协议（Acceptance Tri-State Protocol）

> 层级定位：共享验收契约层（`_shared/`）。
> 来源：handbook M7 Guardrail 三态门控 + tanweai/pua 3.5.1 pua-loop 外部验证门控。单处落盘：pua-loop merge 与 handbook M7 落地均指向本文件，禁两处各落一套。

---

## 一、问题定义

Agent 的完成声明存在自报完成风险：worker 把「未验证 / 验证失败 / 证据不足」包装成完成
（kanban 历史上 51% 完成任务零交接评论即同一风险面）。两源独立收敛到同一解法：

- handbook M7：生产发布门控三态 PASS/BLOCKED/UNKNOWN，**确定性系统机械聚合**——
  必检项缺失或存在 BLOCKED/UNKNOWN 时，不可能形成放行结果；
- pua-loop D1：完成声明前由**验收方（非模型自跑）**运行外部验证命令，exit 0 接受 / ≠0 拒绝并把验证输出喂回。

## 二、核心语义（两条硬语义，禁裁剪）

1. **UNKNOWN 不能当 PASS**。证据不足或验证未执行 ≠ 通过。任何检查项未真实执行、
   输出不可读、退出码未知，状态一律 UNKNOWN，按非 PASS 处理。
2. **Agent 不得自改判定口径**。已发布的检查项清单与三态判据属于契约；agent 可以优化调查方式，
   但不能修改检查目标、删减检查项、或重新解释状态语义来凑出 PASS。

## 三、三态定义

| 状态 | 判据 | 后续动作 |
|---|---|---|
| **PASS** | 检查项真实执行 + 退出码 0/通过 + 证据可引用（命令、输出摘要） | 可 complete |
| **BLOCKED** | 检查项真实执行 + 真实失败（退出码≠0 / 输出含失败事实） | 禁止 complete；block / request_changes / 修复后重验 |
| **UNKNOWN** | 检查项未执行 / 执行了但证据不足（输出为空、无法读取退出码、环境异常） | 按 BLOCKED 同等处理，**禁止当 PASS** |

任务无关的检查项从清单**移除**（并注明为何无关），不标 PASS——无关 ≠ 通过。

## 四、落地形态（三处接线）

### 4.1 kanban_complete 的 metadata.findings 三态标注

结构化完成声明中，`metadata.findings` 显式分类：

```python
metadata={
    "findings": [
        {"check": "pytest -q", "state": "PASS", "evidence": "8 passed in 2.1s"},
        {"check": "mypy src/", "state": "BLOCKED", "evidence": "src/x.py:12 error: ..."},
        {"check": "smoke test", "state": "UNKNOWN", "evidence": "venv 路径不存在，未执行"},
    ]
}
```

存在 BLOCKED 或 UNKNOWN 项时**禁止 complete**（走 block / request_changes / 修复后重验）。

### 4.2 外部验证门（pua-loop 语义的 Hermes 形态）

完成声明前的补充门：由验收方（reviewer / 下游 worker / 独立脚本）运行验证命令；
agent 自跑的验证输出是证据素材，**不替代**验收方独立运行。
锚句：独立功能检查由验收者在模型结束后运行，不是模型自己执行过的证据（tanweai/pua MODEL-MATRIX-20260909.md:21）。

### 4.3 skill 侧引用（禁止重复落盘）

以下 skill / 文档引用本协议，不各自复制语义：

- pua-pressure-engine「外部 Oracle」节；
- pua-harness-governance「验收五单列」段；
- semantica-runtime SKILL.md 设计约束段。

发现第二处试图完整落三态语义时：改为引用本文件路径，不新增副本。

### 4.4 WAIVED 豁免出口

> 来源：Universal Delivery Gate Framework (QGate) v0.1 §17/§20（存档 `workspace/research/qgate-fusion-20260923/`）。
> 本节是三态的**出口扩展**，不改 §二两条硬语义、不改 §三三态判据本体。

BLOCKED/UNKNOWN 项按 §三应禁止 complete，但存在例外情形：检查项**确认与任务无关**（§三已允许移除）之外的**显式接受**场景——

- 检查项执行路径客观不可用（环境/依赖缺失，且补环境成本显著超任务价值）；
- 检查项对应能力已在更高层级被覆盖（如 evals 基线已覆盖该回归面）。

满足上述情形时，该项可记 **WAIVED**（豁免），但豁免必须六字段齐备，缺一即视为 UNKNOWN：

| 字段 | 含义 |
|---|---|
| reason | 豁免理由（指向具体不可用事实，非"来不及"） |
| scope | 豁免范围（仅本任务/本检查项，禁扩大到任务类） |
| approver | 批准人（用户裁决或 orchestrator，**worker 不得自我豁免**） |
| mitigation | 缓解措施（替代验证/后续补验入口） |
| expiration | 有效期（到期自动失效回 UNKNOWN，需重新豁免） |
| revalidation | 复验触发条件（何种变更使豁免作废） |

WAIVED 项在 metadata.findings 中显式标注：

```python
metadata={"findings": [
    {"check": "e2e 回归", "state": "WAIVED",
     "evidence": "evals baseline T6-T7 覆盖同一回归面 (approver=orchestrator, expires=2026-10-23, revalidate=测试脚本变更时)"}
]}
```

**硬边界**：WAIVED ≠ PASS（豁免的证据效力低于 PASS）；WAIVED 不能永久隐藏风险（expiration 必填）；同一检查项连续两次豁免 → 强制升级为 block 上报（豁免疲劳信号）。

## 五、与其他契约的关系

- 本协议是 `output-contract.md` §完成定义的**状态语义细化**，不替代其验证清单与四段评论要求（文件：`_shared/03-evolution-memory/output-contract.md`）；
- 与 markings 传播（marking-rules.md）正交：三态管「验证是否通过」，markings 管「产物可见性」；
- `worker-completion-independence-verification` skill 的独立核验操作即 4.2 外部验证门的执行者侧实现。

## 六、上游锚点

- handbook M7 Guardrail [p.60-63]（PDF 页号口径）+ tanweai/pua v3.5.1 tag 77fa47c4
- Universal Delivery Gate Framework v0.1 §17/§20（存档 `workspace/research/qgate-fusion-20260923/`）
- 变更历史见 git log
