# Spec：零交付遥测检测器 completion.zero-delivery（run20 复盘产品化）

- 分支：`fix/run20-zero-delivery-detector`
- 日期：2026-10-16
- 上游：用户 goal「run20 推演复盘——识别产品问题并修复完善」批
- 复盘正本：overlay/docs/2026-10-16-run20-retrospective.md（P 类问题·产品面）

## 一、主旨与范围

run20（20261015-v8-run20）收官工作台账遥测发现「done 状态但卡 body 无 commit= 锚的卡
31 张」——标记完成却无代码证据。当时处置=收尾时人工逐张判定（治理/台账类卡属合法无
锚，研发交付类卡=零交付形态），判定停留在报告层的文本遥测，产品无持续监测面。

本 spec 范围=把该遥测产品化为巡检官检测器一件；不在范围=分类判据自动化（治理类 vs
研发类的机器分类需卡类型字段，属后续产品化项，见§五）。

## 二、问题定义（实测锚点）

| 锚点 | 事实 |
|---|---|
| run20 evidence/work-report.md「零交付遥测」节 | done 卡 body 无 commit= 锚 31 张；原文口径「治理/台账类卡属合法无锚，研发交付类卡=零交付形态——逐张人工判定」 |
| run20 evidence/issues.log `ISSUE\|zero-delivery\|director\|...` | 该遥测当时仅记问题单+观察归桶，未产生产品检测面 |
| 巡检官既有检测器面（detectors.ts） | delivery.anchor-missing 管「有分支不可反查」、completion.no-realwork 管「过程无真做」、card.body-empty 管「正文空」——「done 但零交付引用」无对应检测器（缺口实证） |

## 三、设计

判据：done/completed 卡 ∧ 无 `branch_name` ∧ body 无 `commit=<hex7+>` 锚 →
`completion.zero-delivery`（severity=warn），聚合单条异常（subject=
`board:zero-delivery-candidates`），detail 带候选卡清单（≤20 封顶防载荷爆）+
total 真值+分诊提示。

与既有检测器边界（防重复报）：有分支引用→归 anchor-missing；负责人无真做行→归
no-realwork；正文空→归 body-empty。本检测只收「三者皆非但 done」的零凭证形态。

误报口径：治理/台账/评审类卡合法无代码锚（run20 实测 31 张中多数属此类）——定级
warn 且 summary 明示「须人工分诊」，禁一键升 high：分类判据未产品化前，高噪高级别
=告警疲劳（run20 巡检官垫片致盲史的同型教训：告警不值钱=没有告警）。

fail-open：runningCards 面未接线=合法空态静默（同族检测器语义）。

## 四、验收

1. `vitest run custom/server/clusterinspector/__tests__/zero-delivery.test.ts` 7/7：
   空态/非 done 五态/有 commit 锚/有分支引用/聚合单条+total/清单截断 20/detectAll 接线。
2. detectAll 全量入口接线实证（防漏接线空转——测试第 7 例）。
3. 隔离树不影响其他检测器（套件全量回归）。

## 五、复用约束与后续

- 检测器判据（无分支+无 commit 锚）是「零交付」的操作性定义，若后续产品化卡类型
  字段（governance/delivery 分类），本检测应升级为「研发类卡零交付=warn、治理类
  卡无锚=静默」，届时改判据须同批改测试第 3/5 例语义。
- 检测器只读 kanban 卡面，不写任何状态（巡检官全体只读纪律）。

## 决策记录

| # | 决策 | 理由 | 替代方案（否） | 可逆性 |
|---|---|---|---|---|
| D1 | 新文件 detectors-zero-delivery.ts 而非并入 detectors.ts | 并行会话正在同文件做安全轮 M7 检测器，合并编辑冲突风险高；独立文件+一行接线 | 直接并入 detectors.ts（冲突风险） | 可逆 |
| D2 | 定级 warn 不 high | 治理类合法无锚占多数，分类判据未产品化；高噪高级别=告警疲劳 | high（误报轰炸） | 可逆 |
| D3 | 聚合单条异常而非逐卡一条 | 31 张候选逐条=31 条告警刷屏；聚合+清单截断保信噪比 | 逐卡（噪音） | 可逆 |
| D4 | 检测器只出候选不自动定罪 | 「零交付」定性需人（分类未产品化）；机器只负责可见性 | 自动改状态/自动派修（越权） | 可逆 |
| D5 | spec 随分支提交满足 L2 spec-first 门禁 | R109-D8 起历史 spec 不放行；本 spec 即实施正本 | --no-verify（放弃流程约束） | 可逆 |
