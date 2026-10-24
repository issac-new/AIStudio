---
description: 开始新需求——AI 自动创建 spec + 判断任务类型 + 判断规模 + 预填复用约束
argument-hint: <需求描述>
---
AI 自动：
1.创建 spec 文件
2.判断任务类型（从分支名/用户意图）：feature/fix/refactor/chore/docs/test/exp——映射见 assets/task-type-gates.conf
3.判断规模（优先 task-scale.sh 事前判定；spec 写完后用 detect-spec-scale.sh 复核）：
  - bash scripts/task-scale.sh → simple/standard/full（基于 git diff，不需要 spec）
  - 规则：simple（≤5 文件且不触碰敏感目录）；standard（6-10 文件单一模块）；full（>10 或触碰 public/api/schema/migration/auth/model 等敏感目录 或 跨多服务）
  - 规模不确定按更大规模处理（升档不降级）；公共接口/数据模型/权限改动无"简单"档
4.预填 §5.5 复用约束（从特征卡第 11 项检索可复用稳定单元）
5.运行 --reuse 验证
6.执行门禁集（任务类型 × 规模档取并集，质量优先取更重档）：
  - 任务类型基础集（task-type-gates.conf）：feature→--all-full；fix→--all --reuse；refactor→--all-full --reuse --stable-diff；chore→--all；docs→--docs-pack；test→--all --shift-left；exp→--all
  - 规模档叠加：simple→--all；standard→--all-full；full→--all-full --shift-left
  - 两者取并集（更重档）；compliance 档项目追加 --compliance-suite；compliance 档无"简单任务"豁免
$ARGUMENTS
