# AIStudio 管理员运维参考

> 面向环境管理员、运维人员和讲师预演。本文回答怎样启动、怎样核对、怎样处置故障，不替代学员的页面操作手册。
>
> 事实基线：commit `3690ceba3`，整体版本 `1.0.16-overlay`，日期 `2026-11-12`。版本载体见 `package.json:2-6` 与 `RELEASE-MANIFEST.json:18,54,74,93,122-140`。
>
> **验证声明**：本文是对当前源码、配置和守门文档的静态核对。所有命令都是可执行示例，**不代表本手册编写时已启动服务、访问真实账号、调用模型、运行 worker、连接 Matrix 或验证 Windows 实机**。示例输出只说明判读方法，不是本次采集结果。

## 1. 先读命令属性和证据规则

### 1.1 三类命令属性

- **【只读】**：不发起业务写入。进程查询、版本查询、HTTP GET、dry-run 属于这一类，但其中仍有严格程度差异，见第 13 节。
- **【写】**：会修改源码树、依赖、配置、数据库、Git 仓、账号、会话、任务或本地进程状态。启动服务也属于这一类，因为服务会初始化数据库、写日志并恢复后台任务。后端启动时会初始化全部 Store，见 `vendor/hermes-studio/packages/server/src/bootstrap/http.ts:479-488`。
- **【外部写】**：会向 gateway、Synapse、模型服务、远端发布通道或其他外部系统写入。课堂预演必须使用培训专用对象。

受保护 GET 不等于绝对零磁盘写入。Studio 鉴权中间件会刷新 `last_login_at`，首次初始化还会创建签名 token；orchestrator 首次读策略版本也会打开并初始化 SQLite。严格零业务写入的预检只使用第 13.1 节，带 JWT 的探针按第 13.2 节理解。依据：`vendor/hermes-studio/packages/server/src/modules/studio/middleware/auth.ts:119-121,469-488`、`vendor/hermes-studio/packages/server/src/modules/studio/repositories/users-store.ts:157-163`、`custom/server/orchestrator/store.ts:122-151`。

### 1.2 路径、占位符和证据

- `<本仓根目录>`、`<培训治理仓绝对路径>`、`<培训 Studio 状态目录>`、`<保留且不存在的路径>` 都是占位符，执行前替换为实际绝对路径，不要输入尖括号。
- 引用格式均为 `仓内相对路径:起止行`。`vendor/` 是钉版基线，补丁注入后的行为以 `patches/` 与 `zcode-patches/` 为准，不能把未注入的 vendor 文件当成最终产品行为。注入路由和生成过程见 `scripts/inject.mjs:28-52,194-205,694-804`。
- 本文区分三种“默认”：上游代码缺省、仓内 `team/config.yaml` 或 `config/orchestrator.env` 覆盖后的默认、需要管理员显式开启的值。`serve` 会读取仓内编排配置，且 shell 已有环境变量优先，见 `scripts/serve-server.mjs:61-83`。
- 证据存在不等于本机已生效。核对当前进程时，以进程工作目录、实际环境、端口监听、日志和业务探针共同判定。

## 2. 先确定运行拓扑，不要起出第三条派发链

### 2.1 两条既有执行链

**链 A：看板任务链。**

```text
Matrix/API/页面消息
  → 本机 hermes gateway 与团队 orchestrator
  → kanban 任务真值
  → gateway 内嵌 dispatcher
  → worker
  → ACP
  → Ycode 编码引擎与任务工作区
```

团队 orchestrator 负责路由和分解，dispatcher 负责认领，worker 负责执行，ACP 是编码委托通道。`team/README_zh.md:104-127`、`docs/DESIGN.md §3.6、§4.2`。当前团队配置开启 gateway 内 dispatcher，60 秒一拍，总并发 8、单 profile 并发 3，陈超时 14400 秒；这些值以目标 profile 的实际配置为准。`team/config.yaml:429-441`。

**链 B：Studio @mention 链。**

```text
已认证 Studio 请求
  → custom/server/zcode/mention-dispatch
  → Ycode WebSocket :3030
  → 会话与命令投影
```

该链有独立的目标解析、pending 槽、去重和 outcome，不要再写一个 Router 抢占同一工作区。`custom/server/zcode/mention-dispatch.ts:1-20,69-110,128-167`。设计正本明确列出 `mention-dispatch` 与 kanban dispatcher 两条派发链，第三条会互相抢占。`docs/DESIGN.md §3.6`。

轻量直接回复是链 A 的分支，不是第三条链。Ycode 的 `:3030` WebSocket 服务与 ACP stdio `app-server` 是两种接入形态，也不是两个任务真值。Ycode 安装与 ACP 调用形状见 `scripts/zcode-engine.mjs:99-105`，Studio WebSocket 握手见 `custom/server/zcode/engine-bridge.ts:127-165`。

### 2.2 新 orchestrator 只做事件、授权和引用

新 `custom/server/orchestrator/` 只处理 Trigger、Thread、Decision、Mandate、Admission、Assignment 和摘要投递，**不是第二个 kanban dispatcher，也不直接驱动 worker**。执行仍归链 A 或链 B。`custom/server/orchestrator/types.ts:1-17`、`custom/server/AGENTS.md:35-36`。

当前仓内 `config/orchestrator.env` 把轮询间隔设为 60000 毫秒，因此 `npm run serve` 读文件后，**实际默认会开启一分钟编排轮**，不是代码函数的缺省关闭。每轮默认评估 2 条；`ORCHESTRATOR_TICK_INTERVAL_MS=0` 可关闭整个定时轮，`ORCHESTRATOR_EVAL_ON_TICK=0` 只关闭模型评估。`config/orchestrator.env:18-26`、`custom/server/orchestrator/tick.ts:117-131`、`custom/server/orchestrator/controller.ts:312-320`。

编排轮做“看板桥接→语义评估→汇总→投递”，单步失败会记 `errors` 并继续其他步骤。`custom/server/orchestrator/tick.ts:66-115`。语义评估缺 profile、base URL 或 `API_SERVER_KEY` 时为 `unavailable`，超时和非 completed 不重发，因为接口没有幂等键。`custom/server/orchestrator/evaluator.ts:23-31,116-175`。

准入默认不是自动执行。未配置来源时按 `observe` 处理，名单外发送者默认 `ignore`；只有来源 `mode=auto` 且准入动作非 ignore 才允许接单。`custom/server/orchestrator/admission.ts:21-44,55-80`。看板桥只读上游 SQLite，但会推进自己的游标，所以手动 `POST /api/orchestrator/tick` 是【写】，不是健康检查。`custom/server/orchestrator/kanban-bridge.ts:68-108`、`custom/server/orchestrator/controller.ts:292-308`。

### 2.3 gateway 的部署边界

目标拓扑是每个运行节点一个 gateway 复用多个 profile，不是全网唯一中央网关；多节点通过受控 peer API、Matrix 和 Git 制品协作。`docs/DESIGN.md §4.2`。当前团队配置也开启 `multiplex_profiles`。`team/config.yaml:464-475`。

同一机器只应有一个内嵌 dispatcher 持有单例锁。锁不可用时回到配置控制，因此运维仍须主动避免多个 gateway 同时开启 dispatcher。`runtime/gateway/kanban_watchers_common.py:148-173`。

## 3. 首次安装、启动、注入和重启

### 3.1 先做只读预检

**【只读】版本、 commit 和现有监听：**

```bash
cd <本仓根目录>
node --version
git rev-parse --short=9 HEAD
node -p "require('./package.json').version"
lsof -nP -iTCP:8647 -sTCP:LISTEN
lsof -nP -iTCP:8649 -sTCP:LISTEN
lsof -nP -iTCP:8650 -sTCP:LISTEN
lsof -nP -iTCP:3030 -sTCP:LISTEN
```

Node 必须不低于 23。`package.json:62-64`。Windows 用 `node --version`、`git rev-parse --short=9 HEAD` 和 `netstat -ano | findstr "8647 8649 8650 3030"`；`netstat` 是只读查询，进程终止另属【写】。

### 3.2 首次注入与依赖安装

**【写】以下命令会改 vendor 工作树、生成配置和清单、建立链接，并把 runtime 部署到 `~/.hermes/hermes-agent`；依赖安装还会写 node_modules。**

```bash
cd <本仓根目录>
npm run inject
cd vendor/hermes-studio
npm install --no-audit --no-fund --ignore-scripts
mkdir -p dist
cd ../..
```

注入会应用 hermes-studio、hermes-agent 和 Ycode 补丁，生成 `vite.config.overlay.mts` 与 `.overlay-injected.json`，最后执行 `deploy-agent-runtime.mjs --apply`。`scripts/inject.mjs:782-804`。hermes-studio 补丁失败会中止；hermes-agent 与 Ycode 补丁失败可以 WARN 后跳过，所以 `[inject] done` 和 manifest 不能单独作为全链成功证明。`scripts/inject.mjs:239-255,312-329`。

**【只读】核对运行时差异，不带 `--apply` 时是 dry-run：**

```bash
cd <本仓根目录>
node scripts/deploy-agent-runtime.mjs
```

默认保留安装树中与模板不同的文件并报告 `kept`，只有显式 `--force` 才备份后覆盖。出现 `kept>0` 时，要人工比对并决定回灌模板还是保留宿主修复，不要把 inject 成功等同于运行时已经完全同步。`scripts/deploy-agent-runtime.mjs:1-10,78-120`。

**【只读】运行基础 doctor：**

```bash
cd <本仓根目录>
npm run runtime:doctor
npm run runtime:doctor -- --hermes-home <HERMES_HOME 绝对路径>
```

硬检查覆盖 semantica manifest、PUA pin、技能目录和 patch 375 一致性；任一硬检查失败退出 1。`--hermes-home` 只增加软检查，软检查不影响退出码。`scripts/runtime/runtime-doctor.mjs:1-11,98-185`。它**不是服务存活检查**。另外，patch 375 的可应用性只在 `<本仓根目录>/../upstream/hermes-agent` 存在时检查，单仓 vendor 形态可能没有这一项覆盖。`scripts/runtime/runtime-doctor.mjs:24-27,145-159`。

### 3.3 共享培训或生产后端的推荐启动形态

**关键决定：显式使用 `NODE_ENV=production`。** `npm run serve` 只设置 `TS_NODE_PROJECT`、`TS_NODE_FILES` 和 `PORT`，不设置 `NODE_ENV`。`scripts/serve-server.mjs:57-59`。非 production 的 Studio 数据库位于 `<vendor/hermes-studio>/packages/server/data/hermes-web-ui.db`，production 才位于 `HERMES_WEB_UI_HOME/hermes-web-ui.db`。`vendor/hermes-studio/packages/server/src/modules/studio/infrastructure/database/index.ts:6-20`。

随机建号 CLI 始终写 `HERMES_WEB_UI_HOME/hermes-web-ui.db`。`vendor/hermes-studio/bin/hermes-web-ui.mjs:17-25`。因此，共享培训或生产应让 CLI 与后端都使用 production 数据落点，避免“重置成功但登录仍为空库”。

**【写】创建或重置管理员。仅在首次初始化或明确计划重置时执行：**

```bash
cd <本仓根目录>
HERMES_WEB_UI_HOME=<培训 Studio 状态目录> \
  node vendor/hermes-studio/bin/hermes-web-ui.mjs reset-default-login
```

该命令会把已有 `admin` 重置为 `super_admin` 并生成新的随机密码，也会覆盖 `admin-login.json`。密码只显示一次，文件权限目标为 0600。不要把密码写入手册、聊天记录或命令日志。补丁后的真实行为见 `patches/640-studio-remove-default-login.patch:29-87`。空库不再接受出厂默认口令；隔离开发的 `HERMES_WEB_UI_DEV_BOOTSTRAP=1` 也不用于共享培训。`patches/640-studio-remove-default-login.patch:548-616`。

**【写】启动后端，会初始化数据库、日志和后台任务：**

```bash
cd <本仓根目录>
NODE_ENV=production \
BIND_HOST=127.0.0.1 \
HERMES_WEB_UI_HOME=<培训 Studio 状态目录> \
GOVERNANCE_REPO=<培训治理仓绝对路径> \
OBS_SIM_ROOT=<保留且不存在的路径> \
HERMES_WEB_UI_DISABLE_UPDATE_CHECK=1 \
npm run serve
```

这里的 `OBS_SIM_ROOT` 是生产关闭 SIM 的防自动发现措施：非空值会阻止 `serve-server.mjs` 自动寻找兄弟目录，路径不存在又使 SIM 专用端点按设计 503。不要用空字符串模拟关闭，因为空值会重新进入自动发现。自动发现和治理仓回落见 `scripts/serve-server.mjs:84-119`，SIM 关闭语义见 `custom/server/simcenter/observer-root.ts:25-29`。

预期日志应逐项核对，而不是只看进程仍在：

```text
[serve-server] PORT=8647
[serve-server] GOVERNANCE_REPO=<确实是培训仓>
[serve-server] OBS_SIM_ROOT=<确实是保留的不存在路径>
```

日志字段见 `scripts/serve-server.mjs:121-131`。组织保存会写文件并直接 `git add`、`git commit`，所以 `GOVERNANCE_REPO` 不对时禁止保存。`custom/server/governance/registry-admin.ts:51-61`。

**【写】另一个终端启动前端，predev 可能自动补注入和安装钩子：**

```bash
cd <本仓根目录>
npm run dev
```

`npm run dev` 使用 8649 并代理到 8647；`predev` 先运行 `ensure-injected`。`package.json:14-21`。自动补套补丁会更新 manifest，差量失败不能当成功。`scripts/ensure-injected.mjs:215-253`。

### 3.4 启动 gateway、worker 链和 Ycode

先安装目标 profiles，并在相应 `HERMES_HOME` 准备模型、API_SERVER_KEY 和 Matrix 配置。profile 安装示例见 `team/README_zh.md:132-153`。

**【写+外部写】启动本机 gateway，会恢复平台连接、dispatcher 和会话：**

```bash
hermes gateway run
curl --fail --silent --show-error http://127.0.0.1:8650/health
```

前台 `gateway run` 便于预演观察；`gateway start` 是服务化启动。命令入口见 `vendor/hermes-agent/hermes_cli/gateway.py:5060-5092`。当前团队配置把 API 地址从上游缺省 8642 改为 `127.0.0.1:8650`。`team/config.yaml:521-533`、`vendor/hermes-agent/gateway/platforms/api_server.py:218-234`。

`API_SERVER_KEY` 缺失、占位、短于 16 字符或强度无法校验时，API server 即使只绑回环也拒绝启动。`vendor/hermes-agent/gateway/platforms/api_server.py:4405-4464`。basic `/health` 只证明 API adapter 可响应，不证明模型、dispatcher 或 worker 已完成任务。`vendor/hermes-agent/gateway/platforms/api_server.py:2365-2373`。

**【写】安装并启动 Ycode：**

```bash
cd <本仓根目录>
npm run zcode:ensure
node scripts/zcode-engine.mjs install-cli
ZCODE_SERVER_HOST=127.0.0.1 npm run zcode:serve
```

`zcode:ensure` 在缺依赖或构建产物时执行 pnpm install/build，属于【写】；`install-cli` 覆盖安装到 `~/.hermes/ycode/zcode.cjs`。`scripts/zcode-engine.mjs:57-74,99-135`。`zcode:serve` 已监听 3030 时会跳过重复拉起，只以 TCP 在位判断“引擎已在跑”，预演还需做第 13 节的 WS 和业务核验。`scripts/zcode-engine.mjs:76-96`。

### 3.5 正确的换装与重启顺序

**【只读】先确定目标 PID 与其工作目录：**

```bash
lsof -nP -iTCP:8647 -sTCP:LISTEN
lsof -a -p <PID> -d cwd
```

**【写】只终止已核对的 PID，先发 TERM：**

```bash
kill -TERM <PID>
```

不要把模糊进程名匹配或 `kill -9` 当默认动作。后台脚本的 Ctrl+C 与退出码会透传，见 `scripts/serve-server.mjs:134-156`。

补丁或服务端变更按“停服→clean→inject→serve”执行：

```bash
cd <本仓根目录>
npm run clean
npm run inject
NODE_ENV=production BIND_HOST=127.0.0.1 \
HERMES_WEB_UI_HOME=<培训 Studio 状态目录> \
GOVERNANCE_REPO=<培训治理仓绝对路径> \
OBS_SIM_ROOT=<保留且不存在的路径> \
npm run serve
```

以上全部为【写】。`clean` 会反向补丁、清理链接和部分生成物；检测到 8647 在听会拒绝，但非 8647 的实例也应由管理员主动停止。`scripts/inject.mjs:63-89,805-831`。不要把 `OVERLAY_ALLOW_LIVE_CLEAN=1` 当常规绕行，它允许运行树与进程模块缓存分裂。`scripts/inject.mjs:65-70`。

`custom/server`、补丁和 runtime 修改后重启对应后端或 profile gateway；dispatcher 的多数配置在启动时读取。`runtime/gateway/kanban_watchers_dispatcher.py:33-55`。`kanban.auto_decompose` 是例外，会在每拍重读。`runtime/gateway/kanban_watchers_common.py:72-87`。

## 4. 端口、绑定地址和访问边界

| 端口 | 当前用途与默认绑定 | 管理员判读 | 证据 |
|---|---|---|---|
| 8647 | `npm run serve` 后端；wrapper 默认 PORT=8647 | Koa 的 `BIND_HOST` 缺省是 `0.0.0.0`，不是回环。单机培训显式设 `127.0.0.1`；需要 LAN 时用受控代理和认证，不要只改前端 | `scripts/serve-server.mjs:18-28`、`vendor/hermes-studio/packages/server/src/modules/studio/public/config.ts:47-55,92-105` |
| 8649 | Vite 前端 | `npm run dev` 日常使用；`dev:lan` 加 `--host` 会暴露全网卡。开发空库引导与 LAN 组合尤其危险，不用于共享培训 | `package.json:17-20`、`scripts/inject.mjs:478-487` |
| 8650 | 当前团队 gateway API | 当前 `team/config.yaml` 为 `127.0.0.1:8650`；上游缺省是 8642，所以其他机器必须核对实际 config，不要背端口 | `team/config.yaml:521-533`、`vendor/hermes-agent/gateway/platforms/api_server.py:218-234` |
| 3030 | Ycode HTTP/WS | `ZCODE_SERVER_HOST` 优先于 `HOST`。未设置时源码不显式传 host，日志显示 localhost 不等于已核验绑定；本机部署显式设 `127.0.0.1`，再用 lsof/netstat 复核 | `vendor/zcode/packages/server/src/entry-http.ts:17-20,31-40`、`vendor/zcode/packages/server/src/http.ts:472-479` |
| 8748 | Electron 桌面内嵌 Web UI，可选形态 | 桌面默认 8748 并强制 `NODE_ENV=production`，与命令行 8647 是两种启动形态 | `vendor/hermes-studio/packages/desktop/src/main/webui-server.ts:41-54,675-728` |
| 15721 | 团队模板中的本机模型代理 cc-switch | 不是 AIStudio 公共 API。离线或培训要确认该代理实际可用，或改目标 profile 的 provider | `team/config.yaml:1-8,563-573` |
| 8008 | Matrix homeserver 的常见本地兜底 | 不由 `npm run serve/dev` 自动启动。真实地址按 `MATRIX_HOMESERVER_URL`、gateway dotenv、兜底顺序解析 | `custom/server/matrix/server-info.ts:8-16,29-57` |
| 8801/8802 | SIM gateway / SIM Studio | 属于独立推演拓扑，不是生产第二实例；用独立 `SIM_ROOT` 与 `HERMES_HOME` | `simharness/README.md:18`、`custom/server/simcenter/simcenter-controller.ts:331-335` |

## 5. 三类凭据怎样分开保管和使用

### 5.1 Studio 账号与 Studio JWT

- 账号密码用于登录，登录成功后签发用户 JWT。`/api` 和 `/v1` 默认受保护，认证始终开启。`vendor/hermes-studio/packages/server/src/modules/studio/middleware/auth.ts:161-165,320-323,360-365`。
- JWT audience 是 `hermes-studio`，默认有效期 30 天，可用 `HERMES_WEB_UI_AUTH_JWT_EXPIRES_IN` 调整。它不是永久 API key，也不是 gateway 的 `API_SERVER_KEY`。`vendor/hermes-studio/packages/server/src/modules/studio/middleware/auth.ts:44-95,167-187`。
- 签名密钥优先取 `AUTH_JWT_SECRET`，否则使用 `AUTH_TOKEN` 或 `${HERMES_WEB_UI_HOME}/.token` 中的自动生成值。轮换签名密钥会使既有 JWT 失效，预演不要随手删除 `.token`。`vendor/hermes-studio/packages/server/src/modules/studio/middleware/auth.ts:119-121`、`vendor/hermes-studio/packages/server/src/modules/studio/services/auth/token-auth.ts:7-35`。
- 受保护接口用 `Authorization: Bearer <Studio JWT>`。不要把 JWT 放 URL 查询参数、培训文档或截图；中间件虽兼容 `?token=`，这会增加日志泄漏面。`vendor/hermes-studio/packages/server/src/modules/studio/middleware/auth.ts:123-127`。
- Matrix 登录与 Studio 账号是相关联但不同的身份面。校验通过的 Matrix access token 会写入 `${HERMES_WEB_UI_HOME}/matrix-session.json`，目标权限 0600、目录 0700。`custom/server/matrix/session-store.ts:1-15,83-105`。

### 5.2 Gateway `API_SERVER_KEY`

- 它保护 gateway API，包括能够发起终端工作的端点；Studio 的 runtime-caps 和 orchestrator 也用同一值访问本机 gateway。`custom/server/runtimecaps/runtime-caps-controller.ts:120-167`、`custom/server/orchestrator/evaluator.ts:23-31,130-137`。
- `serve-server.mjs` 优先使用进程环境中的值，缺省时只从 `${HERMES_HOME:-~/.hermes}/.env` 读取 `API_SERVER_KEY`，不会把密钥写入 `config/orchestrator.env`。`scripts/serve-server.mjs:61-83`。
- 生成和轮换属于【写】。使用至少 16 字符的强随机值，实践上可用 `openssl rand -hex 32` 生成 64 位十六进制串，再通过受控 secret 渠道配置；不要生成后贴进培训群。强度门见 `vendor/hermes-agent/gateway/platforms/api_server.py:4407-4436`。
- 改 key 后要同步 gateway、`~/.hermes/.env`、使用该 key 的 Studio 进程和调用方，并重启相关服务。runtime-caps 对配置有 60 秒缓存，不能仅凭一次 401 判断轮换未完成。`custom/server/runtimecaps/runtime-caps-controller.ts:127-149`。

### 5.3 Synapse 管理员 token 与 Matrix 业务 token

这两个 token 不能混用：

| 凭据 | 用途 | 不应承担的用途 | 证据 |
|---|---|---|---|
| Synapse 管理员 access token | 建号、改密、停用、列用户等 Synapse 管理操作 | 不等于 Studio 超级管理员密码，也不应作为普通 chat bridge 长期身份 | `custom/server/matrix/admin-service.ts:88-183,252-289` |
| Matrix 业务或 bridge access token | `whoami`、同步房间、发送消息、加入房间 | 不应默认拥有 Synapse 管理权限 | `custom/server/matrix/chat-bridge.ts:94-175` |
| Matrix `MATRIX_ACCESS_TOKEN` | gateway/Brief/chat bridge 回落凭据，和 `MATRIX_HOMESERVER`、`MATRIX_USER_ID` 三件套缺一不可 | 不用于 Studio JWT 签名 | `custom/server/matrix/gateway-env.ts:1-11,62-107` |

邀请建号由服务端生成一次性初始密码，密码只在创建响应出现一次，邀请台账不落密码。`custom/server/governance/registry-admin.ts:16-22,243-250`。建号、改密、停用都是【外部写】，课堂只在培训 Synapse 上执行。

`/api/matrix/gateway-credentials` 会向本机浏览器返回 Matrix 凭据三元组，因此有 TCP 回环、转发头、Origin、Host 四道限制。LAN 用户应走手动 Matrix 登录，不要为图方便放开该接口。`custom/server/matrix/routes.ts:43-65,66-119`。

## 6. 核心环境变量速查

| 变量 | 当前语义与注意事项 | 证据 |
|---|---|---|
| `NODE_ENV` | 共享培训/生产显式 `production`，使 Studio DB 与建号 CLI 同落 `HERMES_WEB_UI_HOME` | `vendor/hermes-studio/packages/server/src/modules/studio/infrastructure/database/index.ts:6-20` |
| `PORT` | Studio wrapper 默认 8647；`npm run serve -- --port <端口>` 也可改。Ycode 也读取 PORT，所以不要全局导出 8647 后再起 Ycode；改端口还需同步前端代理与探针 | `scripts/serve-server.mjs:18-28,57-59`、`vendor/zcode/packages/server/src/entry-http.ts:17-18` |
| `BIND_HOST` | Koa 缺省 `0.0.0.0`；本机部署显式 `127.0.0.1` | `vendor/hermes-studio/packages/server/src/modules/studio/public/config.ts:47-50` |
| `HERMES_HOME` | hermes 运行根，缺省 `~/.hermes`；SIM 与生产必须分开 | `custom/server/lib/paths.ts:12-16` |
| `HERMES_WEB_UI_HOME` | Studio 状态根，缺省 `~/.hermes-web-ui`；本文统一使用主变量，避免不同域对兼容别名支持不完全一致 | `vendor/hermes-studio/packages/server/src/modules/studio/public/config.ts:52-55`、`custom/server/lib/paths.ts:18-22` |
| `HERMES_WEBUI_STATE_DIR` | 上游兼容别名；优先级低于主变量，不作为本文推荐配置点 | `vendor/hermes-studio/packages/server/src/modules/studio/public/config.ts:12-16,52-55` |
| `OVERLAY_UPSTREAM_ROOT` | 上游根解析优先级为显式 env、仓内 vendor、旧兄弟 upstream；单仓通常不用设 | `scripts/serve-server.mjs:50-55`、`scripts/inject.mjs:28-41` |
| `GOVERNANCE_REPO` | 组织注册表和审计 Git 仓；生产必须显式指定，防止回落 SIM 中央仓 | `scripts/serve-server.mjs:104-119`、`custom/server/governance/repo-root.ts:11-17` |
| `OBS_SIM_ROOT` | SIM 专用根；不存在时专用端点 503。非空但不存在可阻止自动发现并 fail-closed | `scripts/serve-server.mjs:84-103`、`custom/server/simcenter/observer-root.ts:25-29` |
| `SIM_BRANCHES_REPO` / `SIM_ANCHOR_REPO` | SIM 分支新鲜度和 commit 锚使用的中央仓；缺省会按端点 fail-closed | `scripts/serve-server.mjs:94-103`、`custom/server/simcenter/simcenter-controller.ts:31-34` |
| `SIM_HARNESS_LAUNCH` | 只有 `=1` 才允许受控启动固定推演脚本；默认关闭，仍要求 super_admin 和驱动锁检查 | `custom/server/simcenter/sim-launch.ts:4-15,47-59,89-119` |
| `SIM_SUPERVISOR` | `off` 只关闭监督器，不等同于关闭所有 SIM 端点 | `custom/server/simrun/supervisor.ts:7-8,115-124` |
| `ORCHESTRATOR_TICK_INTERVAL_MS` | 代码缺省 0，仓内配置为 60000；低于 10000 或非法值也按 0 | `config/orchestrator.env:18-20`、`custom/server/orchestrator/tick.ts:117-121` |
| `ORCHESTRATOR_EVAL_*` | profile、base URL、timeout、每轮开关和上限；profile 与 base URL 还必须有 API_SERVER_KEY | `config/orchestrator.env:5-12,22-26`、`custom/server/orchestrator/evaluator.ts:23-31` |
| `ORCHESTRATOR_KANBAN_DBS` | 逗号分隔的看板库，支持 `~/`；首次接入先把游标设到当前最大事件 id，避免回填历史 | `config/orchestrator.env:14-16`、`custom/server/orchestrator/kanban-bridge.ts:34-47,64-108` |
| `GRAPH_ENGINE` | `legacy`、`shadow`、`on`，未知值回落 legacy；详见第 8 节 | `custom/server/loop/graph/graph-assembly.ts:35-44` |
| `CHAT_BRIDGE_*` | chat bridge 开关、Matrix 凭据、房间映射和状态文件；默认不启用 | `custom/server/matrix/chat-bridge.ts:447-474` |
| `HERMES_TOOL_ENFORCE` | 只有 `=1` 才开启 Studio 工具执法总闸；配置存在本身不拦截 | `custom/server/toolpipeline/enforce-gate.ts:450-480` |
| `HERMES_TOOL_ENFORCE_STRICT` | `=1` 时无策略配置或裁决异常 fail-closed；默认不开启 | `custom/server/toolpipeline/enforce-gate.ts:469-479,682-709` |
| `HUMAN_GATE_DECIDER_ROLES` | 逗号分隔的裁决角色白名单；未配置不校验角色 | `custom/server/approval-inbox/human-gate.ts:295-305` |
| `HUMAN_GATE_REQUIRE_HUMAN_DECIDER` | `=1` 时拒绝同一主体注册并裁决；默认自批记 delegated | `custom/server/approval-inbox/human-gate.ts:295-315` |
| `HERMES_EXEC_SANDBOX` | `off` 禁用 OS 沙箱，已接入沙箱的执行会 unavailable 而不是裸跑 | `custom/server/sandbox/exec-sandbox.ts:42-67,106-117` |
| `HERMES_WEB_UI_DISABLE_UPDATE_CHECK` | 离线/隔离环境设 `1`，禁止后端定时访问 npm registry 查版本 | `vendor/hermes-studio/packages/server/src/modules/studio/services/health.ts:6-9,42-68` |
| `ZCODE_SERVER_HOST` / `ZCODE_SERVER_AUTH_TOKEN` | Ycode 绑定与访问 token；跨机或不可信网络不能只靠端口不可见 | `vendor/zcode/packages/server/src/entry-http.ts:17-20,31-40` |
| `ZCODE_BIN` | ACP 实际引擎 CLI；强制使用 Ycode 分叉时显式指向 `~/.hermes/ycode/zcode.cjs` 并核对日志 | `runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py:129-154,243-248` |
| `HERMES_BIN` | Studio 调 hermes CLI 的覆盖路径；Windows 离线建议指向 venv 内 `hermes.exe` | `scripts/offline-template/env/env-vars.md:23-28` |

## 7. 数据真值、落点和保留期

### 7.1 不要把投影当正本

| 数据 | 权威落点 | 运维边界 | 证据 |
|---|---|---|---|
| Studio 用户、会话与产品状态 | production：`${HERMES_WEB_UI_HOME}/hermes-web-ui.db`；非 production：server cwd 下 `packages/server/data/hermes-web-ui.db` | 建号、备份和恢复必须先确认模式与 cwd，不能混拷贝两份库 | `vendor/hermes-studio/packages/server/src/modules/studio/infrastructure/database/index.ts:6-20`、`vendor/hermes-studio/bin/hermes-web-ui.mjs:17-25` |
| kanban 任务、尝试和事件 | `${HERMES_HOME}/kanban.db`；命名板在 `${HERMES_HOME}/kanban/boards/<slug>/kanban.db` | orchestrator 只读事件并保存自己的游标，不能拿 orchestrator DB 当任务正本 | `custom/server/orchestrator/kanban-bridge.ts:40-61,68-108` |
| 新 orchestrator | `${HERMES_HOME}/orchestrator/orchestrator.sqlite`，可用 `ORCHESTRATOR_DB` 覆盖 | 单写者是 Studio 进程；保存 Trigger、Decision、Mandate、Assignment 和游标，不复制 kanban 状态机 | `custom/server/orchestrator/store.ts:1-5,22-126` |
| 组织、邀请和治理注册表 | `GOVERNANCE_REPO` 中的 Markdown 与 Git commit | 保存即提交。写错仓时不能用 UI 再改一次掩盖，先停写并核对仓库历史 | `custom/server/governance/registry-admin.ts:16-61` |
| Matrix 账号与消息 | 外部 Synapse 及其房间 | chat bridge state 只保存 since、已投递 id 和已见事件 id，不是消息正本 | `custom/server/matrix/chat-bridge.ts:178-213`、`docs/DESIGN.md §3.4` |
| Loop / Graph | `HERMES_LOOP_DIR` 优先，否则可写 cwd 的 `.loop`，不可写时回落 `${HERMES_WEB_UI_HOME}/loop` | Windows 只读安装目录会触发回落；备份前核对日志中的实际路径 | `custom/server/loop/paths.ts:1-10,34-49` |
| Ycode 工作区与证据 | 任务绑定的工作区和 ACP 回执 | `zcode` provider 名称不能证明实际引擎身份；还要核对 `engine_bin` 与版本日志 | `docs/DESIGN.md §4.3` |

### 7.2 保留期的真实含义

| 数据族 | 当前配置 | 不能怎样误读 | 证据 |
|---|---|---|---|
| hermes 会话 | `retention_days: 90`，但 `auto_prune: false` | 90 天不是当前自动删除承诺；只有开启 auto_prune 才按周期清理，VACUUM 也随该路径执行 | `team/config.yaml:484-489`、`vendor/hermes-agent/hermes_cli/cli_auto_maintenance.py:54-71` |
| checkpoints | 开启，保留 7 天，最多 50 份、总 500MB、单文件 10MB，auto_prune=true | `delete_orphans: true` 不代表无人值守会删孤儿；自动维护强制按 false 处理，孤儿清理由显式 prune 执行 | `team/config.yaml:83-91`、`vendor/hermes-agent/tools/checkpoint_maintenance.py:425-442` |
| 看板通知订阅 | `done_sub_retention_days` 缺省 30 天，0 禁用 | 清理的是 done/blocked 任务的通知订阅，不是删除看板卡 | `runtime/gateway/kanban_watchers_common.py:90-97`、`vendor/hermes-agent/gateway/kanban_watchers_notifier.py:290-299` |
| 运行日志 | 常规日志 5MB、3 份；worker 日志 2MiB、1 份 | 这是大小轮转，不是按天保留，也不是审计归档策略 | `team/config.yaml:432-434,452-455` |
| chat bridge 游标 | sent ids 500、seen events 1000、assign handled 1000 | 环形上限只控制游标内存，不是 Matrix 消息保留期 | `custom/server/matrix/chat-bridge.ts:178-191,308-314,326-337,399-400` |
| Studio / orchestrator / Matrix 消息 | 本文未找到一个可统一套用的自动保留天数 | 不要把 hermes 会话 90 天套到 Studio DB、orchestrator DB 或 Synapse；按各自持久数据制定备份和删除流程 | `custom/server/orchestrator/store.ts:22-151`、`custom/server/matrix/chat-bridge.ts:178-213` |

## 8. `GRAPH_ENGINE` 三态怎样选择和验证

| 模式 | 实际行为 | 运维使用建议 | 证据 |
|---|---|---|---|
| `legacy` | 默认。旧调度为主，新图引擎只挂 REST 只读面，spawner 与 shadow 不启动 | 生产默认和故障回退态。没有 shadow 证据时，不为课堂演示直接切 on | `custom/server/loop/graph/graph-assembly.ts:5-9,35-44` |
| `shadow` | legacy 仍为主，ShadowRunner 用 dry-run 双跑到期 loop，事件写 shadow 日志 | 只用于对照。shadow 事件不是生产执行结果，不能据影子成功宣称 on 安全 | `custom/server/loop/graph/graph-assembly.ts:5-9` |
| `on` | RunSpawner 接管调度，REST tick 分流，写回和熔断生效 | 需要单独变更、数据备份、对照证据和回退方案；启用后检查实际 tick 与事件，不只看 env | `custom/server/loop/graph/graph-assembly.ts:5-9,94-110` |

未设置、空值或未知字符串都会落到 legacy，未知值会打印 warning。`custom/server/loop/graph/graph-assembly.ts:37-44`。

`GRAPH_ENGINE=on` 时还要决定 cron 归属，避免 RunSpawner 内部轮询和 gateway cron 双 timer。当前装配提供 cron bridge，不能用“两个都在跑”证明高可用。`custom/server/loop/graph/cron-bridge.ts:1-15`。

**【写】切换模式必须重启后端。** **【只读】判读顺序**：先读进程环境中的 `GRAPH_ENGINE`，再查启动日志的 mode，再查调度事件和 shadow 对比。部分 spec runtime 端点不要求全局 `on`，不能用某个导演端点可用反推全局调度已接管。`custom/server/loop/graph/graph-rest.ts:244,520`。

## 9. Matrix chat bridge 与消息边界

chat bridge 默认关闭。启用需要：

```bash
CHAT_BRIDGE_ENABLED=1
CHAT_BRIDGE_MATRIX_HOMESERVER=<Matrix homeserver>
CHAT_BRIDGE_MATRIX_ACCESS_TOKEN=<bridge 专用 token>
CHAT_BRIDGE_MATRIX_USER_ID=<bridge MXID>
CHAT_BRIDGE_ROOMS='!matrix-room:server=<Studio 群聊 roomId>'
```

这些变量交给后端进程属于【写配置】，启动后会有【外部写】：加入房间、发送消息、发送 state 事件。凭据不全或映射为空时 bridge 不启动。`custom/server/matrix/chat-bridge.ts:447-474`。

桥的工作范围是 Matrix 与本地群聊双向投影：入向只持久化和广播，不触发第二套 agent 编排；出向只发 agent 终态，不发流式片段；assign 回执 `observed` 只表示已投影，不表示 worker 已接单。`custom/server/matrix/chat-bridge.ts:1-22,326-365`。

状态默认写 `${HERMES_HOME}/chat-bridge-state.json`，保存 since token 和去重 id。重置该文件是【写】，会造成重放或重复投递风险，不能当普通缓存清理。`custom/server/matrix/chat-bridge.ts:178-213`。

新 orchestrator 的 Matrix 摘要只投 `platform=matrix` 且有订阅的房间；E2EE 房不在支持范围。`docs/DESIGN.md §3.6`。因此，房间能收发 m.text 不等于全链 E2EE，也不能用聊天回执替代任务状态。

## 10. SIM 与生产怎样隔离

### 10.1 启动前的硬隔离

1. 生产显式设置 `GOVERNANCE_REPO`，否则发现 SIM 中央仓时会自动指向它。`scripts/serve-server.mjs:104-119`。
2. SIM 使用独立 `SIM_ROOT`、独立 `HERMES_HOME` 和独立端口 8801/8802；生产不得复用这些运行库。`simharness/README.md:18`、`docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md:375-410`。
3. 生产若存在可自动发现的兄弟 `ncwk-sim-mux`，用非空且不存在的保留路径覆盖 `OBS_SIM_ROOT`，使 SIM 专用端点 fail-closed；仅设 `SIM_SUPERVISOR=off` 不够。`scripts/serve-server.mjs:84-103`、`custom/server/simrun/supervisor.ts:115-124`。
4. SIM 专用端点缺根是 503；日常观察聚合缺根可以是 HTTP 200 + `available:false`。这两种语义不是矛盾，不能为了“页面好看”把 503 改成假空数据。`custom/server/simcenter/simcenter-controller.ts:86-90,123-165`。

### 10.2 当前隔离仍有缺口

设计要求 SIM 任务在日常入口只读，但当前只有观察端点和部分前端守卫，批量操作与注意力入口尚未全部排除 SIM 任务。不能宣称已经闭合隔离，也不要在 SIM 中使用真实敏感数据。`docs/DESIGN.md §4.10、§6.4`。

不要在活轮次内注入或换装。部署窗口脚本要求 `report_done=1` 且驱动、监督进程都退场后才允许动作。`simharness/mux/deploy-window-runbook.sh:48-70`。其中针对独立 product-dist 的 `OVERLAY_ALLOW_LIVE_CLEAN=1` 是特定推演部署例外，不是生产通用做法。

## 11. 默认安全姿态、sandbox 与失败语义

### 11.1 默认不是“全部已治理”

- 后端缺省全网卡绑定，单机必须显式收紧。`vendor/hermes-studio/packages/server/src/modules/studio/public/config.ts:47-50`。
- 团队模板使用本机终端 `terminal.backend: local`，不是 Docker 隔离；`approvals.mode: off`，同时 kanban dispatcher 默认开启。`team/config.yaml:57-61,408-417,429-441`。
- Studio 工具执法要 `HERMES_TOOL_ENFORCE=1`。非 strict 时无配置不执法，裁决异常 fail-open；strict 才在无配置或异常时拒绝。`custom/server/toolpipeline/enforce-gate.ts:469-480,682-709`。
- HumanGate 的裁决角色白名单与严格异人都要显式配置，默认自批记录为 delegated。`custom/server/approval-inbox/human-gate.ts:295-315`。
- 治理姿态端点读实际值，不猜期望。它把显式 off 标为 bare、未声明或读不出标为 partial；管理员可写 expectations 文件后再比较，但没有 expectations 时不生成“已达标”结论。`custom/server/governance/posture.ts:9-17,60-74,145-233`。

### 11.2 OS sandbox 只覆盖已接入的执行面

macOS 使用 `sandbox-exec`，Linux 使用 `bwrap`，其他平台或探测失败为 unavailable。沙箱禁网、清环境、只放开声明的可写目录；不可用或 `HERMES_EXEC_SANDBOX=off` 时绝不降级裸跑。`custom/server/sandbox/exec-sandbox.ts:1-7,42-117`。

qgate 只有 `executor.sandbox` 为真才进入该路径，结果是 INCONCLUSIVE，不是 pass；未声明 sandbox 的命令仍可直接 spawn。`custom/qgate/src/executors/command.ts:36-70,93-114`。因此不能把“仓里有 OS sandbox”写成“所有 Agent 命令默认隔离”。Windows 不在该后端支持列表中，离线 Windows 的终端能力也不能据此宣称已沙箱化。

### 11.3 fail-soft 与 fail-closed 的判读

- 读模型缺源用 `available:false`、`null` 或明确错误，不造空成功。写操作和命令失败必须非 2xx；读模型降级可以是 200 + `ok:false`。`custom/server/AGENTS.md:11-17`。
- SIM 专用根缺失是 503，日常观察缺源是 `available:false`。`custom/server/simcenter/simcenter-controller.ts:86-90,123-165`。
- orchestrator 模型评估失败是 `unavailable`，不是 `ignore` 或 `accept`，且不因超时自动重发。`custom/server/orchestrator/evaluator.ts:116-164`。
- 工具执法默认与 strict 的失败语义不同；OS sandbox 则始终不可用不裸跑。不要把所有内部异常都笼统写成 fail-closed。`custom/server/toolpipeline/enforce-gate.ts:682-709`、`custom/server/sandbox/exec-sandbox.ts:106-117`。

## 12. 离线 Windows 与发布产物

### 12.1 Windows 离线安装不是“零网络、零依赖”

目标形态是 Windows 10/11 x64 Web 模式，预装 Node≥23（Ycode 建议 24）、Python 3.14、Git for Windows；除内部 pip/npm 镜像可达外，其余外网不可达。安装脚本不会改 registry。`scripts/offline-template/install/README-windows.md:1-13`。

**【写+联网镜像】联网开发机生成离线包：**

```bash
cd <本仓根目录>
npm run offline:package
```

产物为 `dist/offline/aistudio-offline-<full版>-win64.zip`。它包含 full 源码、打包机 `~/.hermes/hermes-agent` 工作树快照、脱敏模板和安装链；脱敏扫描命中凭据形态会拒绝打包。`scripts/make-offline-package.mjs:1-5,200-227`。该命令会读取打包机的 hermes 与 `.zcode` 资产，执行前必须确认快照来源与版本，不要把未知本机残留当发布正本。`scripts/make-offline-package.mjs:74-92,227-318`。

**【写+外部写】Windows 目标机安装：**

```powershell
powershell -ExecutionPolicy Bypass -File install\install-windows.ps1
```

脚本会布源码、创建 venv、安装 pip/npm 依赖、安装 profiles/skills、写模板、inject、执行 8647 冒烟并安装 Ycode CLI。它幂等可重入，但 S1 可能备份并替换既有 hermes-agent，S4 会启动再终止冒烟进程，全部按写操作审批。`scripts/offline-template/install/install-windows.ps1:72-113,178-229`。

装完后再填 `API_SERVER_KEY`、模型凭据和实际 provider，设置 `HERMES_BIN` 与 `ZCODE_BIN`，然后启动 gateway 和后端。`scripts/offline-template/install/README-windows.md:28-34`。`setx` 会持久修改用户环境，也是【写】，执行后要重开终端。

**已知限制必须向讲师和运维明示**：当前安装链未在真实 Windows 实机验证；Electron 桌面包不在该离线包内；node-pty 依赖镜像提供 win32 预编译；Ycode 技能中的部分源码工具仍需目标机安装依赖。`scripts/offline-template/install/README-windows.md:47-54`。

### 12.2 当前每版只上传 full 与 yuan everything 两件

现行长期政策：

1. `aistudio-full-<ver>-src.tar.gz`。
2. `swarm-yuan-offline-<ver>-everything.zip`，附配套 SHA256SUMS。

GitHub Release 与 ModelScope 都只发布 full 与 yuan everything 两件主资产及配套 SHA256SUMS；四模块源码包和 DMG/zip 构建物不再上传，旧远端资产默认保留。当前整体版本为 1.0.16-overlay，四个模块分别为 cockpit 0.8.20-studio.2、agent-teams v0.23.1-team.2、Ycode 3.17.2、yuan v2.100.3。`docs/superpowers/specs/2026-11-03-release-asset-policy-twopackage.md:3-15`、`RELEASE-MANIFEST.json:18,54,74,93,122-140,157-158`、`RELEASE-NOTES.md:3,48-55`。

**【只读】发布对账和 dry-run：**

```bash
cd <本仓根目录>
npm run release:check
npm run release:packages -- --dry-run
```

`release:check` 对账模块版本、Ycode 活跃补丁、packageIncludes 和整体包三处版本，不执行构建。`scripts/verify-release-manifest.mjs:1-8,188-230`。默认 dry-run 计划只应有 1 个整体包；`--all-modules` 是显式 4+1 逃生通道，不是日常默认。`scripts/make-release-packages.mjs:38-57`。

**【写】真正打 full 包和 yuan everything：**

```bash
cd <本仓根目录>
npm run release:packages
SWARM_YUAN_OFFLINE_VER=1.0.16-overlay \
  bash skills/swarm-yuan/scripts/make-offline-bundle.sh --everything
cd <本仓根目录>/dist
shasum -a 256 \
  release/aistudio-full-1.0.16-overlay-src.tar.gz \
  swarm-yuan-offline-1.0.16-overlay-everything.zip \
  > release/SHA256SUMS-v1.0.16-overlay.txt
```

full 默认只打整体包并生成 `dist/release/SHA256SUMS`。`scripts/make-release-packages.mjs:49-94`。最后一段命令为两件资产生成配套校验文件，文件名和双通道布局遵循 `docs/superpowers/specs/2026-11-03-release-asset-policy-twopackage.md:7-9`。注意 everything 资产名的版本前**没有 `v`**，SUMS 文件名则使用 `SHA256SUMS-v<版本>.txt`。yuan 的 everything 当前采用 R134：`--no-vendor + knowledge + docs + github-src`，技能本体随包，**可经 pip/npm 镜像安装的运行时不内嵌**，所以 everything 不等于完全断网自足。`skills/swarm-yuan/scripts/make-offline-bundle.sh:33-47,53-65`、`docs/superpowers/specs/2026-11-07-r143-runtime-refresh-regression-release.md:32-36`、`RELEASE-NOTES.md:48-52`。

**【只读】本地校验示例：**

```bash
cd <本仓根目录>/dist/release
shasum -a 256 -c SHA256SUMS
cd <本仓根目录>/dist
shasum -a 256 -c release/SHA256SUMS-v1.0.16-overlay.txt
```

Windows 用 `Get-FileHash <文件> -Algorithm SHA256` 逐件核对。上传和远端替换属于【外部写】，需要单独发布授权；发布后还要回下载并重新算 hash，不能以本地打包成功代替远端验证。当前发布纪律见 `docs/superpowers/specs/2026-11-08-release-v1.0.14-overlay.md:18-32`。

**ModelScope 当前状态不能写成“全量回验完成”。**该通道在 v1.0.12 由用户明确恢复，v1.0.14/v1.0.15 持续发布 full 与 everything 双件（v1.0.15 起与仓内 ZCode Windows 配置包并存）；LFS 上传和 SUMS 云端内容回验已完成，但大文件完整下载哈希回验受平台传播延迟与本机传输中断影响，尚未完成。运维报告必须分开登记“已上传”“文件树已登记”“SUMS 已回验”“大文件哈希待复验”，不得沿用早期暂停口径，也不得把上传成功冒充完整验收。`RELEASE-NOTES.md:3,7,48-52`；`docs/superpowers/specs/2026-11-08-release-v1.0.14-overlay.md:25-32`。

## 13. 只读健康检查命令与判读

### 13.1 严格优先：不携带凭据的基础探针

**【只读】进程、监听、存活和仓库一致性：**

```bash
cd <本仓根目录>
node --version
git rev-parse --short=9 HEAD
lsof -nP -iTCP:8647 -sTCP:LISTEN
lsof -nP -iTCP:8649 -sTCP:LISTEN
lsof -nP -iTCP:8650 -sTCP:LISTEN
lsof -nP -iTCP:3030 -sTCP:LISTEN

curl --fail --silent --show-error http://127.0.0.1:8647/livez
curl --fail --silent --show-error http://127.0.0.1:8647/health/ready
curl --fail --silent --show-error http://127.0.0.1:8647/health
curl --fail --silent --show-error http://127.0.0.1:8650/health

npm run runtime:doctor
npm run release:check
node scripts/deploy-agent-runtime.mjs
```

判读：

- `/livez` 只返回 `{status:'ok'}`，表示 Koa 路由可响应。`vendor/hermes-studio/packages/server/src/modules/studio/controllers/health.ts:14-20`。
- `/health/ready` 返回 ready 只表示 HTTP shell、路由和静态资产已就绪；慢速 runtime、socket 和恢复工作仍可能在后台继续。`vendor/hermes-studio/packages/server/src/bootstrap/http.ts:232-240,528-541`。
- `/health` 返回 `status:'ok'`、`gateway:'running'` 不等于 agent bridge、模型、worker、Ycode 全部就绪，还要看 `agent_bridge` 子对象。`vendor/hermes-studio/packages/server/src/modules/studio/services/health.ts:70-93`。
- gateway basic `/health` 只表示 adapter 存活。`vendor/hermes-agent/gateway/platforms/api_server.py:2365-2369`。
- `runtime:doctor` 与 `release:check` 都是静态一致性检查，不能替代上述 HTTP 探针。`scripts/runtime/runtime-doctor.mjs:1-11`、`scripts/verify-release-manifest.mjs:206-230`。

Windows 用 `netstat -ano | findstr "8647 8649 8650 3030"` 替代 lsof；PowerShell 的 `Invoke-RestMethod <URL>` 替代 curl。判读不变。

### 13.2 业务只读但可能刷新时间或本地状态的探针

先通过安全渠道设置 `STUDIO_JWT`、`GATEWAY_KEY`、`MATRIX_ACCESS_TOKEN`，不要把值写进命令历史。以下均为【业务只读】，但 Studio 请求可能刷新登录时间，首次运行也可能初始化本地状态。

```bash
BASE=http://127.0.0.1:8647

# 无 JWT：401 表示 custom 路由已挂且受保护；404 优先查注入和重启。
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  "$BASE/api/orchestrator/health"

# 有 JWT：只证明编排路由、策略版本和 DB 可读，available:true 不证明定时轮或模型健康。
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${STUDIO_JWT}" \
  "$BASE/api/orchestrator/health"

# Ycode：HTTP 200 也可能 online:false；online:true 只表示 WS open，不是 ACP 任务成功。
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${STUDIO_JWT}" \
  "$BASE/api/zcode-engine/health"

# gateway 详细健康：看 readiness、platforms、active_agents、pid，不只看 HTTP 200。
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${GATEWAY_KEY}" \
  http://127.0.0.1:8650/health/detailed

# Matrix 业务 token：验证 token 对应身份，不输出到培训记录。
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${MATRIX_ACCESS_TOKEN}" \
  "${MATRIX_HOMESERVER}/_matrix/client/v3/account/whoami"
```

orchestrator `/health` 的 `available:true` 是固定响应，不能当 dispatcher 或评估器健康证明。`custom/server/orchestrator/controller.ts:42-48`。Ycode 健康端点 offline 时也返回 HTTP 200 + `ok:false`，online 的判定仅为 WS open。`custom/server/zcode/engine-controller.ts:118-127`、`custom/server/zcode/engine-bridge.ts:188-196`。gateway detailed 的内容见 `vendor/hermes-agent/gateway/platforms/api_server.py:2371-2414`。

**【只读】worker 停滞信号，不做唤醒：**

```bash
hermes kanban sleeping-workers --idle-sec 1800
hermes kanban diagnostics
```

`sleeping-workers` 只列 running 卡中超过阈值没有真实工作信号的 assignee；空结果也不能单独证明 dispatcher 正常。`runtime/hermes_cli/kanban.py:785-809`、`runtime/hermes_cli/kanban_parser.py:294-299`。dispatcher 活性还要结合 gateway 日志、ready/running 变化和一次受控任务验证。

**【业务只读】Synapse 管理面验证，输出含账号信息，不纳入共享培训材料：**

```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer ${SYNAPSE_ADMIN_TOKEN}" \
  "${MATRIX_HOMESERVER}/_synapse/admin/v2/users?from=0&limit=1"
```

该端点验证管理员 token 能否读取用户列表；403 是权限不足，404/其他状态要按 Synapse 实际部署排查。实现使用同一路径族，见 `custom/server/matrix/admin-service.ts:88-106`。

### 13.3 这些不是只读健康检查

| 命令或端点 | 实际副作用 | 证据 |
|---|---|---|
| `POST /api/orchestrator/tick` | 推进看板游标，可能建评估会话、写 Decision/Digest 并投 Matrix | `custom/server/orchestrator/controller.ts:292-308`、`custom/server/orchestrator/kanban-bridge.ts:68-108` |
| `POST /api/zcode-engine/projection/watch` | 建立引擎连接和投影订阅，可能写 client id | `custom/server/zcode/engine-controller.ts:129-158`、`custom/server/zcode/engine-bridge.ts:60-75` |
| `POST /api/zcode-engine/mention` | 创建或合并真实 Ycode run | `custom/server/zcode/engine-controller.ts:174-196` |
| `POST /api/auth/login` | 校验密码、签发 JWT、更新登录状态 | `vendor/hermes-studio/packages/server/src/modules/studio/controllers/auth.ts:195-239` |
| `POST /api/harness/sim-launch/start` | 启动真实推演驱动进程 | `custom/server/simcenter/sim-launch.ts:93-157` |
| `POST /api/harness/sim-launch/stop` | 终止本进程拉起的驱动 | `custom/server/simcenter/sim-launch.ts:159-177` |
| `hermes kanban selfcheck` | 是写路径启动自检，不归入纯只读健康命令；只在培训板按变更流程执行 | `runtime/hermes_cli/kanban.py:812-818` |
| 组织保存、邀请、改密、停用 | 写 Git、Synapse 和账号状态 | `custom/server/governance/registry-admin.ts:51-61`、`custom/server/matrix/admin-service.ts:108-183` |

## 14. 讲师预演顺序

### 14.1 开课前只读检查

1. 记录 commit、整体版本、Node 版本和各进程 cwd；没有采集的项写“未采集”。版本与启动日志证据见 `package.json:2-6`、`scripts/serve-server.mjs:121-127`。
2. 按第 4 节核对 8647、8649、8650、3030 的实际绑定，区分回环与全网卡；Koa 缺省绑定证据见 `vendor/hermes-studio/packages/server/src/modules/studio/public/config.ts:47-50`。
3. 请求 `/health/ready`，再分别看 `/health` 的 `agent_bridge`、gateway `/health/detailed`、Ycode `online`，不用单一 ready 代替端到端健康。判读依据见 `vendor/hermes-studio/packages/server/src/bootstrap/http.ts:232-240`、`vendor/hermes-agent/gateway/platforms/api_server.py:2371-2414`、`custom/server/zcode/engine-controller.ts:118-127`。
4. 检查 `GOVERNANCE_REPO`、`OBS_SIM_ROOT`、`HERMES_HOME`、`HERMES_WEB_UI_HOME` 是否都属于培训环境；自动回落规则见 `scripts/serve-server.mjs:61-119`。
5. 检查 `HERMES_TOOL_ENFORCE`、strict、HumanGate 两键、`SIM_HARNESS_LAUNCH` 和 chat bridge 开关的实际值，不把配置文件存在当成进程已加载。依据见 `custom/server/toolpipeline/enforce-gate.ts:469-480,682-709`、`custom/server/approval-inbox/human-gate.ts:295-315`、`custom/server/simcenter/sim-launch.ts:47-59`、`custom/server/matrix/chat-bridge.ts:447-474`。
6. 运行 `runtime:doctor`、runtime dry-run、`release:check`，把 WARN、kept 和覆盖缺口分别记录。命令语义见 `scripts/runtime/runtime-doctor.mjs:1-11`、`scripts/deploy-agent-runtime.mjs:1-10`、`scripts/verify-release-manifest.mjs:1-8`。
7. 只记录状态码、布尔值、路径和非敏感计数，不记录 token、密码或完整用户清单；身份与审计纪律见 `custom/server/AGENTS.md:18-19`。

这些检查对应第 13 节证据，不发起业务写入。预演记录模板：

```text
检查时间：
commit / 版本：
进程与 cwd：
已验证项：
失败项及原始错误：
未验证项：
开课前必须处置：
负责人和复核人：
```

### 14.2 受控写操作预演

以下全部为【写】或【外部写】，只在隔离培训对象上执行：

1. 初始化或重置培训管理员，使用培训账号完整登录一次。
2. 创建一张只读检查型任务卡，不携带生产命令、密钥或真实仓库写权限。
3. 让 dispatcher 认领该卡，观察 `ready → running → 实际终态`，不要手工改成 running 或 done。
4. 在培训 Matrix 房间发一条测试消息，核对 chat bridge 的 `observed` 与 worker 真实回执不是同一事实。
5. 发起一次低风险 Ycode/ACP 任务，记录 `engine_bin_source`、`engine_bin`、工作区和真实回执；provider 写 zcode 不足以证明用了 Ycode 分叉。`runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py:129-154,243-248`。
6. 预演结束后按培训约定归档测试卡和测试消息，保留必要证据，不批量清空数据库。

任何一步缺依赖，就把该实操标为未验证，不用截图、静态页面或口头说明冒充完成。培训依赖原则见 `docs/manuals/aistudio-training-and-user-guide.md:832-903`。

## 15. 六类故障分类与处置

统一先分六类，机械初筛顺序为 `ENV > TIMEOUT > PRODUCT > SCRIPT > FLOW > UNKNOWN`。同一错误第二次出现时必须改变处置动作，不能只会“再跑一次”。分类正本见 `skills/swarm-yuan/references/failure-taxonomy.md:5-24,36-40`。

| 类别 | 本运维场景的例子 | 处置与回流 | 证据 |
|---|---|---|---|
| `ENV` | 端口占用、未注入、依赖缺、`ECONNREFUSED`、API_SERVER_KEY 缺失、培训仓路径错 | 先修环境并重试一次。回流启动配方、配置和依赖，不急着改产品或断言 | `skills/swarm-yuan/references/failure-taxonomy.md:15` |
| `TIMEOUT` | gateway 评估超时、WS 握手超时、安装等待耗尽 | 一次性调整预算或标跳过，不死磕。orchestrator 评估不能自动重发，因为无幂等键 | `skills/swarm-yuan/references/failure-taxonomy.md:16`、`custom/server/orchestrator/evaluator.ts:159-164` |
| `PRODUCT` | 环境正常后仍稳定 5xx、同一状态错误可重复 | 重试确认稳定复现后登记 defect，保留请求、响应和版本，不修改测试迁就 | `skills/swarm-yuan/references/failure-taxonomy.md:17,22-24` |
| `SCRIPT` | 运维脚本语法、import、类型、路径引用错误 | 修一次后只跑目标验证，不全量盲目重跑；回流脚本本身 | `skills/swarm-yuan/references/failure-taxonomy.md:18` |
| `FLOW` | 前置账号、房间、任务依赖或预演断言设计错误 | 重推 Given/When/Then 与前置条件，不现场改断言。ready 不进入 running 时先查认领条件，不手改状态 | `skills/swarm-yuan/references/failure-taxonomy.md:19` |
| `UNKNOWN` | 证据不足，无法区分模型、gateway、worker、数据或脚本 | 补采集后由 AI 或人复核，记录残留疑点，不强行写 PRODUCT | `skills/swarm-yuan/references/failure-taxonomy.md:20-24` |

`FLAKY` 不占六类中的额外一席，也不能凭一次“偶发”定性；同一命令跨次结果不同才有判据，确认后走隔离和豁免登记。`skills/swarm-yuan/references/failure-taxonomy.md:22-24`。

## 16. 写操作总清单与未验证边界

### 16.1 执行前必须按写操作审批的命令

- `npm install`、`pnpm install`、`npm run inject`、`npm run clean`、`npm run dev`、`npm run serve`。
- `npm run zcode:ensure`、`npm run zcode:serve`、`node scripts/zcode-engine.mjs install-cli`。
- `npm run runtime:register`、`node scripts/deploy-agent-runtime.mjs --apply`，尤其 `--force`。
- `hermes profile install`、`hermes gateway run/start/stop/restart`、模型和平台配置变更。
- `reset-default-login`、组织保存、Matrix 邀请/改密/停用、任何 JWT 或 key 轮换。
- `POST /api/orchestrator/tick`、Ycode mention/watch、真实 ACP 任务、SIM start/stop。
- `npm run offline:package`、Windows 安装脚本、`setx`、`kill`、`taskkill`。
- `npm run release:packages`、yuan 离线包构建、任何上传或远端资产替换。

对应证据分别见第 3、5、9、12、13.3 节。 dry-run 只有 `node scripts/deploy-agent-runtime.mjs` 与 `npm run release:packages -- --dry-run` 这两个本文明确给出的只读形式；去掉 dry-run 或加上 `--apply` 后就是写操作。`scripts/deploy-agent-runtime.mjs:1-10`、`scripts/make-release-packages.mjs:8-17,36-41`。

### 16.2 本文没有宣称完成的验证

- 未启动当前 worktree 的后端、前端、gateway、Matrix、Ycode 或 worker。
- 未使用真实 Studio JWT、API_SERVER_KEY、Synapse token 或模型凭据。
- 未创建账号、任务、Git commit、Matrix 消息、Ycode 会话或发布资产。
- 未执行 clean/inject，避免改变当前工作树和共享 runtime。
- 未做 Windows 实机、完全断网、跨机、高可用或故障切换验证。
- 未上传 full、yuan everything 或任何其他文件。

因此，讲师仍须按第 13、14 节在目标培训环境采集真实结果。静态证据只能证明当前实现与配置口径，不能替代目标环境的运行验收。
