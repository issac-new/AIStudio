# capability-ladder — 能力缺口补全阶梯（RSI 内核决策表）

> 单一事实源：本文件。orchestrator SOUL 与 capability-gap-watchdog 消费本表，不各自维护判据。
> 变更纪律：本表属共享规则，改动走变更三分法 normal 档（实现后过独立评审）。设计原型见 ncwk `docs/superpowers/specs/2026-09-18-rsi-kernel-design.md`。

## 判决句

任务找队发现能力缺口时，沿 R0→R3 四级阶梯逐级补全，每档只尝试 1 次；补全的触发自动、采纳按档分权（R0/R1 机械验收即生效，R2 激活须人审，R3 只出提案）；「补好了」的判据是重跑原任务验收命令的退出码，不是补全者的自述。

## 1. 缺口判定（三信号源，全部机械可判）

| # | 信号源 | 判定载体 | 生产者 |
|---|---|---|---|
| S1 | 前置判定 | 分解环 3 查 `_shared/06-observability/skill-catalog.md`，目标 skill 未生成或域未注册 | orchestrator 分解时 |
| S2 | 执行判定 | 卡 `kanban_block(kind="capability")`（落库字段 `block_kind='capability'`） | worker 执行中 |
| S3 | 验收判定 | 收尾打标 `[capability-gap]` 或轨迹签名 `sig-missed-capability`（词表：`_shared/03-evolution-memory/output-contract.md`） | worker 收尾 / evo-nightly 采集 |

三信号汇入同一登记通道：`gap_register.py add --domain capability`（寄存器 `~/.hermes/gap_register.yaml`）。

## 2. 补全阶梯（R0→R3，成本递增、门槛递增）

| 档 | 动作 | 承载 | 验证关 | 采纳通道（变更三分法） |
|---|---|---|---|---|
| R0 借调 | owner-registry backup 接卡；或 capability-graph `--substitute-for` 命中的替代岗 | 调度层派单换人 | 原任务验收命令重跑退出码 0 | standard：机械验收即生效 |
| R1 挂载 | 既有 skill 白名单挂载给在编岗 | platform-skill-miner 唯一装卸通道 + 装卸审计 | 挂载后 skill_view 可加载 + 影子首跑零误报 | standard：装卸审计兜底 |
| R2 生成 | swarm-yuan 流A 为目标仓库生成目标技能 | componentization 五阶段流水线 | 每条验收命令实跑 exit=0；≥1 次真实拦截；mark-active 三关 | normal：生成自动，激活人审 |
| R3 派生 | 新 profile / 新领域 team 提案 | 复制基座编制模式 + 领域知识库清单 | 试运行标记「提案·试运行」+ 成本预估 | normal + HumanGate：只产提案，不自动建岗 |

逐级规则：先 R0 查替代（查得到不生成）；R1 查 catalog 已有（有现成不重造）；R2 才生成；R3 永不自动触发，只能由 orchestrator 产出提案卡。

治理视角：R0-R3 是对能力本体自身的四种受治理写事务，各带前置校验、验证关与治理档。查询入口：`bin/capability-ontology.py --actions`（自描述）、`--dispatch`（派单导航，实时状态 `--state`）。存储层六源（domain/owner/capability/profiles/skill-catalog/gap-suggestions）仍是单一事实源，查询层经 capability-ontology 合一，orchestrator 环 1 单接口导航。

## 3. 触发与执行权

- **触发器**：orchestrator 分解环 3（S1 路径）与 `bin/capability-gap-watchdog.py`（S2/S3 路径，扫各板 `block_kind='capability'` 与收尾标签）。触发器只建补全卡，不直接改能力资产。
- **执行权**：补全卡统一建在 `platform` 板，assignee=platform-skill-miner（按名册派单，本板编制内）；跨板依赖走 body 引用（`src:<board>:<taskId>`），禁用跨板 `parents`。
- **执行者拿到卡后**：按 §2 表对应档行动。R0 借调由 orchestrator 派单换人执行；R1/R2 由 skill-miner 执行；R2 的 mark-active 等人审（staged 提案，晨报呈现）。
- **解除阻塞**：补全卡 done 后，由 orchestrator 对原 blocked 卡 unblock 并重派；原任务验收命令重跑即 §2「验证关」的「重测原问题」。

## 4. 卡片字段约定（任务卡补全预算与留痕）

补全卡 body 首行留痕（与 `routed:heavy:N`、`[REJECT:<FM>]` 同风格）：

```
rsi:src=<board>:<taskId> rung=<R0|R1|R2|R3> attempt=<n>
```

原任务卡（重型、预估可能遇能力缺口）可在 body 声明补全预算，超预算直接 blocked 升级人工：

```
rsi-budget: rungs<=R2 attempts<=1
```

预算判级：lite 级任务（交付标准判级）预算上限 R1；standard 上限 R2；compliance 上限 R3（提案）。判级在先，补全在后。

幂等键：`rsi:<board>:<taskId>:<rung>`——同一张卡同一档只建一次补全卡。

## 5. 递归边界（四条硬约束）

1. 任务级上限：错误自愈 ≤2 轮不变；阶梯每档尝试 1 次，四级用尽即 `blocked(kind="capability")` 等人工。
2. 预算前置：无 `rsi-budget` 声明的卡按其判级默认预算执行；超预算不建卡，登记 gap 待人审。
3. 递归深度 = 1：补全动作本身是变更，走三分法授权，不再触发补全递归；「为补全而补全」一律人工。
4. 效果判定在机器：采纳前必须用补全能力重跑原任务验收命令，退出码为准；补全者自述不作数。

## 6. 回流（四路）

1. 任务续跑：补全 done → orchestrator unblock 原卡 → 重派。
2. 资产登记：新能力写回单一事实源——capability-graph 手工区（substitutes/capabilities，人审后折叠）、skill-catalog 登记、新域进 domain-registry。
3. 缺口台账：`gap_register.py update <id> --set status=done` + 修复方案；修过又坏重开必须记因。
4. 派单偏好：`bin/capability-substitute-suggest.py` 聚类 S3 信号，产出 `~/.hermes/shared/capability-gap-suggestions.yaml`；orchestrator 分解环 1 择优时读它作可靠性之外的次级信号。

## 7. 检验标准

每当同一能力缺口第二次出现，必须已有补全卡或已折叠进注册表；没有机制接住的重复缺口，即本表失效，按 normal 变更提修订。

## 8. 外部坐标系对照（引用级，不改本表判据）

> 完整对位：`_shared/evals/baseline.md` §H5.4 + `research/harness-fusion-20261004/FUSION-VERDICT.md`。
> 对照 The Path to Recursive Self-Improving Agents 的 L1-L5 分级：本表 R0/R1≈L2（有人审），R2≈L3（机制固定），R3≈bounded L4（提案级、永不自动）。
> 对照清华 RSI Survey 三证据分级：本表「验证关」测任务增益，evals 密封题库测能力保留，T12-T17 效力题测改进器增益——「更新闭环≠独立测试」由 evals 既有纪律承载。集群定位 L2-L4 有界递归，与业界现状自判一致，无过度声明。
