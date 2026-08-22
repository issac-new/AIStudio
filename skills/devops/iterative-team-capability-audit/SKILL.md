---
name: iterative-team-capability-audit
description: 多轮迭代检视 agent teams 能力与工具：结构/内容/定义/可操作性/增强一致性，每轮探针+修复+复验。
triggers:
  - "深入复盘检视"
  - "迭代优化若干轮"
  - "确保满足实用主义"
  - "全局一致 定义准确"
  - "逻辑闭环 可操作"
---

# Iterative Team Capability Audit（多轮迭代检视）

用户要求"深入复盘检视当前所有 agent teams 的能力及工具，确保满足实用主义且全局一致、定义准确、逻辑闭环、可操作，迭代优化若干轮"时使用。与 agent-team-deep-audit（第一轮 7 defect classes 检测）互补：本技能是**第二轮起的迭代循环**——每轮一个检视维度，发现问题立即修复，最后复验。

## 轮次设计模板（8 轮）

| 轮 | 维度 | 探针 | 典型发现 |
|----|------|------|---------|
| 1-4 | 结构一致性 | clearances 全覆盖 / toolset YAML 格式 / 命令手册 27/27 / 前线侦察引用 / SOUL 行数健康(100-400) | worker-researcher toolset 是逗号字符串 |
| 5 | 内容质量 | 编造工具扫描 / skill_view 引用有效 / _rules.md 引用有效 / 跨 team 交接说明 | 全部通过（引用路径含嵌套需全盘找） |
| 6 | 定义准确性 | 相邻角色 Jaccard 重叠度(<5% 边界清晰) / 概念定义一致性 | 4 对角色边界清晰 |
| 7 | 可操作性 | 标准作业循环 7 步 / 退出协议完整 | 发现 [已移除] 缺 kanban_complete+block |
| 8 | 增强一致性 | 新增能力章节与角色匹配(关键词命中≥2/5) | 全部匹配 |

## 探针脚本要点

### 结构扫描（yaml 正确解析，勿用正则）
```python
import os, yaml
c = yaml.safe_load(open(cfg))
toolsets = c.get('toolsets', [])
# 陷阱: 可能是逗号字符串 "hermes-cli,acp,..." 而非列表 → 判定格式错误
clearances = c.get('clearances')  # 缺 = markings 校验失效
```

### 围栏平衡验证
```python
import re
stack = []
for i, line in enumerate(lines):
    if re.match(r'^```(\w*)$', line.strip()):
        stack.pop() if stack else stack.append(i+1)
# stack 非空 = 未闭合
```
⚠️ **here-doc 陷阱**：`gh pr create --body "$(cat <<'EOF'"` 内含的 EOF 会吞闭合标记 → 修复在 EOF 后补 ```。` ```python` 作为 CLOSE 的配对歧义（L148/L157）是原始问题，不影响 prompt 功能，可放弃修复。

### 标准作业循环完整性——**误报判定法**
关键词检测会大量误报，只有一条铁律：
**任务执行者缺 `kanban_complete`+`kanban_block` 才是真缺陷**。
- [已移除] 教师缺 `cd_workspace` → 合理（不写代码）
- [已移除]-orchestrator 缺 `kanban_show` → 合理（路由器）
- hack-recon 缺 `kanban_block` → 合理（侦察总是产出）
- [已移除] 用词不同 → 人工确认非缺陷

## 修复执行

- **clearances 批量**：27 profile 按 team 差异化。`yaml.dump(sort_keys=False)` 保留字段顺序。hack=+TLP:AMBER，[已移除]=EYES-ONLY:[已移除]，platform=EYES-ONLY:platform（已有者跳过）
- **命令手册补缺**：并发 delegate_task 编辑同一文件会互相覆盖 → 保留质量更高的版本，用 Python str.find 精确插入，完成后统一 grep 去重（`## 具体操作命令手册` 出现次数=1）
- **退出协议补丁**：[已移除] 追加 成功→complete / 缺信息→block needs_input / 故障→block dependency

## 最终报告格式

每检查项输出 通过/总数+状态（✅=100%，🟡=≥70%，⚠️=其余）。分三类：
1. **已修复**（列出具体修复）
2. **确认无问题**（带证据：count/grep/DB 查询）
3. **合理设计选择**（非问题，说明理由——避免把合理差异当缺陷修掉）

主动放弃低价值修改也要诚实声明（如内联协议精简每处仅省~100字符，误删风险>收益，放弃）。

## Related Skills

- **agent-team-deep-audit**（default profile，第一轮 7 defect classes）— 本技能是其后的迭代修复循环
- **multi-profile-system-audit** — 10 问表面健康检查
- **agent-soul-patching / soul-enrichment-command-manual** — SOUL.md 批量补丁细节
