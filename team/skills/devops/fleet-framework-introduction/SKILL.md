---
name: fleet-framework-introduction
description: "Use when introducing a new framework as fleet soul."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, framework-introduction, methodology, design-doc]
    related_skills: [soul-framework-propagation, design-doc-feynman-craft, cybernetics-dual-lens]
---

# Fleet Framework Introduction（新框架引入集群灵魂）

引入一个尚未落库的方法论框架（某理论体系/外部理念）作为 agent 集群灵魂时加载。
触发词：引入框架、作为灵魂、理论底座、认识论总纲、收编升维。
「传播已定稿框架到 N 个 SOUL」是另一阶段，机械学见 soul-framework-propagation（default 库 symlink，本 profile 只读）。

## 步骤（顺序执行，前两步决定后面全部质量）

1. **盘点现有理论资产** — 主设计文档理论节 + skills 库相关透镜 skill + AGENTS.md 证据分级，逐一列出。工作系统几乎总已隐式使用框架方法（机制域/验收门/决策闭环就是具象），先列资产再谈新增。
2. **逐元素分类：收编 vs 缺口** — 框架每个成分映射到现有资产：已有机制承载 = 收编升维（引用机制与证据强度）；真缺 = 缺口（新设计 + 固化门槛）。禁「推倒重来」叙事——抹掉在跑机制、重开已裁决的决策。
3. **同轮写边界裁决（防硬套）** — 每个成分声明什么不迁移（数学工具/领域模型/第二套本体/替代现有门禁）；上游透镜 skill 已裁定的直接引用，不重裁。
4. **载体分层，先于写文案** — 决策回路层（SOUL 内嵌自检问句，agent 真拿来做决策闸）→ 机制锚定层（设计文档标注各机制域归哪个成分）→ 透镜 skill 层（固化门槛：≥3 次真实使用记录。机制存在≠机制被使用，禁预建样子货）。
5. **铺开顺序** — 先 patch 框架 owner profile 自己的 SOUL（成为权威版，SOUL git 备份可回滚）→ 设计文档落指路行（as-is 措辞）→ N 文件舰队写延后到用户批准重构设计之后（重型变更纪律）。

## 舰队 SOUL 落点速查（工程舰队实测）

- 锚点普查先于一切（grep 每个候选标题计命中数）。47 profile 工程舰队实测：`## 标准作业循环` 46/47（仅 orchestrator 无）、`## 你是谁` 44/47。
- 无主锚点的 profile（通常 orchestrator）：就地升级其现有决策/自检段，禁为凑锚点硬造新节。
- 岗位透镜定制：共享骨架（框架核心问句）全员一致；主镜按团队职能分派（调研岗=信息类、编码岗=验证类、运维岗=控制类、架构/建模岗=系统类），落到各岗位自己的作业循环而非抽象背书。
- 验收 frozen：grep 框架关键词计数 = 舰队规模 + 抽查跨团队文件 + audit 脚本无回归 + SOUL git 备份确认提交。

## Pitfalls

- 框架引入 ≠ 框架传播：跳过盘点直接铺 SOUL = 把隐式方法论写成空中楼阁，且与在跑机制打架。
- 收编判定带证据强度：Exercised 级机制才可标收编；Present 级如实标低，不拔高。
- to-be 重构方案独立成文、as-is 主文档只放指路行；落地到 Wired 才回写主文档，未落地就回写 = 主文档自述假现状。

## Related Skills

- **soul-framework-propagation** — 传播阶段机械学（census/patch/marker 验收/批量脚本纪律）
- **design-doc-feynman-craft** — to-be 重构文档与 as-is 主文档的分离形态
- **cybernetics-dual-lens** — 已有透镜收编的先例（控制论成分直接引用其裁定，不重裁）