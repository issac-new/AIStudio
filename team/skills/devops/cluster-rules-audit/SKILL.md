---
name: cluster-rules-audit
description: "集群规则有效性审计三线法：机械扫描+命令实测+冲突检测.触发:检查规则有效性/审计SOUL/规则落地性."
version: 1.0.0
metadata:
  hermes:
    tags: [devops, audit, rules, soul, reliability]
    related_skills: [soul-rule-enforceability-audit, harness-entropy-management, open-source-skill-fusion]
---

# 集群规则有效性审计（Cluster Rules Audit）

> 2026-08-21 全集群实战提炼（27 profile + 24 _shared：293 条命令全量实测、27 处冲突修复 16 处）。
> 目标：实用主义——每条规则要么能机械落地，要么显式标注降级方式，杜绝"看着完整实际空转"。

## 触发条件 / When to Use

- 用户说"检查规则有效性 / 审计 SOUL / 规则无法落地 / 规则能不能执行"
- 大规模 SOUL/rules 修改后（融合任务收尾）的回归审计
- 熵管理 cron 定期防腐化扫描（挂 harness-entropy-management 周期）

## 三线审计法（必须全走，缺一线即漏）

| 线 | 方法 | 抓什么 |
|----|------|--------|
| ① 机械扫描 | scanner 六维度：D1 悬空引用 / D2 失效 skill / D3 模糊措辞 / D4 重复块 / D5 死链 / D6 失效子命令 | 路径级失效 |
| ② 命令逐条实测 | 抽 SOUL bash 块命令 → which / `hermes <sub> --help` 返回码 / 脚本路径 exists | 二进制/子命令/脚本真伪 |
| ③ 交叉冲突检测 | 子代理读全量共享文件，比对阈值/级别/枚举值/章节锚点 | 语义冲突（多版本数字、旧文未删、双正典） |

详细方法论（含扫描器误报源、静默失效陷阱表、审计纪律）：
**[references/rules-audit-methodology.md](references/rules-audit-methodology.md)**

## 快速判定分级

- **无法落地（P0）**：强制引用不存在的 skill/命令/章节锚点 → 当场修
- **弱落地（P1）**：依赖无机制支撑的量（token 数/权重）→ 加"目测近似/人工判定"标注或定值
- **健康**：语义完整的多副本（如退出协议 23/23 核心语义保留）→ **不去重**（摘要+正式版双层是刻意设计）

## 最高频病灶速查（先查这些）

1. **skill 可见性**：索引器只认 `profile/skills/<分类>/<名>/SKILL.md` 二级形态——顶层平铺与 `_shared/skills/` 全部不可见（"Unknown skill"）。修：`ln -s ~/.hermes/skills/<分类>/<名> ~/.hermes/profiles/<p>/skills/<分类>/<名>` 对每个引用 profile 重复
2. **子命令单复数/改名**：`hermes session`→`sessions`；无 `hindsight` CLI（长期记忆走会话内 hindsight_recall 工具）
3. **SQLite 静默失效**：`-readonly` 遇 WAL 库报 Error 14（用 `file:$db?immutable=1`）；`created_at` 是秒级时间戳，`date('now')` 比较永远空结果（用 `strftime('%s',...)`）
4. **路径漂移**：`kanban/current/kanban.db`（current 是文件非目录）；任务集中在 swarm 库

## 分层批量补齐模式（Tier 1/2/3 + 锚点优先级，2026-08-21 实战提炼）

大规模 SOUL.md 批量修改（如 22 个 profile 补同一规则引用）的标准流程：

**Step 1 分层**：不按"全部补齐"一刀切，按规则重要性分 Tier：
- Tier 1 全员强制（基础治理四件套：verification/output-contract/ontology/shared-rules）
- Tier 2 安全敏感团队（banned-command/defensive-patterns/mandatory-privacy → hack/ops/worker/eda）
- Tier 3 领域特定（marking-rules → orchestrator/platform；kanban-advanced → worker/orchestrator）

**Step 2 锚点优先级**：27 个 profile 的 SOUL.md 结构不统一，按优先级序列找插入锚点：
```
"## 验证清单" → "## 输出契约" → "## 标准作业循环" → "## 共享规则" → "## 具体操作命令手册" → "## 红线"
```
实测 44 处插入全部命中（0 处无锚点）。

**Step 3 dry-run 先行**：生成 JSON 清单（profile × rule × anchor_line × insert_text），人工复核后再执行。

**Step 4 从后往前插入**：同一 profile 多条规则插到同一锚点时，按 anchor_line 降序插入，避免行号偏移。

**Step 5 审计复验**：批量修改后重跑审计脚本，确认覆盖率从 X% → Y%。

**产出物模板**（可直接复用）：
- 审计脚本：`~/.hermes/bin/audit-soul-rules.sh`（macOS bash 3.2 兼容，无关联数组）
- dry-run 清单：`research/tier{N}-dry-run.json`

## 修复纪律（血泪教训）

1. 修复后**原样复制 SOUL 命令到真实 shell 跑通**（grep 归零不算完）
2. skill 修复单一机制：master 实体放 `~/.hermes/skills/<分类>/`，profile 侧仅 symlink；**禁 cp -cR 混用**——`hermes skills list` 调用本身触发索引器写，双侧同名目录时 master 会被覆写成自指环（Errno 62）
3. 子代理跑"验证命令"前先 grep 该脚本有无写操作（drift 类脚本会自动重打 patch）
4. 误报逐个人工复核再丢弃：知识陈述≠模糊规则；grep -A6 窗口太窄会误判语义缺失

## 与其他 skill 的联动

- **harness-entropy-management**：扫描器挂其周期做防腐化回归
- **soul-rule-enforceability-audit / soul-operability-quality-bar**：单条规则的可执行性细化
- **open-source-skill-fusion**：融合任务落地后的验收审计用本 skill 三线法

## Reference Files

| File | Content |
|------|---------|
| `references/rules-audit-methodology.md` | 完整方法论：扫描器误报源、静默失效陷阱表、可落地性分级、审计纪律、可见性修复模板 |
