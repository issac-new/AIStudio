# FACT 键豁免登记（WP1）

> 决策 48：每个 `FACT_` 键必须有执行面机器消费者，或在本表登记理由。
> 本表替代 `self-check.sh` 中内联的 `_fk_exempt` 字符串；新增键二选一：接消费者，或在此登记。

| 键 | 理由 | 登记日 |
|----|------|--------|
| `FACT_FLOW_NODES` | 九节点流程叙述数；workflow.md 结构叙述，无机械对账面 | 2026-10-21 |
| `FACT_DECISION_TYPES` | 决策三级分类数（Mechanical/Taste/UserChallenge），方法论叙述 | 2026-10-21 |
| `FACT_DOMAINS` | 32 领域清单规模；domain-knowledge.md 目录级叙述 | 2026-10-21 |
| `FACT_CONF_VARS_USERFACE` | user 面必配项预算；注释自承估算值，不设等值断言 | 2026-10-21 |
| `FACT_LOOP_ORACLE` | 布尔启用标记；hook 存在性由 install/渲染面覆盖 | 2026-10-21 |
| `FACT_COMPACTION_JOURNAL` | 布尔启用标记；同上 | 2026-10-21 |
| `FACT_FAILURE_DETECTOR` | 布尔启用标记；同上 | 2026-10-21 |
| `FACT_INTEGRITY_GUARD` | 布尔启用标记；同上 | 2026-10-21 |
| `FACT_TRACE_CHAIN` | 布尔启用标记；链校验由 trace-log --verify-chain 行为测试守 | 2026-10-21 |
| `FACT_DECISION_LOG` | 账本文件名登记；路径事实，非计数断言对象 | 2026-10-21 |
| `FACT_BOOTSTRAP_GATES` | 三档自举序列说明；注释自承“非 3 个门禁”，防误读登记 | 2026-10-21 |
| `FACT_SPEC_ENFORCE_LAYERS` | 四层拦截模型叙述；L1-L4 面由 test-r101/r103 行为测试守 | 2026-10-21 |
| `FACT_FRAMEWORK_EVIDENCE` | 布尔启用标记；framework-evidence.sh 台账 TSV | 2026-10-21 |
| `FACT_CONF_RENDER_PROFILES` | conf-render 档位数；三档行为由 test-conf-render 覆盖，不按键名对账 | 2026-10-21 |

## 说明

- 本表只登记“设计上无机器消费面”的叙述/台账级键；能接消费者的键应优先接消费者。
- 新增豁免必须写理由；无理由的键由 `self-check` 的 FACT 消费闭环断言 fail。
- `registry-render.sh --dead-facts` 与本表共用同一判据，输出未登记的死键。
