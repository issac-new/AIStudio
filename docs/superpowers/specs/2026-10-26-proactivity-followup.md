# 主动性两轴挂账清偿批（2026-10-26）

分支：`feat/proactivity-followup`（worktree `proactivity-followup`，自 origin/main 0516fc565 起）。前批=2026-10-26-proactivity-two-axis.md（判定面落地，main 97d5afb08）。

## 变更

清偿前批全部四项挂账＋生产换装：

1. **H4 执行面接线（enforce-gate 消费两轴裁决）**：新增 `custom/server/proactivity/enforcement-policy.ts`（per-profile 两轴策略存储 `policy.json`：level/contract/goalId，与对齐台账同目录）＋ enforce-gate 增第四级策略源——总闸 `HERMES_PROACTIVITY_ENFORCE=1`（默认 0=零行为变化，对齐 HERMES_TOOL_ENFORCE 先例）且该 profile 有策略条目才执法；只收紧不放宽（硬边界之后、阶梯之前）；工具→纵轴档映射=read 类=观察面恒放行（L5 告知也要能看）、非 read 按风险档映射 reversible/irreversible_exec；裁决复用 `assess()` 单一事实源。新规则：`proactivity-inform-only`（L5 非 read）、`proactivity-draft-cap`（L4 无契约非 read，**可走审批桥**——人核即「起草待确认」语义闭环）、`proactivity-goal-drift`（L4 目标 stale/never-confirmed，不可审批桥豁免——须重新确认目标而非批一次单）。内部异常 fail-open；拒绝走既有 emitDenyEvent（govbus security/high）。
2. **治理 UI**：`custom/client/governance/components/ProactivitySection.vue` 挂入 `GovRegistryRulesView`（AutonomyLadderSection 之后）：两轴矩阵（服务端 /model caps 渲染，无双端复算）、策略编辑（profile/level/契约/关联 goalId）、对齐清单（状态 chip+确认按钮）、assess 演算器；API 入 `governance/api/incident-suite.ts`（ladder 同款）。
3. **goals.py 目标自动登记（补丁 696）**：vendor hermes `GoalManager.set()/set_contract()` 时 fail-soft upsert 对齐台账（同机共享文件 `~/.hermes-web-ui/proactivity/alignment.json`，原子替换、保确认历史）；契约事实透传——goal 有 completion contract（验收规则）即 `acceptanceCriteria=true`（升仓通道的自动判据）；`HERMES_GOAL_ALIGNMENT_OFF=1` 可关。goalId=`hermes-goal:<session_id>`（会话轮转经 migrate 语义天然一条活跃目标）。
4. **文章 §7 基础设施映射对账**（见下「§7 映射」节入册）。
5. **8647 换装＋实物走查**：合并后重启后端，curl 带 JWT 实测五端点，浏览器走查治理页 ProactivitySection。

**§7 映射（Qoder Cloud Agents 基础设施清单 → AIStudio 对应物）**

| 文章要素 | AIStudio 对应 | 状态 |
|---|---|---|
| 稳定身份与记忆（目标跨会话持续） | agentidentity 域＋48 profile 常驻＋hermes memory＋goals.py 跨会话（migrate_goal_to_session） | 已有 |
| Channel（事件与时机） | automations 四源（file/kanban/git/webhook）＋Matrix 群聊/私聊触发 | 已有 |
| Schedule | hermes cron＋autosched | 已有 |
| 云端执行环境（离线继续） | 本机常驻网关（launchd/nohup babysit）＋session rotation——单机形态的「行动不因会话关闭而停」 | 已有（形态差异如实：非云端） |
| 权限/确认 | enforce-gate 四级链（身份/沙箱预算/声明式策略/阶梯）＋proactivity 两轴＋审批收件箱（14 介入点） | 本批补两轴 |
| 运行记录 | tool-exec-audit JSONL＋govbus 事件总线＋审批留痕＋policy-decisions 决策账 | 已有 |

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | enforce-gate 以第四级策略源接入，总闸独立（HERMES_PROACTIVITY_ENFORCE），默认关 | 零行为变化先例（HERMES_TOOL_ENFORCE）；两轴是正交新维度，独立闸门可单独灰度 | 并入阶梯档位（否决：语义混轴）；默认开（否决：改变存量执法行为须独立灰度） | 是 |
| D2 | read 类工具=观察面恒放行（含 L5） | 文章 L5=「告知我你观察到了什么」——不能看就无从告知；纵轴 inform 档天然容纳 | L5 连读都拒（否决：消解 L5 语义） | 是 |
| D3 | proactivity-draft-cap 进审批桥（APPROVAL_CLASS_RULES），inform-only/goal-drift 不进 | 起草待确认=「人核后生效」，审批单正是人核通道；目标漂移须改目标本身（确认台账），批一张单放行一次=漂移防线被击穿 | 全部可审批（否决：L5 目标猜错/目标过期不是批一次能修的） | 是 |
| D4 | goals.py 直写对齐台账文件（同机共享 JSON），不走 REST | 单机桌面形态下两进程同文件；REST 需 JWT 通道（agent 侧无凭据面），为登记开无鉴权内路=削弱安全边界（红线）；kanban.db 直读是既有先例 | agent→REST 登记（否决：鉴权面）；studio 侧观测登记（否决：studio 无 goal 生命周期观测点） | 是 |
| D5 | 登记挂在 set()/set_contract()（创建与契约变更），不挂每轮 _save | 每轮 upsert 写文件徒增写放大；两轴事实只在目标文本/契约变化时变 | 挂 _save（否决：写放大+与确认写的竞态窗口放大） | 是 |
| D6 | 策略与对齐台账同目录（~/.hermes-web-ui/proactivity/，policy.json+alignment.json） | 同域两文件，一次目录覆盖（env）双隔离 | 各自独立目录（否决：测试隔离面翻倍无收益） | 是 |

## 验证

- 新增三组测试 48/48 绿（2026-10-26 worktree 实测）：`custom/server/proactivity`（原 21+新增 policy 存储/事实装配/HTTP 契约）、`toolpipeline/__tests__/proactivity-enforce.test.ts`（四级链 9 用例：L5/L4 无契约/漂移/契约齐备放行/未配置不执法/总闸默认零变化/draft-cap 审批桥归类）、`custom/client/governance/__tests__/proactivity-section.test.ts`（矩阵 caps 渲染/策略保存/对齐确认/演算器/降级诚实 6 用例）。
- 补丁态拼合树 pytest：`python3.14 -m pytest vendor/hermes-agent/tests/hermes_cli/test_goals_alignment_ledger.py` **6/6 绿**（登记带契约事实/无契约 acceptanceCriteria=false/upsert 幂等保确认历史与 createdAt/set_contract 就地更新/OFF 开关+坏档容错/登记失败不阻断 goal 生命周期）。
- clean+inject 全链重放 0 FAILED（含 696；首版新文件段 diff --git 头与 +++ 路径不一致被 inject WARN 跳过——修头后重放通过，此坑记档）。
- `npm run typecheck:harness` 0 错（enforcement-policy.ts 并入点名清单）。
- 全量 `npm test`：898 文件＝892 过/6 跳过；6,431 用例＝6,420 过/11 跳过/**0 失败**，exit=0。
- 8647 换装后 curl JWT 实测与浏览器走查：结果随收口段补记。

## 设计文档影响

DESIGN_SYNC: touched
- docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md — §4.3 两轴段「执行面接线挂账」改为已接（HERMES_PROACTIVITY_ENFORCE opt-in）＋审批桥起草语义。
- docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md — 补丁/域计数随批刷新。

## 挂账（本轮不做）

- proactivity 策略的 UI 级灰度预设（按 profile 模板批量下发）。
- SIM_ROOT 推演实例内两轴策略的推演场景化（判据零变化纪律下另轮）。
