---
name: skill-recall
description: 归档技能检索与召回——技能清单已收敛治理, 低频技能在归档区, 检索并按需恢复
---

# 技能召回 (skill-recall)

当前技能索引经过边界治理(shared/skill-fence.py 按 profiles.yaml allowlist 收敛):
每个 profile 只挂载自己类目的技能; 低频/一次性技能已归档, 不占系统提示词。

## 何时用
- 任务需要的能力不在 <available_skills> 索引中, 或技能描述与任务高度相关但未见条目
- 准备新建技能前——先查归档, 避免重复造轮子

## 怎么做
1. 检索归档清单:
   ```bash
   grep -i "<关键词>" ~/.hermes/skills-archive/MANIFEST.md
   ```
   (MANIFEST 每行含: 技能名 | 原路径 | 归档时间 | 最近使用 | 描述 | 恢复命令)
2. 直接读取归档技能内容(无需恢复即可参考):
   ```bash
   cat ~/.hermes/skills-archive/global/<类目>/<技能名>/SKILL.md
   ```
3. 需要恢复到索引时(一次性任务完成后可再归档):
   ```bash
   ~/.hermes/hermes-agent/venv/bin/python ~/.hermes/shared/skill-lifecycle.py restore <技能名>
   ```
4. 顶层单例技能恢复后需在 ~/.hermes/shared/profiles.yaml 的对应 profile 增补 skills_pinned, 再重跑 generate-configs.py。

## 纪律
- 新技能一律建在既有类目目录下(devops/research/...), 禁止新建顶层单例目录——顶层目录会被 fence 归档
- 一次性任务成果优先 hindsight 记忆, 只有可复用流程才沉淀为技能
