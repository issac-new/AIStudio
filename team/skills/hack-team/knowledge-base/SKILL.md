---
name: knowledge-base
description: "Hack team 分层知识库——每条打法=标签+一句话概括+完整打法三层，注入只带前两层。Use when 渗透/侦察/报告任务开工先查同类条目（先读后做）、任务结束命中五触发写回经验、或新任务命中同族迁移形状想带成熟打法进场。"
version: 1.0.0
license: "internal（机制模式吸收自 sapper-v2 MIT 与 reverse-skill MIT，未 vendor 任何正文）"
routing:
  phase: [recon, enum, exploit, privesc, post, report]
  target_type: [web, ad, cloud, network, binary, mobile]
  technologies: []
  vuln_hints: []
  task_types: [report, exploit, recon]
is_broad_knowledge: true
aliases: [kb, 知识库, fact-graph, 分层事实图, field-journal, 经验写回, 同族迁移, isomorphism-transfer]
metadata:
  hermes:
    tags: [knowledge-base, fact-graph, field-journal, write-back, isomorphism-transfer, layered-index]
    sources:
      - "sapper-v2（github.com/N1nEmAn/sapper-v2，MIT）README §2 History 三层 + §5 Isomorphism transfer——按模式自写，未 vendor 正文"
      - "reverse-skill（github.com/zhaoxuya520/reverse-skill，MIT）README_AI.md『Auto-Evolution Mechanism』节（本地锚点 repo-reverse-skill-AI.md:488-523）——按模式自写，未 vendor 正文"
      - "融合档案 /Users/YOURNAME/.hermes/shared/research/hack-teams-fusion-20261101/FUSION-DOSSIER.md §二 机制2/4/5 + §七 融合纪律"
    fusion_wave: W1-B (t_92231462, 2026-11-02)
---

# Knowledge Base — 分层知识库 + 经验写回闭环

> 一句话：**个体会死（会话结束/上下文饱和），图要活着。** 每条验证过的打法沉淀成
> 「标签+概括+完整打法」三层条目；新任务先读图再动手；干完活写回图。
> 杠杆依据：sapper-v2 靠同款分层事实图 + 同族迁移，用 10.3 亿 token 打平烧 45.8 亿
> token 的对手（同 85 flag），后期破题速度 3 分钟/题（repo-sapper-v2.md §5）。

## 触发条件（何时用本库）

- **开工时（先读后做）**：任何 recon/exploit/report 任务动手前，先查 `INDEX.md` 同类条目
- **收尾时（五触发写回）**：任务结束对照 §b 五触发，命中任一即写回条目
- **接题时（同族迁移）**：新目标与已验证打法「结构同形」时，读同族迁移条目带成熟打法进场
- **查死路时**：本库查不到活法 → 转查 `failure-trace-index`（见 §e 分工）

## 目录结构

```
knowledge-base/
├── SKILL.md          # 本文件：分层纪律 + 写回触发 + 同族迁移规范
├── INDEX.md          # 第一二层索引（标签+概括行）——注入提示词只带这两层
├── methodology/      # 方法论打法（含同族迁移条目）
├── payloads/         # payload/利用链打法
├── redteam/          # 红队专项打法
└── knowledge/        # 外部知识蒸馏（hacktricks/既有 redteam 明细包）
```

## a. 三字段分层纪律（sapper 文档三层）

每条事实/打法必须分三层存储：

| 层 | 内容 | 大小 | 去向 |
|---|---|---|---|
| 1 标签 | 几个字，检索锚点 | ≤10 字 | 进 INDEX，可注入 |
| 2 一句话概括 | 这条打法解决什么问题 | ≤50 字 | 进 INDEX，可注入 |
| 3 完整打法 | 具体命令、兜底方案、证据要求 | 不限 | 独立文件，按需自取 |

**注入纪律：拼进提示词的只有第 1、2 层（INDEX 表格）；第 3 层完整打法由 worker
判断命中后自己打开文件读。省注入不省存储。**

为什么分层（sapper-v2 教训，repo-sapper-v2.md §2）：
- 单层字符串事实图：一条事实写错 → 全链污染，且每次检索都烧完整条目的 token
- 三层后：坏只坏一层（概括错了改概括，命令错了改命令文件）；扫 INDEX 便宜，
  深读按需

条目文件内格式（第 3 层载体）：

```markdown
# <标题>
- 标签: <≤10 字>
- 概括: <≤50 字>
- 类型: fact | field-journal | isomorphism
- 日期: YYYY-MM-DD（field-journal/isomorphism 必填）

## 完整打法
（具体命令 / 兜底方案 / 证据要求。命令必须真实可复跑，证据要求对齐
 poc-evidence-snapshot：命令+退出码+输出摘要。）
```

## b. 五触发写回（field-journal）

任务收尾时对照以下五条，**任一命中即写回**一条 field-journal 条目：

1. **任务完成有产出**——验证过的打法值得沉淀
2. **新工具链坑点**——装了/用了新工具踩到坑（版本冲突、平台差异、隐藏依赖）
3. **流程缺陷修复**——既有流程/SKILL 被发现缺陷并修复（修了什么、为什么坏）
4. **路由未覆盖的新场景**——任务形态是技能库没覆盖的新场景
5. **失败但有参考价值**——失败原因/排除过程对后续任务有参考（注意：完整的
   死路账本归 failure-trace-index，见 §e；这里只写「失败中产生的活知识」，
   如「X 手法不行但 Y 变体可行」）

写回内容八要素（缺一不可）：

| 要素 | 说明 |
|---|---|
| 日期 | YYYY-MM-DD |
| 场景 | 场景类别（web/iot/ad/云/逆向…）+ 任务来源卡号 |
| 目标摘要 | 目标类型与关键特征（脱敏，不含凭据/PII） |
| 完整执行链 | 从入口到结果的步骤序列（每步给命令） |
| 坑点 | 哪里会踩坑、症状是什么 |
| 关键命令 | 可直接复跑的命令（真实值，不留 <TARGET> 占位） |
| 可复用模式 | 换目标时哪些参数要改、哪些直接照抄 |
| 证据要求 | 复跑者应留什么证据（对齐 poc-evidence-snapshot） |

写回动作两步：① 新建条目文件（文件名 `YYYY-MM-DD_<slug>.md`，落对应子目录）；
② INDEX.md 加一行（标签+概括+链接）。**只加不删**——旧条目过时就在条目内加
`> 已过时（YYYY-MM-DD）：<原因>` 标注，保留审计轨迹。

## c. 先读后做

新任务开工**第一动作**（在 nmap/目录爆破/任何主动探测之前）：

1. 读 `INDEX.md`，按目标类型/技术栈/漏洞类扫标签列
2. 命中同类条目 → 先读对应完整打法文件再动手（带成熟打法进场，不从零推导）
3. 同时查 `failure-trace-index`（死路账本）——两头都查，避免重蹈死路
4. 逆向类任务另加第一跳：`reverse-ecosystem-index`（别人拆过没）→ 本库 → failure-trace-index

## d. 同族迁移条目（isomorphism transfer）

sapper-v2 战绩来源：指挥官读全部题目，识别「结构同形」的题族，把已验证打法蒸馏给
新兵——Digital Shelf 破防后 40 分钟连下 12 旗（repo-sapper-v2.md §5）。

本库对应机制：**isomorphism 类型条目**——把单点验证过的打法抽象成「通用解法 +
适用形状」，新任务命中形状即直接带打法进场。

条目额外必填字段：

```markdown
- 类型: isomorphism
- 适用形状:            # 新目标命中即迁移
  - "结构相同的 Web 应用换细节"（如：同框架 CMS/同插件族的注入点分布）
  - "多阶段渗透链"（如：配对绕过→提权面→root 服务的三段组合）
  - "同代工方案换品牌"（如：同一 SDK/中间件做的不同厂商设备）
- 已验证实例: <在哪些目标上跑通过，给卡号/报告路径>
- 迁移时要换的参数: <哪些是目标特定值，必须替换>
- 迁移时保真的骨架: <哪些步骤直接照抄>
```

纪律：isomorphism 条目**只能从已验证打法抽象**（有 PoC/报告锚点），禁止从理论
推测生成。抽象时保留「已验证实例」字段作证据背书。

## e. 与 failure-trace-index 的分工

| | 本库（knowledge-base） | failure-trace-index |
|---|---|---|
| 记什么 | **活法**：怎么成的（验证过的打法） | **死路**：怎么败的（dead-end 账本） |
| 载体 | INDEX.md + 条目文件（本目录） | engagement 工作区 failures.jsonl |
| 触发 | 任务完成/坑点/修复（§b 五触发） | 尝试失败且死因可复述 |
| 边界 | 失败中产生的活知识（如「X 不行但 Y 变体可行」） | 完整失败事实（X 对 Y 不可行，因为 Z） |

**开工两头都查**：先 INDEX（有没有现成活法）再 failures（是不是已经死过一次）。
一个打法在本库有条目、在 failures.jsonl 也有死路记录时，以更新时间新者为准，
并在条目内互相引用。

## 使用速查

```bash
# 开工先读（先读后做）
grep -i "<目标类型/技术栈>" ~/.hermes/skills/hack-team/knowledge-base/INDEX.md
# 命中后读完整打法
cat ~/.hermes/skills/hack-team/knowledge-base/<子目录>/<条目>.md

# 收尾写回（五触发命中时）
# 1. 建条目文件 → 2. INDEX.md 加一行（标签+概括+链接）
```

## 来源与边界

- 分层事实图/同族迁移：sapper-v2（github.com/N1nEmAn/sapper-v2，MIT）README §2/§5，
  本地正典 /Users/YOURNAME/.hermes/shared/research/hack-teams-fusion-20261101/repo-sapper-v2.md
- 五触发写回/先读后做：reverse-skill（github.com/zhaoxuya520/reverse-skill，MIT）
  README_AI.md『Auto-Evolution Mechanism』节（本地锚点 repo-reverse-skill-AI.md:488-523）
- 两源均按模式自写，未 vendor 任何正文（FUSION-DOSSIER §七 融合纪律 1）
- 本库条目**不产生目标流量**；条目内命令仅在授权 engagement 内复跑
