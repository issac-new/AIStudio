# P7 spec：会话进展 checkpoint 写手（hermes-agent）

日期：2026-09-24 ｜ 状态：spec 待批（按 2026-09-24 MiMo 调研 P7 立项：建议独立 spec，本轮不实现）
来源锚点：MiMo-Code session/checkpoint.ts（1862 行）+ checkpoint-templates/-validator/-progress-reconcile/-retry/-align，见 `2026-09-24-mimo-code-coding-tools-research.md` §3.5。

## 1. 主旨（一句话）

任务结束/中断/预算触顶时，由一个独立的小模型调用把"做到哪了、下一步、坑在哪"写成结构化 checkpoint 落入记忆（memory 工具的文件面），使任意会话重开（人重启、换 profile、子代理接手）都能从 checkpoint 而非从零续跑。

## 2. 为什么单独立项

- 直击本项目最高频痛点：推演与装机验证反复暴露"续跑假完成/重做已做步骤"（ncwk 记忆 2026-09-22：START_STEP 须位置比较；aipaydev 多轮续跑教训）。现有兜底是工程侧位置比较，治标；checkpoint 写手治本——把进展显性化为模型可读状态。
- MiMo 实现重（模板+分节预算+校验器+对账+重试五件套 1862 行），且深绑其 SQLite FTS 记忆。hermes 记忆是文件型（P4 未做 FTS 化），照抄必错位；需按 hermes 形状重设计，故独立 spec。

## 3. 设计（hermes 形状的最小闭环）

- **触发**：三个锚点——任务完成前、中断（用户 stop）、预算触顶。挂在 run 生命周期钩子（与 run-trace 插件同层，独立成 agent 插件 `session-checkpoint`，避免改内核）。
- **写什么**（模板五节，各带 token 预算，总预算 ≤800）：
  1. `goal`：任务一句话目标（从会话首条用户消息抽取）；
  2. `done`：已完成的可验证事实（要求带 file:line/命令输出锚点，无锚点不写）；
  3. `next`：下一步动作（必须是可执行的具体动作，禁"继续推进"类空话）；
  4. `blockers`：卡点与已试过无效的路径（防重蹈）；
  5. `artifacts`：产物路径清单（diff/报告/分支）。
- **写到哪**：`memory` 工具的 `memory` target 下 `checkpoints/<task-or-session-id>.md`（文件型现状即可用；P4 若做 FTS 化则自动获得检索能力，无耦合）。
- **写手模型**：auxiliary_client 廉价档；写完跑校验器（纯规则：五节齐全、done 有锚点、next 非空话黑名单），校验失败重写一次，再失败落原始轨迹摘要兜底。
- **续跑对账**（防 checkpoint 自身说谎）：会话启动且发现 checkpoint 时，`done` 节逐条做轻量核验（文件存在/行内容匹配）；核验失败的条目降级标注 `unverified`，不阻塞。
- **不做**：不自动改任务状态、不自动派发 next——checkpoint 只是状态面，动作面仍归人/主代理（与 P6 的"只发信号不处置"同一纪律）。

## 4. 验收

1. 单测：模板预算截断、锚点校验器（含黑名单）、对账降级三分支、重写一次后兜底。
2. 集成：推演环境跑一个 20 步任务中途 stop → checkpoint 落盘 → 新会话加载并从 next 续跑不重做 done 步。
3. 回归面：run 生命周期钩子现有测试 + memory 工具测试全绿；插件可整体禁用（env 开关）保零侵入。

## 5. 代价与边界

预估 5 天+（写手 1.5 / 校验器 1 / 对账 1 / 钩子与开关 0.5 / 测试与推演 1.5）。边界：每任务最多一次成功 checkpoint 写入（幂等键 task-id+generation）；checkpoint 不进系统提示词主上下文，按需经 memory 检索读取，防 token 膨胀。
