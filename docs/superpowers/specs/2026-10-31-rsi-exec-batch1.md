# RSI 首批执行方案：R1/R4/R8/R12a 四件（2026-10-31）

日期：2026-10-31
状态：implemented-批次一二三执行中（本 spec 即治理 spec；对应总方案 `2026-10-31-rsi-improvement-plan.md` 的批次 A/D/C 摘出件）
来源：用户指示「哪些可以落地实施，制定下方案」。从 R1-R12 中按可落地性筛出**无外部依赖、S 规模、当轮可收口**的四件为首批；其余分第二/三批（本 spec 第二节）。

## 变更

### 一、首批四件实施细节（落点已核到 file:line）

#### R1 rsi-maturity 探针修复（真缺陷，最高优先）

- **缺陷**：`countCapabilityGaps()` 与探针都读 `hermesPath('gap_register.yaml')`（rsi-maturity.ts:62/160），该文件 2026-10-12 已迁往 `/Users/cuishi/hermes-docker-sandbox/workspace/life-workbench/gap_register.yaml`（592KB 在位、10-30 活跃；watchdog 自身已改址，watchdog L42）。当前本机 L2/L3 自评输出 null，与「达成」文案矛盾。
- **实施**：路径解析改三级序——env `GAP_REGISTER_PATH` → life-workbench 新址（常量，与 watchdog 同源）→ 旧 `~/.hermes` 路径兜底。探针缺席时 L2/L3 输出维持「无法判定=null」但 gap 描述如实写「探针失效（三址均缺）」。
- **验收**：本机 `GET /api/harness/rsi-maturity` 恢复 L1-L3 达成；`GAP_REGISTER_PATH=/nonexistent` 时 L2=null 且描述含「探针失效」；三态测试（新址/env 失效/文件不可读）三例。

#### R4 探测多样本 k≥2（D4 匹配预算 pass@k）

- **落点**：`probe-runner.ts` spawn 循环加 `k` 参数（默认 2，预算允许时；probe-runner.ts:260-312 逐题 spawn 处）；`ProbeMetrics.k` 已有字段如实记录（types.ts:154）；晋级门（loop.ts:524-527 `statistical_insufficient` 语义收紧：k=1 时恒 warning）＋新增 warning `pass_at_k_divergence`（pass@1 上升而 pass@K 下降＝靠运气而非能力，两读数齐全才判）。
- **验收**：k=2 全链测试（两样本聚合）；divergence 构造用例（p1=0.8/pk=0.4 告警；p1=0.7/pk=0.7 放行）；k=1 时 statistical_insufficient 必现。

#### R8 经验加权检索＋批量复核（D11 执行面可操作化）

- **检索侧**：`suggestProposal` 经验选取（service.ts:571-574 现取 adopted 前 3）改加权排序——`score = confidenceScore（freshness 现算）×（surfaceKey 匹配 1.0 / 跨面 0.5）×（domain 匹配 1.0 / 异域 0.7）`，取 top-3；stale 经验在起草 prompt 附「建议引用以刷新」清单（D11 revalidate 建议的消费通道）。
- **复核侧**：memoryPolicy 折叠块加两操作（HarnessImprovePanel.vue:1015 区）——「批量退役孤儿」（勾选集→逐条调既有 `setWorkbenchExperienceStatus`，前端串行）与「引用 stale 到新提案」（勾选集→写入 createForm.experienceIds）。REST 不新增（复用既有端点），只加前端批量编排＋确认框。
- **验收**：加权选取单测（同置信 fresh 优先、面域匹配优先、stale 附刷新清单）；批量操作组件测试（勾选→确认→N 次调用）；100 条规模渲染冒烟。

#### R12a 验证信号分级（tier 推导＋晋级留痕＋面板列）

- **推导**（纯函数，loop.ts）：`verificationTierOf(proposal)` 从选中探测证据类型推导——`command`（命令式验收器运行）> `heldout`（R6 后接，暂缺席）> `regression`（普通 eval 回归集）> `judge`（LLM 判分主导），取本次晋级实际用到的**最强层**；无探测=`none`。
- **留痕**：`PromotionRecord` 加 `verificationTier?: 'command'|'heldout'|'regression'|'judge'|'none'`（types.ts:244-252），晋级时写入 store。
- **面板**：进化表（HarnessImprovePanel evolution 区）每轮加 tier 徽标；连续 ≥3 轮 tier≤judge 触发 warning `weak_verification_streak`（进化健康度）。
- **验收**：tier 推导单测全覆盖（命令式>回归>判分的排序、无探测=none）；PromotionRecord 写读往返；面板徽标渲染＋streak 告警用例。**R12b（约束单层消融）后置第二批**——需运行时对照探测支撑，不与本件捆绑（总方案 §五已注明）。

### 二、后续批次排期（不属本批执行面）

| 批次 | 项目 | 前置 |
|---|---|---|
| 第二批 | R3 CHASE 变换器 → R2 三类证据自动跑（反事实档）；R6 heldout 门；R5 gap 桥；R12b 约束消融 | R3 先行（R2 反事实档消费其产物）；R5 依赖的仓外文件已确认在位 |
| 第三批 | R7 advisory 执行回路（memory/tool_guidance）；R9 技能差分（依赖 R2 runner）；R10 任务族；R11 SQLite 持久化 | R7 最大涉人审应用通道；R11 独立迁移需隔离窗 |

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 首批只取四件 S 规模件 | 无外部依赖、纯 custom、当轮可收口——快速兑现总纲「证据与治理先行」且控制回归面 | 首批带 R3/R2（否决：M 规模依赖链会拖长首批周期） | 是 |
| D2 | R1 路径解析三级序而非硬编码新址 | env 覆盖保测试与多机；旧址兜底防他机未迁移 | 只写死 life-workbench 路径（否决：他机/CI 必坏） | 是 |
| D3 | R4 默认 k=2 而非可配置默认 1 | D4 机制的核心就是多样本；k=1 保留为预算不足时的自动降级而非默认 | 默认 k=1 需手动开（否决：机制形同虚设） | 是 |
| D4 | R8 批量操作走前端串行复用既有端点 | 不新增 REST 面＝不扩攻击面；N 条规模（≤百）串行足够 | 新增批量 REST（否决：为省前端循环扩服务端接口不值） | 是 |
| D5 | R12 拆 a/b，消融后置 | 消融需「每约束独立贡献」的运行时对照测量（每约束跑一次带/不带探测），成本与 R2 runner 耦合 | 与 tier 捆绑首批（否决：把 M 规模件混进 S 批） | 是 |
| D6 | R12a 的 heldout 层暂列枚举但不判 | R6 未落地前该层无证据可判；枚举先占位避免 R6 落地后改类型 | 现在就接 heldout（否决：无消费者） | 是 |

## 执行实记（2026-10-31 深夜，随码同批增补）

- **R1 修复两个真缺陷**（超出原认知）：①路径三级序（env `GAP_REGISTER_PATH` 强制语义——指定即用、缺席失效不回落，D2 决策语义；→ life-workbench 新址 → 旧 `~/.hermes` 兜底）；②原正则 `^-[-\s]+domain:` 只匹配旧格式行首字面短横线，对 life-workbench 新址缩进格式 `  domain: capability` 恒数 0——改 `^\s*-?\s*` 兼容两格式。本机活体：L1-L3 全恢复 true，L2 证据锚点如实带新址路径。
- **R4**：runner `k` 参数（缺省 2；预算不足 `affordableK` 降 1 如实降级）；晋级门 k<2 恒 `statistical_insufficient`＋新增 `pass_at_k_divergence`（pass@1 升而 pass@k 降＝靠运气）。
- **R8**：加权 top3＝confidenceScore（HP-7 半衰期现算）×面域（同面 1.0/跨面 null 0.7/异面 0.5）×domain（同域 1.0/异域 0.7）；stale 刷新清单（同面 stale、上限 5 条）进起草 prompt；面板孤儿批量退役＋stale 批量引用（前端串行复用既有 `setExperienceStatus` 端点，window.confirm 门）。
- **R12a**：`verificationTierOf`（regression > heldout（R6 后接，类型已占位）> judge > none；regression 存在即 regression 层，无硬证据而 judgeOnline 判 judge 层）；`PromotionRecord.verificationTier` 晋级留痕；`EvolutionRound.verificationTier`／`EvolutionSurface.weakVerificationStreak`／`EvolutionReport.healthWarnings`（streak≥3 触发 `weak_verification_streak`）。
- 测试：`rsi-maturity-path.test.ts`（新文件，4/4）＋loop 53/53＋http 27/27＋面板 20/20；三批后 workbench 全套件 **160/160**；全量 `npm test` = 981 文件 / **7153 用例通过、11 跳过、0 失败**；typecheck 0 错（终态）。
- K19 棘轮：新增端点统一走 lib/http ok() 出口（5 处），1195→1193 达标；一处括号笔误当场修复。

## 三批执行实记（2026-10-31 深夜，随码同批增补）

### 第二批（R3/R2/R6/R5/R12b）

- **R3**：`counterfactual-variants.ts`——四类确定性变换（rename_ids 哈希/rename_files 路径词/wrap_output 标签包装/inject_noise 干扰行），语义保持自检清单四条，同输入同输出（测试断言 JSON 全等）。
- **R2**：auto-probe 候选探测完成后自动补基线运行——nullTree（未改动 harness 物化）×2 跑同集＝噪声 δ 自动标定，×1＝等预算基线写回 `equalBudgetBaseline`；预算内串行，失败不阻断主探测（如实静默跳过）。反事实（③）依赖 R3 变体集运行编排，下轮接。
- **R6**：heldout-store `scoreSet`（密封契约原样：限次/只回聚合）接晋级门——`heldout_missing` warning（`HARNESS2_RSI_REQUIRE_HELDOUT=1` 升 blocker）＋`heldout_regression` blocker（留出率低于 evolve 通过率−δ）。
- **R5**：`gap-source.ts` 只读桥——capability 域条目解析（容错 YAML 子集）→draft 映射（关键词定面/`gap:` evidenceRefs）＋`GET /gap-suggestions`＋`POST /gap-suggestions/import`＋建议行回写通道。
- **R12b**：`constraint_ablation_due` warning——≥2 项约束全 pass 且零 fail 历史＝零对抗证据，提示单层消融。
- 坑：DatabaseSync（Node 24.22）**无 `.transaction()`**（类型库有签名、运行时没有）——改显式 BEGIN/COMMIT/ROLLBACK。

### 第三批（R7/R9/R10/R11）

- **R7**：`surfaceArtifactsOf`（memory 面=条目 JSON／tool_guidance 面=覆盖片段）＋`markSurfaceApplied`（`appliedVia: 'via-surface'` 三态）＋GET/POST 端点。导出不直写（advisory 面无写盘授权，人审后由既有管理面应用）。
- **R9**：`Proposal.skillDifferential` 字段＋双 warning（`skill_undifferentiated` 未测／`skill_negative_delta` 负差分=负担技能）。
- **R10**：`EvalSet.family` 字段＋overview 族聚合（familyGains：族→平均增益）＋`family_specialization` 警示（面级均增益>0 而某族<0）。
- **R11**：`HARNESS2_STORE_SQLITE=1` 渐进切 SQLite（四表＋显式事务＋旧 JSON 一次性迁移改名 .migrated＋auto_jobs 任务态落盘/孤儿查询）。**落地实测抓出列名混用 bug**：INSERT 模板串内插 JSON 字段名当列名（updatedAt≠updated_at），静默 catch 吞掉——修复后迁移往返全绿；catch 改为 console.warn 不再全静默。

## 残项清偿实记（2026-11-01，R2③＋R7 前端）

- **R2③ 反事实档自动编排**：`runAutoProbeJob` 的 R2 证据块扩展——R3 变换器对探测集产 `rename_ids` 变体→注册临时 eval 集（name 带 `cf-<set>-<id>-<ts>` 防撞名）→候选树跑探测→replay 判分→写回 `evidence.counterfactual`。预算不足（剩余 < 单题估价）或变体/建集失败时如实跳过不阻断主探测。CHASE 门从此有自动证据供给，闭环完整。
- **R7 前端按钮**：`fetchWorkbenchSurfaceArtifacts`/`markWorkbenchSurfaceApplied` 两 api＋晋级态 memory/tool_guidance 面提案行内「导出建议产物」（Blob 下载 JSON/md）与「标记已应用」（confirm 门＋`appliedVia=via-surface` 后按钮隐藏）；i18n 三键 zh/en 成对。
- **R11 维持 D2 渐进决策不动**：默认仍 JSON；`HARNESS2_STORE_SQLITE=1` 启用路径与迁移窗归用户（决策可逆，不擅自翻默认）。

## 验证

- 每件独立 vitest 套件（上列验收）；`npm run typecheck:harness`；全量 `npm test` 收口。
- R1 需本机活体验证（真 gap_register 文件在位）。
- 本 spec 为实施方案文档批：gongwen-lint＋docs-ssot（附录 A 登记）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-31-rsi-improvement-plan.md`：§二批次表补「首批=R1/R4/R8/R12a，见执行 spec」指针。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（计数 +1）。
