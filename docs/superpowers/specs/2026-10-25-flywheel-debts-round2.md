# 数据飞轮吸收轮·挂账清偿（round 2）

- 日期：2026-10-25
- 状态：已落地（本轮）
- 源文：同 round 1（银翼AI评测室《AI Agent 数据飞轮》）——本轮清偿 round 1 spec 立账的五项挂账 + 活体走查
- 关联正本：`2026-10-25-agent-data-flywheel-absorption.md`（round 1，D1-D11）

## 变更

1. **挂账5 → 运行报告页「提炼入库」按钮**（客户端）：失败样本行新增按钮，调 `POST /badcase/distill`，回显提案摘要（根因/步数红线/禁忌条数），与既有回流按钮并列。
2. **挂账3 → LLM 归因并联复核**：distill 端点新增 `judgeAttribution` 选通——确定性根因（S0 主判，D1 不变）交裁判端做 noul 复核，四态（confirmed/disputed/unknown/offline）全部如实入台账 `attribution` 字段，不影响入库与主判。
3. **挂账1 → Few-shot 记忆按相似度召回（词面 v1）**：飞轮台账提炼记录扩 `problem`/`expectedBehavior` 快照字段（源集非密封才存文本）；`eval/fewshot.ts` 把每条提炼打包成「触发场景/错误示范/正确做法」三元组，新查询按 ROUGE-L F1 词面相似度召回（超阈值才注入、封顶 3 条、无相关历史返回空）；召回端点 `GET /flywheel/fewshot?query=`；注入接线挂 expcandidates `experienceLinesForDispatch` 附加一路（`FLYWHEEL_FEWSHOT_INJECT=1` 选通，默认关，fail-soft 空行）。
4. **挂账2 → CI 焊接点（合入门）**：`flywheel.ts` 新增 `mergeGateOf`——变更清单（Prompt/模型/编排三类，与 EvalRunTarget 三锚对齐）任一为真时，回归库最新 run 必须满足：存在、k≥2、通过率门 pass、无 riskVeto，否则 blocked（执法面 fail-closed，理由逐条列）；无相关变更 → not_required。端点 `POST /flywheel/merge-gate`。reviewgov `ReviewCase` 增可选 `regressionGate {status, summary}`，mergeReadiness 在该字段存在且 blocked 时追加 blocker——治理对象显式接入才受管辖（absent 不阻断，不静默扩权）。
5. **挂账4 → 检索生成后相关性断言（捕获网卡点②）**：`toolresultguard/retrieval-relevance.ts` 确定性规则 + ekko 钩子——检索类工具（名字模式匹配）postExecute 算查询词在结果文本的覆盖率，低于下限标记 flag（留痕+计数，不改写不阻断——软信号 CONFIRM 形态，与注入围栏 BLOCK/REWRITE 区分）；`FLYWHEEL_RETRIEVAL_GUARD=1` 选通默认关；无查询参数/无结果文本不适用跳过。
6. **活体走查**：serve-main 仍被并行升级轮占用（8c0f8b5c5+383 脏文件），canonical 8647/8649 换装留给该轮收口复原；本轮在独立端口（8667/8668）从 main 内容起专属实例做实物走查。

## 决策记录（接 round 1 D1-D11）

- **D12 词面召回替代向量召回（v1）**：文章 0.85 阈值是 embedding 余弦口径；仓内无向量基建，v1 用 ROUGE-L F1（复用 `eval/similarity.ts`），阈值默认 0.45（`FLYWHEEL_FEWSHOT_MIN_SIM` 可调）——分度不同，取「同题改述能召回、异题不误召回」的实测平衡点，embedding 基建立项后升级。召回三元组的错误示范带失败动作签名（根因+禁忌动作文本），正确示范取 expectedBehavior 快照。
- **D13 归因复核不替换主判**：LLM 复核结论只入台账供人工复核（disputed 即提示人工看一眼），不改变确定性根因与入库行为——S0 哲学与 round 1 D1 一致；判定端不可用如实 offline，零费路径不受影响。
- **D14 合入门 fail-closed、接入 opt-in**：三类变更已声明 → 回归库证据缺任何一环即 blocked（红线执法面，与文章「合并之前必须通过全量回放」同义）；reviewgov 侧字段缺席不阻断（既有评审流不静默被扩权）。GitHub workflow 层不接：overlay 注入态在 CI 不可复现是既有约束（.github/workflows 仅跑 qgate 包），写明由 in-product 合入门承接。
- **D15 相关性断言软标记**：检索噪声是软信号（误拦会断正常检索流），落 CONFIRM 形态（flag 留痕+计数），不进 BLOCK/REWRITE 硬路径；查询词提取自工具入参（query/q/question/keywords/text 首个字符串字段），覆盖率=CJK 二元组+ASCII 词的命中占比，默认下限 0.15（`FLYWHEEL_RETRIEVAL_MIN_COVERAGE` 可调）。
- **D16 台账文本快照边界**：problem/expectedBehavior 只在源集非密封时入库台账（密封集内容不出库纪律延伸到台账）；旧台账记录无快照字段 → 该条不参与召回（fail-soft 跳过，不造数）。
- **D17 活体走查载体裁决**：共享载体 serve-main 被并行升级轮占用期间不抢——独立端口专属实例走查（可逆零干扰）；canonical 换装动作留给占用方收口（同「nohup 改托管 run 后须复原」先例）。

## 验证

- `npx vitest run custom/server/eval/__tests__/flywheel-debts.test.ts custom/server/eval/__tests__/flywheel-http.test.ts custom/server/toolresultguard/__tests__/retrieval-relevance.test.ts custom/server/reviewgov/__tests__/<convergence 相关>` 等（见验证结果段）
- 客户端：`npx vitest run custom/client/eval`
- `npm run typecheck:harness`（新增文件入清单）
- 活体：独立端口实例走查「数据飞轮页签 + 报告页提炼按钮 + fewshot 召回端点」
- 全量双树对拍（分支树 vs 基线树）零新增回归

## 验证结果（2026-10-25 收口实测）

- 新增/扩展测试：`flywheel-debts.test.ts` 9 用例（fewshot 召回/合入门/台账补充/归因四态 mock）+ `retrieval-relevance.test.ts` 9 用例 + `regression-gate.test.ts` 3 用例 + exp-inject fewshot 通道 2 用例 + HTTP 扩 3 用例 + 面板 round2 试算 2 用例 + 提炼按钮 2 用例——全绿。
- 域回归：eval+reviewgov+expcandidates+toolresultguard+toolpipeline+custom/client/eval 五域 53 文件 463 用例全绿（toolpipeline 2 文件既有环境性失败除外，见对拍）。
- `npm run typecheck:harness` 出口 0。
- **ts-node 全编译门**：8667 活体实例启动时抓出 round 1 五处潜伏类型错（controller targetSetId unknown/EvalTask 未导入/taskId 非空断言/dims 键型收窄 + badcase-distill toolCalls 可能未定义）——全部修复后编译过、服务起。此门与 vitest（不查型）/typecheck:harness（旗标口径不同）互补，已随活体验证执行。
- **活体走查（独立端口 8667/8668，真数据）**：①`GET /flywheel` 真库读数（27 捕获/2 回流）；②`distill dryRun` 预览（根因=结果缺陷/步数红线 4/双禁忌）→ 提交入库（回归库 rev4）→ 归因复核如实 offline（判定端不可达 fail-soft）；③变体扩产 20 条（2 蓝本×10）；④fewshot 召回：语义无关查询正确零召回、真改述召回 1 条（相似度 0.59 带正误示范）；⑤合入门：换模型→blocked 带人话理由；⑥UI：数据飞轮页签六区块渲染+合入门试算 blocked 呈现+召回试算条目+报告页失败样本行提炼按钮（幂等口径走查中抓到显示问题→当轮修复→HMR 复验通过）。截图留档 session artifacts。
- **全量双树对拍**：分支树 28 文件/39 用例失败 vs 基线树（纯 origin/main）——失败集对拍零新增回归（明细见提交说明；失败均为注入态/兄弟 worktree 路径类环境性失败）。
- 走查副作用披露：真库写入=回归样本库 +1 提炼任务与 +20 变体（rev4）、飞轮台账 1 条提炼+2 条变体批次——均为功能正身操作、幂等可查，保留在库。

## 挂账

- embedding 召回升级（D12 v1 词面口径的替代，待向量基建立项）
- canonical serve-main 8647/8649 换装（待并行升级轮收口；本轮独立端口实例已验证同一棵树）
