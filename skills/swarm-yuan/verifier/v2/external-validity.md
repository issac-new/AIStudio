# 验收标准 v2 - 外部有效性立项稿（External Validity）

> 状态：Phase 2 测量脚本已落地（2026-08-15，`run-v2.sh` + 冒烟自测）；Phase 1 语料标注（≥30 Java/JS + ≥3 非 Java/JS 品类各 ≥10）待采集——语料填满前本文件仍是"无外部有效性证据"。
> v1 回答"重构前后行为是否一致"（内部自洽）；v2 回答"门禁能否拦截真实缺陷"（外部有效）。
> 在 v2 完成并达阈值前，README/PROMO 中"守护代码合规""守护分支质量"等断言须限定为"在 Java/JS Web 品类上验证"（见 R9 样本偏倚声明 + R10 待测品类）。

## 背景：v1 的边界与 v2 的必要性

`verifier/v1` 的 C1（行为等价）证明的是：重构前后，同一 fixture 的判定（violating->FAIL / compliant->PASS）逐字节一致。这只保证"没改坏"，不保证"原本就能拦真实 bug"。

R9-paradigm-realworld-test.md 已诚实披露：5 个真实项目上，fixture 套件**漏掉 3 个 P0/P1 bug**，原因是"fixture 用的是构造的最小样例"。这正是 v1 能证明的最远边界：内部自洽，而非外部有效。

v2 的目标是桥接这道鸿沟--用真实历史 bug commit 作为语料，量化门禁的召回率与精确率。

## 方法

1. **语料采集**：从 R9 测试项目（RuoYi-Vue3 / whatsmars / yudao-cloud 等）的 git 历史中采集 ≥30 个真实 bug 修复 commit，每个 commit 记录：
   - bug 引入 commit（修复 commit 的父提交）
   - bug 类型（安全 / 并发 / 资源泄漏 / 框架误用 / 等）
   - 修复 commit（作为"修复后"对照）
2. **召回率（recall）测量**：对每个 bug 的"引入 commit"跑 `precheck --all-full`，记录是否 fail（任一门禁 fail 即计为"拦截"）。
   - recall = (被门禁拦截的 bug 数) / (总 bug 数)
3. **精确率（precision）测量**：对每个 bug 的"修复 commit"跑同一门禁集，记录是否 pass（修复后应通过）。
   - precision = (修复后 pass 的 bug 数) / (总 bug 数)
   - 低 precision 意味着门禁"误报"--即使 bug 修了也 fail，说明门禁规则过严或与 bug 无关。
4. **F1 报告**：F1 = 2·P·R / (P+R)。附失败案例分析（recall 漏报的 bug 为何漏 / precision 误报的 bug 为何误）。
5. **品类扩展**：与 R10 待测品类对齐--在嵌入式 C / 科学计算 notebook / 单体内核 / Rust 系统编程等品类上各采集 ≥10 个 bug，重复上述测量。

## 验收阈值

| 指标 | 阈值 | 含义 |
|------|------|------|
| recall | ≥ 0.5 | 门禁至少拦截半数以上真实历史 bug，方可宣称"有外部有效性" |
| precision | ≥ 0.7 | 修复后至少 70% 的 bug 能 pass，否则门禁误报率过高不可用 |
| 品类覆盖 | ≥ 3 个非 Java/JS 品类 | 避免 R9 的单一品类偏倚 |
| 样本量 | 每品类 ≥ 10 个 bug | 统计显著性下限 |

**未达阈值前**：
- README/PROMO 中"守护代码合规""54 门禁守护分支质量"须限定为"在 Java/JS Web 品类上验证（R9）"
- 不得使用"拦截真实缺陷""保障交付质量"等强断言，改为"辅助发现""工程过程门禁"
- 自举段须保留"自举只证明内部自洽，不证明外部有效"的边界声明（P0-3 已加）

**达阈值后**：
- 可在 README 附"v2 外部有效性报告"链接，声明 recall/precision/F1 数值与品类覆盖
- "守护代码合规"断言可保留，但须附阈值与样本量引用

## 现状

- **Phase 2 已落地**（2026-08-15）：`run-v2.sh` 测量脚本 + corpus.tsv 格式 + `--smoke` 冒烟（链路验证，不构成证据）。Phase 1 语料库仍空——外部有效性证据仍为无。
- v1 的 C1 行为等价 + C8 gate-fixtures + C9 自举仍是当前最强制约，但都属于"内部自洽"层。
- R9 的 5 项目实测是迄今最接近"外部有效"的证据，但样本偏倚（全 Java/JS Web）+ fixture 漏 3 个 P0/P1 的事实，使其不足以支撑"外部有效"宣称。
- v2 的实现优先级低于 P0/P1/P2 修复--先治好修辞诚实（本 WP），再补证据链（v2）。

## 实施计划（非承诺）

1. **Phase 1（语料）**：从 R9 项目 git 历史采集 bug commit，标注类型；目标 30 个 Java/JS bug。
2. **Phase 2（脚本）**：实现 `verifier/v2/run-v2.sh`，对每个 bug 跑 precheck 并记录 exit code + 命中门禁。
3. **Phase 3（测量）**：计算 recall/precision/F1，输出报告 `verifier/v2/report.md`。
4. **Phase 4（扩品类）**：与 R10 待测品类联动，在 ≥3 个非 Java/JS 品类上重复。
5. **Phase 5（断言）**：若达阈值，更新 README 断言；若未达，保留边界声明并记录差距。

Phase 1-3 可在一个独立 WP 内完成；Phase 4 依赖 R10 品类测试进展。

## 与 v1 的关系

| 维度 | v1 | v2 |
|------|----|----|
| 问题 | 重构前后行为一致吗？ | 门禁能拦真实 bug 吗？ |
| 语料 | 构造的 fixture（最小样例） | 真实历史 bug commit |
| 指标 | 退出码向量逐字节相等 | recall / precision / F1 |
| 性质 | 内部自洽 | 外部有效 |
| 状态 | 已实现，CI 强制 | Phase 2 测量脚本已落地（2026-08-15），Phase 1 语料待采集、Phase 5 断言未接——达阈值前无外部有效性证据 |
| 阈值 | diff 必须为空 | recall ≥ 0.5 / precision ≥ 0.7 |

v1 是 v2 的前提--若门禁连"前后一致"都做不到（v1 红），测 recall/precision 无意义。v1 绿是 v2 启动的门槛。
