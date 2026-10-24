# runtime/mattpocock-skills — CLI 层运行时物化（第 14 个外部运行时）

> **定位**：上游技能本体的忠实镜像，按需调用——AI 在对应节点按需读取技能原文（SKILL.md 及其引用附件）并按其执行。与方法论层 [references/mattpocock-skills-methodology.md](../../references/mattpocock-skills-methodology.md) 构成双层：方法论层是 swarm-yuan 消化后的机制改写（进九节点流程），本目录是上游原语全文（保留上游编排技能间的网状引用，直调不悬空）。
> **分发**：随 install.sh 整体安装到 8 宿主（runtime/ 不在分发排除清单）；不进 generate-skill.sh UNIVERSAL_FILES（目标技能产物不携带，体积预算不受影响）。

## 来源登记

| 项 | 值 |
|---|---|
| 上游仓库 | https://github.com/mattpocock/skills （Matt Pocock，MIT，LICENSE 副本在本目录） |
| 物化基线 | main `49dd158`（2026-10-09，v1.3 未出 tag 线上态） |
| 物化日期 | 2026-10-15（R114 运行时整合轮） |
| 范围 | engineering 20 技能 + productivity 7 技能（整目录含附属文件与 agents/openai.yaml，忠实镜像） |

## 不取清单与理由

| 上游目录 | 理由 |
|---|---|
| skills/in-progress（7 技能） | 上游自标未完成（chief-of-staff / claude-handoff / loop-me 等） |
| skills/misc（4 技能） | git-guardrails-claude-code 为 Claude Code 专用（违背工具无关总目标）；migrate-to-shoehorn 特定库迁移；scaffold-exercises 教学脚手架；setup-pre-commit 与既有 L2 git pre-commit 重叠 |
| 上游安装链（claude plugin / skills.sh / setup-matt-pocock-skills） | 物化即达，不走上游安装链（同 R86 纪律；setup-matt-pocock-skills 技能本体保留在镜像内供 triage 等编排技能引用不悬空，但 swarm-yuan 不调用它做安装） |

## 技能清点（27 = 20 engineering + 7 productivity）

engineering：ask-matt（全族路由器）/ code-review / codebase-design / diagnosing-bugs / domain-modeling / grill-with-docs / implement / implement-spec / improve-codebase-architecture / pr / prototype / research / retro / setup-matt-pocock-skills / tdd / to-spec / to-tickets / triage / wayfinder / wizard

productivity：grill-me / grilling（访谈原语，被 5 个编排技能复用）/ handoff / teach / to-questionnaire / wait-what / writing-for-agents

## 刷新方法（运行时例行刷新轮）

```bash
git clone --depth 1 https://github.com/mattpocock/skills /tmp/mattpocock-skills
# 基线核对：git -C /tmp/mattpocock-skills log -1 --format='%h %ci'
rm -rf swarm-yuan/runtime/mattpocock-skills/engineering swarm-yuan/runtime/mattpocock-skills/productivity
cp -R /tmp/mattpocock-skills/skills/engineering /tmp/mattpocock-skills/skills/productivity swarm-yuan/runtime/mattpocock-skills/
# 更新本文件「物化基线」行；技能清点若有增删同步本节与 facts.conf FACT_MATTPPOCOCK_SKILLS
```

## 使用立场

- MIT 许可，上游署名保留在本目录 LICENSE；镜像不改动上游文件内容（刷新时整目录替换，不产生本地 diff 噪音）。
- 消费方式是**读原文执行**，不是复述摘要：ask-matt 上游原话"summaries here are for orientation only"——调任一技能前读该技能 SKILL.md 全文。
