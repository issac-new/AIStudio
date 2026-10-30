# swarm-yuan 吸收 ub-mode：补齐代码复杂度与重复度的机器判据

- 日期：2026-10-30
- 分支：feat/swarm-yuan-ub-mode
- 状态：已实施

## 变更

《代码整洁之道》作者 Uncle Bob 的 `unclebob/ub-mode` 技能（GitHub API 实测 4,858★，两个文件 README.md 2,195B + SKILL.md 3,958B，master 分支）把「先让它能工作 → 再把它做好 → 遵守工程实践」三阶段写成 Agent 工作纪律，并把质量约束交给三个确定性工具（crapper 的 CRAP 分、dryer 的重复度、mutator 的变异测试）而非长 prompt。

swarm-yuan 的立身主张与之一致（56 道门禁执法、门禁核验实然、不靠模型自觉），但对照后有三处真实缺口（无复杂度判据、无重复度判据、阈值标定无守卫）。本轮按 skill 自身治理规则落五件事：

1. **新增方法论档 `references/clean-code-metrics-methodology.md`**（决策 27「吸收优先于新增门禁」路线）：逐条登记 ub-mode 规则到本仓承载面（已有门禁维度 / 本档 / 仅人审），含 CRAP、重复相似度、变异分数的口径定义与「本仓能算到哪一步」的边界，以及指标不作为万能药的边界声明。
2. **既有门禁扩容两处（零新增 `check_*`，门禁预算 56 不变）**：
   - `check_method_size`（`--method-size`）增加**圈复杂度维度**：按函数边界统计启发式决策点，超 `COMPLEXITY_MAX` 报 warn。原门禁只量行数，20 行 15 分支的满分支函数能过行数门但复杂度已失控。
   - `check_reuse`（`--reuse`）增加**重复代码维度**：内置 Type-1 精确重复块粗筛（`DUPLICATION_MIN_BLOCK`）+ 可选外部工具（`DUPLICATION_CMD` 输出重复率百分比，按 `DUPLICATION_MAX_PCT` 判定）。原门禁只查「新增单元与既有稳定单元重名」，查不出同一段逻辑被复制粘贴。
3. **阈值标定守卫**：`DUPLICATION_CMD` 已配而 `DUPLICATION_MAX_PCT` 未标定（=0）时显式 warn「工具默认值不能当规则值」——照抄 ub-mode 踩过的坑（dryer 原生默认 0.82、规则要求 0.8，参数不对会漏检）。
4. **生成侧模板补纪律**：`generate-skill.sh` 的节点⑤（编码）、节点⑥（测试）模板加入三阶段顺序、最小改动、测试行为不测实现、修根因四条；节点⑥门禁序列点名复杂度/重复度两项新维度。
5. **口径同步**：`facts.conf`（references 57→58）、`assets/registry/references.tsv`、`assets/registry/dist.tsv`、`references/capability-map.md`、`SKILL.md` 文档路由表（等额瘦身，见决策记录）、`docs/usage-manual.md`（门禁表两行补维度与四个旋钮）、`docs/budget-exception-ledger.md`、`docs/design-evolution.md`（决策 58）、`CHANGELOG.md`（v2.97.0）。

四个新旋钮（`COMPLEXITY_MAX`、`DUPLICATION_MIN_BLOCK`、`DUPLICATION_CMD`、`DUPLICATION_MAX_PCT`）走**门禁局部变量**形态，不进 `precheck.conf`：与既有 `METHOD_MAX_LINES` 同一先例（同为门禁内 `${VAR:-default}` 读取 + usage-manual 登记），因此 `FACT_CONF_VARS`（199）与变量预算（200）都不动，不需要走决策 26 修订。落在 conf 模板里会让变量数破预算，而这一轮的价值不在「多四个可配项」。

三个维度的默认值全部为**关闭（0）**，与 `MUTATION_CMD`/`MUTATION_MIN_SCORE` 同一形态：配置了才执法，未配置时诚实跳过并在方法论档给出建议值（`COMPLEXITY_MAX=15`、`DUPLICATION_MIN_BLOCK=8`）。理由是误报治理优先——启发式复杂度计数跨栈必有不精确，默认开启会把误报推给所有存量项目；而默认关闭不构成「假门禁」，因为配置后判定是机器做的。

## 决策记录

- **决策 58（新增，落 `docs/design-evolution.md`）：ub-mode 吸收走「方法论档 + 既有门禁扩容」，不加 `check_*`。** 依据决策 26（门禁预算 56 冻结）与决策 27 第 2 条（吸收优先于新增门禁）。复杂度与重复度不是新概念，是 `check_method_size`/`check_reuse` 已有语义的缺失维度，扩容不改变门禁计数、不破坏 `FACT_GATES_TOTAL=56` 闭合方程。
- **conf 变量一个不加（旋钮走门禁局部变量）**：`METHOD_MAX_LINES` 先例——门禁内 `${VAR:-默认}` 读取 + usage-manual 登记，`FACT_CONF_VARS` 不计、预算不破。若落进 `precheck.conf` 模板，199→203 直接顶穿 200 预算，必须走决策 26 修订；为一个「默认关闭的可选维度」动预算不划算。代价：旋钮在生成物 conf 里不可见，可发现性靠方法论档 §四、usage-manual 门禁表与生成的 workflow.md 节点行三处承载。
- **分发预算例外 +4096（614400→618496）**：新方法论档 4539B 整篇随发，属功能性增量而非版本注记；R125 的价值是切断「运行时刷新注记」那条棘轮，不覆盖方法论档。登记进 `docs/budget-exception-ledger.md` 第 34 次。
- **默认关闭而非默认 15/8**：默认开启会让 146 个既有测试与 81 个框架夹具被动承受启发式误报，且历史项目无基线不可比。关闭 + 建议值 + 生成期配置指引＝与 `MUTATION_CMD` 同族的成熟路径。
- **CRAP 不内置、不伪造**：CRAP = CC² × (1−覆盖率)³ + CC 需要**逐函数**覆盖率，bash 侧只能拿到项目行覆盖率，硬算等于编数。本仓内置圈复杂度（可算准的近似），CRAP 明确登记为「须外部工具产出」，并在方法论档写明与 crapper 的对应关系。
- **SKILL.md 上下文表面接近等额**：新增路由名与一条工作原则，同文件删减冗余表述后净增 51B（197,774→197,825B）。该预算（197,632B）改动前已超 142B 属存量 warn，本轮未做到零增长，如实记录为 +51B（warn-only，不 fail）。
- **`--method-size` 登记 CLI A/B 豁免（`FACT_CLI_AB_ENHANCED_GATES`）**：A/B 是 HEAD vs 工作树逐字节对比，门禁输出新增「复杂度维度跳过提示行」属刻意输出增强（`--reuse` 补 AI 自查段时的同款先例，走同一登记通道）；新维度的行为回归由 `compliant-complexity-warn` 夹具承担，不因豁免失保护。
- **不新增 self-check G 断言做阈值标定**：标定检查下沉到门禁内部（`DUPLICATION_CMD` 与阈值配对），避免再加一条需正负双态测试的 G 断言。代价是 `MUTATION_CMD`/`MUTATION_MIN_SCORE` 的同类配对缺口本轮未覆盖，列为后续项。
- **ub-mode 证据分级**：仓库元数据（★数、文件字节、默认分支）=A（本机 GitHub API 实测）；SKILL.md/README 规则文本=B（官方一手原文）；公众号文章的解读与「4200 Star」等二手数字=C（不采信，以实测 4,858 为准）。

## 验证

基线（改动前，main 工作区 `7f6db8b27` + 干净 `skills/swarm-yuan`）：

- `bash scripts/self-check.sh --check-only` → RC=0，唯一 warn 是上下文表面 197774B > 197632B。
- `bash tests/run.sh --jobs 6` → 133 通过 / 0 失败（RC=0），工作树 `skills/swarm-yuan` 干净。

改动后（worktree 内）：

- `bash scripts/registry-render.sh --gates` 重渲三档聚合文件 + `--check` 六表三向一致。
- `bash scripts/self-check.sh --check-only` RC=0，且上下文表面字节数不高于基线。
- `bash tests/run-sweep.sh`（本地全量回归统一入口：133 锁测试 + e2e/gen-e2e/fieldchange-e2e + verifier all（81 夹具 + 56 门禁夹具双态 + shellcheck + CLI A/B）+ self-check + 汇编六卷）全绿。
- 新维度负向证明：`tests/gate-fixtures/method-size/compliant-complexity-warn`（warn 命中 + 退出 0）、`tests/gate-fixtures/reuse/compliant-duplication-warn`（warn 命中 + 退出 0）；默认关闭态下 `compliant*` 夹具输出不变。
- `bash scripts/build-compendium.sh --regen` 后 `--check` 通过（卷五 facts.conf、卷六 capability-map、卷二 决策史 均被本轮改动）。
- AIStudio 侧 `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`（本章登记附录 A.1 后计数一致）。

## 设计文档影响

DESIGN_SYNC: none

理由：改动落在 `skills/swarm-yuan/` 技能本体（方法论档 + 门禁维度 + 口径台账），不触及 `docs/` 下的 AIStudio 整合正本与数字总账（产品/设计正本无 swarm-yuan 门禁数与 conf 变量数的承载面；这些口径的单一事实源在 `skills/swarm-yuan/assets/facts.conf`，由该技能自身 self-check 对账）。附录 A.1 已同批登记本章（387→388）。
