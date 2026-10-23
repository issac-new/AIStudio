# RRSI 跟进批：held-out 对照、AI 起草器、hex 修复、正本同步（2026-10-23）

## 背景

RRSI 吸收轮（spec: 2026-10-23-rrsi-regularized-workbench.md）合入后用户指示「全都做」，
覆盖收口报告列出的四件：设计正本同步、GatekeeperSection 裸 hex 修复、真实循环走通、
两项可选增强（evolve vs held-out 并排卡、自动提案器）。

## 本批四件

### 1. evolve vs held-out 并排读数（论文图 4 的核心对照）

`RegressionEvidence` 补 `passAt1`（回归运行的通过率，读自 eval store 运行聚合）；
提案卡在选中候选带回归证据时并排显示「进化集通过率 vs 回归集通过率」——evolve 分与
held-out 分分家呈现，正是论文「evolve 集上的分不代表迁移」的可视化落点。

### 2. AI 起草器（论文 proposer 的受治理形态）

`POST /api/harness/workbench/proposals/suggest`：按面起草一个 **draft** 提案。
执行通道与探测同源（hermes CLI 子进程，零新增模型密钥），提示词携带：面定义、基线内容
（截断）、该面进化状态（轮次/退火预算/停滞/剪枝/未探索）、已采纳经验 top3、同面失败假设
清单（勿复提）。产出 JSON（标题/假设/完整候选内容）后走既有 `createProposal` 全部校验
（判词标记、树校验），入库 status=draft。**边界：只起草、不审批、不探测**——批准/晋级/
写盘各门禁原样生效；这与正本「人提案、台正则、门拦险」一致，自动化的只是起草体力活。

### 3. GatekeeperSection 裸 hex 修复（他轮领域，用户明示授权）

`custom/client/ia2/components/inbox/GatekeeperSection.vue:448-449` 两处裸 hex
（#2e7d32/#b71c1c）改 `var(--success)`/`var(--danger)`，让 raw-hex 守门回绿。

### 4. 整合正本同步（欠账补齐）

`2026-10-23-swarmstudio-integrated-design.md` 整合 R2 → R3：⑥治理改进实验处补 RRSI
正则化机制段（七机制＋门禁分级＋δ 不可调参），版本行与变更记录同步。

## 决策记录

- **2026-10-23 · 用户指示「全都做」**：收口报告四项全量执行；含对 3（他人领域小修）的
  明示授权。
- **起草器走 hermes CLI 而非新模型客户端**：custom/server 无通用自由文本模型调用，
  judge 的 AskFn 是断言结构化契约不可复用；探测通道（execFile + profile）已是本台既定
  执行形态，起草复用它=零新增依赖与密钥，成本口径与探测一致。
- **draft 起草失败如实报错**（输出无 JSON/进程失败→502/400），不静默降级为模板拼接。
- **held-out 读数取回归运行 passAt1**：回归集=冻结版本的 held-out 卷（收口轮语义），
  不新造第二套数据通道。

## 验证计划

- HTTP 测试：suggest 端点（注入假 spawn：合法 JSON→draft 提案入库；输出无 JSON→502；
  起草内容带判词标记→400）；record probe 后 regression.passAt1 在位。
- 面板测试：并排行与起草按钮渲染/触发。
- raw-hex 守门复跑回绿；相关套件全量复跑。
- 活体：真实循环走通（小评测集→基线×2→AI 起草→噪声标定→自动探测→组合→晋级），
  进化曲线出真实数据（见任务报告）。
