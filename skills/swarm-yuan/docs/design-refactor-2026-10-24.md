# swarm-yuan 全功能重构设计与优化方案（2026-10-24）

> **定位**：本稿是对当前 R140 系统的全功能复盘、目标设计与重构实施记录。它取代 `docs/design-redesign-2026-10-21.md` 中尚未收口部分作为最新实施口径；系统终态机制仍以 `docs/design-terminal.md` 与 `swarm-yuan/README.md` 为准，决策全文见 `docs/design-evolution.md` 决策 54。
>
> **证据基线**：main `93d2666`（R140 设计文档同步后）。本稿全部数字在 2026-10-24 当前工作树实测；验证命令见 §五。
>
> **硬约束**：bash 3.2 + BSD 工具兼容；门禁 56 冻结；conf 变量上限 200；吸收优先于新增；目标技能侧体积预算不变；一切结构迁移走行为保持式（决策 49）。

---

## 一、全功能盘点

系统不是单一生成脚本，而是“项目专属开发契约的生产系统”。按能力域盘点如下。

| 域 | 对外能力 | 主要入口 | 当前规模（实测） | 证据 |
|----|----------|----------|------------------|------|
| 生成 | 创建/升级/校验/渲染/框架注入/回滚/激活/指纹刷新 | `scripts/generate-skill.sh` | 13 步生成流程；4 档 profile；9 个子命令 | `references/generation-flow.md`、`tests/e2e/` |
| 认知探查 | 组件库清单、关系边集、任务配方、特征卡、领域知识、框架识别 | 生成流程 Step 2–7 + AI 填充 | 17 项特征卡；81 套框架规则；32 领域；8 行业档 | `assets/registry/`、`references/frameworks/` |
| 规范 | 三值规则、conf 参数、标准映射、行业法规 | `assets/rules.d/`、`assets/precheck*.conf`、`assets/standards-map.conf` | 197 个 conf 变量；57 篇方法论 | `facts.conf`、`registry/` |
| 门禁 | 写前/改时/收尾三时点；五条执行序列；SARIF；只读执行守卫 | `assets/precheck.sh` + `assets/gates/<domain>/` | 56 门禁：安全 10 / 架构 18 / 流程 11 / 质量 6 / 合规 11；代码 7769 行 | `gates.tsv`、`gate-enforce-level.conf` |
| 验证 | 测试真跑、覆盖率、接口端点、独立审查、门禁自检、账本链 | `verifier/`、`tests/`、`scripts/trace-log.sh` | 118 个锁定测试；81 框架双态夹具；48+ 门禁夹具 | `tests/index.tsv`、`verifier/v1/` |
| 成长 | 指纹感知、局部重探查、知识生命周期、记忆写回、状态机恢复 | `--refresh`、`state-machine.sh`、`memory-backends.sh` | 6 状态阶段；3 记忆后端；last-good 红线 | `references/knowledge-lifecycle-methodology.md` |
| 分发 | 多宿主安装、离线三件包、运行时物化、知识资产 | `install.sh`、`make-offline-bundle.sh`、`release-src-packages.sh` | 11 宿主；103 分发文件；3 类离线产物 | `hosts.tsv`、`dist.tsv`、`offline-manifest.conf` |
| 治理 | 六张注册表、数字单源、证据分级、豁免台账、决策史、汇编 | `registry-render.sh`、`self-check.sh`、`build-compendium.sh` | 六表；五级证据 M0–M4；三份豁免表 | `assets/registry/README.md` |
| 运维/合规支线 | fix 任务六步排障、只读守卫、堡垒机隧道、JDWP、迎检台账 | `tunnel.sh`、`ops-readonly-guard.sh`、`inspection-ledger.sh` | 173 条检查点；21 条处罚条款；20 项智能体安全 | `references/bugfix-runbook.md`、`references/compliance-checkpoints.md` |
| 外部运行时 | 深度 4 / CLI 6 / 方法论 5；登记 22 | `references/*-methodology.md`、`runtime/` | 15 个整合 + 2 个宿主 CLI + 5 个机制源/观察源 | `runtimes.tsv`、`upstream-baseline.md` |

### 1.1 主链路与兜底

全功能不是并列菜单，而是一条有先后依赖的链。每个环节都有产物、消费方与兜底检查：

| 环节 | 动作 | 产物 | 兜底 |
|------|------|------|------|
| ① 认知 | 形态判定 → 全量枚举 → 关系提取 → 配方归纳 | 组件库清单、关系边集、任务配方 | 计数核验、路径验真、稳定性审计 |
| ② 规范 | 书面规则 + 行为统计 + 推导规则汇合 | 铁律、三值规则、conf 参数 | 规则格式检查、forbid 必带替代 |
| ③ 装配 | 脚本出初稿 → AI 填判断 → 三关激活 | 六段目标技能 | draft 状态门、体积预算、路径零幻觉 |
| ④ 门禁 | 写前拦截、改时校验、收尾序列 | 放行/拒绝/提示 + 执行账本 | 独立验证器双态夹具、SARIF、只读守卫 |
| ⑤ 验证 | 测试真跑、覆盖率、接口端点、独立审查 | 测试与审查证据 | 零用例判负、阈值判负、审查留痕 |
| ⑥ 成长 | 指纹比对 → 局部重探查 → 三态处置 | 新基线、更新后的清单/配方/规则 | 条目骤降过半保留旧基线、状态机恢复 |
| ⑦ 分发 | 宿主检测 → 安装 → 离线包/源码包 | 目标技能目录、三件离线产物 | SHA256SUMS、bundle-version、vendor-status |
| ⑧ 治理 | 注册表 → 生成视图 → 自检 → 决策史 | 数字单源、六表、汇编、豁免台账 | `--check` 三向对账、数字断言、决策留痕 |

这条链解释了为什么“只加一个门禁”不够：门禁属于④，但它的依据在①②、它的证据在⑤、它的口径在⑧。任何一环没有机器锚，最终都会退化成文档声明。

**结论**：能力面已经饱和。连续多轮 sweep 全绿、门禁 56/56 顶格、变量 197/200、81 框架三件套齐全。当前主要矛盾不是“缺功能”，而是**已有能力的真值维护、证据闭合与退役出口**。

---

## 二、健康度与真实缺口

### 2.1 绿灯面

- `registry-render.sh --check`：六表 ↔ 代码 ↔ 夹具 ↔ facts ↔ 上游状态表全部一致。
- `self-check.sh --check-only`：口径、预算、注册表、文档索引、本体对账全部通过。
- 门禁 56 个全部可达；53 个 M2，3 个 M1（已登记豁免）；81 框架 M2 全覆盖。
- 测试统一入口 `tests/run.sh` 已落地，并行安全元数据被调度器真实消费。

绿灯不等于无债。以下缺口都能在绿灯下复现，属于“自检覆盖不到的漂移”。

### 2.2 缺口清单（均有实测证据）

| # | 缺口 | 实测证据 | 影响 |
|---|------|----------|------|
| F1 | 注册表与状态表双源漂移 | R140 已把 13 项新基线写进 `upstream-baseline.md`，但 `runtimes.tsv` 仍是旧值：claude-code 2.1.304 vs 2.1.309、codex 0.163 vs 0.164、comet 0.4.5 vs 0.5.0、ruflo 3.58.1 vs 3.59.17 等 | “权威源”名存实亡；运行时刷新轮会把漂移带进下一轮 |
| F2 | 状态表混入历史 | `upstream-baseline.md` 220KB；46 条逐轮头注 61KB；表体 143KB；单行最长 15KB | 刷新成本高、行级漂移难发现，状态与历史两种文体叠在一张表 |
| F3 | 派生计数手抄 | 终态设计文档仍写 324 行/55 篇/99 文件/113 测试/202 断言；实测 330 行/57 篇/103 文件/118 测试（断言数以运行输出为准） | 文档一边变长一边漂移，读者无法判断哪个数可信 |
| F4 | 测试元数据缺口 | `test-r131-edges.sh`、`test-r138-product-regression.sh`、`test-r140-runtime-refresh.sh` 未登记 `index.tsv` | 层级与并行安全性静默落到默认值，回归调度可能失真 |
| F5 | 执行面复杂度无预算 | 引擎域源代码 7769 行、框架门禁注入 18464 行；门禁数有 56 冻结，代码行数无上限 | “降复杂度的工具自己失控”只挡住了数量，没挡住实现体积 |
| F6 | 生命周期声明无机器锚 | 终态文档称“表内状态列”，但 `gates.tsv`/`references.tsv` 没有 status 列；退役无候选清单 | 能力只进不出，季度评审缺少可执行输入 |
| F7 | 汇编新鲜度检查过弱 | `build-compendium --check` 只比对每卷前 200 行；汇编体积随正本增长，且无重生成入口 | 后续段落陈旧不会被发现 |

### 2.3 根因收敛

七个缺口收敛为一条主矛盾：**注册表已经是权威源，但“从注册表派生的视图”仍有手抄副本，且派生视图的校验只看存在性、不看逐字节一致性。** 因此本轮不新增门禁、不扩能力面，只做“派生面收口”。

---

## 三、目标设计

### 3.1 总原则

继承“一内核、三平面、六注册表、五级证据、四闭环”，新增五条本轮不变量：

| 不变量 | 含义 | 机器锚 |
|--------|------|--------|
| T1 状态/历史分离 | 状态表只存当前值；逐轮差异进 append-only 变更记录 | `registry-render --check`：状态表逐行一致、面积 ≤40KB、无历史头注 |
| T2 派生视图生成 | 有两处以上引用的事实只留一个权威源，其余由脚本渲染 | `--facts` / `--gates` / `--dist` / `--write-upstream-baseline` / `build-compendium --regen` |
| T3 元数据闭环 | 每个测试、每张表、每个派生块都有登记与消费方 | `test-runner-contract`、`registry-render --check`、`--lifecycle` |
| T4 执行面预算 | 门禁代码与框架注入代码行数有冻结上限 | `FACT_ENGINE_CODE_LOC_MAX` / `FACT_FRAMEWORK_GATE_LOC_MAX` + self-check |
| T5 能力可退役 | 每个能力可被枚举为“观察/未整合/未实证/缺证据”候选 | `registry-render --lifecycle` + 季度评审 |

### 3.2 派生关系图

```
runtimes.tsv ──render──> docs/upstream-baseline.md 状态表块
     │                         │
     └──probe (network)──> drift 报告 / changelog（append-only）

gates.tsv ──render──> gates-{strict,warn,advisory}.sh
     └──check──> 域源 / 夹具 / enforce 分层

dist.tsv ──render──> generate-skill.sh UNIVERSAL_FILES 块
references.tsv ──check──> capability-map.md（人工策展，G25 双向对账）
facts.conf（手写预算 + 生成计数）──check──> 文档数字断言
六卷正本 ──build-compendium --regen──> design-compendium-full.md
```

依赖方向固定：表 → 视图 → 文档；禁止视图反写表，禁止文档手抄表。

### 3.3 本轮落地范围

| 工作包 | 内容 | 验收 |
|--------|------|------|
| R1 双源收敛 | 更新 13 项基线；状态表改由 `runtimes.tsv` 渲染；旧表全文迁 changelog；`--check` 增加逐行/面积/头注三项断言 | `registry-render --check` 全绿；状态表 ≤40KB（当前约 5.5KB）；变异基线必红 |
| R2 计数去手抄 | 终态文档与注册表 README 移除易漂移计数，改指 `FACT_*`/`--counts`/`index.tsv`；修正豁免表路径 | 文档无 324/55/99/113/202 旧计数；`test-doc-numbers` 全绿 |
| R3 元数据闭环 | 补齐 3 个测试登记并新增 2 个回归测试；runner 契约测试对未登记项 fail | `run.sh --list` 覆盖全部 118 个测试；契约测试全绿 |
| R4 执行面预算 | 新增引擎/框架 LOC 上限并接入 self-check；新增回归测试 | 7769/18469 均在限内；self-check 超限即 fail（断言已接入） |
| R5 生命周期 | `--lifecycle` 输出退役候选；修正终态文档的过度声明 | 候选清单可读；文档与表结构一致 |
| R6 汇编生成 | `build-compendium --regen` 重渲六卷；`--check` 逐字节比对 | 六卷与正本一致；六卷内改一字即红 |

### 3.4 不在本轮范围

- **vendor-knowledge 外置**（24MB，WP4）：涉及 git 历史与离线包约定，需单独拍板。
- **测试按行为重命名**（49 个 `test-rNNN-*`）：会大面积触碰文档与 CI 标签，收益低于风险。
- **覆盖率矩阵清零**（WP9）：需补 14 组夹具与负向断言，单独一轮。
- **脚本执行时间预算**：需要先建立稳定基准，当前只记录不拦截。
- **capability-map 全量生成**：策展内容多于表数据，当前保留人工维护 + G25 对账。

---

## 四、重构实施记录（2026-10-24）

### 4.1 已完成

1. `assets/registry/runtimes.tsv`：13 项基线升到 R140 当前值；状态维持 19 synced / 2 watch / 1 license-risk。
2. `scripts/registry-render.sh`：新增 `--upstream-baseline`、`--write-upstream-baseline`、`--lifecycle`、`--counts` 档位计数；`--check` 增加上游状态表三项断言。
3. `docs/upstream-baseline.md`：220KB → 5.5KB 状态表；历史全文归档到 `docs/research/upstream-changelog.md`。
4. `docs/design-terminal.md`、`assets/registry/README.md`：移除易漂移计数，指向权威源；修正三份豁免表路径。
5. `tests/index.tsv`：补齐 3 个测试；新增 `test-execution-surface-budget.sh` 与汇编生成测试（R141 轮以 `test-r141-compendium-fullcheck.sh` 承接同一语义）。
6. `tests/test-runner-contract.sh`：未登记测试即 fail。
7. `assets/facts.conf` + `scripts/self-check.sh`：新增执行面 LOC 上限与 fail 断言。
8. `scripts/build-compendium.sh`：`--regen` 重渲六卷；`--check` 逐字节比对（R141 汇编假绿根治轮将原名 `--write` 收敛为 `--regen`，语义一致）。
9. `docs/design-evolution.md` 决策 54：记录本轮取舍。

### 4.2 待办（按优先级）

| 优先级 | 事项 | 前置 |
|--------|------|------|
| P1 | vendor-knowledge 外置与离线包按需拉取 | 用户拍板 + 存档校验 |
| P1 | 覆盖率矩阵：门禁 violating/负向断言缺口清零 | 新夹具，单独立项 |
| P2 | 测试按行为重命名（保留轮号别名） | CI/文档同步 |
| P2 | capability-map 生成器或明确“人工策展”边界 | references.tsv 增补策展字段 |
| P3 | 脚本执行时间基准与预算 | 稳定测量环境 |
| P3 | 宿主 5 项 rendered → proven 实证 | 各宿主真机 |

---

## 五、验收命令

```bash
# 1. 注册表 + 上游状态表 + 派生块
bash swarm-yuan/scripts/registry-render.sh --check

# 2. 全文自检（预算/口径/注册表/文档索引/执行面）
bash swarm-yuan/scripts/self-check.sh --check-only

# 3. 本轮新增/受影响测试
bash swarm-yuan/tests/run.sh --level 1 --jobs 4 --filter test-doc-numbers
bash swarm-yuan/tests/run.sh --level 1 --jobs 4 --filter test-execution-surface-budget
bash swarm-yuan/tests/run.sh --level 2 --jobs 1 --filter test-r141-compendium-fullcheck
bash swarm-yuan/tests/run.sh --level 2 --jobs 1 --filter test-registry
bash swarm-yuan/tests/run.sh --level 2 --jobs 1 --filter test-runner-contract
bash swarm-yuan/tests/run.sh --level 2 --jobs 1 --filter test-upstream-probe

# 4. 汇编一致性
bash swarm-yuan/scripts/build-compendium.sh --check

# 5. 全量收口
bash swarm-yuan/tests/run-sweep.sh
```

---

## 六、风险与对策

| 风险 | 对策 |
|------|------|
| 状态表重写丢失历史证据 | 旧表全文原样归档到 `docs/research/upstream-changelog.md`；git 历史仍可追溯 |
| 移除文档计数降低可读性 | 保留稳定预算数（56/81/200 等）；易变数改为“运行 --counts / 看 facts” |
| 执行面预算阻碍正常开发 | 超限只说明“须等额删减或登记上调”，与门禁 56 同一决策路径 |
| 汇编重渲产生大 diff | 六卷内容就是正本快照；diff 可逐卷复核，卷七/卷八不动 |
| 并行会话撞车 | 本轮只动注册表/文档/测试元数据，不碰生成器主流程与门禁逻辑 |

---

## 七、结论

swarm-yuan 的能力面已经够用，下一步的竞争力来自“每个数字、每张表、每个派生视图都能当场复核”。本轮把上游状态表、测试元数据、执行面预算与汇编生成从“手抄/抽查”推进到“单源/生成/逐字节校验”，并用决策 54 固化。剩余的四项 P1/P2 债务（vendor 外置、覆盖矩阵、测试重命名、capability-map 生成）不应与本轮混做，避免再次出现“预算内的功能增量掩盖结构债”。
