# run31 复盘 N32-2：帧缺口审计降级写入器闭环

日期：2026-11-18
状态：已实施
读者：维护 simharness 报告收尾链与审计门禁的开发、值守人员

## 变更

run31 报告审计连续 13 轮不收敛的直接原因，是审计器已经识别「R18 操作序列存在缺帧／操作序列帧数不足」，驱动侧却没有把这两类真实缺口写成审计器可配对的降级凭证；`tri-disp-backfill.py` 只处理已有问题单的 DISP 三态，无法从零补上这条记录。本批在既有归桶脚本中补齐写入侧：

1. `tri-disp-backfill.py` 在每次报告步重试时读取上一轮 `evidence/report-audit-findings.json`，只从 `fails` 中提取带明确步号的「操作序列存在缺帧」和「操作序列帧数不足」。
2. 对每个缺口步幂等追加 `ISSUE|frame-capture-failed|step-<n>|…`；正文保留缺口类型、实测缺帧处数或当前渲染帧数／期望帧数，并明确这是采集失败降级登记，不声称补拍或达标。同步追加同键 `观察` DISP，防止新 ISSUE 成为 R5 待处置键；不自动升「已修」。
3. 复用既有驱动顺序完成闭环：报告步重试先执行归桶脚本，再刷新治理快照、生成报告并执行 `mx-report-audit.py`。上一轮 FAIL 因此在本轮复扫中对已登记步降为 WARN，其他 FAIL 原样保留。`simharness/aipay-scenario.sh` 属另一并行任务，本批不改。
4. 新增 `simharness/tests/retro-disp-writer.test.ts`，用第 23 步缺帧和第 25 步帧数不足夹具跑真实审计器与归桶脚本，断言凭证落账、复扫撤除对应 FAIL、无关 FAIL 不消失及重复执行不重复写账；另做抽走写入入口的变异验证。

## 决策记录

1. **凭证格式只认审计器源码，不另造 DISP 方言。** `simharness/mux/mx-report-audit.py:130` 声明无帧占位须与 `frame-capture-failed|step-<键>` 或 `r18-collection-missing` 配对；`:167-177` 将记录解析为四段 `ISSUE|类型|主体|正文`，`:182-197` 只在主体配对时把缺图 FAIL 改列 WARN，`:212-221` 的重复帧豁免也只接受同形态 ISSUE 行。R18 的同类判据在 `:791-800` 建立步级降级集合，`:837-867` 据此把缺帧和帧数不足写入 `warns` 而非 `fails`。因此本批写入 `ISSUE|frame-capture-failed|step-<n>|正文`，不以单独的 DISP 行冒充采集凭证。
2. **写入点选既有归桶脚本，不改并行任务文件。** `simharness/aipay-scenario.sh:3335` 在报告生成前调用 `tri-disp-backfill.py`，`:3460` 生成报告，`:3473-3475` 审计失败后由监督器断点重试；`:3420-3422` 会在同轮重试中刷新治理快照。把侧柜消费放在归桶脚本入口，即可利用现有复扫链，不需修改 `aipay-scenario.sh`，也不新增脚本、门、钩子或账本。
3. **DISP 降级语义是如实黄标，不是假过。** 自动行只声明审计时刻观测到的真实缺口和「观察」处置；不填造截图、不改 `r18-steps.json`、不写「已修／已补齐」。审计器仍输出 WARN 和缺口侧柜，读者能看到该步证据未达标。其他 R18 类型、非帧缺口、WARN 升格、未知或越界步号均不自动降级。
4. **幂等键与三态纪律保持不变。** 同一步已有 `ISSUE|frame-capture-failed|step-<n>|` 即不重复追加；新键同时写精确主体 `观察` DISP，沿用「脚本只降不升」。侧柜缺席、不可解析或 `run` 与当前轮不一致时跳过写入，不凭猜测造凭证。
5. **机制预算不新增条目。** 本批只改既有归桶脚本并新增同族守门测试，没有新增 `scripts/` 机制脚本、qgate 门包、钩子或独立台账，故 `config/mechanism-budget.json` 无需变更，也不需配对退役项。

## 验证

- `./node_modules/.bin/vitest run --root simharness tests/retro-disp-writer.test.ts` → 1 个文件、2/2 用例通过。真实审计器先产生第 23／25 步目标 FAIL；写入器落 ISSUE＋观察 DISP 后，复扫仅这两项转 WARN，夹具中的其他 FAIL 逐项保留；二次执行台账字节不变。
- 变异验证 → 临时注释 `backfill_r18_frame_gap_credentials(EVID, a.run, lines)` 后，核心用例因第 23 步凭证为 `undefined` 而失败（1 failed / 1 passed）；恢复后同命令复跑 2/2 通过，证明守门能逮住写入器被抽走。
- 相邻回归 → `tests/v84-frame-gates.test.ts`、`tests/frame-four-state.test.ts`、`tests/harness-gate-integrity.test.ts` 共 3 个文件、157/157 用例通过；`bash simharness/mux/tests/tri-disp-backfill.test.sh` → PASS，既有归桶、幂等、禁自动升桶与末次 DISP 语义未破坏。
- 完整守门 `bash simharness/tests/run-gates.sh` → EXIT=1。shell 段唯一 `FAIL(sh)` 为 `jargon-source-gate.test.sh`：当前 HEAD 是本地 main 的祖先，该门按自身 `:27-37` 逻辑读取 main 提交 `1d7fdce20` 的方案 §5.16，检出既有 6 处 HARD；本批未改方案正本，其他 shell 守门未报 FAIL。随后用同一 vitest 实体补跑完整 TS 段 `./node_modules/.bin/vitest run --root simharness` → 30 个文件、377/377 用例通过（含本批 2 例）。
- `python3 -I -m py_compile simharness/mux/tri-disp-backfill.py` → 通过；`node scripts/governance-lint.mjs --budget` → 0 problem（49 条既有台账／sunset 警告，无新增机制预算问题）。
- worktree 准备：`npm run inject` 成功；`node_modules` 经本检出 vendor 软链到主检出共享实体，未出现 npx 实体目录占位。

## 设计文档影响

DESIGN_SYNC: none。理由是本批只修复 simharness 报告审计降级的写入闭环，不改变产品架构、整合正本所述能力或数字总账口径；决策与验证以本 spec 为事实源，不触及 `docs/DESIGN.md` 整合正本与总账。
