# Worker 申诉协议（2026-08-21，融合自麦肯锡绩效透明框架）

> 麦肯锡 F4："员工必须知道评价标准、数据来源、人工复核机制和申诉路径。"
> Hermes 映射：worker 被 request_changes 打回后，有权要求复核——申诉不是对抗，是发现规则/分解/配置问题的信号。

## 触发条件

worker 收到 `kanban_request_changes` 后，认为打回理由不成立时，可发起申诉。

## 申诉流程（三步）

### 1. 申诉发起

worker 在自己任务卡上 `kanban_comment`，格式：

```
[申诉] 任务 <task_id>
打回理由：<request_changes 的 reason 摘要>
申诉理由：<为什么不成立，附证据（工具输出/文件路径/命令结果）>
请求：<重新验收 / 修改验收标准 / 转人工裁决>
```

### 2. orchestrator 响应（≤24h）

复核申诉理由 + 原验收证据，三选一：

- `kanban_complete`（申诉成立）
- `kanban_request_changes`（维持打回，附更详细理由——必须回应申诉中的每条证据）
- `kanban_block(kind="needs_input", reason="[申诉升级] 需要图爸裁决：<争议点>")`

### 3. 留痕

申诉及处理结果保留在任务卡 comment 链中，供 ops-eval 健康度维度（申诉响应时间/被打回率）统计。

## 反模式

- ❌ 申诉作为拖延手段（无新证据的重复申诉 → orchestrator 直接拒绝并记录）
- ❌ orchestrator 无视申诉直接再次 request_changes（违反透明原则）
- ❌ 申诉内容不含证据（纯情绪性反对 → 要求补证据后再审）

## 与现有机制的联动

- 验收门标准：`loop-engineering-gates.md` 证据强度四分级（L4 直接证明才可放行）
- 三行控制头：`task-contract-guard.md` §五（申诉时引用原控制头作为争议锚点）
- 健康度统计：`ops-eval/SOUL.md` 第七维 Agent 健康度
