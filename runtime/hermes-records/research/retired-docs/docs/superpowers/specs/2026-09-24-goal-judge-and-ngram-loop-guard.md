# P6 spec：goal 冷裁判 + ngram 防循环原语（hermes-agent / loop 治理）

日期：2026-09-24 ｜ 状态：spec 待批（按 2026-09-24 MiMo 调研 P6 立项：先出小 spec 再动）
来源锚点：MiMo-Code session/goal.py:9-27（冷裁判）、session/max-mode.ts:22-28（ngram 检测），见 `2026-09-24-mimo-code-coding-tools-research.md` §3.6。

## 1. 主旨（一句话）

给 hermes 的长任务停止判定加两个互不依赖的小原语：**独立冷裁判**（主代理说"完成"不算数，一个只读轨迹的裁判模型说了算）与 **ngram 文本重复检测**（输出原地打转的客观信号），二者都并入 cockpit 已有的失控信号面板，不新造通道。

## 2. 为什么是这两个

- 现状：hermes 停止 = 主代理自报完成或预算耗尽。自报乐观是已知失效面（ncwk 推演"1 秒假完成"教训）；cockpit 失控信号目前靠外层人工看板，缺模型侧客观原语。
- MiMo 的拆分值得照抄：裁判只读轨迹、不做工作，天然与工作代理的乐观解耦（goal.py 注释原文："its verdict stays cold relative to the working agent's optimism"）；ngram 检测在 max-mode 里防的是同型循环输出，与任务无关、零领域知识。

## 3. 设计

### 3.1 goal 冷裁判

- 触发面：/ide 与 cockpit 任务（loop 引擎）二选一起步——**先 loop 引擎**（已有 run 生命周期钩子，改动面小）。
- 数据面：任务带可选 `goal` 字段（kanban 创建/编辑已有字段面可挂）。代理自报完成时，若 goal 非空 → 调一次裁判模型（auxiliary_client 现成通道），输入 = goal + 轨迹摘要（复用 session 压缩器产物），输出 = `{ok: bool, impossible: bool, reason: str}`。
- 裁决：ok=false 且 impossible=false → 回注一条系统消息"goal 未满足：<reason>"并续跑；impossible=true → 停止并标记"目标不可达"；连续 N 次 ok=false（建议 N=3，对齐 MiMo MAX_GOAL_REACT）→ 停止转人工。
- 成本：每停止判定一次小上下文调用；裁判模型走 profile 里已有的廉价档（复用 auxiliary 选择器）。

### 3.2 ngram 防循环

- 位置：agent 主循环的文本输出侧（非工具侧——工具循环已有分段栅栏与 2026-09-24 失败级联兜底）。
- 算法：最近 K 轮 assistant 文本按 ngram（n=8 词级，滑窗 2 轮）统计重复率；重复率 > 阈值（建议 0.6）连续 2 个窗口 → 发一次 cockpit 失控信号（已有事件面），不打断当前轮。
- 刻意不做的事：不自动终止、不自动 compact——只发信号，处置权在人（与 cockpit 失控信号的既有语义一致）。

## 4. 验收

1. 单测：裁判裁决三分支（续跑/不可达/转人工）+ N 次上限；ngram 检测在构造的循环输出上触发、在正常多轮输出上不触发。
2. 集成：loop 引擎一次带 goal 的任务，主代理假完成被裁判打回并续跑（推演环境可复现）。
3. 回归面：auxiliary_client 现有测试 + loop 引擎测试 + cockpit 信号测试全绿。

## 5. 代价与边界

预估 2-3 天。边界：不动 hermes 默认停止语义（goal 为空时零变化）；裁判失败（网络/额度）按"无法裁决"放行完成并留痕，不阻塞主流程。
