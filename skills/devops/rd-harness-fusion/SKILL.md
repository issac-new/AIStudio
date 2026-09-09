---
name: rd-harness-fusion
description: 外部 RD Harness 调研→三层资产落地→skill 散射→悬空引用扫描完整工作流。
version: 1.0.0
platforms: [linux, macos]
metadata:
  hermes:
    tags: [devops, rd-harness, fusion, knowledge-base, skill-scattering]
    related_skills: [harness-fusion-patterns, open-source-skill-fusion, wechat-article-research]
---

# RD Harness 融合模式（大淘宝实践 → Hermes 落地）

> 来源：2026-08-25 大淘宝 RD Harness 文章调研 + 落地实战（t_d5edac1a → t_158a120b → t_557a46fc → t_72807660）
> 核心产出：5 层知识库骨架 + 27 个 applications 知识 + 11 个 devops-rd skill + rd-export.py 脚本

## When to Use

- 用户给微信文章/GitHub 链接要求"调研外部研发流程并落地到 Hermes"
- 需要把外部团队的 RD/知识库/质量门禁理念融合到本机 agent teams
- 需要批量生成 profile 知识文件（applications/*.md）
- 需要把 skill 散落到多个 profile 自有目录（非共享 symlink）

## 三层资产结构（文章核心模型 → Hermes 映射）

```
命令协议层   →  .agents/commands/    → Hermes：devops-rd skill（verify-prd/verify-requirement/code-review/release-plan + rd-work/clarify/analyze/decompose/apply/validate）
知识资产层   →  knowledge/           → Hermes：~/.hermes/knowledge/{main,applications,candidate,personal,template}
RD 过程层    →  rd/requirements/{id}/ → Hermes：kanban.db + rd-process-export skill + ~/.hermes/bin/rd-export.py 脚本
```

## 完整工作流（6 步）

### 1. 抓取并精读

用 `wechat-article-research` skill 的 curl + regex 零依赖路径抓取，精读三层资产结构。

### 2. 现状盘点

机械扫描本机现状：
- `ls ~/.hermes/profiles/` 确认 profile 数量
- `sqlite3 kanban.db "SELECT ..."` 确认任务状态
- `find ~/.hermes/profiles/*/skills/` 确认 skill 分布
- **严禁 LLM 主观判断**，全部用命令输出

### 3. Gap 分析

对照文章三层资产，列出本机缺失项：
- 知识库层：knowledge/{main,applications,candidate,personal,template}/ 是否存在？
- 命令协议层：/rd:* 命令是否有对应 skill？
- 过程资产层：kanban.db 是否能导出 Markdown 套件？

### 4. 分阶段落地

按"短期（零破坏）→ 中期（自动化）→ 长期（Harness 化）"三档：
- **短期**：建目录骨架 + 写元文件（README/INDEX/ROUTING）+ 抽模板
- **中期**：批量生成 applications/*.md + 抽 review skill 到各 profile
- **长期**：rd-process-export 自动导出 + 多 Agent 编排

### 5. 机械验收

- [ ] 所有文件真实存在（`ls` 验证）
- [ ] YAML front matter 完整（id/type/domain/status/confidence/stability/evidence）
- [ ] 无 secret 泄漏（`grep -r "api_key\|token\|password"`）
- [ ] 无顺手重构（`git diff --name-only` 只含任务范围内文件）
- [ ] INDEX/ROUTING 已挂新条目（无"待补"残留）

### 6. 悬空引用扫描

落地后必须扫描：
```bash
# 检查 skill 引用的脚本是否存在
grep -r "\.py\|\.sh\|\.js" ~/.hermes/profiles/*/skills/*/SKILL.md | while read line; do
  path=$(echo "$line" | grep -oE '~/[^\"` ]+\.(py|sh|js)' | head -1)
  [ -n "$path" ] && [ ! -f "${path/#\~/$HOME}" ] && echo "悬空: $path"
done

# 检查 SOUL.md 是否引用了新 skill
grep -l "devops-rd" ~/.hermes/profiles/*/SOUL.md
```

## 关键 Pitfalls（本次实战 5 条）

### 1. 跨 profile 写 skill 被软守护拦截，需 cross_profile=True

`write_file` 写其他 profile 的 `skills/` 会被拦截。用户显式授权后需加 `cross_profile=True`：
```python
write_file(path="~/.hermes/profiles/worker-coder/skills/...", cross_profile=True)
```

### 2. Profile skills/ 下 symlink 目录 ≠ 自有目录

`worker-coder/skills/devops` 是 symlink 到 `~/.hermes/skills/devops`（default 共享目录）。**写 profile 自有 skill 必须建独立目录**（如 `devops-rd/`），不能写 symlink 目标目录（会污染所有 18 个 profile）。

### 3. SOUL.md 是 protected file，patch 需用户审批

`patch` 或 `write_file` 写 `SOUL.md` 会触发审批弹窗，无响应即超时拒绝。**方案：提前在任务 body 中说明需修改 SOUL.md，或改用 ROUTING.md 集中索引替代分散引用**。

### 4. 落地后必须扫描"悬空引用"

Skill 建好后必须验证：
- 引用的脚本/文件是否真实存在（`ls <path>`）
- 引用的 skill 是否能被 `skill_view` 加载
- SOUL.md / INDEX.md / ROUTING.md 是否已挂新条目

### 5. 批量生成知识文件必须含真实职责描述

27 个 applications/*.md 模板化生成时，每个 profile 的"核心职责/边界/上下游"必须从实际 SOUL.md / 集群规则提取，禁止空泛占位（"负责编码"→"按 requirement 实现代码，跑 verify-requirement → 编码 → code-review"）。

## RD 命令 → Hermes skill 映射表

| 文章命令 | Hermes skill | 落地位置 | 用途 |
|---|---|---|---|
| `/rd:verify-prd` | `verify-prd` | worker-researcher/skills/devops-rd/ | PRD 8 项检查 |
| `/rd:verify-requirement` | `verify-requirement` | worker-coder/skills/devops-rd/ | requirement 10 项 + ontology 对照 |
| `/rd:code-review` | `code-review` | worker-coder/skills/devops-rd/ | Diamond 6 门 |
| `/rd:release-plan` | `release-plan` | ops-devops/skills/devops-rd/ | 发布前 8 项 + 可逆性分级 |
| `/rd:work` | `rd-work` | orchestrator/skills/devops-rd/ | RD 路由命令 |
| `/rd:clarify` | `rd-clarify` | worker-researcher/skills/devops-rd/ | 需求澄清 |
| `/rd:analyze` | `rd-analyze` | worker-researcher/skills/devops-rd/ | 需求分析 |
| `/rd:decompose` | `rd-decompose` | orchestrator/skills/devops-rd/ | 需求拆解 |
| `/rd:apply` | `rd-apply` | worker-coder/skills/devops-rd/ | 按 requirement 编码 |
| `/rd:validate` | `rd-validate` | worker-tester/skills/devops-rd/ | requirement vs diff 对账 |
| RD 过程导出 | `rd-process-export` | orchestrator/skills/devops-rd/ | 重型任务导出 Markdown 套件 |

## 知识库五层结构

```
~/.hermes/knowledge/
├── README.md          # 知识库自身说明（来源/范围/写入规则/生命周期）
├── INDEX.md           # 5 层导航 + 任务类型导航（禁止全量读）
├── ROUTING.md         # 关键词 → board → profile → 知识入口
├── main/              # 跨 profile 通用知识
├── applications/      # 27 个 profile 知识文件
├── candidate/         # 候选知识（含 confidence/stability/evidence）
├── personal/          # 个人经验
└── template/          # 强约束模板（knowledge/decision/finding/report/artifact）
```

## 关联

- **harness-fusion-patterns** — 外部 Harness 融合主流程（位于 default profile）
- **open-source-skill-fusion** — 开源项目融合方法论
- **wechat-article-research** — 微信文章抓取（curl+regex 零依赖）

## 变更历史

| 版本 | 日期 | 变更内容 | 变更人 |
|---|---|---|---|
| 1 | 2026-08-25 | 初版（大淘宝 RD Harness 融合实战沉淀） | orchestrator |