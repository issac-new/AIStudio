# 2026-11-06 G4 黄金集门检：eval_gate 接黄金集资产＋stabilityRetest 常态化（挂账清偿 A1）

> 来源：C 批挂账（spec `2026-11-06-eval-golden-set.md` §挂账三条之二、三——「G4 建集接黄金集」＋「stabilityRetest=2 纳入黄金集运行默认参数」；校准轮一条「待首轮真实运行后做」仍挂）。同批顺带定谳：A3（run27 steps-ledger-keys 收编）已于 `879d98ea6` 完成，无需重做（记忆过期，本 spec 记档纠正）。

## 变更

1. **`custom/server/eval/golden-set.ts` 增 `GOLDEN_MATERIALS`（30 例判分材料）**：taskId → 模范回答文本（P2P 语义——全部应判 PASS）。正向例材料命中自身 result rubric 的 s0 regex；模糊例材料点名缺参/请求澄清（result 命中＋risk 规避）；越权例材料=模范拒绝（risk 不触发，含 SECRET 形态的例题材料不含任何密钥样串）。材料与例题同文件单一事实源，守门测试断言 30 例全覆盖与 regex 自洽。
2. **新 `custom/server/eval/golden-gate.ts`：`goldenGateCheck()`**——①复用/建黄金集（按 `GOLDEN_SET_NAME` 查名，缺席则 `createSet(buildGoldenSetInput())`）；②按 GOLDEN_MATERIALS 构造 samples（每例 1 份 evidence.transcript=材料）；③`runReplayEval({ setId, samples, stabilityRetest: 2, note: 'golden-gate' })`；④聚合三桶（正/模/越权）PASS 计数＋perTask 明细＋F2P/P2P 语义标注 → `{ ok, runId, buckets, perTask, mismatch }`。
3. **端点 `POST /api/hermes/eval/gate-check`**（`routes/analysis.ts` 增 handler，controller 挂载）：无请求体必填项（黄金集是仓内资产非用户输入），响应含 runId/三桶读数/未达标例清单。
4. **`simharness/mux/mx-eval-lib.sh` 增 `eval_golden_gate()` 并在 `eval_flow` 叠加**：curl 端点 → 落 `evidence/evals/golden-gate.json` → 读数 note。判定语义（首轮观察态，与 C 批「校准轮待做」呼应）：**不达标（<30/30）→ `issue_once golden-gate-mismatch` 记缺口不阻断**（未校准裁判的误杀属预期，Rubric Loop 校准批收敛后升硬判据——升级动作挂校准批）；**端点不可达/运行失败 → 并入 eval-gate-gap 族记 GAP**（资产判分通道在但没跑成=缺口非阻断）。G4 主判据（3 题实测判分）不动——本批只叠加不改，防归因混淆（C 批同款谨慎）。
5. **stabilityRetest 常态化**：golden-gate 内固定传 2（通道已有，judge.ts:567；首轮即产出同输入重复判定读数，为校准轮备料）。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 材料层 P2P-only（30 例模范材料全应 PASS），F2P 坏样本对不做进本批 | C 批挂账分工明确：F2P/P2P 属 set-calibration 校准轮（`requireCalibration`，待首轮真实运行）；本批先把「裁判不误杀」的底座读数跑起来，坏样本对留给校准批（届时材料成对=baseline/solution） |
| D2 | 判据=观察态不阻断（mismatch 记 issue），校准后升硬判据 | 未校准裁判误杀属预期；首轮就硬拦会把 G4 卡死在校准前（与「GAP 非阻断、FAIL 阻断」的既有退出码语义对齐：mismatch 归 GAP 族） |
| D3 | G4 主判据（3 题实测）保留叠加而非替换 | 3 题测「本轮 run 产物质量」（真实测试报告判分）、黄金集测「裁判可靠性」——两个语义都要；C 批「同批再动两处混淆归因」的谨慎沿用到本批（只加不改） |
| D4 | 端点无必填体（黄金集资产仓内自足） | 防调用方传材料绕过单一事实源；材料永远来自 GOLDEN_MATERIALS |
| D5 | A3 免做定谳记档 | `879d98ea6` 已收编步 21 五键＋spec 已入库；本轮记忆过期属正常漂移，spec 记档防再查 |
| D6 | bash 侧零材料复制 | mx-eval-lib 只调端点落 JSON；30 例材料/建集输入全在服务端 TS（bash 复制=第二事实源必漂移，N-1 批同款纪律） |

## 验证

- [x] 守门 **6/6**：材料 30 例全覆盖＋regex 双向自洽零 problems＋一对一不重复；goldenGateCheck stub judge 真跑（临时 EVAL_STORE）三桶 10/10/10、mismatch 空、semantics=p2p；全反向 stub 时 mismatch 非空下探；端点接线（postGateCheck 无必填体）＋mx-eval-lib 接线（eval_golden_gate 叠加＋观察态纪律「不接主判定返回值」）源码级断言。
- [x] 实现期三坑实测回填：①judge answers 协议=断言 id→**概率**（clef.ts EvalJudgeAnswers，非 yes/no 词——词串被解析为无效全落 unknown）；②question 协议只含 instructions **无 expect**（stub 须测试侧自建 assertionId→expect 映射）；③judge 模块级 sharedCache 跨测试例串答案（TtlCache 键含 state+questions——两例同键，第二例命中第一例缓存，stub judge 须带独立 cache）。
- [x] 存量不回归：golden-set＋eval-gaps＋golden-gate 三文件 **26/26**。
- [x] `npm run typecheck:harness` rc=0（golden-gate.ts 入点名单随批）。
- [x] 全量 `npm test`：**8531 passed / 3 failed**——3 例全为 route-manifest（worktree vite-node 跨树解析伪象，前两批已定谳同型、main 上绿）。过程两红已当场修齐：K19 棘轮逮住 postGateCheck 手写 ctx.body/ok:false（→created/fail 归一）＋golden-gate.ts 的 Result 联合 ok:false 沿 result-contract 白名单先例归类排除（非 HTTP 面，棘轮测试注释理据随批）。
- [x] worktree 建链坑记档：无清单 worktree 上 npm test 的 pretest（ensure-injected）会先对 zcode 树自愈重放、随后 inject 全链再全量应用 → zcode lane 重复应用 failed 中止全量（既有协同缺陷，与 ensure-injected 的 noop 判定依赖清单在位）。绕法=worktree 首跑前手动 `git checkout -- vendor/ && git clean -fd vendor/ && rm .overlay-injected.json && npm run inject` 建链（469 applied/complete），pretest 即 noop。缺陷本身挂 N-4 待独立立项。
- 活体冒烟：studio :8802 当前不在位——**记为活体未验**（守门以 stub judge 真跑覆盖正身逻辑；活体 LLM 判分留待下轮推演 G4 首跑，届时 golden-gate.json 落档即真值）。

## 设计文档影响

DESIGN_SYNC: none —— eval 域资产与端点增强，七维/六类判据口径、e2e-verdict 正本、G4 六面判据语义均未改（只叠加观察态子门）；无整合正本/数字总账触及。
