# 校准化介入：注意力治理者、反馈台账与三层计分卡

日期：2026-11-03
状态：implemented
触发：用户「深入调研 https://mp.weixin.qq.com/s/2Ge6Pp2oCAk8fZx7NUE3dg 完善AIStudio」。综述《Proactive AI for Superintelligent Agents》的第三条与第四条命题（校准化主动性、三层评估）在仓内无对应实现——判定权限的轴已经很强，决定「合不合时宜」的注意力轴、反馈回路与用户层指标全缺。调研全文见 `docs/reports/2026-11-03-proactive-ai-survey.md`。

## 变更

- 新增 `custom/server/proactivity/intervention-governor.ts`：介入治理纯函数。输入候选干预（面/严重度/受众/话题键/预期收益/打断成本/时效）＋注意力偏好（安静时段/日预算/时预算/同类冷却/拒绝退避/最低分）＋近期干预史，输出 `deliver | defer | batch | suppress | escalate` 与理由码、下次窗口。规则优先级：critical 必达 → 同类冷却 → 拒绝退避 → 安静时段 → 预算 → 待议积压合并 → 反复延后升级 → 收益成本阈值 → 放行。
- 新增 `custom/server/proactivity/intervention-ledger.ts`：append-only 干预台账（决策与反馈两个事件面），派生校准读数（按面/话题的接受率、忽略率、平均响应时长、拒绝后应退避时长建议）。
- 新增 `custom/server/proactivity/proactivity-scorecard.ts`：三层计分卡——任务层（被采纳建议数）、机制层（决策分布、合并/延后命中）、用户层（打扰次数、接受率、忽略率、撤回率、安静时段拦截数、预算触顶数、信任校准度＝接受率与前次撤回率的背离）。
- 扩展 `custom/server/proactivity/proactivity-controller.ts`：`GET|PUT /attention`（偏好，落盘）、`POST /interventions/sync`（从 delivery 建议拉取候选并裁决落账）、`GET /interventions`（按状态过滤）、`POST /interventions/:id/feedback`（accepted/rejected/ignored/modified/takeover/snoozed）、`GET /scorecard`。新端点一律走 `lib/http` 的 `ok/fail`（K19 只减不增）。
- 新增客户端治理面板「介入治理」区：偏好表单、计分卡三段读数、干预队列与反馈按钮（`ProactivitySection.vue` 扩展 + `improve-i18n` 同级字典）。
- 设计同步：正本 §5.8 增「注意力轴」一条；总账 §A 增两行稳定参数（介入决策五档、注意力预算缺省值）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 治理者只判「何时以何形态递给人」，不改两轴权限判定 | 两轴管「最多能做到哪一步」，注意力轴管「现在该不该出现」，正交；混在一起会让权限判定承担节流语义 | 在 `assess()` 内加时机参数（否决：纯权限函数被 IO 化） | 是 |
| D2 | 受众分 `human` 与 `agent`：注意力规则只约束 human 面 | 催办 agent 的 Matrix 消息不是「消费人的注意力」，套安静时段会让夜班编排停摆 | 统一按 human 治理（否决：误伤 agent 协作面） | 是 |
| D3 | 拒绝后同类退避，而不是「换种说法再劝」 | 综述点名的失败模式：把拒绝理解成「解释不够」再劝一遍 | 拒绝后提高说服强度（否决：训练出更能说但更没用） | 是 |
| D4 | 反复延后升级（同话题 ≥3 次 defer 且从未投递） | 延后过久等于静默丢弃；升级是「别再等了」的显式出口 | 无上限延后（否决：安静的丢失比吵闹更糟） | 是 |
| D5 | 收益/成本用可解释启发式（0-1 标度），不训练模型 | 缺真人反馈数据，先有可解释排序；训练留到有反馈量之后 | 学习式打分（否决：无标签时不可验证） | 是 |
| D6 | 安全告警不接治理者 | 安全告警不是「主动建议」，静默它等于削弱边界 | 统一治理（否决：可能吞掉安全事件） | 是 |
| D7 | 反馈只落台账与校准读数，不自动改用户显式偏好 | 综述要求「允许用户纠正触发这次行动的记忆或规则」，但自动改配置会让人失去控制感 | 自动调参（否决：控制感反过来下降） | 是 |

## 验证

- `custom/server/proactivity/__tests__/intervention-governor.test.ts`：critical 必达、同类冷却、拒绝退避、安静时段（含跨夜窗）、日/时预算触顶、积压合并、反复延后升级、低于阈值抑制、agent 受众不套安静时段、窗口计算边界。
- `custom/server/proactivity/__tests__/intervention-ledger.test.ts`：决策与反馈落账、坏档隔离、校准读数（接受率/忽略率/退避建议）。
- `custom/server/proactivity/__tests__/proactivity-scorecard.test.ts`：三层投影、空台账合法读零、信任校准背离。
- `custom/server/proactivity/__tests__/interventions-http.test.ts`：偏好读写校验、sync 从 delivery 建议生成干预并落账、反馈流转、状态过滤、scorecard 端点。
- 全量 `npm test` 与 `npm run typecheck:harness`。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：§5.8 增注意力轴与三层评估的约束句。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§A 增两行稳定参数（介入决策五档、注意力偏好缺省）。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec 与本轮报告，计数递增。
