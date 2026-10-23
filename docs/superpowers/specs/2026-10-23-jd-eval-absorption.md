# 京东评测体系吸收轮：稳定性复测＋难度/角色分桶＋secrets 采集器补缺

- 日期：2026-10-23
- 状态：已落地（feat/eval-jd-absorb）
- 源文：《京东 Agent 评测体系技术拆解：从 6 亿人的购物车里长出来的评测体系》（银翼AI评测室，2026-10-23，mp.weixin.qq.com/s/RyR5lGNlmWBfo-AUz6-Daw）
- 关联正本：`2026-10-23-swarmstudio-integrated-design.md`（Eval Studio 章）

## 背景与缺口对照

四路探查（Eval 域/SIM 场景/观测层/安全审计）对照文章七条可借鉴实践的结论：

| 文章实践 | 吸收前现状 | 本批处置 |
|---|---|---|
| 评估器性价比阶梯（代码比对优先） | S0 规则打底→S1 裁判→人工兜底，成本纪律完备 | 无需改 |
| 稳定性也是指标（同批样本多次调用） | 只有 referenceLeakCheck 换序检验；TTL 判定缓存把同输入钉死，抖动结构性测不出 | **落地 stabilityRetest** |
| 难度分级宁缺毋滥（P0-P3） | difficulty 全库零命中 | **落地 byDifficulty** |
| 归因按角色切（分工边界即归因边界） | 只有 byLink 六环节（行为环节），无责任主体维度 | **落地 byRole** |
| 证据模态隔离/防泄漏 | referenceLeakCheck＋密封集＋held-out 三层 | 无需改 |
| 双螺旋（基准既当尺子又当靶场） | workbench 证据只认 Eval 真实运行 | 无需改 |
| 安全红队（Agent 工具链独立成项） | toolpipeline 五钩子已在；但 secaudit `secrets` 面自始声明 `collector:'secrets'` 而 collectAutoEvidence 从未产出该键——声明与实物不符 | **补 scanDeploySecrets** |

## 落地内容

### 1. 输出稳定性复测（stabilityRetest）

- `POST /runs` 可选参数 `stabilityRetest`（2-10 整数，超界 400 拒绝；判定成本随轮数线性放大，默认关）。
- 实现（`custom/server/eval/judge.ts`）：S1 首轮判定后同输入再判 N-1 轮；retest 轮缓存键加盐（`salt: 'retest-<r>'`）绕开 TTL 缓存——不加盐则同输入永远命中缓存，抖动被缓存钉死，结构性测不出。裁判请求载荷不变（盐只进缓存键不进模型输入）。
- 读数口径：`judgeMeta.outputStability = { rounds, checked, flips }`（attempt 级）→ 聚合 `aggregates.outputStability = { rounds, checked, flips, flipRate }`（run 级，rounds 取参与 attempt 的最大轮数）。
- **flip 不改判词**：与 referenceLeakCheck 的语义区分——那个是判据锚错对象（方法论错误，置 unknown 进人工）；本读数是同输入重复判定的结论漂移（模型温度抖动，是模型属性），纯观测呈现，不污染 pass 率口径。
- 前端（`EvalReportPanel.vue`）：新增「稳定性读数」区块，同时呈现 outputStability 与此前无出口的 judgeStability（参照答案锚定检验）。

### 2. 难度分桶（byDifficulty，宁缺毋滥）

- `EvalTask.difficulty?: 'P0'|'P1'|'P2'|'P3'`（可选；共识不稳定不硬标，未标注如实进 untagged 桶）。
- 聚合 `aggregates.byDifficulty`（`metrics.ts byDifficultyOf`）：按 P0→P3→untagged 固定序输出任务数与桶内 pass@k；全未标注 undefined 不产噪。
- 出题校验（`store.ts validateTask`）：非法档位拒绝。

### 3. 责任角色分桶（byRole，归因按角色切）

- `EvalTask.role?: string`（1-32 字符；建议值 planner/implementer/reviewer/tester/sre/audit/ops，对齐 SIM 15 角色编制的责任域子集）。与 `link`（链路环节）正交：link=行为发生在哪一环，role=这一环的责任主体是谁。
- 聚合 `aggregates.byRole`（`metrics.ts byRoleOf`）：按标注角色分桶出任务数/通过数/桶内 pass@k，失败经桶直达责任方——归因进运营动线而非事后报告。全未标注 undefined；不回任务 id 清单（密封集报告只回聚合的契约不变）。

### 4. secaudit secrets 部署面采集器补缺

- 新文件 `custom/server/secaudit/deploy-scan.ts`：`scanDeploySecrets()` 扫描部署根（`SECAUDIT_DEPLOY_ROOT` > `~/.hermes`，深度≤3，≤300 文件，单文件≤512KB）下配置类文件（json/yaml/toml/env/ini/cfg/conf/log/txt），复用 `repo-scan` 导出的 7 条密钥形态规则；跳过 traces/db/sessions 数据目录。只读、fail-soft，命中≠已泄露（三态裁决仍归 engine/verify）。
- 接线 `collectors.ts`：`out.secrets = scanDeploySecrets()`——secrets 面自动兜底自本批起名实相符。
- 与 `repo_secrets` 的分工：那个扫代码仓 repoRoot（源码内嵌密钥），本采集器扫部署根（运行时配置与日志中的令牌落盘/日志泄漏）。

## 决策记录

1. **D1 flip 不置 unknown**（stabilityRetest）：温度抖动是模型属性不是判据错误，置 unknown 会污染 pass 率；作纯读数供选型/门禁消费。与 referenceLeakCheck（置 unknown）的语义分界写进两处类型注释。
2. **D2 盐只进缓存键不进模型输入**：retest 的目的是测模型同输入的真实抖动；改请求载荷等于改输入，测的就不是同输入。
3. **D3 难度/角色均为可选标注、全未标注缺省**：沿用 dimension/coverage 的诚实口径（标注是承诺不是装饰），自动推断难度/角色=造数。
4. **D4 byRole 不回任务 id 清单**：密封集报告只回聚合的既有契约优先于归因便利；非密封面 attempt 明细本来可查。
5. **D5 stabilityRetest 限 2-10**：2-3 轮够出翻转率；上限防误把整批判定预算烧在复测上。
6. **D6 deploy-scan 不扫 traces/db/sessions**：运行时数据产物尺寸大且密钥形态命中多为业务数据误报；配置与日志才是 secrets 面 focus（令牌落盘/日志泄漏）的主战场。

## 验证

- 新增单测 `custom/server/eval/__tests__/eval-jd-absorption.test.ts`（15 用例：分桶/复测/缓存盐/校验/部署扫描）全绿。
- eval 域＋secaudit 域回归 26 文件 250 用例全绿（含既有 212 例零回归）。
- `npm run typecheck:harness` 0 错误（清单追加 deploy-scan/repo-scan 及 eval 五文件）。

## 挂账（未落地，待裁定）

1. **行为数据当评测信号**（文章实践②：采纳率/活跃度/调用次数当评测读数）——obs-signals 已有调用量遥测但口径是可观测性，接入 eval 判分属产品层改动，另行立项。
2. **评测结果翻译成经营语言**（文章实践⑦：GMV/转化率类业务表述）——现有虚拟损益表半步，完整翻译层需业务收益侧数据源，另行立项。
3. **红队检测器 S1 接线**（toolresultguard 三段门控的 S1 未接红队侧，`redteam/detector.ts:26` 如实声明）——后续轮。
4. run-trace 插件 golden-span 钉测「文档声明有、实物缺席」（README:85 引用的测试文件不存在）——Python 侧，不属本批。
