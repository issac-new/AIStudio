# HarnessPro×Harness 十一坑双文吸收轮（2026-10-23）

## 背景与来源

两篇 2026-10-23 微信文章，源码级实锚：

1. **《智谱唐杰署名 RSI 新成果开源！Agent 自我进化成本还狂降 53%》**（量子位 19:30）。
   正主 = **HarnessPro**（arXiv 2610.26770，2026-10-19 提交；github.com/pzs19/HarnessPro，
   main@2026-10-19，691 文件，已克隆 /tmp/harnesspro-research 实读）。无标签自进化框架：
   帕累托优化引入 Agent 底座进化，Heavy 档平均 +2.0pp 通过率 / -26.1% 成本（vs RHO），
   Medium 档 SWE-Bench Pro 单点成本 -53.0%。仓库发布三基准×Lite/Medium/Heavy 九套
   进化产物 harness（policy.json+hook.py+rubric）+ 评测设施；四 Agent 进化循环本体
   未随仓发布（仅论文层面）。
2. **《换模型效果归零？一文扒透 Harness 落地 11 个坑》**（腾讯云开发者 08:45，茹炳晟）。
   认知/实践/组织三层 11 误区；实践层引 OpenAI/Anthropic 实验：同一模型仅改 Harness
   编码基准 6.7%→68.3%、Terminal-Bench 2.0 52.8%→66.5%；三种致命失败模式 =
   过早宣布胜利 / 上下文焦虑 / 越权操作。

SwarmStudio 改进实验台已有 RSI 七项正则化（spec: 2026-10-23-rrsi-regularized-workbench.md：
退火预算/泄漏批评者/噪声地板/成本规则/停滞/剪枝/失败假设不复提）。本轮吸收
两文的**未覆盖机制**，全部有源码/论文实锚。

## 机制 → 本仓落点（映射表）

| # | 来源机制（实锚） | 本仓落点 |
|---|---|---|
| HP-1 | 帕累托前沿三档选拔：淘汰「花钱更多分还更低」的帕累托劣势候选；归一化加权平方距离选 Lite（省钱）/Medium（均衡）/Heavy（高性能）代表（论文摘要+量子位文） | `workbench/loop.ts` 新纯函数 `paretoFrontier()`+`tierPicks()`；晋级门新 blocker `pareto_dominated`（选中候选被其他已记录候选支配=花钱更多分还更低，硬拦）；overview 提案详情出 `pareto` 段；`HarnessImprovePanel.vue` 提案卡新增帕累托表（候选×通过率×成本×档位×淘汰原因） |
| HP-2 | 前缀缓存复用纪律：进化钩子把阶段提醒拼接在工具返回结果末尾，「完美保护 Prompt 前缀缓存」（hook.py `_stage_context` 经 additionalContext 注入+量子位文） | 晋级门新 warning `prefix_cache_churn`：候选改动 always_on 常驻文件（SOUL.md/config.yaml/constraint-policy.md，`loop.ts:64` 既有清单）且 diff 含删除行 → 提示常驻面前缀缓存将被击穿，建议追加式编辑。信息级 warning（人裁决），文案如实标注启发式 |
| HP-3 | 运行时阶段阶梯：工具调用次数达 economy_after_tools → 经济阶段提醒；达 strict_after_tools → 收敛警告（每 reminder_every 次重发）；超 finalize_after_tools → 拦截并令「保留当前文件，基于现有证据交卷」（hook.py `_stage_context`/`_pre_tool_use`；三档=同机制不同旋钮，TB2 lite/medium 仅 finalize 38→44，heavy 18/38/60） | 新纯函数模块 `server/goalbudget/stage-ladder.ts`：三档预设（fraction of maxSteps：lite 0.35/0.65/0.95、medium 0.40/0.70/1.0、heavy 0.50/0.80/1.0）、`stageAt()`、`escalationMessage()`（文案锚 hook.py 语义）；`goal-autonomy.ts` 预算触顶 reason 引用 finalize 交卷语义；workbench `validateTree` 对含 PreToolUse/PostToolUse hook 的树候选新 issue `hook_stage_thresholds_missing`（hook 未声明递增阈值 economy<strict<finalize） |
| HP-4 | 工具输出折叠：连续重复行折叠 `[previous line repeated N more times]`+超长输出头尾截断留中间省略标记+原文落盘可回查（hook.py `_compact_text`/`_post_tool_use`） | 新 `server/toolresultguard/fold.ts`：`foldRepeats()`（连续相同行折叠）+`compactOutput()`（折叠+头尾截断+省略标记+rawLength）；`eval/judge.ts` `truncateForState()` 接线：截断前先折叠重复行（判分输入只减重复噪音，语义不变，注释+测试锁定） |
| HP-5 | 三种致命失败模式检测（腾讯文引 OpenAI/Anthropic）：过早宣布胜利（判定来自自我感觉非机器可验证事实）/上下文焦虑（长任务 70% 上下文将满开始赶进度）/越权操作（调用被禁命令） | `clusterinspector/detectors.ts` 新检测器 `detectContextAnxiety`（session.context-anxiety：watermarkPct≥80 或 compaction=now ∧ 空转/多轮换签名——区别于 D9 纯水位，要求行为签名）与 `detectSensitivePath`（security.sensitive-path：`sensitivePath24h` 采集了但从未告警的真空）；`Anomaly` 新可选字段 `failureMode`（文章三轴分类轴），既有 premature-victory 家族检测器（completion.zero-delivery/no-realwork/body-empty）打标——卡片级过早宣布胜利已有零交付族覆盖，本轮补分类轴与两真空检测器 |
| HP-6 | LLM 裁判盲目乐观：失败案例召回仅 41.7%，换合成可执行测试后 83.3%（论文+量子位文）；「选手和裁判不能是同一个人」生成/评估分离（腾讯文误区六引 Anthropic） | `eval/judge.ts` 冲突判词新结构化字段 `conflictDirection`（'s0_no_s1_yes'=裁判漏判失败 / 's0_yes_s1_no'=误杀方向）；`eval/evaluators.ts` 审计新段 `judgeCalibration`（S0 决定性样本上算裁判失败召回 failureRecall，含旧判词 reason 回退解析）与 `judgeIndependence`（生成侧 `target.model` vs 裁判模型同源 → note+watch）；纯审计读数，不改判分口径 |
| HP-7 | 记忆「保鲜」与「置信度」（腾讯文误区三：三个月前的决策被当成今天的真理；用户确认与模型猜测混在一起） | 新 `workbench/experience-freshness.ts` 纯函数：confidence 数值化（low .3/medium .6/high .9）× 半衰期 90d 时间衰减（自 lastValidatedAt）；`Experience` 新可选字段 `lastValidatedAt`；service：提案晋级时给引用的 experienceIds 刷新 lastValidatedAt（采纳=再验证）、回滚时清除该次刷新；经验库列表/导入出 freshness 派生（fresh<30d/aging<90d/stale≥90d）排序；面板经验库段新增保鲜列 |

## 设计决策

1. **纯函数优先**（与 RRSI 轮同纪律）：HP-1/3/4/6/7 核心逻辑全部纯函数层
   （loop.ts/stage-ladder.ts/fold.ts/evaluators.ts/experience-freshness.ts），
   service/inspector 只编排，单测覆盖全分支。
2. **门禁分级**：`pareto_dominated`=blocker（论文「无情淘汰帕累托劣势废案」的直接对译，
   机械可判无歧义）；`prefix_cache_churn`/`hook_stage_thresholds_missing`=warning/info
   （启发式与结构性提示，人裁决）；裁判校准与独立性=纯审计读数进 notes/riskLevel，
   不改判分与门禁契约（unknown 计不通过的口径不动）。
3. **帕累托口径**：双目标 = passAt1（越大越好）× costUsd（越小越好）。支配定义：
   候选 A 支配 B ⟺ A.passAt1≥B.passAt1 ∧ A.costUsd≤B.costUsd ∧ 至少一严格。
   null 读数不参与（无成本读数的候选不进前沿，如实列 excluded）。三档代表 =
   两轴 min-max 归一化（econ=1−归一成本）后，距档位参考点欧氏平方距离最近的前沿
   候选：lite=(0,1) 最省角（性能接受前沿地板）、medium=(1,1) 双优点、heavy=(1,0)
   最高分角——「归一化加权平方距离准则」的可解释实例化，档位偏好编码在参考点
   （论文未公开公式细节，如实标注为本仓实例化；首版乌托邦点+权重法在三点前沿上
   会让均衡款包揽三档，实测弃用）。
4. **阶段阶梯挂 goalbudget 不改 agent 运行时**：hermes-agent 是独立运行时（Python，
   upstream），本轮不动其补丁面；阶梯以纯机制库落在 goalbudget 域（与 GoalBudget
   三预算同域），goalautonomy 消费；workbench 侧只加 hook 候选的阈值声明检查
   （树候选本就支持 scripts+HOOK_EVENTS）。不宣称运行时已接线，如实标注消费方。
5. **conflictDirection 向后兼容**：新判词带结构化字段；旧判词（只有 reason 串）
   由 evaluators 按本仓自定格式的正则回退解析（`/^S0 (yes|no) \/ S1 (yes|no) 相反/`，
   judge.ts:477 自定契约，测试锁定）。failureRecall 只在 S0 决定性（s0/s0+s1 非
   unknown）样本上计算，无样本 → null 如实缺席。
6. **保鲜是派生不是状态**：Experience 状态机（candidate/adopted/retired）不动；
   freshness/confidenceScore 现算派生（RRSI 轮 evolution 段同模式，不落盘）。
   仅 lastValidatedAt 落盘（可选新字段，旧库零迁移）。
7. **检测器零误报纪律**（同族语义）：context-anxiety 要求水位/压缩态 ∧ 行为签名
   双条件（纯水位已由 D9 报，重复报=狼来了）；sensitive-path 沿用预警先行版
   （只报不拦，warn 起、量大升 high），黑名单语义不变。
8. **i18n**：面板新增文案全部进 `improve-i18n.ts` 域级字典（zh/en 成对），零新 patch。

## 验证计划

- `loop.test.ts`：paretoFrontier（支配淘汰/互不支配前沿/null 排除）、tierPicks 三档
  归属、晋级门 pareto_dominated 与 prefix_cache_churn 分支。
- `stage-ladder.test.ts`：三档预设阈值序、stageAt 边界（economy/strict/finalize 跨越）、
  阶梯文案、hook 阈值声明检查（缺声明/乱序/合规）。
- `fold.test.ts`：重复行折叠（>2 折叠/=2 保留）、头尾截断+省略标记、短文直通、
  truncateForState 折叠后语义锁定。
- `detectors` 测试：context-anxiety 双条件矩阵（水位×行为签名）、sensitive-path
  阈值与升级、failureMode 打标（zero-delivery→premature-victory）。
- `judge/evaluators` 测试：conflictDirection 结构化与旧 reason 回退解析一致、
  failureRecall 分母为零→null、judgeIndependence 同源/异源/缺席三分支。
- `experience-freshness.test.ts`：数值化基数、半衰期衰减、fresh/aging/stale 分档、
  晋级刷新与回滚清除（service 层编排测试）。
- 全量：workbench/eval/clusterinspector 域 vitest + ts-node 全编（真型门）；
  8649 面板走查帕累托表与保鲜列。

## 决策记录

- 2026-10-23 吸收轮立项：用户指令「深入调研两文完善 swarm studio」。批次=上表
  HP-1..HP-7 七机制四域（workbench/观测/评测/经验库）。未采纳项如实挂账：
  ①合成测试生成器（论文四 Agent 之一，无源码可依、需真实判定端联调，挂账待判定端
  在线轮）；②动态路由五档分类器（需任务分发路径改造，超出本轮）；③企业级约束
  评测场景（误区十一，评测集内容工程，非机制缺口）；④Harness 组件退役检测
  （误区九「拆墙」侧，待晋级门使用统计积累后）。
- 帕累托三档代表权重为本仓实例化（论文未公开公式），已标注；blocker 而非 warning
  的理由：支配关系机械可判且语义无歧义（花钱更多分还更低），与论文「无情淘汰」对齐。
- conflictDirection 正则为本仓自定契约的回退解析，非外部格式依赖。
