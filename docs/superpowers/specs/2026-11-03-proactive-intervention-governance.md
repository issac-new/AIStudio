# 校准化介入：注意力治理者、反馈台账与三层计分卡

日期：2026-11-03
状态：implemented
触发：用户「深入调研 https://mp.weixin.qq.com/s/2Ge6Pp2oCAk8fZx7NUE3dg 完善AIStudio」。综述《Proactive AI for Superintelligent Agents》的第三条与第四条命题（校准化主动性、三层评估）在仓内无对应实现——判定权限的轴已经很强，决定「合不合时宜」的注意力轴、反馈回路与用户层指标全缺。调研全文见 `docs/reports/2026-11-03-proactive-ai-survey.md`。

## 变更

- 新增 `custom/server/proactivity/intervention-governor.ts`：介入治理纯函数。输入候选干预（面/严重度/受众/话题键/预期收益/打断成本/时效）＋注意力偏好（安静时段/日预算/时预算/同类冷却/拒绝退避/最低分）＋近期干预史，输出 `deliver | defer | batch | suppress | escalate | clarify | hold` 与理由码、下次窗口。**四门顺序对齐全文**（p24-28）：安全必达 → ①置信（不足先澄清）→ ②价值/成本（冷却、拒绝退避、收益阈值、未来接受度折现）→ ③时机（安静时段、任务断点、注意力预算）→ ④风险（不可逆+对外→优雅不动；代价可逆/影响团队→要求确认）。
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
| D7 | 反馈只落台账与校准读数，不自动改用户显式偏好 |
| D8 | 四门顺序与 `clarify`/`hold` 两档对齐全文，而非压成规则优先级 | 摘要版只有「抑制/延后」，全文明确低置信应先澄清、不可逆且等待便宜应优雅不动；两者是不同的产品行为 | 继续用 suppress 兜底（否决：把「需要问」和「不该说」混为一谈） | 是 |
| D9 | 成本按性质分账（attention/resource），只有注意力型占人面预算 | 全文 p26：建议花注意力、环境动作花资源与风险，共用一把尺会两头都算错 | 统一预算（否决：资源型动作被无关注释） | 是 |
| D10 | 断点由看板事件自动推断，而不是调用方自觉 | 全文 p27「骑现成断点」是可测的现实信号；靠调用方手填等于把时机判断交回给最想发消息的那一方 | 保持调用方传参（否决：自证对自己的时机有利） | 是 |
| D11 | 缺证据判「非断点」而非「不确定」 | 推断错误的代价不对称：误判成断点=打断人，误判成非断点=延后到下次 | 三态返回（否决：治理者只有二值，三态会被压缩成默认放行） | 是 | 综述要求「允许用户纠正触发这次行动的记忆或规则」，但自动改配置会让人失去控制感 | 自动调参（否决：控制感反过来下降） | 是 |

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
