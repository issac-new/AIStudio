# Spec：会话饥饿检测器 + 任务卡分类判据（run20 复盘四大件之 D6 与卡分类，overlay 侧）

- 分支：`fix/run20-d6-starvation-card-classify`
- 日期：2026-10-16
- 上游裁定：用户指令「4 个大件没修的 立刻修好」（同批 simharness 侧 spec=docs/specs/2026-10-16-run20-four-major-items.md，本 spec 覆盖其中 overlay 侧两件）
- 复盘正本：overlay/docs/2026-10-16-run20-retrospective.md（D6、C6 分类挂账项）

## 一、问题定义

| 件 | 问题 | 实测锚点 |
|---|---|---|
| D6 会话饥饿 | wei 形态：in=78K 涨、out=1-8 token ×4 轮临界空转，靠人工发「立即换会话令」救场——无产品检测面、无自动处方 | issues.log wei-session-starvation 条目；run20 22:24 实录 |
| 卡分类 | 零交付检测器只出「候选+人工分诊」：治理类卡合法无锚 vs 研发类零凭证无机器判据，31 张候选逐张人工判定 | evidence/work-report.md 零交付遥测节 |

## 二、设计

### D6（detectSessionStarvation，detectors.ts）
- 判据：emptyStreak ≥ 3（可调）∧ 上下文压力（watermarkPct ≥ 65 或 contextLength ≥ 60K）；
  streak ≥ 6 且高压 → high。
- 与 D10 empty-streak 的边界：低水位空转=可能卡住（等得回来）不判；本检测只收
  「再等无益」的交集形态。
- nudge 面接入（inspector.ts）：session.starved 入提醒催单覆盖面，专属换会话令
  文案（新会话只干显式命令清单三行交接：卡号/基线/下一条命令，禁陪等）——通用
  收尾三步对饥饿是错误处方。profile 提取补 session: 前缀形态（wei@matrix→wei）。

### 卡分类（card-classify.ts，新模块=判据单一源）
- classifyCard：①有 branch/commit 锚→delivery；②治理词 ∧ 无研发词→governance；
  ③研发词 ∧ 无治理词→delivery；④双命中/双不命中→uncertain。
- detectZeroDelivery 升级：governance 静默剔除（计入 detail.governanceNoAnchor
  可反查）；delivery 强告警（summary 改「研发交付类卡零凭证」）；uncertain 维持
  人工分诊（禁机器臆断，不升 high）。

## 三、验收
- vitest：session-starved.test.ts 7/7（空态/低水位不判/未达阈/双代理/warn/high/接线）；
  zero-delivery.test.ts 11/11（原 7 + 分类 4：治理静默/研发强告警/不确定/静默清单反查）。
- 巡检官套件全量回归（127 例）。

## 四、复用约束
- 分类规则单一源=card-classify.ts；判据变更须同批改 zero-delivery.test.ts 分类用例。
- 饥饿判据参数走 DetectOptions（starveStreak/starveContextTokens/starveWatermarkPct），
  禁在调用方各写阈值。

## 决策记录

| # | 决策 | 理由 | 替代方案（否） | 可逆性 |
|---|---|---|---|---|
| D1 | 饥饿=空转×压力交集而非仅空转 | 低水位空转可能自愈；交集形态才需换会话（run20 wei 判读依据） | 扩 empty-streak 阈值（误伤低水位卡住） | 可逆 |
| D2 | 换会话令=告警+处方文案，不自动杀会话 | 在途工作丢失风险；先可见后自动化 | 自动轮换（越权） | 可逆 |
| D3 | 分类 v1 用标题规则 | 卡 schema 无类型字段（上游面）；规则可测可调 | 等 schema 加字段（阻塞） | 可逆 |
| D4 | uncertain 维持人工分诊不升 high | 分类不确定时高噪高级别=告警疲劳（run20 巡检官致盲史同型） | 全升 high（噪音） | 可逆 |
| D5 | spec 随分支提交 | L2 spec-first（R109-D8） | --no-verify | 可逆 |
