# 日常实例跨实例只读检索推演会话规格

- 日期：2026-10-27
- 状态：实施中
- 分支：`feat/search-sim-sessions`
- 关联：`2026-10-27-search-session-source-load.md`

用户立项：日常实例（8647/8649）的检索弹窗要能搜到推演各轮的会话（matrix 群聊、agent 单聊），且推演会话必须带醒目标识（不同颜色或徽章）区分。

数据面实测：SIM 根 `hermes/profiles/<profile>/state.db` 的 `sessions` 表承载全部推演会话——27 个 profile 共 3,212 条（fanfan 626、wei 367、chen 304 等），含 display_name/chat_type/session_key。推演栈（8801/8802）未起时库文件仍在，直读即可检索，不依赖推演进程。

## 变更

1. **服务端端点 `GET /api/hermes/sim/observer/sessions?q=&limit=`**（simcenter-controller 族）：
   - SIM 根缺席返回 `available:false`（fail-soft，与 observer/overview 同门）
   - `node:sqlite` 只读逐 profile 扫 sessions 表，按 display_name/session_key/id LIKE 匹配；返回 `{id, profile, chatType, displayName}`
   - 60s 结果缓存+single-flight；limit 默认 50 上限 200
2. **弹窗新增「推演会话」组**（GlobalSearchDialog）：检索词变化时经 workspace store 装载（动态 import 防测试链）；行带 `◎` 前缀+行尾紫色「推演」徽章；meta=profile·类型·会话 id；排在日常会话组后，计入会话页签徽标。板/时间筛选不作用于该组（无板挂接与日常时间语义）。
3. **点击诚实降级**：推演会话在另一实例，不伪造深链。`SIM_STUDIO_URL` 已配置时行点击新窗口打开推演 studio；缺席时行内提示「在推演实例中查看」，无假跳转。

## 决策记录

| 编号 | 决策 | 类型 | 用户裁定 | 理由与边界 |
|---|---|---|---|---|
| D1 | 只读库直读，不走推演网关 API | Mechanical | approved | 推演栈未起也要可搜；readOnly 与网关并发写共存（kanban 快道同款先例） |
| D2 | 紫色「推演」徽章+独立分组 | Taste | approved | 用户明确要求颜色/徽章区分；紫色不与既有红/黄/绿状态色冲突 |
| D3 | 点击诚实降级不伪造深链 | Mechanical | approved | 跨实例会话无日常路由可达；配置了 SIM_STUDIO_URL 才提供真跳转 |

决策留痕写入本任务 worktree 的 `.swarm-yuan/decisions.jsonl`。

## 验证

- 先红后绿：服务端（SIM 根缺席/匹配与归属/limit 上限）＋客户端（推演组渲染+紫色徽章、缺席不显示、点击两态）。
- 依次运行目标测试、ia2 全目录、全量 `npm test` 与 `npm run build`。
- 最后在内置浏览器活体走查：输入「支付」应出现推演会话组多行紫色徽章。

### 实测回填（2026-10-27）

- 服务端先红后绿 4 例：根缺席 fail-soft、多 profile 命中与归属、limit 上限与空词不倾倒、60s 缓存命中。
- 客户端先红后绿 3 例：推演组渲染+紫色徽章+会话徽标合并计数（关键词过滤后 1+2=3）、fail-soft 不渲染、无 SIM_STUDIO_URL 不跳转。
- 目标面 35 过；ia2+simcenter 110 文件 834 过。
- 全量 `npm test`：922 文件（916 过/6 跳过），6,572 用例 6,561 过/11 跳过 0 败（rc=0）。
- `npm run build` 通过，verify-dist 出厂口令扫描零命中。
- 途中裸 hex 预算闸正确拦截写死的紫色——改为 ia2.scss token（--ia-sim/--ia-sim-deep/--ia-sim-on），组件 var() 引用。

### 未验证项

- VITE_SIM_STUDIO_URL 配置后的真跳转未实测（当前环境未配置该 env，走提示态）。
- 3,212 条全量检索的端到端时延以缓存首查为准，未做压测。

## 设计文档影响

DESIGN_SYNC: touched

- 整合正本 §2.12 补跨实例只读检索段。数字总账补端点数。附录 A 登记本 spec。

## 风险与回滚

- 27 库全表 LIKE 冷扫 <100ms 级，60s 缓存挡连续击键；推演写库并发由 readOnly 不锁页保障。
- 回滚=还原本批提交；无数据迁移、不改 vendor。
