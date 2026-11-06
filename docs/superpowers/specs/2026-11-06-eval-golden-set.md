# 评测黄金集：30 例资产＋10/10/10 配比校验＋裁判指纹冻结＋规模披露

## 变更

补上评测平台审计的头号缺口——「有能力拼、没有成品」：无 30 例黄金集、无配比校验、裁判不随 run 冻结、报告不披露评测规模（微信三篇调研 C 批，对应文章一《OPC 一人搭评测平台》的「黄金数据集是核心资产，平台是空壳」主张）。

- **30 例黄金集资产**（新增 `custom/server/eval/golden-set.ts`）：`buildGoldenSetInput()` 产出完整建集输入——10 正向（七维显式标注、exceptionType=none）、10 模糊复杂（ambiguous_intent×3 / missing_param×2 / user_rephrase×2 / knowledge_conflict×2 / tool_timeout×1，覆盖异常六类中除 none 外五类）、10 越权异常（改写自红队六向量种子，dimension 沿用 `REDTEAM_VECTOR_DIMENSIONS` 映射）。每条带 `GOLDEN_SOURCES` 出处锚点（素材来源：红队种子/六类故障种子/企业约束种子/治理域真实流程），不虚构成生产 trace。
- **配比建集校验**（`custom/server/eval/types.ts` + `store.ts`）：`EvalSet` 增可选 `golden?: boolean`；`createSet` 在 `golden: true` 时强制校验 10/10/10（正向=exceptionType none；模糊=五类异常类目；越权=dimension privilege_injection/unclassified 且 rubric 含 risk 断言），不满足即拒——配比从此是机制不是口头约定。存量集不受影响（golden 缺省 false）。
- **裁判指纹冻结**（`judge.ts` + `types.ts` + `runner.ts`）：`judgeMeta` 始终写 `models`（单模型也写，此前多模型才写）；`EvalRun` 增 `judgeFingerprint: { models, backend, tauYes, tauNo }`，run 起跑时从 `loadEvalConfig()` 快照冻结——换裁判模型/阈值后，历史读数与新一轮的不可比可机械判定（文章三「请向我展示选项、选择与结果」在评测侧的对应物）。
- **规模与指纹披露**（`mx-eval-summary.py` + `mx-report-gen.py`）：`eval-summary.json` 的 `run` 块新增 `taskCount / k / attempts / attemptsWithEfficiency / judgeFingerprint`；报告评测节渲染「N 题 × k 样本 = M 次判分＋裁判指纹」一行——run27 类「3 题×2 纯 S0、efficiency 全 null、S1 判词 0 条」从此在报告页自曝，不再只靠深挖 JSON 才能发现。

## 决策记录

### 一、出处诚实：素材锚点，不冒充生产回流

审计确认仓内没有生产 trace 存量（`trace-reflow` 通道在、库里 0 条真实回流）。30 例的出处锚点如实标注为仓内素材（红队种子/故障种子/企业约束/治理域真实流程——如「双凭证收口」「审批先于发布」取自六闸纪律而非编造），`origin` 字段（ReflowOrigin）不填——它语义专属坏例回流端点，手工集填了就是伪造来源。这与「fail-soft 不造假」不变量一致。

### 二、配比校验挂在 golden 标志，不做全局最小样本量

不强制所有集 ≥N 条（回归库 4 条是合法的小集）；只在显式声明 `golden: true` 时校验 10/10/10。魔法字符串（按集名触发）与全局硬门槛都被否——前者脆，后者伤存量。

### 三、裁判指纹存 run 而不只在 judgeMeta

judgeMeta 是每次判定的伴随快照，但运行级对比需要单一锚点。`EvalRun.judgeFingerprint` 在起跑时冻结（模型/端点/双阈值），跨 run diff 一眼可见「裁判变了」。不改判定逻辑本身——指纹是观测面，不是行为面。

### 四、G4 换黄金集挂账，本批不动 mx-eval-lib 建集

G4 的 3 题内联建集改接黄金集需要活体 Eval Studio 在位（建集是 run 期动作），且 G4 判据面刚在 A 批动过（GAP=4）——同批再动两处会混淆归因。本批先把资产、校验、披露三层备齐：黄金集就绪后 G4 接线是一行建集调用的事（挂账见 §五）。

## 验证

- `npx vitest run custom/server/eval/__tests__/golden-set.test.ts`：①`buildGoldenSetInput()` 产出恰 30 例且 10/10/10（按校验器同源口径）；②真跑 store 层（临时 EVAL_STORE）`createSet(golden:true)` 成功落库、contentHash/revision 正确；③错配比（抽掉一条越权）被拒且 problems 点名；④30 例 id 无重复、出处表覆盖全部 30 条。
- `npx vitest run custom/server/eval/__tests__/eval-regression.test.ts`：存量回归不破（golden 缺省 false 零影响）。
- `simharness/tests/eval-fullflow-integration.test.ts`：补断言——summary 输出含 `taskCount`/`k`/`attempts`（fixture 3 题×k=2 → taskCount=3）。
- `node scripts/typecheck` 或单文件 tsc：golden-set/store/types/judge/runner 五文件零错。
- `python3 -m py_compile simharness/mux/mx-eval-summary.py simharness/mux/mx-report-gen.py`。

## 设计文档影响

DESIGN_SYNC: none——评测集资产与观测面增强，不改七维/六类判据口径与 e2e-verdict 正本；黄金集是既有 EvalTask schema 的实例化，无 schema 变更（仅 EvalSet 可选字段与 EvalRun 可选指纹字段，均为加法）。

## 挂账（下一轮）

- G4 建集接黄金集：`mx-eval-lib.sh` 的 `eval_ensure_set` 增黄金集档（活体在位时建/复用），G4 判据从 3 题内联升级为 30 例资产判分。
- 黄金集 Rubric Loop 校准：`requireCalibration: true` 在黄金集上的首次校准轮（F2P/P2P）——待首轮真实运行后做。
- 裁判稳定性常态化：`stabilityRetest=2` 纳入黄金集运行默认参数（通道已有，G4 未传）。
