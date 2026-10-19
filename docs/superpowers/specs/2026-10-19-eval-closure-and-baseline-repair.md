# Eval 收口与测试基线修复设计（2026-10-19）

> 状态：已落地（feat/eval-closure，2026-10-19）。
> 前置：specs/2026-10-19-eval-baidu-reward-design.md（B1-B5）、specs/2026-10-19-eval-baidu-paradigm-design.md（范式轮）、specs/2026-10-19-eval-baidu-followup-design.md（B6-B7）。
> 本文只补三份前置未覆盖的断点：评测结果如何驱动修复并被机械关闭、历史考卷如何冻结、无证据时如何不误判。

## 主旨三句话

唯一主旨：让评测从「打分并给建议」变成「登记处置、同卷复评、按判据关闭」，同时消除四处会把无证据读成安全的语义漏洞。受众：Eval Studio 维护者与把评测读数用于发布判断的人。读完促成：失败样本有可追踪的处置单，复评必须使用与首次运行相同的考卷版本，处置关闭由复跑结果机械决定。

## 1. 变更

### 1.1 评测集版本快照（考卷冻结）

- `EvalSetRevision { setId, revision, contentHash, tasks, createdAt }` 追加写入 store；建集写第 1 版，改题、回流、变体扩产各写新版本。
- `EvalRun.setRevision` 记录运行时版本；缺省（历史运行）不回填假版本。
- 新增 `GET /sets/:id/revisions`（密封集只回版本号、指纹、时间、任务数）与 `GET /sets/:id/revisions/:revision`（密封集拒绝回题目内容）。
- A/B 对比在两侧 `setHash` 都存在且不相等时拒绝，并说明「同集不同考卷版本」。避免把改题后的读数当成能力变化。

### 1.2 同卷复评

- `POST /runs/:id/rerun`：以基准运行的 `setRevision` 取冻结题目判分，不再读当前集内容。若基准运行缺版本（历史数据）则要求当前集指纹等于基准 `setHash`，否则拒绝。
- 运行器新增 `expectedSetHash`、`expectedRevision` 入参；解析出的考卷与期望不符时返回可读错误，不静默改用当前集。
- 复评响应沿用密封集只回聚合的契约。

### 1.3 处置单与机械关闭

- `RemediationRecord { runId, setId, setHash, setRevision, taskId, sampleIdx?, status: open|closed, rerunCount, rerunRunId?, lastRerunPassed?, note?, owner? }` 持久化。
- `POST /runs/:id/remediations` 建单；同一 run+task+sample 幂等返回既有单。密封集拒绝（逐条处置是内容探测通道）。
- `GET /runs/:id/remediations`、`GET /remediations?status=&setId=`。
- `POST /remediations/:id/verify { rerunRunId }`：只接受同一评测集、同一 `setHash`、同一 `setRevision` 的复评运行；该任务在复评中任一样本通过才置 `closed`，否则保持 `open` 并累加复评次数。关闭没有手工旁路。
- 风险否决单独判断：复评若仍 `riskVeto`，即使任务样本通过也不关闭。

### 1.4 密封写响应

- Rubric 修订、人工仲裁、线上证据回填三个写端点：密封集只返回运行/集摘要，不返回完整 `tasks` 或 `attempts`。与既有的读端点、A/B、证据、回流规则一致。

### 1.5 无证据不判安全

- S0 正则断言在 `transcript` 缺失或为空时返回 `unknown`，理由写明「证据缺席」。此前返回 `no`，会让 `expect=no` 的红线断言被当成「确认未发生」，把无证据误读为 clean。

### 1.6 基线测试修复

- `RunSelector` 只在运行列表已完成一次真实加载后清空 `?run`；加载中、加载失败、测试态都不清。修深层链接被立即抹掉的问题。
- 事故窗口测试改用仓库内 fixture，不再读取共享 SIM 运行树中会消失的生产文件；补畸形 fixture 与显式路径优先级断言。
- `ensure-injected` 的 zcode 自愈增加「补丁声明新增但工作树缺失」检测，按文件粒度补放；修上游树脏时缺文件永远无人发现的问题。CUA 平台测试因此恢复可运行。

## 2. 决策记录

- 2026-10-19 用户指令「继续 完成所有」：范围=上一轮列出的四项 Eval 缺口 + 全量测试 8 个基线失败；红队遗传算法生成、真实线上采集等前置明确排除项不在本轮。
- 考卷冻结选「版本快照」而非仅存指纹：指纹只能示警，不能让人在改题后仍按旧题复评。快照体积随改题次数增长，但评测集规模在千条量级，可接受。
- 处置单不自动派发给某个 agent：仓库没有稳定的责任路由契约，自动派发会把处置变成猜测。本轮先把状态、判据、关闭条件做真，派发保持在人。
- 关闭必须由复评结果决定，不提供 `close` 端点：否则又回到「自己说自己修好了」。
- 密封集禁止建处置单与复评？复评允许（每次运行已受密封尝试上限约束），建处置单拒绝（会暴露任务/样本存在性）。
- S0 空证据改为 unknown 会降低部分回归样例的通过率：这是口径修正，不是回归。现有 `eval-regression` 样例全部有 transcript，不受影响。

## 3. 验证

必跑：

```bash
cd overlay/.claude/worktrees/eval-closure
npx vitest run custom/server/eval custom/server/redteam custom/client/eval
npx vitest run custom/client/ia2/__tests__/journey.test.ts \
  custom/server/incident/__tests__/incident-window.test.ts \
  custom/server/zcode/__tests__/cua-node-backend-platforms.test.ts
npm test
npm run typecheck:harness
npm run build
```

浏览器走查：`/app/eval` 运行记录 → 失败样本建处置单 → 同卷复评 → 处置单关闭；改题后同集 A/B 被拒并显示原因；密封集修改 Rubric 的响应不含题目内容。

验收线：

- 处置单在复评失败时保持 open，复评通过且同集同版本时自动 closed，人工无法直接关闭。
- 改题后对旧运行发起复评，使用旧版本题目；A/B 拒绝跨版本比较。
- S0 正则遇到空证据输出 unknown，红线层不得显示 clean。
- 全量测试 0 失败；类型检查 0 错；构建成功。

## 4. 边界

- 不实现处置单分配到具体 agent、不实现通知/催办。
- 不实现线上实时采集；线上证据仍由 B7 的回填端点提供。
- 不改发布门禁阈值；处置单状态不直接改变门禁结论，只作为复评与关闭的事实源。
- 历史运行（无 setRevision）只能在当前集指纹与 `setHash` 相同时复评；不做题目内容的反推回填。
- 真引擎 `importSession` 集成用例改为显式 `ZCODE_ENGINE_INT=1` 才运行：共享引擎上探测与正式用例两次握手会互相干扰（2026-10-19 实测 5s 超时），默认全量不再把它误报为产品红。

## 5. 验证账（2026-10-19 执行）

- 目标域：`custom/server/eval` + `custom/server/redteam` + `custom/client/eval` → **189 通过 / 0 失败**。
- 基线三件：journey / incident-window / CUA 平台 + 补丁清单 → **16 通过 / 0 失败**。
- 全量（推送提交 `1555bec7` 实测）：**746 文件通过、5 跳过；5437 用例通过、8 跳过、0 失败**（751 文件 / 5445 用例）。
- 类型：`npm run typecheck:harness` 0 错误；`vite build` 成功（输出 `/tmp/eval-closure-dist`，未覆盖共享 dist）。
- 浏览器走查（隔离后端 8648 + 前端 8653，未触碰 8647/8649）：失败样本建处置单 → 处置单待修复 → 同卷复评通过 → 状态自动变「已关闭」、复评次数 1、最近复评通过 ✓。截图 [closure-closed.png](assets/eval-closure-2026-10-19/closure-closed.png)。
- 走查后经 API 复核：处置单 `status=closed`、`rerunRunId` 指向复评运行；复评运行 `setRevision=1`、`passAtK=1`；首次运行 `passAtK=0`。
