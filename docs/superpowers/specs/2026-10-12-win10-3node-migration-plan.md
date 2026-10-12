# Windows 三机迁移方案（推演程序跨平台与分布式编排）

- 日期：2026-10-12
- 状态：待批准。批次 0 已定稿，批次 1 起待用户点头开工
- 上游依据：全仓平台耦合排查（2026-10-12，锚点见 §4）。场景规格仍以《2026-10-05-mux-v8-fullflow-plan.md》V8.15 为正本。本方案只管迁移与编排，不改场景规则
- owner：推演 harness 侧（simharness 仓 + 本文档）

## 1. 背景与决策定案

推演程序（simharness）现按 macOS 单机执行。一个驱动脚本在同一台机上拉起全部服务，直读本机 agent 日志，本机浏览器拍帧。新目标是 3 台 Windows 电脑各部署 1 个账号及其 hermes agent teams。一个导演编排三机协作，完成同一需求的全流程交付推演。排查结论：直接拷贝不可用，需要平台移植与编排改造两层工作（断点清单见 §4）。

五项决策已由用户定案：

| 决策点 | 定案 |
|---|---|
| 执行环境 | Git Bash + Windows 原生：harness 跑在 Git Bash，hermes/studio/node/python 均为 Windows 原生进程 |
| 拓扑形态 | 走法 B：单导演编排三机协作同一需求 |
| 编排传输 | 拉取式节点守护：工作机零入站端口，主动轮询导演机领任务并回传结果 |
| 编制切分 | 按职能域切三机（导演机兼共享组件宿主） |
| 跨机记忆延续 | 不做：每机 hindsight 独立，不做跨机记忆库配对（不设 AIPAY_USER_MAC） |

落选记录（ADR 口径）：用户否决了 SSH 直连方案。SSH 的优势是调试直观，但要在两台工作机启用 OpenSSH Server 并改造默认 shell。拉取式方案工作机零入站配置，节点守护复用现有 watcher 的 bash+curl 形态。未来工作机换网络环境也能用。代价是新增常驻组件与其保活（§3.6）。

## 2. 目标拓扑

三机按职能域切分，导演机同时承载共享组件：

| 机器 | 角色 | 承载 |
|---|---|---|
| 机 1（导演机） | 导演 + 前段职能 | 驱动脚本、导演控制面（hub）、共享 synapse、central 仓 clone、需求/项目管理/系统分析/架构域档案、本机 gateway + studio |
| 机 2 | 研发域 | 研发工程师组档案、本机 gateway + studio、各自工作区 |
| 机 3 | 测试评审与治理域 | 测试/评审/安全/运维/审计档案、本机 gateway + studio、各自工作区 |

账号归机的点名映射在批次 3 实施时冻结，写进拓扑清单，本表只锁职能域口径。核定两步：

- 按 V8 方案 §2.2 编制表定各职能域
- 按 `boards_of`（mux/mx-lib.sh:157-172）实测点名

42 个 profile 按归机拆分，每机自己的 `$SIM_ROOT`、hermes 隔离快照、工作区与 hindsight。

网络面只有三条跨机通路，其余全部留在各机本机回环：

```
机2/机3 ──轮询领任务/回传结果/上传帧──▶ 机1 hub :8803（LAN 入站①）
机2/机3 ──matrix 客户端连接──────────▶ 机1 synapse :8008（docker 发布到 LAN，入站②）
机2/机3 ──git push 交付物────────────▶ GitHub central 仓（既有通路，零新增）
```

- 机 1 只开两个入站端口（synapse 8008、hub 8803）。机 2/机 3 零入站。
- 每机 gateway :8801 与 studio :8802 仍绑本机回环（mux/mx-lib.sh:98-99 现状）。导演不直连工作机的任何端口，一切经节点守护。
- 聊天总线共享：全部 15 角色的群聊房间在机 1 synapse 上，三机 agent 与帧采集登录都指向它。`MX_HS` 变量已支持覆盖（mux/mx-lib.sh:107），工作机指向 `http://<机1 LAN IP>:8008`。

## 3. 编排架构：拉取式节点守护

### 3.1 组件与职责

四个新件，全部落在 simharness 仓：

1. **mx-director-hub**（机 1，node 内置 http，:8803）：任务队列、结果表、心跳表、帧仓。任务与结果落 JSONL 台账可审计。
2. **mx-node-agent**（机 2/机 3 常驻，bash）：长轮询领任务，本地执行，回报结果。可执行任务类型：服务起停（mx-up/mx-down）、hermes CLI（kanban 真值查询）、git 操作、帧拍摄、文件读段。
3. 拓扑清单 nodes.json（`$SIM_ROOT/var/nodes.json`）：机器表（名称、职能域、sim_root）与用户归机表的单一事实源。**清单缺省即单机模式**：驱动读不到清单时按现行为全本地执行。macOS 单机推演（run16 起）零变化，守门测试断言此兼容性。
4. **驱动路由层**（mx-scenario-lib 内新增函数组）：`machine_of <user>` 查清单，`on_machine <user> -- <cmd...>` 分流。本地用户直跑，远端用户经 hub 下发并等待。

### 3.2 协议

| API | 方向 | 语义 |
|---|---|---|
| POST /task | 驱动→hub | 入队 {id, node, type, args}；id 全局唯一（run+步号+序号） |
| GET /next?node=&wait=25 | agent→hub | 长轮询领任务；空手 25s 超时返回 |
| POST /result | agent→hub | {id, rc, stdout 尾, stderr 尾, 产物清单} |
| POST /heartbeat | agent→hub | 30s 一轮：各档案 last_work_ts、tail_stalled、日志字节数；服务健康位 |
| POST /frame | agent→hub | 帧二进制，按 run/step 落导演机 `$SIM_ROOT/runs/<run>/evidence/screenshots/steps/` |

- 鉴权：共享密钥请求头。密钥由 mx-setup 生成，经离线渠道放到各机 `$SIM_ROOT/var/node.token`。局域网实验室口径，不做证书面。
- 幂等：任务带 id，agent 维护本地已完成表，重放直接回执原结果。hub 任务 10 分钟 TTL。
- 超时：驱动侧 `wait_task <id> <timeout>`。超时记 issues.log 不阻断主链，与现有帧采集失败语义一致（mux/mx-scenario-lib.sh:637-651 同款）。

### 3.3 判活下沉

现状判活是驱动直接 tail 本机 agent 日志并解析工作行时间戳（`_agent_log_last_work_ts`、`_agent_log_tail_stalled`，mux/mx-scenario-lib.sh:660-679）。改造：这套采样逻辑原样搬进节点守护的 30s 心跳采样器。驱动等待环改为查 hub 心报表。本地用户（机 1 档案）仍走本地直读。采样逻辑是搬运不是重写，判死阈值与正则口径不变。

### 3.4 帧采集路由

`capture_step`（mux/mx-scenario-lib.sh:629-655）按 `machine_of <user>` 分流。本地用户现状直跑。远端用户经 hub 下发帧任务，节点守护在本机 studio（127.0.0.1:8802）拍完上传。报告生成器只认导演机 evidence 目录，远端帧落位后报告侧无感。帧 provenance 记拍摄机名，报告标注帧来源机器。

### 3.5 真值核验

- central 仓核验（branch_fresh 等）本来就走本地 clone + fetch（mux/mx-scenario-lib.sh:607-618），三机交付物都推 GitHub，导演 fetch 即得，零改造。
- kanban 真值（mx_kanban 直调本机 HERMES_BIN，mux/mx-lib.sh:402-405）改为经 `on_machine` 路由到板所属机执行。
- 26 步主链结构不动：改造面收敛在五类原语（服务起停、判活、帧、kanban、文件读段），步序与判据不变。

### 3.6 节点守护的保活

机 2/机 3 各跑一个看护环，仿 run-driver-supervisor 的 stop 文件加失效自愈。Windows 侧再叠一层计划任务兜底：schtasks 每 5 分钟检查拉起，装机手册固化。节点失联的处理是告警加等待恢复，不做任务漂移重派（见 §7 边界第 1 条）。

## 4. Windows 平台移植清单（批次 1 范围）

排查定锚的断点与对策全部落在批次 1。macOS 侧以守门测试与单机回归验证。**Windows 侧未经真实执行，首航批次 5 实测**，预期有返工轮：

| # | 断点（锚点） | 对策 |
|---|---|---|
| 1 | 帧采集硬编码无兜底：mux/r18-frames.mjs:59,68,87 直写 /Volumes；BASE 焊死 127.0.0.1:8802（:68）。render-to-png.mjs、capture-ui.mjs、verify-governance.sh、mx-grant-profiles.mjs 同病 | 统一改读 `AIPAY_SIM_ROOT` env + `$HOME` 回落；MSYS 路径形态（/c/…）归一为 C:/…；端口走 env |
| 2 | 默认路径各自为政：mx-lib 之外 7 个脚本独立 fallback /Volumes（mx-clean.sh:16 等）；Python 侧 6 处无 env 覆盖（mx-report-gen.py:25 等） | 全部收敛到 mx-lib 的 SIM_ROOT 解析器（单一事实源），Python 侧补 env 读取 |
| 3 | BSD 专属命令：`date -j -f`（mx-scenario-lib.sh:665,1229,1238）、`stat -f %z`（run-driver-supervisor.sh:111） | 兼容层双分支（BSD/GNU），模式复刻 stat 已有的双分支先例（mx-lib.sh:483-486） |
| 4 | 进程面：caffeinate（mx-up.sh:34-38）、lsof -ti（mx-down.sh:21）、pgrep/pkill/pgid（mx-relay/mx-clean/prelaunch/supervisor）、uptime 负载检查（mx-up.sh:42） | caffeinate→Windows 以 powercfg 预检替代（预检不过告警不拒跑）；lsof→netstat -ano 解析；pgrep/pkill→MSYS `ps -W` 解析 + taskkill；uptime 特性探测，缺失即跳过 |
| 5 | rsync 无（Git Bash 不带）：mx-lib.sh:444（源码快照）、mx-lib.sh:478 起（product-dist 快照） | `cp -a` + tar 替代分支 |
| 6 | venv 布局：`venv/bin/python`（mx-lib.sh:73,452） | 探测 `venv/Scripts/python.exe` 分支 |
| 7 | 宿主 `~/.hermes` 供给链（mx-setup.sh:18 硬前置、config/SOUL/roster 源） | Windows 侧 hermes home 由装机批次供给（§5），harness 只改路径解析 |
| 8 | 脱敏正则只认 /Users/、/Volumes/（mx-scenario-lib.sh:1627；mx-report-gen.py:3629；mx-report-audit.py:692） | 补 C:\Users\… 盘符形态占位符（`[宿主家目录]` 同口径扩义） |
| 9 | 微信开发者工具 macOS 路径（cashier-devtools/capture-wechat.mjs:19） | 双路径探测（Windows 装机目录 cli.bat） |
| 10 | 守门测试：python3 调用、/Volumes 字面量断言（tests/harness-gate-integrity.test.ts:249,254）、execFileSync 拉 bash -c | python3→python 回落；字面量断言改 env 派生；Git Bash 在 PATH 为装机前提 |

兼容层落 `mux/mx-win-compat.sh` 单文件，函数名统一 `mxc_` 前缀，全部双平台分支（macOS 路径原语义零变化，守门断言兜底）。

## 5. 装机与供给（批次 3）

每台机公共清单：Git Bash、node LTS、python 3.11、Docker Desktop、Chrome、jq/sqlite3/perl、ncwk 仓 clone。

studio 在 Windows 本机构建，npm ci + inject + build 出 dist 快照。推演形态是纯 node 服务（mx-lib.sh:356-370 直跑 `server/index.js`），不需要 Electron 装机包。这恰好绕开 mac 交叉构建缺 win-x64 原生依赖的缺陷。本机构建让 sharp/node-pty 等自动取 Windows 版。

机 1 专属：synapse 容器端口发布到 LAN，docker -p 面检查绑定 0.0.0.0。hub 常驻，驱动与 central clone 在位，账号由 gov_provision_user 单点注册。账号 token 经 hub 密头发放到档案所属机，写入本地 creds。

hermes home 供给两选一：

- 复用 win10-mig-20261012 包的 bootstrap（从零构建版）
- 按其 README 原生重装

两路都满足 §4 第 7 条的供给前提。armada 不在本方案面（Windows 编译不过，不迁）。

## 6. 批次计划与验证门禁

| 批次 | 内容 | 验收判据 | 闸 |
|---|---|---|---|
| 0 | 本方案定稿（本文档） | 用户批准 | — |
| 1 | Windows 兼容地基（§4 全表） | macOS 守门全绿 + 单机冒烟不回归；Windows 侧如实标注未实测 | run15 运行中：worktree 分支开发，不合 main |
| 2 | 拉取式编排层（§3 全部新件 + 驱动路由） | 本机模拟三机集成测试：一台 mac 起 hub + 两个 agent，协议全路径（领任务/回传/心跳/帧上传/幂等/超时）绿；无清单时单机模式守门绿 | 同上；依赖批次 1 兼容层 |
| 3 | 装机手册 + 每机 setup + 归机点名冻结 | 三机各自 `mx-prelaunch-check` 过 | 依赖真机到位 |
| 4 | 方案正本修订 + 报告链三机化 | §1.3:200 跨机边界条款改写、§3.1/§4.4 拓扑表补三机形态；报告器认远端帧 provenance | **硬闸：run15 report_done 之后才动正本** |
| 5 | 三机首航 | 机 1 单机 Windows 回归 → 双机联调 → 三机 run16 全量轮出报告 | 依赖 1-4 |

批次 1、2 可并行两条分支开发（并行上限内），合并均等 run15 report_done。

## 7. 边界（本可做但不做）与风险

不做四件：

1. 节点失联自动漂移重派：失联=告警+等待恢复。三机协作同一需求进验证范围，"谁离线不影响全网"的联邦韧性仍不做。这与 V8 方案 §1.3 原精神一致，批次 4 只放宽"单机等价"一条。
2. 跨机记忆延续：已拍板不需要。
3. Windows 原生 cmd/PowerShell 版 harness：Git Bash 是前提，不做第二套 shell。
4. matrix 联邦（多 synapse 互联）：单共享实例口径。

风险与置信度：

| 风险 | 判断 |
|---|---|
| Git Bash 下 nohup/进程组/常驻语义与 macOS 有差 | 可能（未实测）。批次 5 首航预期返工，看护环与 stop 文件先行兜底 |
| studio Windows 本机构建遇原生依赖问题 | 可能。交叉构建缺陷是实测事实（win 包缺件），本机构建路径未走过 |
| docker 端口发布到 LAN 的绑定面 | 待检查。批次 3 装机时以 `docker port` 实测确认 |
| 共享 synapse 单点：机 1 重启则三机聊天中断 | 确定存在。属边界第 1 条已声明的范围外韧性，记档不修 |
| run15 在跑与开发互踩 | 已规避。开发全在 worktree 分支，正本修订硬闸在 report_done 后 |

## 8. 收口画面

批次 5 的验收画面：三台 Windows 机同时亮屏。机 1 驾驶舱里，研发组的板出自机 2，评审板出自机 3。全部帧当轮实时拍摄，逐帧标注来源机器。run16 报告第一次以三机分工呈现同一张需求单的全流程。
