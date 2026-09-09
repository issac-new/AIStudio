---
template_id: TPL-REPORT-V1
template_type: report
template_status: OFFICIAL
template_updated: 2026-08-25
template_owner: orchestrator
template_source: output-contract.md §1 + AGENTS.md §1.3
---

# Report（调研/分析报告）文档模板

> 用途：所有调研/分析报告的强约束模板。worker-researcher 输出报告时必须套本模板。
> 强约束：缺 Executive Summary / Findings / Recommendations / Methodology / Appendix 五段 = 报告不合规。

---

## YAML Front Matter

| 字段 | 类型 | 说明 |
|---|---|---|
| `report_id` | string | 唯一编号：`R-<DOMAIN>-<YYYY-MM-DD>-<SEQ>` |
| `report_type` | enum | `research` / `analysis` / `audit` / `postmortem` / `comparison` |
| `domain` | string | 业务域 |
| `author` | string | 作者 profile 名 |
| `commissioned_by` | string | 委托方（人 / 任务 / board） |
| `produced_at` | date | 产出日期 |
| `methodology` | string | 调研方法（如 "open-source 源码级调研"、"对比分析"、"5-why"） |
| `data_sources` | list[object] | 数据来源（每条含 type/url/source/credibility） |
| `confidence` | enum | `high` / `medium` / `low`（整体置信度）|
| `peer_reviewed` | bool | 是否经过蓝军评审 |
| `reviewer` | string | 评审人 profile（peer_reviewed=true 时必填）|

---

## 正文模板（output-contract.md §1 标准骨架）

```markdown
# <报告标题>

> **报告类型**：<research/analysis/audit/postmortem/comparison>
> **数据时间窗口**：<YYYY-MM-DD 至 YYYY-MM-DD>
> **调研耗时**：<X 小时/天>
> **核心结论（30 秒读完版）**：<一句话讲清楚>

## 1. Executive Summary（执行摘要，≤ 200 字）

<读者读这一段就知道报告的全部核心结论>

## 2. Findings（核心发现，每条带 file:line 或 URL 锚点）

### Finding 2.1: <标题>
- **证据**：<file:line 或 URL>
- **可信度**：<high/medium/low>
- **意义**：<为什么这个 finding 重要>

### Finding 2.2: <标题>
- 同上结构

## 3. Recommendations（建议，按 impact × effort 排序）

| 建议 | 影响面 | 工作量 | 优先级 | 关联 finding |
|---|---|---|---|---|
| <建议 1> | high/medium/low | 人天 | P0/P1/P2 | F-XXX |
| <建议 2> | ... | ... | ... | ... |

## 4. Methodology（调研方法）

- 数据来源：<列出 ≥ 2 个独立来源做三角验证>
- 工具：<用到的工具/命令/skill>
- 局限：<本次调研的边界，未覆盖区域>

## 5. Appendix（附录）

### 附录 A：原始数据
<关键截图 / 命令输出 / 长引用>

### 附录 B：术语表
<首次出现的术语解释>

### 附录 C：相关材料
<其他可参考的报告 / 代码 / 文档>

## 报告元数据（self-evaluation）

| 项 | 值 |
|---|---|
| 来源可追溯率 | <% 数字>（每条 finding 有 file:line 或 URL 锚点） |
| 三角验证覆盖率 | <% 数字>（关键 finding 至少 2 源） |
| 时效标注完整性 | <% 数字> |
| 数据是否有编造 | 否（数据均来自真实工具调用） |
```

---

## 写作纪律（AGENTS.md §1.3 + cognition-self-check）

### DO

- ✅ 每条 finding 必带 file:line 或 URL 锚点
- ✅ 关键数字/结论 ≥ 2 个独立来源三角验证
- ✅ 时效标注：数据获取时间 + 数据本身的时间窗口
- ✅ 数字精确到来源能追溯的位数（不四舍五入到合理化）
- ✅ 报告 PDF = HTML + CSS → Chrome headless（拒 reportlab）

### DON'T

- ❌ 编造数据：发现报告中无来源数字
- ❌ 拼凑结论：把 Worker 各自输出拼盘未独立验证
- ❌ 营销语言：「重塑 / 赋能 / 颠覆」等
- ❌ 模糊建议：「需要改进 / 应该优化 / 值得关注」

## 验证清单（worker 自检 + reviewer 验收）

- [ ] YAML Front Matter 10 字段全有
- [ ] 5 段式骨架完整（ES/Findings/Recommendations/Methodology/Appendix）
- [ ] ≥3 条 Findings，每条带 evidence + 锚点
- [ ] ≥2 条 Recommendations，按 impact × effort 排序
- [ ] Methodology 含数据来源 + 工具 + 局限
- [ ] 数据可追溯率 ≥ 80%（每条核心数字可指回 file:line）
- [ ] 无营销语言 / 无编造数据

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版 | orchestrator |