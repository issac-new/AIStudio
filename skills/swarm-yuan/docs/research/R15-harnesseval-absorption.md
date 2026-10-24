# R15：MirroS HarnessEval 调研与吸收（2026-08-21）

> 来源：机器之心《开启Benchmark的Harness时代：15家学术机构联合发布HarnessEval》（2026-08-18）+ 源码实证 `research/harnesseval-w/`（master afa6c5f，浅克隆，mirros-lab/harnesseval-w）。
> 性质：评测层 Harness 吸收——与 R14 better-harness（工作流审计层）互补；swarm-yuan 的三层 Harness 拼图（过程强制门禁层 + 工作流审计层 + 评测层）完整。

## 一、HarnessEval 核心机制（源码实证）

| 机制 | 内容 | file:line |
|---|---|---|
| **证据树 = digest 链式锚定** | plan → skill cache → agent cache → bundle → score 的分层 artifact 链；下游 digest 含上游 digest，上游变动自动使下游 stale | `skill_intentional_change_vlm.py:636-705`、`runner.py:284-287`、`score.py:251-258` |
| **Skill 三段式** | 身份常量头（SKILL_ID/VERSION/CACHE_CONTRACT）+ Backend Protocol（backend_id/version/config_digest/execution_mode 四元组）+ 纯函数评分（不碰 IO）+ 缓存优先 evaluate | `skills/skill_render_quality.py:20-279`、`skills/common.py:15-30` |
| **Plan-Route-Decompose-Verify 四阶段** | 显式 CLI 阶段：plan（LLM 计划，缓存）→ eval inventory（INPUT_AUDIT 前置清点，fail-closed）→ eval run-skills → eval score → verify run（全矩阵重走） | `cli.py:23-287`、`pipeline/planner.py`、`pipeline/runner.py:154-156` |
| **选择即证据（负空间可审计）** | selected_skills[].reason + skipped_skills[].reason 双列表——启用要记理由，跳过也要记理由 | `planner.py:159-171, 444-452`、`benchmark/plans/*/*.skill_plan.json` |
| **缺证据宁 invalid 不插值** | normalized_metrics 拒绝插值；status 体系 ok/invalid/missing_cache/blocked；invalid 不参与聚合 | `skills/common.py:33-52`、`aggregate.py:88-97` |
| **审计即完成条件** | INPUT_AUDIT 不过不开工（fail-closed）；validate_run 按 manifest×model 全矩阵重走 + 重跑必须是 no-op（幂等性作为验收条件） | `runner.py:154-156`、`validation.py:18-251` |
| **cache 只存证据，分数读时派生** | 缓存命中后重跑 result_from_metrics，status≠ok 视为不存在；分数永远是读时派生（防规则改了旧结论还在背书） | `skill_render_quality.py:188-189`、`score.py:396-401` |

## 二、吸收三问评审与落地

**裁决**：P3/P4/P5/P7 落条件（4 单元），P2（cache 只存证据+分数读时派生）与 gate-runs 存证据+report 派生同构印证，P1（Skill 三段式）/P6（聚合分离+证据压帽）登记候选。

### 落地单元（全部落条件，可执行）

1. **digest 链式锚定（P3）**：`decisions.jsonl` 增 `ref_trace_hash` 字段——decisions 记录引用同项目 trace.jsonl 末行 cksum。下游 artifact（decisions）的 digest 含上游（trace 末行）：trace 被篡改 → ref_trace_hash 失配 → 全链 stale 可检出。三本账从并列升级为链式。
2. **missing_evidence 态（P5）**：`gate-report.sh` 证据态分级加第三态——"该测没测"显式计数（≤59），不算 Present（机制存在）也不算 Exercised（用过），独立"缺失"态（缺证据宁 invalid 不插值）。
3. **gate-plan 选择即证据（P4）**：新建 `scripts/gate-plan.sh`——任务开工 `--plan "enable:a,b|skip:x(理由),y(理由)"` 落 `.swarm-yuan/gate-plan.json`；收口 `--diff` 对比计划 vs 实际触发：missing_evidence（启用未触发）/ 计划外执行 / skip 声明被违反，全部 advisory 提示。负空间可审计。
4. **audit-closure 审计即完成条件（P7）**：新建 `scripts/audit-closure.sh`——goal_id 全集的 closure 完备性报告（open/closed 分布 + open goals 列表）；`--strict` 有 open goal 时 exit 2；串到 mark-active 状态门（advisory 降级：有 open 时 warn 不阻断，fail-open 教义）。

## 三、不吸收清单（显式登记）

- Skill 三段式 schema 化（门禁证据 JSON 化——大动作，触发条件=门禁证据需跨 run 复用时）
- evidence-adjusted cap（证据压帽——门禁是布尔放行无"分数打折"语义，触发条件=引入评分制评测时）
- LLM planner（AI 选 skill——需 LLM 基础设施；gate-plan 用声明式手工 plan 代替）
- 12 指标 backend（megasam/unidepth/CLIP 等视觉指标——与 swarm-yuan 代码门禁场景无关）

## 四、候选登记

| 候选 | 触发条件 |
|------|----------|
| Skill 三段式（门禁证据 JSON + 纯函数评分 + 缓存契约） | 门禁证据需跨 run 复用时 |
| evidence-adjusted cap（证据质量差时结论降级） | 引入评分制评测（非布尔门禁）时 |
| audit-closure --strict 从 advisory 升级为阻断 | 用户报"open goal 交付了但没被发现"时 |

## 五、验证

17 测试 + gen-e2e 全 PASS；digest 链验证（decisions 引用 trace 末行 hash 非空）；gate-plan plan+diff 四类不一致全部检出（missing_evidence/计划外/skip 违反）；audit-closure --strict exit 2 正确（open goal 检出）。
