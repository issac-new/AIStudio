# XXX-DEV 技能「设计文档同步」机制 + 合入前 pull 更新 main 序列

> 状态：已批准（2026-10-26 用户三项裁定：声明式+机械核验 / 生成器+实例双层 / 技能层落点）
> 分支：feat/skill-design-doc-sync

## 1、背景与问题

- swarm-yuan 生成的项目开发技能（aistudio-dev 及未来 XXX-DEV）九节点工作流中，**不存在任何**指向项目设计正本/数字总账的引用与同步环节（探查实证：`aistudio-dev/references/workflow.md` 全文与门禁断言零命中 `integrated-design|design-ledger`）。
- 设计文档同步现靠人工纪律（总账维护规则「随批对账」2026-10-26 刚裁定），已出现真实漂移：整合正本头部 R10 但变更记录表止于 R9；§0.1 全量测试 5,906 vs 总账 6,336。
- 另：worktree 分支合入时未强制「先 fetch+快进本地 main」，多人协作（多会话/多机）下本地 main 滞后远端会导致旧基线合入或二次冲突。
- 执法脚本（spec-first-pre-commit.sh 等）属 UNIVERSAL_FILES，--upgrade 会从生成器覆盖——执法逻辑必须写在生成器源码，实例只放配置。

## 2、变更

### A. 生成器 skills/swarm-yuan/

1. `scripts/generate-skill.sh` `_fg_emit_workflow()`：节点③加 spec 四要素声明义务（DESIGN_SYNC_REQUIRED=1 时 spec 须含「设计文档影响」段）、节点⑦加声明合理性核验、节点⑧加设计文档随批 + 新合入序列（fetch → 本地 main ff-only 快进 → rebase → merge --no-ff → push）、终检表加 2 条。
2. `assets/spec-template.md`：§20 变更左移下加「设计文档影响」子节模板（`DESIGN_SYNC: touched/none` 格式）。
3. `assets/precheck.conf`：`DESIGN_SYNC_REQUIRED=0`（默认关）+ `DESIGN_DOCS=()`（opt-in，项目侧开启）。
4. `assets/spec-first-lib.sh`：新增 `spf_design_sync_check`（解析声明段 + 核验变更集兑现），L2/L3 复用。
5. `assets/hooks/spec-first-pre-commit.sh`（L2）与 L3 `check_spec_first` 所在 gates-warn.sh：追加调用。
6. `references/template-spec.md`：修复 9 节点命名表与实际 emit 不同步的既有缺陷 + 补新机制描述。
7. `assets/facts.conf`：FACT_CONF_VARS 197→199。
8. `SKILL.md`：九节点描述同步。
9. `tests/`：新增 design-sync 判定守门测试 + 同步受影响断言。

### B. 实例 .claude/skills/aistudio-dev/

10. `references/workflow.md`：节点③⑦⑧项目化落地（两文件路径、修订锚点、触发分级、合入序列）、终检表。
11. `SKILL.md`：九节点一句话版 + 完成检查表同步。
12. `scripts/precheck.conf`：`DESIGN_SYNC_REQUIRED=1` + DESIGN_DOCS=(整合正本, 数字总账)。
13. `scripts/spec-first-lib.sh`、`spec-first-pre-commit.sh`、`gates-warn.sh`：从生成器源码刷新拷贝（不手改）。

### C. 设计文档修订（机制首次运行）

14. 整合正本 R10→R11：版本行、§0.1 数字对齐总账、变更记录表补 R10（欠账）+R11 行、维护规则段改「已机制化」。
15. 数字总账：specs 数随批、维护规则补机制化注记。
16. 根 `AGENTS.md` 规则 2：spec「三段」→「四段」；grep 全量同步「三段」表述。

### D. 渲染回执

17. 重跑 `--render-tools` 刷新用户级 ~/.zcode/AGENTS.md 渲染块。

## 3、决策记录

| # | 决策 | 选择 | 备选 | 理由 | 类型 |
|---|---|---|---|---|---|
| D1 | 执法强度 | 声明式+机械核验：spec 增为四要素（变更/决策记录/验证/设计文档影响），L2 核验「声明触及→变更集须含设计文档修订」；声明无需更新附理由放行，节点⑦核合理性 | 纯流程环节（无机械兜底）/ 强制全覆盖（误伤纯测试类变更） | 用户裁定 2026-10-26；与 spec-first 四层拦截同构、符合「执行层强制」不变量 | UserChallenge |
| D2 | 落点范围 | 生成器+实例双层：生成器模板加 opt-in 机制（默认关），实例项目化开启 | 仅实例（执法脚本会被 --upgrade 覆盖漂移，其他项目不受益） | 用户裁定 2026-10-26 | UserChallenge |
| D3 | merge 前 pull 序列落点 | 技能层（生成器节点⑧模板 + 实例 workflow.md），不动用户级 AGENTS.md | 同步写入用户级 §2.3 | 用户裁定 2026-10-26 | UserChallenge |
| D4 | 门禁预算 | 不新增 check_* 门禁（56 已冻结 FACT_GATES_BUDGET），扩展现有 L2/L3 检查内涵；conf 变量 197→199（预算 200） | 新增独立门禁 | 等额删除或例外申请成本高；先例=「★左移」要素形式 | Mechanical |
| D5 | 声明格式 | spec「## 设计文档影响」段内 `DESIGN_SYNC: touched`（后列 DESIGN_DOCS 路径逐行）或 `DESIGN_SYNC: none`（附理由）；touched 时所列路径须在变更集（staged ∪ 分支 diff） | 结构化 frontmatter / 独立 JSON | 与「## 决策记录」段判据同构，markdown 内聚、解析简单、人可读 | Taste |
| D6 | 执法代码位置 | 只写生成器源码（spec-first-lib.sh 等），实例从生成器刷新拷贝 | 实例内手改 | UNIVERSAL_FILES 升级覆盖会洗掉实例改动（宣告≠生效） | Mechanical |
| D7 | 既有缺陷连带修复 | 整合正本补 R10 变更记录行 + §0.1 数字对齐；template-spec 命名表对齐 | 挂账另批 | 漂移形态正是本机制要根治的对象，作为首次实证顺批修复；命名表不修则 lexical-consistency 测试风险 | Taste |

## 设计文档影响

- DESIGN_SYNC: touched
  - docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md —— 版本行 R10→R11；§0.1 全量测试数字对齐总账；变更记录表补 R10（欠账）与 R11 行；§5 能力层补机制一行；维护规则段改「已机制化」
  - docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md —— 文档域 specs 数随批 +1；维护规则补机制化注记（L2 机械核验已上线）

## 4、验证

（实施后回填）

1. 生成器测试族：swarm-yuan tests/ 相关（template-lexical-consistency / doc-numbers / 新增 design-sync）全绿。
2. L2 双场景对拍：①spec 声明 touched 但变更集无设计文档 diff → pre-commit exit 1；②声明 none → 放行。
3. 实例门禁：`precheck.sh --all` 过。
4. 数字对账：facts.conf ↔ test-doc-numbers 断言一致；正本/总账/AGENTS.md 三方一致。
5. 渲染回执：--render-tools 后 ~/.zcode/AGENTS.md 渲染块更新。

## 5、风险与回滚

- conf 变量余量刷后仅剩 1/200（数字有锁，无隐性超支）。
- 弱撞面：并行分支 refactor/swarm-yuan-integration 改 tests/test-doc-numbers.sh 与 index.tsv（verifier 迁移轮），收口 rebase 时小冲突可解；核心文件零撞面（已核）。
- 回滚：L2 新检查为增量分支（DESIGN_SYNC_REQUIRED=0 即全关），回滚=配置归零或 revert 本批。
