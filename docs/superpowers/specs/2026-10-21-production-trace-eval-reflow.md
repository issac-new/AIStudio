# SwarmStudio 生产轨迹转回归样本设计

日期：2026-10-21　分支：`feat/production-trace-reflow`

## 1. 结论与来源

本轮把生产会话或 span 转成可重复判分的回归样本，并区分“原证据复现”与“新证据修复”。现有采样端点只返回证据，客户端没有入口。回归库收到题目后，运行器也不能自动绑定原会话。这两处断点使线上失败无法进入既有复评和发布门。

调研来源：

1. [Cloudflare 安全审计文章](https://mp.weixin.qq.com/s/eQQxGgdFFSGxqusucsh1tg)与[官方仓库](https://github.com/cloudflare/security-audit-skill)：覆盖、独立验证、证据失效和中立报告。
2. [OpenAI Evals 文章](https://mp.weixin.qq.com/s/_m7x5KPazF5jQX9z8ew9xg)与[官方仓库](https://github.com/openai/evals)：评测资产、轨迹判分和生产失败回流。生产轨迹转回归属于现代评测生态的扩展，不视为 OpenAI Evals 原生能力。

`feat/secaudit-eval-discipline` 已合入 `origin/main`，覆盖安全审计账本、三态裁决、自证拒绝和判分纪律。本轮不重复实现这些内容。

## 2. 现状与主要矛盾

现有能力已经覆盖两段流程：

- `POST /api/hermes/eval/sample-from-trace` 与 `sample-span-from-trace` 能读取 L2 轨迹，但不写入评测集。
- `reflowTaskToSet()` 能复制已有评测任务，`verifyRemediation()` 能用同卷复评关闭处置单，Harness² 能检查候选的回归证据。

缺少的是两段之间的产品路径。生产 trace 没有转题入口，原会话引用没有进入 `origin`。运行器也没有按引用取证的显式模式。

## 3. 目标与非目标

### 3.1 目标

1. 在 IDE 轨迹页把完整 session 或具备稳定引用的 span 转成回归题。
2. 转题前由人确认问题、期望行为和至少一条断言。预览后证据变化必须重新确认。
3. 回归库可按 `origin` 自动绑定原证据复判，显式提供的新样本始终优先。
4. 原证据复判只用于诊断。修复关闭和候选晋级必须读取新运行证据。
5. 复用现有评测集版本、处置单和 Harness² 发布门，不新增第二套存储或门禁。

### 3.2 非目标

- 不支持 OTel 转题、跨机 trace 拉取或原始证据快照库。
- 不实现通用代码仓安全审计、操作系统沙箱或新的 Agent 运行器。
- 不把单样本原证据复判当作统计充分的发布证据。
- 不处理通用密钥识别或数据防泄漏。界面必须提示人工检查裁判发送范围。

## 4. 用户流程

1. 用户在 IDE“观测 → 轨迹”打开一个已结束会话。
2. 用户选择“本会话转回归”。节点有稳定 `spanRef` 时，也可选择“此 span 转回归”。
3. 系统预览证据并返回 `traceHash`。用户填写问题、期望行为和断言后提交。
4. 服务端重新读取证据并检查 hash，再写入默认“回归样本库”。重复请求返回原任务，不增加修订号。
5. 用户在评测岛选择“按来源证据复现”。运行器按 `origin` 读取原证据，产生 `evidenceMode=origin` 的诊断运行。
6. 修复后，用户显式提供新 session 或内联证据做同卷复评。只有 `explicit` 运行能关闭处置单或进入 Harness² 候选证据。

## 5. 数据与接口设计

### 5.1 来源引用

`ReflowOrigin` 改为兼容旧数据的联合类型。旧数据没有 `source` 时按 `eval_run` 解读。

```ts
type ReflowOrigin =
  | {
      source?: 'eval_run'
      runId: string
      taskId: string
      sampleIdx?: number
      sessionId?: string
      spanRef?: string
      traceHash?: string
      at: number
    }
  | {
      source: 'production_trace'
      sessionId: string
      spanRef?: string
      traceHash: string
      at: number
    }
```

`origin` 只存引用与指纹，不存 transcript、请求、响应或推理文本。生产任务 ID 使用 `re-` 加来源键 SHA-256 的前 20 位。来源键包含 session 与 span，不包含时间、actor 或证据 hash。

### 5.2 转题端点

新增 `POST /api/hermes/eval/reflow-from-trace`，请求字段：

- `sessionId`、可选 `spanRef`。
- `expectedTraceHash`。
- `task.problem`、`task.expectedBehavior`、`task.rubric` 及既有可选标注。
- 可选 `targetSetId`，缺省写入“回归样本库”。

服务端重新采样并验证完整性。以下情况不得写入任务：非法引用、路径逃逸、header 身份不符、缺少 trailer、空证据、OTel、hash 漂移、密封目标。

同来源同定义返回 `created:false`，不增加 revision。同来源不同任务定义返回冲突。新建或追加任务继续调用既有资产原语，保留 contentHash、revision 和不可变考卷快照。

### 5.3 按来源复判

`ReplayRunInput` 增加 `useOrigin?: boolean`。只有显式开启且任务没有显式样本时，运行器才从 origin 生成一个样本。任何任务既无样本也无合法 origin 时，整次运行拒绝，不静默漏题。

`EvalRun` 增加 `evidenceMode: 'explicit' | 'origin' | 'mixed'`。原证据缺失或 hash 漂移时，自动模式不得调用裁判，也不得落运行记录。显式样本始终优先，不复制 origin 伪造 k。

### 5.4 新鲜证据门禁

- `origin`：原事故复现、判分器诊断、历史基线。
- `mixed`：混合诊断。首版同样不能关闭处置单或晋级。
- `explicit`：新 session 或内联证据，可按既有规则关闭处置单和进入候选评估。

旧运行没有 `evidenceMode` 时按历史显式运行处理。Harness² 读取历史回归证据时必须使用运行钉住的考卷快照。快照缺失或 hash 不符即拒绝。

### 5.5 轨迹图与客户端

`buildTraceGraph()` 为 LLM 与 tool 节点返回结构化 `sessionId/spanRef/spanKind`。客户端不得解析显示 ID 猜引用。

新增 `TraceCaseComposer` 负责预览、人工任务定义、隐私提示和提交。`IdeTrajectoryPane` 只提供入口。`EvalView` 提供 origin 复判。`EvalReportPanel` 显示诊断证据限制。页面挂载不得自动发起收费判分。

## 6. 备选方案与否决理由

1. **直接扩展 `reflowTaskToSet()`**：否决。它依赖既有 EvalRun 和源任务，伪造这些对象会污染审计语义。本轮新增独立编排模块，复用底层资产原语。
2. **复用 `EvidenceDrawer` 作为生产入口**：否决。它依赖 `runId/taskId/sampleIdx`，离开评测运行后没有数据语义。生产入口放在 `IdeTrajectoryPane`。
3. **默认按 origin 运行**：否决。隐式改变空调用语义会让旧调用意外读取生产证据。必须使用 `useOrigin:true`。
4. **首轮支持 OTel**：暂缓。当前采样器只认 legacy。在适配器落地前显式拒绝，避免空证据进入回归库。

## 7. 风险与回滚

- 隐私：来源引用不复制原文，界面提示人工检查敏感内容。发现泄露时删除目标任务，不影响原 trace。
- 证据漂移：转题和 origin 复判都检查 hash。漂移时停止写入或判分，用户重新预览或提供新证据。
- 统计误读：origin 只产生一个样本，保留 `statisticallyInsufficient`。界面不得把诊断通过写成修复完成。
- 回滚：关闭客户端入口即可停止新增任务。既有 EvalSet、EvalRun 和处置单保持原格式，旧数据无需迁移。

## 8. 决策记录

1. 首版只支持完整 legacy JSONL。OTel 明确返回不支持，不生成空证据。
2. `traceHash` 取原始 trace 文件字节的 SHA-256。span 转题也绑定整份文件，避免预览后任何变化绕过确认。
3. 生产转题使用独立 `trace-reflow.ts`，不伪造 EvalRun，也不复制 EvalSet 存储逻辑。
4. `useOrigin` 是显式选择。显式 samples 优先，来源证据只补缺失样本。
5. origin/mixed 不得关闭处置单或作为 Harness² 候选证据。fresh explicit 证据沿用既有门禁。
6. 不新增中心、页签、Agent 运行器或发布门。入口复用 IDE 轨迹页与评测岛。
7. 工作区已有 5 个 linked worktree，用户于 2026-10-21 明确批准本轮例外新增 1 个。不得清理或接管其他在途工作区。

## 9. 验证

- 转题：session/span、幂等、定义冲突、密封、非法引用、完整性、hash 漂移和无原文落库。
- 复判：origin 自动取证、显式样本优先、缺证据时裁判零调用、span 不扩展成整会话、k=1 如实标记。
- 门禁：origin/mixed 不能关闭或晋级。fresh explicit 可以。历史 run 使用冻结考卷。
- 客户端：预览、必填、冲突、重复转题、session/span 入口、sealed 禁用和中英文键齐平。
- 回归：上述域的定向测试、`npm run typecheck:harness`、`npm test`、构建检查与浏览器热更新走查。首版不默认装机。
