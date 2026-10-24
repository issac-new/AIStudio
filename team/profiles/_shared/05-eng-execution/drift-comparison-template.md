# 攻击面漂移对比模板（Drift Comparison Template）

> 来源：YunkunSec `RunContext` 组件 —— "目标状态记录与比较"
> 落地：orchestrator 合并重型 hack 任务报告时**强制**包含此段落
> 依据：recon 阶段 `coverage JSON`（`(subdomain,port,service)` 三元组）即前基线；exploit/auditor 完成后生成后快照，diff 出 drift

---

## 强制包含规则

当 orchestrator 合并 **hack 看板重型任务**（工具调用 ≥6 或文件写入 ≥3 或涉及安全/部署）的子任务报告时，最终合并报告**必须**包含以下 "攻击面漂移对比" 章节。缺少此章节 = 报告不完整 = `kanban_block`。

---

## 模板（Markdown，直接复制到合并报告）

```markdown
## 攻击面漂移对比（Attack Surface Drift）

> 基线：recon 阶段 coverage JSON（`(subdomain,port,service)` 三元组）
> 快照：exploit/auditor 阶段完成后的资产确认结果

| 维度 | 评估前（基线） | 评估后（快照） | 变化量 | 变化说明 |
|------|----------------|----------------|--------|----------|
| 暴露子域数 | N | N' | +N'/N | 新增/失效子域列表 |
| 暴露端口/服务 | N (e.g., 80:http, 443:https) | N' | +N'/N | 新增/关闭端口详情 |
| 已知漏洞数 | 0 | N (HIGH:X, MED:Y, LOW:Z) | +N | 按严重度分布 |
| 资产指纹覆盖 | X% (覆盖三元组数/总三元组) | Y% | +Y%/X% | 覆盖率提升/下降原因 |
| 新发现攻击向量 | — | 列表 | — | SQLi/XSS/SSRF/IDOR 等 |
| 证据关联度 | N 个 evidence | N' 个 evidence | +N'/N | 新增原始工具输出 |

### 关键发现漂移详情

| Finding ID | 阶段 | 状态变化 | Evidence IDs | 说明 |
|------------|------|----------|--------------|------|
| F1 | recon→exploit | 疑似→确认 | e001,e003 | SQLi 验证通过 |
| F2 | recon→audit | 新增 | e005 | 代码审计发现 IDOR |

### 评估结论

- **整体漂移评级**：<显著/轻微/无变化>
- **新增风险面**：<简述>
- **遗漏/回归项**：<如有>
- **后续建议**：<修复优先级/复测计划>
```

---

## 自动化生成建议（可选）

orchestrator 可在合并时自动生成此表：

```python
# 伪代码：从子任务 metadata 中提取基线/快照
baseline = recon_task.metadata.get("coverage_json", {})  # {(sub,port,svc)}
snapshot = exploit_task.metadata.get("confirmed_assets", {})

added = snapshot - baseline
removed = baseline - snapshot
drift = {"added": list(added), "removed": list(removed)}
```

---

## 关联文档

- `_shared/hack-knowledge-index.md` §2.2 目标状态记录与比较
- `_shared/constraint-policy.md` §三 Phase 门（DISCOVER+ENUMERATE 基线生成）
- `evidence_gate.py`（证据闸门确保 drift 数据有据可依）

---

## 修订记录

| 版本 | 日期 | 内容 |
|---|---|---|
| v1.0 | 2026-08-29 | 首版，YunkunSec `目标状态记录与比较` 对标落地 |