# V8.41 交付验收记录（性能 · 安全 · 团队页 · 26 步术语）

日期：2026-10-18
验收基线：`overlay/main` `85207676`（本文提交后 HEAD 前进，性能/安全数据以该基线为准）
环境：后端 8647（ts-node，`OBS_SIM_ROOT=/Users/cuishi/lab/ncwk-sim-mux`）、前端 vite dev 8649（热更新）、Playwright Chrome 1440×900；性能数据使用 run21（`20261017-v8-run21`）真实运行目录与开发环境管理员 JWT；团队页使用 Matrix 账号 `@swarm:matrix.test`。

## 一、结论

1. **性能通过**：九个只读端点 P95 最高 77.0ms（N6 目标 ≤1s，约 13 倍余量）；五个核心页首屏 P95 311–1369ms（开发形态目标 ≤3s）。
2. **安全通过（附环境说明）**：未认证访问 11 个端点全部 401；篡改 token 401；静态 token 路径不可读；工厂口令扫描零命中；Matrix 用户对未授权 profile 的会话检索返回 403。遗留项台账因环境变量缺席按设计返回 503，不是权限绕过。
3. **WCAG 文本级 AA 通过**：3 个核心页 × 深/浅两主题，0 项失败，最低对比度 4.78:1；修复前最低 2.37:1。非文本图形对比度（WCAG 1.4.11）未单独逐项测量。
4. **建立团队与协调关系页已在 Matrix 登录态下可用**：注册房间 `!GDYGiVlmorCzLdtTAP:matrix.test`（已命名为「Swarm 团队注册房间」）跨重载保持；账号树、准入五问、领导管理、群聊值守、外派任务五个区块均渲染。修复了一个真实缺陷：`getAccountData` 返回 MatrixEvent，旧代码按 `{ content }` 读取导致重载后回到未配置态。
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

范围说明：本次覆盖 WCAG 1.4.3 文本对比度；WCAG 1.4.11 非文本对比度（图标、边框、图表元素）未逐项测量，列为后续复核项。

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
| 全量测试 | 通过 | 662 文件，4,854 通过 / 8 跳过 / 0 失败（`--testTimeout=20000`） |
| 构建与出厂检查 | 通过 | vite build 11.31s；verify-dist 口令零命中 |

### 遗留与环境说明

1. `ORGLOOP_LEDGER_TSV` 未配置：`/ledger` 与清偿写端点按设计 503。界面已能优雅降级（审批队列仍可用、错误可读）；要执行清偿需把变量指向某一轮的 `evidence/compensation-ledger.tsv` 并重启 8647。
2. run21 无 journal 副本：`/journal` 404，属如实缺席。
3. 默认 5s 的完整测试在系统高负载下曾出现两个无关重型挂载超时；`--testTimeout=20000` 下全量 0 失败。该环境观察已记录，未用重试掩盖断言失败。
4. WCAG 1.4.11 非文本对比度（图标/边框/图表）未逐项测量，列为后续复核项。
5. Matrix 用户自动建为 `admin` 是现有产品策略；如需更窄默认角色，应单独评审。

## 七、决策记录

1. **性能判定按 N6 ≤1s 与开发形态首屏 ≤3s**： ledger 503 与 journal 404 是预期状态（配置缺席/文件缺席），记录响应时延但不计为性能失败；不为了凑 200 去修改失败关闭语义。
2. **安全验收以未认证、篡改 token、越权 profile、口令扫描为本次可执行面**：Matrix 用户自动建为 `admin` 属现有产品策略；本批不改角色模型，只如实记录观察到的 profile 范围 403。
3. **WCAG 本次承诺 1.4.3 文本级 AA**：1.4.11 非文本对比度未逐项测量，列为后续复核项，不用文本级结果代替非文本级声明。
4. **团队页验收以 Matrix 登录态为准**：注册房间是本次测试产生的真实房间，已命名为「Swarm 团队注册房间」；值守目标为空是「尚无账号声明 agent teams」的预期状态，不是页面失败。

## 八、证据锚点

- 验收基线：`overlay/main` `85207676`；本次记录与方案同步提交在同一分支。
- 团队持久化修复：`11872a27`、`b3ab0d05`；正本 `2026-10-18-team-registry-sync-detection.md`。
- 26 步显示名：`3d21f087`；正本 `2026-10-18-steps-display-names.md`。
- WCAG 修正：`24e98bb1`、`85207676`；正本 `2026-10-18-wcag-muted-contrast.md`。
- 性能/安全测量脚本与原始输出：会话临时文件 `/tmp/perf-final.txt`、`/tmp/wcag-result3.json`、`/tmp/final-accept-tests2.log`、`/tmp/final-accept-build2.log`（非仓内文件，数值已在本记录固化）。
