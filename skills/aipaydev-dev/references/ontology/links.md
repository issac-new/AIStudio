# swarm-yuan 关系类型目录（Link Types）——实体间的类型化关系

> **何时读我**：设计新关系（必配机器锚，无锚不进目录）、评审地图/规则的"是/应当"两区纪律、排查关系断裂（path-check / stability-audit / digest 链）时读。日常开发任务不读。
>
> 本文件定义 swarm-yuan 承诺的关系类型（Palantir Links 的对应物：类型化关系免 ad-hoc 推断）。
> 每个关系类型给出：域（domain，参与方 A 的类型）、值域（range，参与方 B 的类型）、基数、以及**机器锚**（该关系实例的可验证存证）。
> 设计原则：一条关系若无机器锚 = 它只是文档修辞，不进本目录（防止无锚依赖——历史上全部漂移 bug 的根源；见 swarm-yuan/README.md 三章 How · 3.8 完备性——关系派生机制）。

## 关系目录

| 关系 ID | 语义 | 域 → 值域 | 基数 | 机器锚 |
|---------|------|-----------|------|--------|
| `represents` | 表征/关于（地图是仓库的部分表征） | Skill 的 map 部分 → Repository | n:1（一技能表征一仓库） | path-check（表征指向完整性：反引号路径 test -f）+ 计数核验 ≥0.95（覆盖度） |
| `generated_by` | 生成（技能由生成器某版本产出） | Skill → Generator | n:1 | `.swarm-yuan-version` 的 source_repo+version |
| `governs` | 规范性治理（规则约束命令行为——是/应当区分的工程化） | RuleFile → 命令空间 | n:m | gate-rules 求值：每次实例化留命中记录；FORBID 消息即治理关系的可读投影 |
| `records` | 记录（账本行固化一个发生体） | Ledger 行 → Generation/Decision/GateExecution | 1:1（一行一事件） | jsonl 行契约（ts+必填字段）；gate-audit 的 invoked/result 配对审计 |
| `mounted_in` | 挂载（技能的 hook 部分寄宿宿主生命周期） | Skill 的 hooks 部分 → HostCLI | n:m（两宿主） | hooks.json（Claude 形态）/ .codex/hooks.json + codex-gate-wrapper（Codex 形态） |
| `anchors` | 依赖锚定（账本行引用上游账本末态） | decisions 行 → trace 末行 | n:1 | `ref_trace_hash` 字段：篡改 → 失配 → 全链 stale 可检出 |
| `snapshot_of` | 快照（指纹是仓库特定时态的固化） | Fingerprint → Repository 时态 | n:1（新快照不覆盖旧，last-good 保护） | fingerprint 文件 + 骤降 >50% 拒写红线 |
| `propagates_to` | 沿调用链传播（稳定性标记沿调用链向下传播） | StabilityMark → 下游组件 | 1:n | `--stable-diff` 下游传播 warn（决策 28，Palantir markings-propagate 映射） |
| `plans` | 选择声明（任务计划启用/跳过门禁并记理由） | gate-plan 声明 → Gate 族 | n:m | gate-plan.json + `--diff` 收口对账（missing_evidence/计划外/skip 违反） |
| `closes` | 闭环（决策事件关闭某目标） | Decision → Goal | n:1（末次决策定 closure 态） | closure 字段 + audit-closure `--strict` 完备性重走 |

## 关系使用纪律

1. **新关系须带锚**：设计新机制时先回答"这个关系的实例怎么机器验证"——无锚关系只写进调研报告，不进实现。
2. **域值域取自 objects.md**：关系的参与方必须是对象目录里的类型（不引用未定义类型——类型封闭性）。
3. **描述 vs 规范不混写**：`represents` 是描述性的（仓库什么样），`governs` 是规范性的（应当怎样）——地图里可以引用规范词（稳定性标注）但规范的**执行体**只在 rules.d/gates（Hume 是/应当区分的载体纪律）。
