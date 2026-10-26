# V8.54 编码委托证据位接线批（2026-10-26）

分支：`fix/delegate-evidence-wiring`（worktree `delegate-wire`，自 origin/main f5113d944 起）

## 变更

V8.54 §5.4.3「编码委托证据位」已立规范（三正本同步批），本批完成两侧接线（挂账清偿）：

1. **报告能力正本（custom/server/report/evidence-blocks.ts）**：新增 `delegateEvidenceBlock(logText)`——编码委托证据块（原文透传+引擎身份行齐备/缺失判定横幅；缺身份行标 `delegate-identity-missing`）。与 qgateBlock 同款「导出件原文透传、禁手抄结论」纪律，maskEnvPaths 脱敏。
2. **推演执法面（simharness/aipay-scenario.sh G3）**：ACP 后端轮的 per-branch 检查由「日志存在」扩展为「存在 ∧ 含 `engine_bin_source=` 身份行」——缺身份行记问题单 `delegate-identity-missing`；同时把各分支身份行/终态行采集到 `$EVID_DIR/delegate-identity.txt`（报告证据源）。
3. **报告生成面（mx-report-gen.py）**：新增 `delegate_identity_block(n)`（步 18 挂载）——`evidence/delegate-identity.txt` 在位即原文透传，缺席零渲染（非 ACP 轮零影响），与 qgate_block 同款。
4. **判定一致性**：unified-report-layer.py 问题单分类表加 `delegate-identity-missing: coding` 并计入 G3 缺口合计；守门测试 harness-gate-integrity.test.ts 增场景脚本包含断言。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 产品侧只加证据块构造器（纯函数），不改 report-controller 路由 | 委托日志当前经推演链路产生，产品侧尚无采集通道；能力正本先备好块构造与判定语义（V8.54 唯一事实源的消费面），控制器接线随产品侧出现该数据源时一行接上 | 现在就接 controller（否决：无真实数据源，空转路由） | 是 |
| D2 | 执法粒度=身份行 `engine_bin_source=` 必在，RESULT 行只采集不拦 | 身份行是 V8.54 的强断言（「ACP 调用的是谁」）；RESULT 缺失已有既有口径（G3 testlog/委托失败族），重复立法无增益 | 连 RESULT 行也拦（否决：与既有失败口径重叠） | 是 |
| D3 | 采集件形态=`evidence/delegate-identity.txt` 每分支身份+终态行 | 与 qgate-release-report.txt 同款「文件在位才渲染」契约，历史轮零影响 | 逐分支独立文件（否决：N 文件枚举复杂度无收益） | 是 |

## 设计文档影响

DESIGN_SYNC: none
理由：本批是 V8.54 §5.4.3（已入 fullflow，三正本同步批 f5113d944）的实现接线，规范面零改动；产品侧判定语义与规范逐字一致（delegate-identity-missing 键名同源）。

## 验证

- 产品侧：`npx vitest run custom/server/report/__tests__/delegate-evidence-block.test.ts` **4/4 绿**（身份齐备/缺失/空日志/脱敏四态）。
- 推演侧：`bash -n aipay-scenario.sh` 过；`py_compile` mx-report-gen.py 与 unified-report-layer.py 过；守门测试 `simharness> npx vitest run tests/harness-gate-integrity.test.ts`：㉔（Ycode 引擎驱动接线）**含本批新增三断言全绿**；全文件 8 败/120 过＝基线 9 败减一（顺手根治 ㉔ 的旧布局回退路径 `../overlay`→仓根，bare worktree 下 cat 旧路径必炸的单仓遗留缺陷），其余 8 败全为既有环境类（stash 差分基线同败实证），零新增。
- 一致性：issue 键名 `delegate-identity-missing` 四处同源（scenario 闸门/unified-layer 分类+合计/守门测试断言/产品块横幅）。
- 额度探针（21:19）：coding-plan 仍 1310 上限（2026-10-27 02:17 重置）——「模型按技能执行」E2E 维持挂账，复验口令：/tmp 临时项目落 `.agents/skills/<x>-dev` + 会话要求按技能前缀回复，断言回文带前缀。
- 未验证项：真实 run 级全链（下一轮 ACP 后端推演实跑时 G3 新门禁/采集件/报告透传三面自然首验）。

## 挂账

- 产品侧采集通道（studio 面消费 delegateEvidenceBlock）——产品报告页出现委托证据数据源时接线（D1）。
