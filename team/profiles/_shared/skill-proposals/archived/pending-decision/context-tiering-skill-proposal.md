# SkillProposal: context-tiering [create]

## 评审意见（platform-skill-miner 评审通道 · 2026-10-19）

**判定：批准（有条件）**——机制方向正确，交付物已实测在位（`~/.hermes/shared/context-layers.yaml` 与 `model-routing.yaml` 本日本磁盘核验 EXISTS），单源纪律（skill 只留查表步骤、不复制契约数值）符合「合一>散落、单一事实源」裁决倾向。

条件（批准后由 curator 执行时落实）：
1. 创建路径定为 `devops/context-tiering`（提案已指定，无需改）；
2. frontmatter description 首行 ≤57 字符触发句式，须含「SOUL/skill/共享资产写入时查分档」触发词面；
3. 落地时机械验证：`hermes --profile <p> prompt-size --json` 对 ≥1 个 profile 确认新 skill 进 skills_breakdown（skill-library-maintenance Mode 9 smoke test 口径）。

理由：本提案证据类型是「裁决矩阵缺口」而非频率挖掘，但缺口基线有实测数字（49 份 SOUL 全文常驻 14354 行），触发面明确（写作/归档时点），且已排除与 long-session-hygiene / context-degradation-ops / skill-library-slimming 的重叠——三者均管「已膨胀后怎么救」，本提案管「写入时归位防膨胀」，时点不同。



> 提案来源: wx-fusion-20261016 子卡C4（t_f6480ea4，platform-skill-miner）
> 类型: 融合缺口提案（非挖掘频率提案——缺口判定来自 FUSION-VERDICT 而非 comment 挖掘）
> 状态: 待评审 ｜ 提案日 2026-10-16 ｜ 依据裁决矩阵 FUSION-VERDICT-20261016.md §4 C4 行

## 触发条件
写作或归档任何要进 agent context 的资产（SOUL/skill/角色合约/共享 yaml）时，
或发现会话 L2 驻留超预算、context 膨胀稀释时，加载本 skill 查资产应进哪一档。

## 证据链
- FUSION-VERDICT-20261016.md §2:52-54 —— A4「SOUL 全文注入、无分档契约」/A5「worker 不分阶段」均判 ⚠️ 部分，缺口归属子卡C4
- 实测基线 2026-10-16 —— 49 份 SOUL.md 全文常驻合计 14354 行（最大 588 行）；cognition-lattice 单参考文件 239 条目全量；无任何分档约束
- article-A-harness-rewrite.md:148-150 —— 机制原文：分层加载防膨胀稀释 attention + 过早重启丢理解成本
- 交付物 —— ~/.hermes/shared/context-layers.yaml（契约本体）+ model-routing.yaml（同卡姊妹契约）

## 四段式内容
1. 触发条件 → 新建/修订 SOUL、写 skill、配置共享台账、会话 context 膨胀自检时
2. 标准步骤 →
   1. read_file ~/.hermes/shared/context-layers.yaml 取三档定义与预算
   2. 按四类资产（soul/skill/role_contract/reference_doc）查 asset_placement.by_class 归位
   3. 新资产默认 L3；升档须 ≥3 会话实际引用；升降档走 miner 提案 → curator 裁决
   4. 重开决策只看 cold_restart.triggers CR-T1..T4，达线先落盘再重开
3. 陷阱 →
   - 把操作手册长文写进 SOUL 头部（L1 爆预算，全文稀释）
   - 巨型 references 整体读进 context（应留 L3 路径锚点）
   - 未达触发线就重开（丢理解成本）；达线不落盘就重开（丢状态）
4. 验证 → yaml 契约可 safe_load；SOUL 头部 ≤ 全文 10%；单会话 L2 驻留 ≤3 个 skill 全文

## 与既有 skill 关系
- 新增（不并入）。排查过 long-session-hygiene（会话内状态保全纪律）、
  context-degradation-ops（压缩运行时机制）、skill-library-slimming（skill 数量瘦身），
  主题均不重合；分工边界表见 ws-c4-context/REPORT.md §6。
- Related 设计: long-session-hygiene（触发线数值对齐 60 轮/压缩 3 次）、
  context-degradation-ops（压缩机制背景）、llm-routing-redlines（模型路由红线）。

## 预期收益
新资产写作时有机械归位依据，止住 context 体量无约束增长；
会话重开决策从「感觉卡了」变成查触发线，减少过早重启丢理解成本。

## 落地说明
批准后由 platform-skill-curator 裁决创建 devops/context-tiering，
正文以 ~/.hermes/shared/context-layers.yaml 为单一事实源，skill 只留触发词+查表步骤，
不复制契约数值（避免双源漂移）。
