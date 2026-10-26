# 九点产品逻辑对账校正轮（2026-10-26）

分支：`fix/nine-point-reconciliation`（worktree `nine-point`，自 origin/main 385cbdce9 起）

## 变更

用户给出九点产品架构权威表述（驾驶舱 / matrix+element 迁移聊天 / 网关唯一入口 / kanban 挂 teams / Ycode / swarm-yuan / ACP 编码链 / 任务 workspace / 人主 AI 辅），要求据此梳理全部设计文档并校正功能实现。三路探查（文档盘点、组件 1-4 实现面、组件 5-9 实现面）对账结论：

1. **文档面漂移**：门面版本表停在 v0.7.38/v0.22.4（VENDOR.md 已是 0.7.39/0.22.5）；补丁数 684 为过期口径（series 已重编号）；swarm-yuan 记 v2.93.0（实际 v2.95.0+R142）；总账核实日 2026-10-23 未覆盖单仓整合/升级轮/rebrand；整合正本残留多仓旧路径（:175/:293/:427/:451-452）；全流程方案 V8.52 全文零次「Ycode」，步 25 编码链口径仍是「claude code/codex/zcode+IDE 未来取代」。
2. **实现面断链**：ACP 委托链真实存在（run18 实证）但引擎身份是官方 ZCode.app 3.16.3 而非本仓分叉；`/element-web/` 静态中间件指向不存在的目录（悬挂 500 面）；kanban done 列无人工审批预置（机制在位、零配置）。
3. **覆盖缺口**：第 3 点后半句（网关接受其它用户分布式 bot 互调）无正本文档；第 5 点 Ycode 仅存在于文档注释层。

本轮落地（经用户三项裁定：引擎本轮切换、UI 不改名、门禁 opt-in）：

- **P0-2 ACP 引擎切换分叉**：`scripts/zcode-engine.mjs` 增 `install-cli` 子命令（vendor/zcode 构建 `@zcode/cli` → 安装 `~/.hermes/ycode/zcode` 包装器）；`runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py` 引擎环境优先级=显式 env `ZCODE_BIN` > `~/.hermes/ycode/zcode`（部署分叉）> 桥自身兜底，落盘日志记录解析结果。降级条款：分叉 CLI 构建或 app-server stdio 模式不可行 → 只落安装通道与文档标注。
- **P1-4 element-web fail-soft**：新增补丁（element-web 目录缺席时静态分支不挂载、`/element-web/*` 返回 503 `{available:false}`，config.json 端点保留）；`custom/server/matrix/server-info.ts` elementWebUrl 附 available 语义。
- **P2-6 kanban done 列人闸 opt-in**：`team/` 增 gates.json 参考模板与说明，存量板零行为变化。
- **文档批 D-2~D-7**：数字总账刷新；README/AGENTS/CLAUDE 版本表对齐 VENDOR.md；整合正本 R9→R10（旧路径勘误+第 3 点后半句正本段+Ycode/ACP 口径）；全流程方案 V8.52→V8.53（词表 Ycode 入册+步 25 措辞对齐，26 步/六闸/判据零改动）；team/simharness/runtime README 族口径修正；USAGE 核对。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | ACP 引擎身份走「桥进程环境」而非改桥/改桥调用方：delegate 驱动在 spawn 桥前解析引擎 env（ZCODE_BIN > ~/.hermes/ycode/zcode > 桥兜底） | 第三方桥 zcode-acp-server 以 `ZCODE_BIN > PATH zcode > /Applications/ZCode.app` 解析引擎（resolve.js:96-112）；env 是它原生开关，注入点收敛在自家驱动一处，零三方补丁 | 改桥源码/换桥（否决：引入三方维护面）；只在 team profile env 注入（否决：team/shared/profiles.yaml 是 core-chain 在改文件，且逐 profile 注入扩散） | 是 |
| D2 | 分叉 CLI 安装位 `~/.hermes/ycode/zcode`（shell 包装器 exec node zcode.cjs） | 主树 vendor/zcode 是宿主稳定位但仓内路径不该硬编码进生产脚本；~/.hermes 下已有运行时部署惯例（hermes-agent 同域）；包装器免 .cjs 可执行位/shebang 依赖 | 直接引用仓内 dist 路径（否决：checkout 位置耦合）；SEA 打包（否决：超出本轮） | 是 |
| D3 | Ycode 不改 UI/二进制命名，作为文档统称（=vendor/zcode+zcode-patches 分叉构建物） | 用户裁定；补丁 690 rebrand 轮已刻意保留 zcode 标识符，重开品牌面需另立项 | 产品面统一改名（否决：i18n 大面改动+与 690 保留清单冲突） | 是 |
| D4 | element-web 悬挂面以新补丁修（不动 008/667 中链段），目录缺席=503 fail-soft | series 是顺序重放链，改中段补丁有重放冲突风险（667 依赖 008 形态）；503+available:false 符合仓「fail-soft 不造假」不变量，优于摘除（element 参照位保留） | 重写 008（否决：链风险）；整段摘除 element 面 descendant（否决：config.json 单源端点与参照语义仍有消费者） | 是 |
| D5 | done 列人闸走 opt-in 模板（team/ 供 gates.json 参考），不默认启用 | 用户裁定；requiredHumanApproval 机制在位（kanban_gates.py）零预置，默认启用会改变存量板流转行为 | 默认启用（否决：存量板行为变化需迁移告知） | 是 |
| D6 | 全流程方案升 V8.53 只做术语对齐（词表+步 25 措辞），动作序列/等待信号/判据零改动 | 冻结面=26 步主链/六闸/治理机制/判据（fullflow:92）；措辞对齐不改判据，沿 V8.51/V8.52「26 步/六闸/判据零改动」升版先例，无需整轮推演 | 重写步 25 语义（否决：触发冻结面变更须整轮推演验证） | 是 |
| D7 | **分工让渡**：P0-1（manifest 技能卡部署+external_dirs 注册）、P1-3（worker-coder SOUL 技能环+skillgov `<项目>-dev` 派生）、P1-5（skillgov 派生）让渡并行会话 `fix/core-coding-chain` | 该会话正改同文件（skillgov-controller、runtime-manifest、profiles.yaml、worker-coder SOUL），仓规禁两执行者写同一文件；其 external_dirs 方案更贴 hermes 原生机制；用户裁定让渡 | 本会话并行实现（否决：同文件双写冲突） | 是 |
| D8 | worktree 并行上限临时放宽至 4（本会话第四树） | 用户裁定；在途三树（cockpit-refactor/core-chain/swarm-yuan-core）均有活跃会话，收口即回落 3 | 等待任一收口（否决：阻塞不可控） | 是 |

## 验证

- P0-2（实测 2026-10-26 14:3x-15:0x）：
  - 分叉 CLI 构建链通：`vendor/zcode` 注入 zcode-patches 002-008 → pnpm install（2m52s）→ turbo 依赖闭包构建 11 任务全过 → `apps/zcode-cli/packages/cli/dist/zcode.cjs`（28.7MB，0.17.0）；`app-server --stdio` 冒烟直出 ZCode Protocol NDJSON 帧。
  - install-cli 幂等落位 `~/.hermes/ycode/zcode.cjs`；桥（zcode-acp-server，`[node, ZCODE_BIN, 'app-server','--stdio']` 形态）接受该路径。
  - 引擎解析序单测 3/3 绿（runtime/tests/hermes_skills/test_zcode_acp_delegate.py）。
  - 活体委托会话三次（14:40/14:46/15:04）：`engine_bin_source=ycode-fork engine_bin=~/.hermes/ycode/zcode.cjs` 三次命中；分叉引擎握手/建会话/流 update 全通；**引擎身份链闭环**。端到端最终回包未取得——上游提供方 `open.bigmodel.cn/api/anthropic`（account:bigmodel-individual-coding-plan / GLM-5.3-Flash）持续 HTTP 500，三轮各重试 10 次全败（引擎侧日志 ~/.zcode/cli/log 实锚，reason=server_error，与分叉接线无关）。**复验口令**：提供方恢复后重跑本节三次会话同款命令，断言 `RESULT exit=0` 即闭环。
- P1-4（实测）：补丁 691 生成走快照重建法（基线+11 个触及 http.ts 补丁重放→纯增量 diff）；`npm run clean`+`npm run inject` 全链重放后门在位（:531/:555）；目标测试 13/13 绿（server-info 10+failsoft 3）。
- P2-6：模板 JSON 语法校验过；无 gates.json 板零行为变化（kanban_gates.py 惰性语义既有测试覆盖）。
- 合并前：`npm test` 全量 + `npm run typecheck:harness`。
- 未验证项（如实声明）：ACP 委托在真实推演轮（run 级）的引擎断言；提供方恢复后的端到端回包（见上复验口令）。

## 挂账（本轮不做）

- ACP L2（协议级 coding_delegate 工具）与 L3（zcode headless 自举）维持设计挂账。
- board→profile/员工归属绑定（第 4 点）与 A2A 跨用户互调接口契约 spec（第 3 点后半句的正本段落本轮入整合正本，接口级 spec 另批）——core-chain 会话挂账一致。
- 历史档案文档（ncwk 导航页 V8.47 引用、RELEASE-NOTES SwarmStudio 标题）按仓规不改写。
- SwarmKanbanView 列自动化静默跳过=代码注释明载的 fail-soft 设计决策，维持现状。
- matrixAuth 默认关、CHAT_BRIDGE_ENABLED 缺省关等产品决策面不动。
