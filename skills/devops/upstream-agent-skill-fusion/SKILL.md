---
name: upstream-agent-skill-fusion
description: "融合上游 agent 工具/skill 进 Hermes：调研→裁剪安装→hermes 化→Exercised 验收。"
version: 1.0.0
metadata:
  hermes:
    source: archify 融合（2026-09-01）实战蒸馏
    tags: [devops, skill-fusion, open-source, integration]
    related_skills: [open-source-architecture-research, deep-research-workflow]
---

# 上游 agent 工具/skill 融合落地（upstream-agent-skill-fusion）

首轮实践：tt-a1i/archify v2.16 → `~/.hermes/skills/devops/archify`（2026-09-01，全链 Exercised）。
区别：`open-source-architecture-research` 管**调研**，本 skill 管**调研后的落地改装与验证**。

## Workflow（6 步）

### Step 1: 获取源码（tarball 优先）
```bash
# 默认首选 codeload tarball（git clone 即使网页可达也可能协议卡住 exit 124；实测 2026-09-01）
curl -sSL -m 120 -o /tmp/X.tar.gz https://codeload.github.com/<owner>/<repo>/tar.gz/refs/heads/main
tar -xzf /tmp/X.tar.gz && mv <repo>-main /tmp/X-src
```

### Step 2: 调研核心机制
读 SKILL.md / DESIGN.md / references / 主入口源码，产出 6 维报告（架构/能力/工作流/独有特性/技术栈/融合评估）。

### Step 3: 真机验证关键机制（在源仓库目录里先跑）
工具自检（doctor/health）→ guide/最小 case → **用本集群真实素材跑端到端**（不要跑它自带的 hello-world 就当验证了）。

### Step 4: 裁剪安装
```bash
# 目标：~/.hermes/skills/<类目>/<name>/
# 先 grep bin/renderers 对要裁目录的引用（path.join(skillRoot,'scripts/…') 模式），精确补齐必需文件
# 保留运行时必需：bin/ renderers/ schemas/ examples/ references/；裁 test/ migrations/ 构建链
```

### Step 5: hermes 化 SKILL.md
- 上游正文原样保留；顶部加「Hermes 使用纪律」段（产物落盘位置/禁联网开关/验收证据进 metadata/修复循环上限）
- frontmatter 加 `metadata.source`（上游+版本+日期）与 `related_skills`

### Step 6: Exercised 级验收（必做）
新装目录里重跑 Step 3 的端到端（不是源仓库目录！）：工具自检 + 真实素材产物 + 工具自己的 receipt/自检输出当证据，
样例与产物落盘 workspace（`research/<name>-fusion/`）。仅「文件在/能 skill_view」是 Wired 不是 Exercised。

## Pitfalls

### 1. 裁剪目录后必须端到端冒烟——缺依赖会伪装成内容错误
裁 test/scripts 等目录前 grep 运行时被引用的文件精确补齐；装后必跑自检+一例端到端。
实测（archify）：漏掉 `scripts/check-render-output.mjs` 后 validate 报无分类 `artifact/check-failed`，
看似图质量问题实为 checker 缺失。**判据：无分类/无诊断的错误先怀疑基础设施缺失，再怀疑内容。**

### 2. 上游自带联网行为必须先禁
融合前 grep update-check/telemetry 路径，找禁用开关（env 形如 `ARCHIFY_UPDATE_CHECK_DISABLED=1`）
写进纪律第一条，每条命令带 env 前缀示范。渲染期不做网络抓取的 fail-closed 行为保留并注明。

### 3. 产物落盘纪律
工具产物一律写 kanban 任务 workspace 绝对路径（禁 /tmp、禁 scratch——D7 事故纪律）；
交付物进 `kanban_complete(artifacts=[...])`。

### 4. 与既有工具互补不互斥
新工具与集群已有的同类能力（如 mermaid 文本图）写清边界：文本可 diff 的场景保留，
对外交付/重展示走新工具。不重复造同一场景的两条互斥路径。

## Reference Files

| File | Content |
|------|---------|
| `references/archify-fusion-case.md` | archify 融合实测全记录：语法要点（grid/layout 位置/authored id）、5 轮修复收敛、装后两坑、样例路径 |
