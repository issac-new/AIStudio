---
name: fusion-output-quality-gates
description: "融合产出的质量门禁：API 验证、环境检测、伪函数检查、过度承诺降级。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, quality, fusion, governance, blue-team]
    related_skills: [cot-leakage-audit, pua-harness-governance, open-source-skill-fusion-v2]
---

# 融合产出的质量门禁

> 来源：deepseek-harness 融合会话蓝军审查（2026-08-13），delegate_task 独立审查发现 4 BLOCKER + 24 WARNING。
> 定位：**完成时防线**——在把外部项目的能力适配为 Hermes _shared/ 规则或 skill 前，必须过的质量门。

## When to Use

- 把外部开源项目（dsh/PUA/BMAD 等）的理念适配为 Hermes _shared/ 规则文件
- 在 _shared/ 或 skill 中写代码示例（❌/✅ 对比）
- 在 fusion skill 的"实施检查点"段落中推荐操作
- 蓝军 delegate_task 审查前的自检

## 核心问题

Fusion 产出（把外部理念写成 Hermes 规则文件）最容易犯五类错误，每类都有对应的验证方法。

## 五类陷阱与验证门

### 门 1：编造 API 结构（BLOCKER）

**症状**：代码示例引用 Hermes 工具 API 不存在的字段/方法。

**真实案例**：
```python
# ❌ 编造：terminal() 没有 timeout 字段
result = terminal("cmd", timeout=60)
if result.get("timeout", False):  # 永远 False

# ✅ 验证后：terminal() 只返回 {output, exit_code, error}
result = terminal("echo test", timeout=5)
print(list(result.keys()))  # ['output', 'exit_code', 'error']
```

**验证方法**：写任何工具 API 示例前，先跑一次最小调用确认返回结构。

### 门 2：环境假设命令（BLOCKER）

**症状**：推荐的 bash 命令在目标环境不可执行。

**真实案例**：
```bash
# ❌ ~/.hermes 不是 git 仓库
BEFORE_SHA=$(git stash create)  # fatal: not a git repository

# ✅ 先检测
git -C ~/.hermes rev-parse --is-inside-work-tree 2>/dev/null || echo "NOT GIT — 用 cp/tar"
```

**验证方法**：写 git 命令前加环境检测；glob 回滚（`cp *.bak`）改为 `ls -t | head -1` 取最新。

### 门 3：伪函数伪装成可执行代码（BLOCKER）

**症状**："实施检查点"中调用不存在的函数，无 import、无定义。

**真实案例**：
```python
# ❌ 伪函数
metadata = normalize_to_ontology(result_raw)   # 未定义！
metadata = redact_secrets(metadata)             # 未定义！

# ✅ 概念性操作用注释
# 手动检查：metadata 字段名与 ontology.md 定义一致
```

**验证方法**：每个函数调用要么有 import，要么标为伪代码，要么改为注释描述。

### 门 4：数字不一致（WARNING）

**症状**：同一集群在不同文件里 profile 数/文件数不同。

**真实案例**：shared-rules-reference 写 33/33，ADR 写 28，实机 27。

**验证方法**：`ls -d ~/.hermes/profiles/*/ | grep -v _shared | wc -l`

### 门 5：过度承诺（WARNING）

**症状**：prompt 级建议用"🔴强制""防线""直接降低错误率"措辞。

**根因**：把外部项目的运行时机制（dsh TS waterfall）适配为 Hermes Python 环境的 prompt 文本后，执行力从"代码强制"降为"worker 自觉"。

**验证方法**：每次把运行时机制适配为 prompt 文本时，加诚实标注：
```
> ⚠️ prompt 级建议，Hermes 无运行时强制。真正的强制靠 [具体工具]。
```

## 必跑验证清单

在把任何 fusion 产出写入 _shared/ 或 skill 前，过一遍：

1. [ ] 代码示例中的每个 API 字段/方法名都跑过一次验证？
2. [ ] 每条 bash 命令在目标环境（~/.hermes）能执行（非假设）？
3. [ ] 没有 git 命令用在非 git 目录？
4. [ ] 没有未定义函数伪装成可执行代码？
5. [ ] profile 数/文件数是实机计数（非历史记忆）？
6. [ ] "强制/防线"措辞配了"prompt 建议，无运行时强制"诚实标注？

## 与蓝军审查的关系

本 skill 是 **自检门**（写完产出后自己过）。蓝军 delegate_task 是 **独立审查门**（写完后派独立子代理审）。两者互补：

```
产出写入前 → 本 skill 自检清单（6 项）
产出写入后 → delegate_task 蓝军独立审查（对抗性 lens）
```

复杂 fusion 任务（≥6 次工具调用）必须两道门都过。

## Pitfalls

1. **自检走过场** — 清单打了勾但没真跑验证命令 → 蓝军会抓到，更丢脸
2. **蓝军读的是修正前版本** — 如果自检后改了文件但蓝军读的是旧缓存，蓝军会发现已修的问题 → 不影响正确性，但浪费审查资源
3. **诚实标注降级后不补强** — 把"🔴强制"降为"🟡建议"后，如果没有替代的运行时强制方案，规则就只剩 prompt 自觉 → 应在标注中说明"真正的强制靠 X"
