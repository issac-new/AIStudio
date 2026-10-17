# V8.41 交付验收记录（性能 · 安全 · 团队页 · 26 步术语）

日期：2026-10-18
验收基线：`overlay/main` `85207676`（本文提交后 HEAD 前进，性能/安全数据以该基线为准）
环境：后端 8647（ts-node，`OBS_SIM_ROOT=/Users/cuishi/lab/ncwk-sim-mux`）、前端 vite dev 8649（热更新）、Playwright Chrome 1440×900；性能数据使用 run21（`20261017-v8-run21`）真实运行目录与开发环境管理员 JWT；团队页使用 Matrix 账号 `@swarm:matrix.test`。

## 一、结论

1. **性能通过**：九个只读端点 P95 最高 77.0ms（N6 目标 ≤1s，约 13 倍余量）；五个核心页首屏 P95 311–1369ms（开发形态目标 ≤3s）。
2. **安全通过（附环境说明）**：未认证访问 11 个端点全部 401；篡改 token 401；静态 token 路径不可读；工厂口令扫描零命中；Matrix 用户对未授权 profile 的会话检索返回 403。台账与 journal 的环境遗留已关闭：台账自动发现最新 run、journal 回落全局日志；显式错误配置仍失败关闭。
3. **WCAG 文本级 AA 通过**：3 个核心页 × 深/浅两主题，0 项失败，最低对比度 4.78:1；修复前最低 2.37:1。非文本对比度已补测并修复表单控件与状态刻度；带文字按钮的装饰边框按识别信息原则不纳入。
4. **建立团队与协调关系页已在 Matrix 登录态下可用**：注册房间 `!GDYGiVlmorCzLdtTAP:matrix.test`（已命名为「Swarm 团队注册房间」）跨重载保持；账号树、准入五问、领导管理、群聊值守、外派任务五个区块均渲染。修复了一个真实缺陷：`getAccountData` 返回 MatrixEvent，旧代码按 `{ content }` 读取导致重载后回到未配置态。准入五问已通过并声明 `Swarm 团队`（default profile），值守目标出现 `swarm`，注册房间已指派给 `@swarm:matrix.test`。
5. **26 步/七幕可见名已符合标准术语**：方案原文副本保留在 `name`，界面只显示 `displayName`；实机七幕为「序幕·准备 / 第一幕·需求冻结 / … / 第四幕·并行开发 / …」，26 步表无「搭台/上锁/系分/并行生产」。

## 二、性能测量

### 2.1 九个只读端点

方法：每端点 14 次请求，丢弃前 2 次预热，取剩余 12 次的 P95（nearest-rank）；Bearer 为开发环境管理员 JWT。

| 端点 | 状态 | 载荷 | P95 | 备注 |
|---|---|---:|---:|---|
| `/api/hermes/sim/run-state?run=…` | 200 | 888 B | 4.5 ms | |
| `/api/hermes/sim/issues?run=…` | 200 | 2,305 B | 4.2 ms | |
| `/api/hermes/sim/deliverables?run=…` | 200 | 1,051 B | 3.6 ms | |
| `/api/hermes/sim/trace?run=…` | 200 | 210 B | 3.4 ms | |
| `/api/hermes/orgloop/ledger` | 503 | 76 B | 4.2 ms | `ORGLOOP_LEDGER_TSV` 未配置，按设计失败关闭 |
| `/api/hermes/orgloop/interventions/pending` | 200 | 2,991 B | 5.6 ms | |
| `/api/hermes/orgloop/gate-repairs` | 200 | 33 B | 3.6 ms | |
| `/api/hermes/sim/topology` | 200 | 257 B | 77.0 ms | 四服务探测，含超时预算 |
| `/api/hermes/sim/journal?run=…` | 404 | 71 B | 5.1 ms | run21 无 journal 副本，如实缺席 |

判定：N6「只读聚合端点单请求 P95 ≤1s」通过；最高 77.0ms，约 13 倍余量。503/404 是预期状态（配置缺席/文件缺席），响应时延仍如实记录，不计为性能失败。

### 2.2 核心页首屏（开发形态，热重载）

方法：每页热重载 4 次，丢弃第 1 次，计时到内容选择器出现；DCL/FCP 取 Navigation Timing 与 `first-contentful-paint`。

| 页面 | 选择器 | 中位 | P95 | DCL | FCP |
|---|---|---:|---:|---:|---:|
| 流程总览 `/app` | `jrn-page` | 268 ms | 311 ms | 134 ms | 116 ms |
| ③分析设计 `/app/stage/design` | `stg-page-3` | 368 ms | 455 ms | 117 ms | 80 ms |
| ④开发 `/app/stage/build` | `stg-page-4` | 450 ms | 462 ms | 78 ms | 56 ms |
| 仿真中心 `/app/sim` | `ia-sim-panel-overview` | 271 ms | 403 ms | 90 ms | 64 ms |
| 组织与资产 `/app/gov/org-assets` | `kls-section` | 483 ms | 1,369 ms | 197 ms | 184 ms |

判定：开发形态首屏 P95 最高 1,369ms，低于既有 ≤3s 目标；vite dev 含按需编译与 source map，产品构建形态只会更快。组织与资产页的 P95 受首次展开以外的数据加载影响，仍在中位 483ms 量级。

## 三、安全测量

### 3.1 认证与授权

| 场景 | 结果 |
|---|---|
| 无 token 访问 11 个端点（auth/me、run-state、issues、deliverables、trace、ledger、interventions、gate-repairs、key-ledger、topology、journal） | 全部 **401** |
| 篡改 token（`tampered.token.value`）访问 run-state | **401** |
| 静态 token 路径 `/.token`、`/data/.token`、`/token` | **404**，响应体无 token 模式 |
| `/api/.token`、`/api/auth/token` | **401** |
| Matrix 用户 `@swarm:matrix.test`（role=admin）访问 `/api/auth/me`、`key-ledger` | **200** |
| 同用户访问 `summary` 写端点 `merge-run` | **503**：`ORGLOOP_REPO_ROOT` 缺席，按设计失败关闭（非权限绕过） |
| 同用户访问 `evidence/mark` | **400**：缺少 run 参数，进入入参校验（非跳过鉴权） |
| 同用户检索 `profile=orchestrator` 的会话 | **403**：`Profile "orchestrator" is not available for this user`（按 profile 最小授权） |
| 管理员 token 访问 `key-ledger` | **200** |

说明：Matrix 用户由现有产品策略自动建为 `admin`，因此管理类读端点可用；观察到的最小授权边界是 profile 范围（403），不是角色。若要求 Matrix 用户默认更窄的角色，属产品策略变更，需单独评审。

### 3.2 口令与密钥扫描

- `node scripts/verify-dist.mjs`：`OK: 出厂默认口令扫描零命中`；`index.html 4489B, assets/js 6 个`。
- 源码扫描（`custom/client`、`custom/server`，排除测试与夹具）：`admin/123456` 及 password/secret 赋值字面量零命中。

### 3.3 WCAG 2.2 AA 文本对比度

方法：Playwright 在深/浅两主题下打开流程总览、③分析设计、仿真中心；对可见且非纯 emoji/符号的文字元素，解析计算色与最近不透明背景，按字号/字重套 4.5:1（正文）或 3:1（大字）阈值。

| 主题 | 页面 | 检查元素 | 失败 | 最低对比度 |
|---|---|---|---:|---:|
| 深色 | 流程总览 | 47 | 0 | 4.84 |
| 深色 | ③分析设计 | 40 | 0 | 4.84 |
| 深色 | 仿真中心 | 201 | 0 | 4.84 |
| 浅色 | 流程总览 | 47 | 0 | 4.78 |
| 浅色 | ③分析设计 | 40 | 0 | 4.78 |
| 浅色 | 仿真中心 | 202 | 0 | 4.78 |

修复前同口径：浅色三页失败 19/20/125 项，最低 2.37；深色失败 13/17/31 项，最低 3.84（文字级，已排除 emoji 图形误报）。修复动作：
- 壳层 `--text-muted` 浅色 `#666`、深色 `#9a9a9a`；`--text-secondary` 浅色 `#555`、深色 `#a0a0a0`。
- 五态状态色按主题分套：浅色 fresh/pass `#17663a`、stale `#7a5a06`、fail `#b3261e`、compensated `#5e3f92`；深色 fresh/pass `#53b483`、stale `#d4a017`、fail `#f08a8a`、compensated `#b39ddb`。
- 自动化：`wcag-contrast.test.ts` 4/4、`visual-shell.test.ts` 9/9；两套 token 值与对比度均固定。

范围说明：本次覆盖 WCAG 1.4.3 文本对比度；WCAG 1.4.11 非文本对比度已补测（见 §九）：表单控件边框与状态刻度修复后 `input-border`/`status-graphic` 失败 0；带文字按钮的装饰边框不纳入。

## 四、团队页 Matrix 实测

1. Matrix 登录：`POST http://127.0.0.1:8008/_matrix/client/v3/login` 200；应用侧 `POST /api/auth/matrix-login` 200，得到 `@swarm:matrix.test`（role=admin，user id=6）。
2. 首次进入 `/app/teams`：显示「尚未配置团队注册房间」，填写名称「E2E 团队协调测试」创建成功，得到房间 `!GDYGiVlmorCzLdtTAP:matrix.test`。
3. 发现并修复重载缺陷：
   - 现象：创建后当次会话正常，刷新后回到未配置态。
   - 根因：Matrix account_data 已持久化（`com.swarmstudio.registry → { roomId }`，服务端 GET 200；SDK `store.accountData` 也有该键），但 `detectRegistry` 把 `client.getAccountData()` 返回值当成 `{ content }`，真实 SDK 返回 MatrixEvent，内容需 `getContent()`，因此永远读到 undefined。测试 mock 也按 `{ content }` 返回，掩盖了缺陷。
   - 修复：`getContent()` 与旧 `{ content }` 双形状兼容；面板在 Matrix sync 进入 PREPARED/SYNCING 后再发现一次；测试 mock 改为真实形状并补时序用例（21/21）。
4. 修复后复验：重载 `/app/teams` 直接进入「Teams 管理」，注册房间保持为 `!GDYGiVlmorCzLdtTAP:matrix.test`。
5. 页面区块：账号树、准入五问（首宣必填）、leader 管理（邀请/添加 leader）、群聊值守（房间选择/指派给/指派）、外派任务（目标账号/profile/发出）均渲染。`@swarm:matrix.test` 已在 leaders 列表中且为 leader（PL100）；「leader 徽标」只在已声明 agent teams 的账号行显示，当前无声明所以徽标为 0，不是权限失败。
6. 已知限制：值守「指派给」下拉当前为空，因为还没有账号完成 agent teams 声明与准入五问；完成声明后即可指派。控制台另有两条预期非阻塞：Matrix `com.swarmstudio.delivery.index` 初始 404、`search-sessions` 对不可用 profile 的 403。
7. 副作用说明：本次在本地 Matrix 创建了注册房间并改名为「Swarm 团队注册房间」，房间 ID 如上；这是测试产生的真实团队注册房间，可在需要时改名或移除。

## 五、26 步/七幕术语

- `steps-registry.ts`：`ActMeta` 增加 `displayName`；`StepMeta` 增加可选 `displayName`；方案原文 `name` 保留用于追溯。
- 界面只读 `displayName`：`resolveStepRows` 返回 `displayName ?? name`；`OverviewPanel` 的七幕条/分段头/锚点抽屉改用 `displayName`；`SimStepBadge` 幕名改为标准名。
- 实机 `/app/sim?run=20261017-v8-run21`：七幕显示「序幕·准备、第一幕·需求冻结、第二幕·需求分析、第三幕·设计与排期、第四幕·并行开发、第五幕·发布与验收、尾声·治理与复盘」；26 步表对「搭台/上锁/系分/并行生产」零命中；点步 7 的抽屉标题为「步 7·需求冻结（G1）」。
- 自动化：`sim-overview-panel.test.ts` 20 例（含两套幕名与黑话零命中）、`sim-atoms-supplement.test.ts` 8 例，共 28/28。

## 六、交付验收判定

| 验收项 | 判定 | 证据 |
|---|---|---|
| 性能 N6：九端点 P95 ≤1s | 通过 | 最高 P95 77.0ms（topology）；其余 ≤5.6ms |
| 首屏：开发形态 ≤3s | 通过 | P95 311–1,369ms；中位 268–483ms |
| 未认证访问拒绝 | 通过 | 11 端点全 401；篡改 token 401 |
| 越权 profile 访问拒绝 | 通过 | `search-sessions` 对不可用 profile 返回 403 |
| 口令/密钥不落代码 | 通过 | verify-dist 零命中；源码扫描零命中 |
| WCAG 文本级 AA | 通过（3 页 × 2 主题 0 失败） | 最低 4.78:1；1.4.11 非文本未单独测 |
| 建立团队与协调关系页可用 | 通过（Matrix 登录态） | 注册房间跨重载保持；五区块渲染；21/21 单测 |
| 26 步/七幕可见名标准术语 | 通过 | 实机七幕标准名；26 步表黑话零命中；28/28 单测 |
| 全量测试 | 通过 | 663 文件，4,860 通过 / 8 跳过 / 0 失败（默认 20s 超时） |
| 构建与出厂检查 | 通过 | vite build 32.92s；verify-dist 口令零命中 |

### 遗留与环境说明

1. ~~`ORGLOOP_LEDGER_TSV` 未配置：`/ledger` 与清偿写端点按设计 503。~~ **已关闭（§九）**：台账自动发现最新 run；当前 `/ledger` 200（42 笔未清/4 个目标）；显式配置错误仍失败关闭。
2. ~~run21 无 journal 副本：`/journal` 404。~~ **已关闭（§九）**：每轮副本缺席时回落 `SIM_ROOT/logs/workflow-journal.ndjson`；`run=nope` 仍 404。
3. ~~默认 5s 完整测试在高负载下出现两个无关重型挂载超时。~~ **已关闭（§九）**：`vitest.config.ts` 默认 `testTimeout: 20000`；全量 4,858 通过。
4. ~~WCAG 1.4.11 非文本对比度未逐项测量。~~ **已关闭（§九）**：表单控件边框与状态刻度已补测修复；带文字按钮的装饰边框不纳入。
5. Matrix 用户自动建为 `admin` 是现有产品策略；如需更窄默认角色，应单独评审。
6. WCAG 2.4.7 键盘焦点可见性未在本轮逐项测量，列为后续复核项。

## 七、决策记录

1. **性能判定按 N6 ≤1s 与开发形态首屏 ≤3s**：验收时 ledger 503 与 journal 404 是当时环境状态，记录响应时延但不计为性能失败；后续批次已关闭（§九），失败关闭语义未改。
2. **安全验收以未认证、篡改 token、越权 profile、口令扫描为本次可执行面**：Matrix 用户自动建为 `admin` 属现有产品策略；本批不改角色模型，只如实记录观察到的 profile 范围 403。
3. **WCAG 本次承诺 1.4.3 文本级 AA**：1.4.11 非文本对比度已在后续批次补测并修复表单控件边界与状态刻度；带文字按钮的装饰边框不纳入。
4. **团队页验收以 Matrix 登录态为准**：注册房间是本次测试产生的真实房间，已命名为「Swarm 团队注册房间」；值守目标为空是「尚无账号声明 agent teams」的预期状态，不是页面失败。

## 八、证据锚点

- 验收基线：`overlay/main` `85207676`；本次记录与方案同步提交在同一分支。
- 团队持久化修复：`11872a27`、`b3ab0d05`；正本 `2026-10-18-team-registry-sync-detection.md`。
- 26 步显示名：`3d21f087`；正本 `2026-10-18-steps-display-names.md`。
- WCAG 修正：`24e98bb1`、`85207676`；正本 `2026-10-18-wcag-muted-contrast.md`。
- 性能/安全测量脚本与原始输出：会话临时文件 `/tmp/perf-final.txt`、`/tmp/wcag-result3.json`、`/tmp/final-accept-tests2.log`、`/tmp/final-accept-build2.log`（非仓内文件，数值已在本记录固化）。

## 九、环境遗留关闭（2026-10-18 后续批次）

### 9.1 台账与 journal

- **台账自动发现**（`1684c584`，正本 `2026-10-18-environment-residuals.md`）：`ORGLOOP_LEDGER_TSV` 显式存在时优先；显式配置错误仍失败关闭；未配置时从 `OBS_SIM_ROOT/runs/<run>/evidence/compensation-ledger.tsv` 选 mtime 最新一份。实测 `/api/hermes/orgloop/ledger` 由 503 转 **200**，42 笔未清、4 个处置目标；界面清算页灯为「42 笔未清·拒开新轮」，表格 42 行。
- **journal 回落**（同上）：每轮副本优先；run 目录存在但副本缺席时回落 `OBS_SIM_ROOT/logs/workflow-journal.ndjson`；run 目录不存在仍 404。实测 run21 由 404 转 **200**（`source` 指向全局日志），`run=nope` 仍 **404**。
- **测试默认超时**（同上）：`vitest.config.ts` 设 `testTimeout: 20000`；全量 663 文件、**4,860 通过 / 8 跳过 / 0 失败**；构建 32.92s。并行批次 `35598bba` 的抽屉关闭即卸载改动导致三处旧断言过期，已由 `81199368` 同步为元素存在断言（正本 `2026-10-18-drawer-unmount-test-sync.md`）。

### 9.2 WCAG 1.4.11 非文本对比度

- 实测输入框边框对背景仅 **1.26–1.53:1**，26 步 pending 刻度 1.26–1.53:1；状态图形（非文字）不达标。
- 修复（`c5f8caa3`，正本 `2026-10-18-control-border-contrast.md`）：三壳新增 `--ia-border-control`（浅 `#8a8a8a`、深 `#808080`），并通过 `--border-color` 变量覆盖组件内 scoped 边框；pending 步刻度改用该 token。
- 复测：深/浅两主题、流程总览与仿真中心，`input-border` 与 `status-graphic` 失败 **0**；带文字按钮的装饰边框仍低于 3:1，按「文字标签已标识控件」不纳入 1.4.11。
- 自动化：`wcag-contrast.test.ts` 5/5（含控件边框 ≥3:1 与三壳 token 同步）。

### 9.3 团队页值守与准入

- 准入五问已填写并通过；账号 `swarm` 显示「已过五问」与 leader 徽标；声明 `Swarm 团队`（default profile）。
- 值守目标下拉由空转出 `swarm`；已将注册房间「Swarm 团队注册房间」指派给 `@swarm:matrix.test`，值守列表显示该指派，提供「取消值守」。
- 这说明「建立团队与协调关系」不仅页面可达，账号声明、准入、领导、值守四段都可操作。

### 9.4 关闭后仍保留的边界

1. Matrix 用户自动建为 `admin` 是现有产品策略，未在本批改角色模型。
2. WCAG 2.4.7 键盘焦点可见性未逐项测量，列为后续复核项。
3. 带文字按钮的装饰边框不纳入 1.4.11；若后续要求所有控件边框 3:1，需单独视觉评审。
4. 本次仍在本地 Matrix 创建并配置了注册房间 `!GDYGiVlmorCzLdtTAP:matrix.test`；这是真实团队注册数据，可改名或移除。

### 9.5 追加证据锚点

- 环境遗留修复：`1684c584`；正本 `2026-10-18-environment-residuals.md`。
- 控件边框修复：`c5f8caa3`；正本 `2026-10-18-control-border-contrast.md`。
- 全量测试与构建：663 文件 / 4,860 通过 / 8 跳过 / 0 失败；`vite build` 32.92s。
- 抽屉断言同步：`81199368`；正本 `2026-10-18-drawer-unmount-test-sync.md`。

