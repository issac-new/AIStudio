# 统一失败根因分类器（failure taxonomy）

> **何时读我**：任何测试/命令/走查失败后的处置决策点——先归类，再按本表处理策略与回流目标行动；改 `assets/hooks/failure-detector.sh` 的 `_classify_failure` 规则表前必读（两处须同步，`tests/test-failure-detector.sh` 分类态锁一致）。首行：# 统一失败根因分类器（failure taxonomy）。

## 定位

来源：MTSC2026《AI Native 测试工程实践》（极智嘉）六类根因约束的本仓化。核心纪律：**每类失败对应唯一处理策略与回流目标，禁无效重试**——同一错误第二次出现时，处置动作必须换，不允许「再跑一次试试」作为策略。

此前问题：五套失败相关台账/机制（error-history.jsonl 三态模式分析、runaway 六信号、issues.log 问题单、gate-deny.jsonl 门禁拦截、gap_register 能力缺口）各自为政，「这次失败属于哪类、该走什么策略、回流到哪」没有统一答案——AI 在调试时凭直觉选动作，无效重试由乏监督。

## 六类根因（单一事实源）

| category | 语义 | 机械初判规则（签名特征，优先级自上而下） | 处理策略（唯一） | 回流目标 |
|----|------|------------------------|----------------|---------|
| `ENV` | 环境/数据态异常：端口占用、服务未起、未注入、依赖缺、权限 | `EADDRINUSE`、`ECONNREFUSED`、`command not found`、`No such file or directory`、`Permission denied`、`ENOTFOUND`、`EACCES` | 环境重置（`npm run inject`/起服/清缓存）后**再试一次**；环境修复是幂等快操作，先排除性价比最高 | recipes 环境配方（新的环境坑沉淀配方条目） |
| `TIMEOUT` | 超时类：等待预算耗尽、网络超时、死等 | `timeout`、`timed out`、`ETIMEDOUT`、`waitFor timeout`、`deadline` | 放大预算（一次）或标记跳过；**禁死磕重试**——超时重试大概率同超时 | 预算配置（走查 timeout 常量/服务端 waitForOptions） |
| `PRODUCT` | 产品真实缺陷嫌疑：服务端 5xx、状态稳定不符 | `status (code )?(500\|502\|503)`、`Internal Server Error`、`ECONNRESET` | 记 defect 台账（不修测试迁就产品错）；**重试确认稳定复现后定性** | issues/defect 台账（走查 ledger.defect / simharness issues.log） |
| `SCRIPT` | 测试/脚本自身代码错：语法、import、类型、引用 | `ModuleNotFoundError`、`SyntaxError`、`ImportError`、`Cannot find module`、`TS[0-9]{4}`、`is not a function` | **修一次即止**，修完不重跑全量只跑目标；改同处重跑=无效重试 | 脚本/测试文件本身 |
| `FLOW` | 用例设计错：断言失败但环境正常（前置数据/断言口径/时序设计缺陷） | `AssertionError`、`Assertion failed`、`expected … to be/equal/contain/match` | 回流用例设计段（spec §19.2 Given/When/Then）重推前置与断言，**不现场改断言迁就** | spec §19.2 用例骨架 |
| `UNKNOWN` | 机械不可判（无规则命中） | —— | AI 复核归类后按对应类处理；复核不了的列残留疑点 | decisions.jsonl（定性记录） |

**机械层不判的两类（AI 复核专属，防越权误判制造错误信任）**：
- `PRODUCT` 的确证需「重试稳定复现」证据（机械只标嫌疑）；
- `FLAKY`（抖动）需跨次比较——同命令二次运行结果不同才成立，判据化重跑一次（对齐 simharness `tests/run-gates.sh` worker RPC 抖动重跑惯例），确认后走「隔离+豁免登记」而非放任。

## 五套台账映射（互通靠词汇，不统一协议）

| 台账 | 承载 | 与 category 的关系 |
|------|------|------------------|
| `.swarm-yuan/error-history.jsonl` | PostToolUse 失败流（签名/计数/三态模式） | **唯一落 `category`+`category_source:"rule"` 字段的机械台账**；`category_source=rule` 表初判，AI 复核后可改写为复核结论 |
| simharness `evidence/issues.log` | 推演问题单（ISSUE/DISP append-only 事件流） | 协议不动（`mx-compensation-ledger.sh` 按首词「延后」判处置）；人工归类时描述用本表六类术语 |
| `.swarm-yuan/gate-deny.jsonl` | 门禁拦截（spec-required 等） | 治理拦截非失败根因，不映射 category；独立面 |
| `gap_register.yaml`（RSI 外部） | 能力缺口（id/domain/severity） | 域不同（能力建设 vs 失败处置），仅 severity 术语对齐 |
| `.swarm-yuan/decisions.jsonl` | 决策三级分类 | UNKNOWN 定性结论落此（type=Mechanical） |

## 执行投影与同步纪律

- `assets/hooks/failure-detector.sh` 的 `_classify_failure` 是本表的执行投影：优先级 `ENV > TIMEOUT > PRODUCT > SCRIPT > FLOW > UNKNOWN`（环境错会伪装成一切下游错误，先排除）。
- 改任一侧必须同步另一侧；`tests/test-failure-detector.sh` 分类态断言 hook 规则关键词在本表存在（防两处漂移，模板↔产物双向同步纪律）。
- 分类提示随现有 L1/L2+ 输出块附一行（不建独立输出块），格式：`根因初判=<CATEGORY>——<处理策略一句话>`。
