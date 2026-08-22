---
name: codex-harness-patterns
description: "Codex harness 模式知识库：Guardian二审/Goals完成审计/审批前缀黑名单，融合映射 Hermes"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, research, agent-behavior, approval, fusion, codex]
    related_skills: [open-source-skill-fusion, prompt-rule-enforcement]
---

# Codex Harness 机制知识库（openai/codex 源码级调研）

> 来源：2026-08-21 clone f20b63e 深度调研（蓝军审查 B+，25+ 处引用逐项验证）。
> 完整调研报告：`workspace/research/codex-research-report.md`；融合方案：
> `workspace/research/codex-fusion-plan.md`。本 skill 是知识库+融合落点索引，
> 详细机制→源码映射见 `references/codex-mechanism-mapping.md`。

## When to Use

- 需要 Guardian 二审 / banned prefix / 验收证据分级等协议的行为细节或判例原文
- 再次调研 openai/codex 或同类 coding-agent harness（避免重复深读已覆盖模块）
- 评审或扩展 `_shared/skills/codex-guardian-review`、`_shared/banned-command-prefixes.md`
- 对照 Hermes 集群做 gap 分析时（含"哪些不是 gap"的已验证结论）

## 核心机制速查（8 项，详见 references）

| 机制 | 一句话 | 关键源码 |
|------|--------|---------|
| Guardian 二审 | on-request 审批派独立 LLM 评审会话，**fail-closed**（超时/失败/格式错=未批准） | core/src/guardian/mod.rs:1-14 |
| 风险判例法 | 4 类风险 10 条 outcome rule（外泄/凭据探测/安全削弱/破坏性） | core/src/guardian/policy.md |
| Execpolicy | Starlark prefix_rule 自带 match/not_match **单元测试**；host_executable 防路径混淆 | execpolicy/README.md |
| Goals 完成审计 | "completion is unproven by default"；证据分级；blocked 需连续 3 turn | prompts/templates/goals/continuation.md |
| 角色投影 | 子代理角色只做有界覆盖（9 维度），"never replace parent authority" | core/src/agent/role.rs:1-8 |
| Fragment marker | 注入片段带 start/end marker 可识别去重，cache 友好 | context-fragments/src/fragment.rs:14-31 |
| Compaction=交接 | 摘要写给"接手的另一个 LLM"，非通用摘要 | prompts/templates/compact/prompt.md |
| Banned prefixes | 禁授权任意脚本前缀/破坏性命令提供前缀/heredoc 提供前缀 | permissions/approval_policy/on_request.md |

## 已落地的 Hermes 融合（2026-08-21，F1-F3）

| 落点 | 内容 |
|------|------|
| `_shared/skills/codex-guardian-review/SKILL.md` | Guardian 五步协议 + 4 类 10 条判例 |
| `_shared/banned-command-prefixes.md` | 5 类黑名单 + 5 组 match/not_match 单测（G9 试点） |
| `orchestrator_rules.md §0.9` | Guardian 触发规则（fail-closed 入 rules） |
| `loop-engineering-gates.md` 证据强度四分级 | L4 证明/L3 间接/L2 矛盾/L1 缺失，L4 才放行 |

**已验证的非 gap**：spawn-trees/ 与 verification_evidence.db 在 Hermes 已存在；
Hermes 已有证伪主义+complete/clean/aligned 验收门（G3 降格为增强已落地）。
**不移植**：Seatbelt/landlock 沙箱（Docker 隔离已覆盖）、app-server JSON-RPC、
Bazel、crate 拆分纪律、awaiter/fragment marker/memories 遥测（P3/P4 观察）。

## 融合工作流教训（本方法论属于 open-source-skill-fusion，其 default 副本无法从
orchestrator 侧 patch，暂记于此，待 curator 合并）

1. **报告数字必须实测**：目测概数（"112 个 crate""60+ 条"）全部被蓝军证伪——
   count/行号/枚举数必须来自 `cargo metadata`/`grep -c`/`wc -l` 真实输出
2. **Gap 双侧机械验证**：写"Hermes 缺 X"前先 grep/ls Hermes 侧，附验证命令
   （本次 10 条 gap 被蓝军降格 2 条）
3. **蓝军比对包模式**：Part A 落地全文 + Part B 上游原文组装单文件，四维审查
   （忠实/一致/可执行/越界），比散读省 60% 迭代预算
4. **`_shared/` 写入触发 cross-profile 软守卫**：目标路径须先写进获批方案，
   再带 `cross_profile=True` 重试同一写入；方案外路径不可事后追加

## Related Skills

- **open-source-skill-fusion** — 融合主流程（本 skill 的方法论母体，位于 default profile）
- **prompt-rule-enforcement** — 规则落地后的执行审计
