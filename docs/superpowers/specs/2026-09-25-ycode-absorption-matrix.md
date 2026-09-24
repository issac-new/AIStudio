# Ycode 吸收矩阵全量盘点 + 第二批架构项裁决

日期：2026-09-25 ｜ 性质：对账与裁决档（Ycode 实现轮收口产物）
定位基准：`2026-09-23-zcode-foundation-design.md` §0 定位红线（Ycode=以 zcode 源码为基底融合的全新编码工具，非聚合器）。

本文两部分：**§1 全量吸收矩阵**（upstream 全部参考物 × 功能点 × 状态对账，补齐此前未落档的整域盘点）；**§2 第二批架构级五项裁决**（总纲 §1.2 所列"需先行设计后单独裁决"的放行/否决）。

## 1. 全量吸收矩阵

状态词：✅已落地（补丁号）｜🧬原生已有（实证不重造）｜🔜排队（后续轮候选）｜❌不吸收（有因）｜📄概念留档。

### 1.1 总纲第一批十项（全数收口）

| # | 功能点 | 来源 | 状态 | 锚点 |
|---|---|---|---|---|
| 1 | dispatch reason code 词表 | multica MUL-4525 | ✅ 398 | `custom/server/zcode/dispatch-reasons.ts`（18→21 枚举，引擎通道扩展档） |
| 2 | 认领四围栏 SQL | multica agent.sql:743 | 🧬+✅ | hermes 认领已有 per-profile cap/claim_lock/优先级序；399 补同人双跑拦截验收测试 |
| 3 | compact 六段交接 | kimi 吸收表 1 | ✅ 400 | context_compressor TRUE INTENT/新两段/[UNVERIFIED] 标注（既有段强于 kimi 部分不重造） |
| 4 | 审批五档宽度+八态 | minimax types.ts:170-195 | ✅ 402 | `custom/server/approval/`（candidates[0] 恒窄默认；deny→ask→allow） |
| 5 | checkpoint 四恢复选项 | claude-code 概念 | ✅ 组合层 | `custom/server/zcode/checkpoint-options.ts`（zcode v4 原语组合；POST /checkpoint/recover） |
| 6 | runaway-guard 六信号 | minimax contracts.ts:3-10 | ✅ 401+405 | 工具侧六信号+HMAC 指纹；文本侧 ngram（mimo max-mode 原语） |
| 7 | @mention A2A 派单 | multica §3.1 | ✅ | `mention-dispatch.ts`（逐 mention outcome+单 pending 槽 coalesced+可追溯 run） |
| 8 | 看板门禁四件套 | routa kanban.ts:109-127 | ✅ 399 | kanban_gates.py（gates.json 声明式；column_transition 事件） |
| 9 | token-meter 三投影 | deepseek-harness token-meter | ✅ 403 | `custom/server/tokens/`（恒等契约+zcode rounds 互校对账） |
| 10 | 子代理目录+continuation+名册 | dsh+codex+kimi | ✅+🧬 | 名册 patch 404（角色/昵称池/护栏）；continuation 原生已有（delegate background+action steer/stop+`_merge_late_steer`） |

### 1.2 mimo 调研 P1-P9（全数收口或裁决）

| 项 | 状态 | 说明 |
|---|---|---|
| P1 mimo 接入 | ✅ 393/394 | 按 Ycode 定位红线降级为过渡对照手段（非路线终点） |
| P2 LSP 工具化 | ✅ 397 | 五只读操作，真 pyright 冒烟全通 |
| P3 delegate 后台化 | 🧬 | **调研判定有误**——background 模式/steer/stop/_merge_late_steer 原生已有（delegate_tool.py:560-580 实证），worktree 隔离仍是 hermes 独有优势 |
| P4 记忆 FTS | ✅ 一期 406 | FTS5+BM25 索引视图+reconcile（零侵入 MemoryStore，CJK LIKE 兜底）；**二期 auto-dream/distill 排队** |
| P5 失败级联 | ✅ 395 | 调研判定有误的二次修正（hermes 已有分段调度，只补级联） |
| P6 goal 冷裁判+ngram | ✅ 部分 405 | goal 冷裁判原生已有（goals.py 每轮裁判+GoalGate，强于 mimo 单次冷裁判）；ngram 新增 |
| P7 checkpoint 写手 | ✅ 405 | 五节模板+锚点校验+幂等+对账降级（挂预算触顶） |
| P8 workflow 沙箱 | ❌缓 | 与 loop-engineering 重叠，spec 原裁决维持 |
| P9 Exa MCP | ✅ 396 | runtime/exa 单一事实源 |

### 1.3 五仓增量补扫新点（2026-09-25，全部候选排队）

| 来源 | 高价值新点 | 裁决 |
|---|---|---|
| multica | ACP 原子 in-turn interject（steering 三件套：prompt 生命周期开窗+版本门控+ack 超时，ec70b224）；Telegram 媒体双向管线 | 🔜 steering 语义候选（与 mimo/minimax steering 对照）；🔜 媒体管线参考 |
| minimax | Turn 级动态 Bash 工具契约（schema 随运行时裁剪+shell 感知提示，61c4c31）；长会话已验证前缀复用 | 🔜 两候选 |
| kimi | trust-boundary 加固回滚（929403b6d 负信号：深度防恶意加固被撤回） | 📄 概念留档（加固边界停在信任提示前） |
| claude-code 2.1.281 | 恢复保形原则；命令替换递归删除强制询问（allow 规则不吞不可静态判定的破坏性命令） | 📄 概念留档（专有许可红线：只搬概念） |

### 1.4 codex 61 提交增量（15 新点，全文见 `docs/upstream-analysis/codex.md` 增量节）

高价值四候选：Retry-After 遵从（9d8de19）/TUI 选中即复制三档+终端检测矩阵（ab021e9）/per-model 工具描述覆盖族（4 提交）/流式元数据选择性裁剪（e7165c2）。扩展 API 双提交为插件系统设计参考。其余中低档项与维持原判清单见文档。全部 🔜 排队后续吸收轮。

### 1.5 已知事项（E2E 实测，非缺陷即如实记录）

1. **createSession 索引可见性**：经桥 createSession 的新会话不即时出现在 sessions-index initial 快照（E2E 双桶探测证据）；索引归属 host 会话注册表面（zcode session 表 workspace_id 语义，`rememberSessionTrace` 注册链）。待 /ide UI 会话链实测核验。
2. **workspace 键规范**：/tmp↔/private/tmp（macOS 符号链）为不同 runtime 键；调用方须传 realpath。
3. **ts-node 严格面**：vitest/esbuild 不全量类型检查，服务端改动须 `npm run serve` 真启动验证（R3 教训本轮回环重演，收口记录）。

## 2. 第二批架构级五项裁决（放行/否决逐项）

总纲 §1.2 原文五项"需先行设计后单独裁决"。裁决依据：zcode 底座四层复用地图（§1.1）+ 本实现轮各批实证。

| 项 | 来源 | 裁决 | 理由 |
|---|---|---|---|
| ①ThreadItem 服务端投影+协议宏表治理 | codex | **❌ 不吸收** | ThreadItem 是 codex 协议内部数据模型；zcode v4 的 sessions-index/conversation topic 投影（398 实证）已覆盖同类需求，架构位不同。协议宏表治理只在 codex 协议面成立。 |
| ②function-hooks 插件 API 契约形态 | claude-code | **📄 概念留档** | 专有许可（红线：只搬概念）。zcode contracts 已含 hook 事件词汇（75 事件）+hermes plugin 体系并存，基础面已覆盖；待 Ycode 插件体系立项时以其契约形态作设计参考。 |
| ③everything-is-a-plugin 内核 | dsh | **❌ 不吸收** | 与 zcode port/deps 注入面（AgentRuntime 构造注入，`agent-runtime.ts:228-308`）哲学冲突；zcode 扩展模型（contracts port 面）已覆盖全部扩展点。整内核插件化吸收成本极高、收益与 port 面重叠。 |
| ④视频/媒体间接引用链路 | kimi | **🔜 排队（条件启动）** | 台账钦点能力（录屏投喂）；kimi-file:// 间接引用+会话物化+按模型能力解析+20MB 降级设计完整。条件：随 kimi 吸收表 #3/#4（视频输入链路+ReadMediaFile）立项一并设计，独立裁决其通道成本后再动。 |
| ⑤事件日志会话存储 | dsh | **❌ 不吸收** | zcode 底座已有 sqlite 会话库+75 事件词汇+v4 投影（总纲 §1.3 可观测列评"强"）；dsh 事件日志是另一套存储哲学，替换收益为负、迁移风险为正。 |

**收口结论**：第二批五项——两项不吸收（架构位冲突/收益重叠）、一项概念留档（许可红线）、一项排队（条件启动）、一项不吸收（存储哲学冲突）。无放行实施项，架构级吸收面就此闭合；唯 ④ 视频输入链路保留启动条件（台账钦点），到条件即立独立设计轮。
