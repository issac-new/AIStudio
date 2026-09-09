---
name: fusion-governance-patterns
description: "融合治理模式库：蓝军评审/终态 as-is/源码 patch 固化三域。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, fusion, review, governance, patch-persistence]
    related_skills: [adversarial-review-lens, design-doc-archaeology, hermes-source-patch-persistence]
---

# 融合治理模式库（orchestrator 侧超集重建）

> 定位：default profile 的 `adversarial-review-lens` / `design-doc-archaeology` / `hermes-source-patch-persistence` 的 orchestrator 侧聚合超集——按 open-source-skill-fusion 的"多 agent 并发工作时重建超集"模式落地。
> 此 skill 承载本会话（2026-08-22→24）沉淀的新治理模式，与 default 侧母本并行不冲突（母本供各 worker 用，本 skill 供 orchestrator 调度用）。

## When to Use

- orchestrator 发起融合外部框架（Harness/Playbook/开源项目）并需要蓝军对抗评审时
- 撰写/重构终态设计文档（防止档案混入或设计实质遗漏）
- 任何 hermes-agent 源码树 patch（防 update 冲掉的三件套固化）

## 一、蓝军对抗评审（含三个本会话新增核查类）

### 基础纪律（与 default 母本一致）

Goal-Backward FORCE 立场（假设目标未达成直到证据证明）+ 并行多 lens + 发现五分类（intent_gap/bad_spec/patch/defer/reject）+ 空结果重查 + 逻辑剃刀 + Honest Verifier Abstain + 三行控制头 + workspace_audit.py 只读审计。评审报告呈现：一句 gate verdict → critical/high findings → 中低合并。

### 新增核查类（2026-08-22/24 融合波次实证）

**① "已有数据"动态数据源核查**：方案声称"从已有数据提取 X 指标"时，验证动态数据源成熟度（非静态文件存在性）——cron 执行史可能只有 1 天（executions.db MIN/MAX 实测），kanban 可能无某类事件（task_events kind 分布 grep），σ band/lagging 指标的统计前提会因此坍塌。此缺陷类两波各抓一次 major。

**② 现状断言双重标准核查**：方案对对象侧（pi/外部框架）做到 file:line 级引用（8/8 命中），对本机现状断言零引用——此时本机断言全部存疑。要求现状段落每个断言带 file:line 或决策记录链接，否则视为未论证。实例："Hermes 无截断防御"（conversation_loop.py:3612/3930/7040 已有四层）、"离线模型信息不可查"（models_dev.py 三级缓存+ETag 当天刷新）。

**③ 高价值点收割核查**：方案吸收清单 vs 调研报告可移植点清单逐项对账——蓝军发现方案只收 7 项中的 5 项，漏掉的第 8 项（多 agent 并发 git 纪律，与 27 worker 同 workspace 完全同构）反而是最高性价比。要求吸收清单给每项编号+收/砍+理由，禁止无编号遗漏。

## 二、终态设计文档 as-is 治理（与 default 母本 design-doc-archaeology 一致 + 加强）

### 两条核心纪律

1. **终态文档只写现在时**：演化史/考古/评审记录/版本修订史禁止入正文，一律归 research/ 档案层（头部一行指路）。反例：33 页混合版被用户判"那是档案不是终态"，压到 5-6 页。
2. **剔除历史不得误伤设计实质**：档案里很多设计以历史形式记载但是现行机制——机械覆盖率核对（30+ 关键词清单逐项 grep），缺失即回填。实例：剔除时丢了 9 项（[已移除] 铁律/分发红线/四类记忆/防退化四层/技能路由决策/过滤分级/推理分级/Knowledge PII 通道），31 项核对补齐。

### 本会话加强点

- **数字一律重测**：更新时引用率/cron 数等用机械命令现算（audit-soul-rules.sh/sqlite），禁止沿用旧值（48.1% 替换 43.2% 案例）
- **"已清"脚注**：债务清理后债务表必须加"已清+证据"脚注（错峰/cron/引用率/key 哈希），不能只删行不交代
- **维护契约**：终态文档第六章写清"新增设计按层追加+档案实质变更须同步+变更后跑审计"

## 三、源码修复防退化固化（与 default 母本 hermes-source-patch-persistence 一致 + 行为验证加强）

### 三件套（标记区块 → git-diff patch → 静默 watchdog）

1. 标记区块包裹改动（`# >>> swarm:<feature> >>>` 成对）
2. 改前备份 + `git diff`（非 diff -u）生成 a/ b/ 前缀标准 patch；untracked 新文件先 `git add -N`
3. 静默 watchdog（默认 quiet exit 0 健康 / exit 1 已重打 / exit 2 需人工）

### 本会话加强点：行为验证先于 patch 生成

源码级修复的标准验证链（顺序不能反）：
1. **先写行为样例集**跑修复后逻辑（如截断防御 6/6：截断 write_file→拒执 / 嵌套截断→拒执 / 完整 JSON→正常 / 尾逗号→正常 repair / 闭合边界→正常）
2. 再生成 .patch + 注册 apply-source-patches.sh + watchdog 签名（src before/after + dist 三处检测）
3. watchdog 幂等试跑（已应用 PRESENT skip，无重复执行）

**反模式**：先 patch 后验证会把未验证逻辑固化进防退化层——update 后重放的仍是未验证代码。

### patch 落点真值核查

修复前先确认缺口真实存在且定位正确：grep 本机源码逐层核对（conversation_loop / helpers / sanitization 每层独立核查）。实例：蓝军发现修复目标"截断拒执"已有四层防御（conversation_loop.py:3612/3930/7040 + helpers:4310），真缺口在下一层 sanitization.py:195 的 repair-execute——patch 落点必须在真缺口层。

## 四、融合落地完整流程（8 步速查）

```
1. 抓取 → 2. 深读（delegate clone --depth 1，file:line）→ 3. 现状扫描（机械 grep/sqlite，现状断言全部带 file:line）
→ 4. 融合方案（吸收/保留/不吸收三分+逐项编号收/砍+理由）→ 5. 蓝军评审（5 lens，critical+major 全修出 v2）
→ 6. 批量落地（Tier 分层+锚点优先级+dry-run JSON+从后往前插+审计复验）
→ 7. 真源码修复走三件套固化（行为验证先行）→ 8. 发布（github-profile-distribution 三道闸：公开变体/密钥终扫/最小提交面）
```

## Related Skills

- **adversarial-review-lens**（default）— 蓝军评审母本
- **design-doc-archaeology**（default）— 终态文档考古母本
- **hermes-source-patch-persistence**（default）— patch 固化母本
- **github-profile-distribution**（default）— 发布红线与 PII 清洗
- **harness-fusion-patterns**（default）— 融合工作流母本
