# Windows 三机真集群推演部署手册（2026-10-12 双模式轮）

本手册让同一套 simharness 程序在两种形态下运行：mac 单机模拟集群（现状，`MX_NODE` 不设即全编制本机跑，行为与历史轮一致）；Windows 三机真集群（1 台导演机 + 2 台 agent 机，每机跑 1-2 个账号及其 agent teams）。目标环境的 matrix 服务端与 GitHub 中央仓都是远端复用，不迁移。

## 一、拓扑与角色

```
┌─ 导演机（Windows，MX_ROLE=director）────────────────┐
│ aipay-scenario 驱动 + 监督器/接力器 + studio:8802    │
│ + 报告链（帧采集/报告生成/审计）+ gateway（本机档案） │
└──────┬───────────────────┬───────────────────────┘
       │ matrix 房间消息     │ git push/pull（GitHub 远端）
┌─ agent 机 B ────────┐  ┌─ agent 机 C ─────────┐
│ gateway（本机档案）   │  │ gateway（本机档案）    │
│ profiles+板+工作区   │  │ profiles+板+工作区    │
└─────────────────────┘  └──────────────────────┘
```

三条网络总线（全部已是网络化协议，本改造未新增）：

1. 派活与回执：matrix 房间 @mention（远端 homeserver）。
2. 交付真值：GitHub 中央仓 issac-new/aipaydev，三机各自 clone，push/pull。
3. 观测：导演机通过 git fetch 与 matrix 消息核验远端真值。

每机的 gateway 只 multiplex 本机档案（`MX_NODE_USERS` 切片）。账号在导演机上一次建齐（studio 的 governance API），token 同步到 agent 机。

## 二、环境变量总表（每机一份）

| 变量 | 导演机 | agent 机 | 说明 |
|---|---|---|---|
| `AIPAY_SIM_ROOT` | `E:\sim` | `E:\sim` | 每机各自的 SIM_ROOT |
| `MX_NODE` | `director` | `node-b` / `node-c` | 节点名（solo=单机全编制） |
| `MX_ROLE` | `director` | `agent` | agent 机跳过账号供给与 studio 拉起 |
| `MX_NODE_USERS` | `fanfan,chen` | `hu,xiao` 等 | 本机档案清单（编制内名字，逗号分隔） |
| `MX_HS` | `http://<matrix服务器>:8008` | 同左 | 远端 homeserver |
| `MX_SERVER_NAME` | 服务器域名 | 同左 | mxid 域名 |
| `MX_SYNAPSE_MODE` | `api` 或 `manual` | 不需要 | admin 建号方式（见四.2） |
| `MX_REG_SECRET` | synapse 注册密钥 | 不需要 | 仅 api 模式 |
| `MX_MODEL_BASE_URL/KEY/NAME` | DeepSeek 三参 | 同左 | 模型通道（chat-completions） |
| `MX_STUDIO_DIST` | SwarmStudio 安装目录的 `resources\webui\dist` | 不需要 | studio 执行面复用桌面包产物（内含 dist/server/index.js 与 node_modules，免带 1.6G product-dist 快照） |
| `MX_HINDSIGHT_API` | hindsight 服务地址 | 同左 | 家族记忆（可集中一台） |
| `MX_GW_PORT` / `MX_STUDIO_PORT` | 8801 / 8802 | 每机自定 | 同机冲突时改 |

## 三、每台机器的公共准备（按序执行）

1. 装 Git for Windows、Node.js ≥23、Python 3.12、jq、curl（Git Bash 自带 curl）。
2. `git config --global core.autocrlf false`。
3. 克隆 simharness 仓（或解包随附的仓快照）。
4. 建议管理员执行 `powercfg /change standby-timeout-ac 0`（推演期防睡眠；mac 的 caffeinate 在 Windows 无对应物，这是替代）。
5. 自检：Git Bash 里 `bash mux/mx-platform.sh` 无输出为正常；`source mux/mx-platform.sh && mxp_selfcheck` 输出工具清单，MISSING 行对应的工具补装。

## 四、导演机部署（按序执行）

1. 设好二节表中导演机列的环境变量（`setx` 或会话内 export）。
2. matrix 接入二选一：
   - 服务器开放了注册共享密钥：`MX_SYNAPSE_MODE=api` 且 `MX_REG_SECRET=<密钥>`。程序会用注册 API 建 admin。
   - 未开放：`MX_SYNAPSE_MODE=manual`。先在服务器上人工创建 `admin` 账号（密码按 user_pass 约定式 `Aipay_admin_2026` 形态，或改 `creds` 供给后手动登录）。程序只验证登录。
3. 跑 `bash mux/mx-setup.sh`。它做这些事：建 admin（按模式）、拉起 studio、经 governance API 建全部账号并登记 roster、生成本机档案（fanfan,chen）的 profiles 与板、克隆中央仓与工作区。
4. 同步 creds 到 agent 机：把 `creds/<档案>.token` 与 `creds/<档案>-agent.token`（仅 agent 机清单内的档案）复制到各 agent 机的 `creds/`。不要把 admin token 发往 agent 机。
5. 跑 `bash mux/mx-up.sh` 拉起 gateway 与 studio。
6. 验证：`bash mux/mx-smoke.sh`。本机档案门禁全过；输出行有 `node=director role=director users=fanfan,chen`。

## 五、agent 机部署（每台，按序执行）

1. 设好二节表中 agent 机列的环境变量。
2. 前置：中央仓 GitHub token 放 `creds/github.token`（或配好 git credential）；matrix homeserver 可达。
3. 跑 `bash mux/mx-setup.sh`。`MX_ROLE=agent` 会跳过账号供给与 studio，校验 creds 后生成本机档案的 profiles、板、工作区。
4. 跑 `bash mux/mx-up.sh`。agent 机只拉 gateway（studio 不在 agent 机跑，`MX_ROLE=agent` 下 mx-up 对 studio 段做健康探测即跳过）。
5. 验证：`bash mux/mx-smoke.sh`。本机档案的 G1/G2-G4/G6 过；fanfan/chen 相关门禁显示 `SKIP`（如实记档，导演机侧已验）。

## 六、起跑一轮推演（导演机）

1. 确认三机 gateway 健康（各机 `curl http://127.0.0.1:$MX_GW_PORT/health`）。
2. 起监督器：`nohup bash mux/run-driver-supervisor.sh --run <RUN_ID> > $AIPAY_SIM_ROOT/logs/<RUN_ID>-supervisor.log 2>&1 &`。
3. 监控：`MX_RUN_ID=<RUN_ID> bash var-templates/run-watch-v3.sh`（工作行活性/空转收场/三查诊断；蓝本已收编进仓）。
4. 报告：导演机 `python mux/mx-report-gen.py --run <RUN_ID>`（需 `MX_OVERLAY_ROOT` 指向 overlay 检出，或保留默认 mac 路径仅限 mac）。

## 七、跨机语义变化（如实说明，mac 单机不受影响）

1. 判活：非本机档案的 agent.log 不在本地，`wait_alive_truth` 走既有降级路径（硬窗等待），失去空转催办与卡死早判。补偿：各机跑 run-watch-v3.sh，停滞靠人看或后续接上报通道（本期未做，记档）。
2. 卡面反查：`verify_done_evidence` 对非本机档案降级为 git 真值核验（commit 反查照旧强断言），卡面不误杀也不虚放。
3. kanban 真值：各机各持本机档案板 DB；跨机交付核验一律走 GitHub 远端（branch_fresh/repo_has 本来就是远端口径）。
4. 进度台账：dispatch-ledger 落导演机本机（`~/.hermes-web-ui/overlay/`），与 studio 同机，语义不变。
5. 监督器锁防御：mac 用进程组（pgid）；Windows 改「同步执行不变式 + relay 在跑则让位」，不杀接力器拉起的合法驱动。

## 八、已知边界与风险

1. 帧采集需要导演机装 Chrome（playwright `channel:'chrome'`，缺省回落 bundled chromium，首次需联网下载浏览器——离线环境预先装 Chrome）。
2. `wmic` 在 Windows 10 自带但新版 Windows 11 移除中；三机环境是 Win10，不受影响。
3. hindsight 家族记忆集中一台时，`MX_HINDSIGHT_API` 三机同指即可；不跑 hindsight 则 mx-setup 会拒绝（G6 依赖），需先拉起。
4. decision backend（JEV 门禁）fail-open：不可达只记 issue 不阻断。
5. 网络抖动会放大等待窗；`MX_ALIVE_HARD_SEC` 可整体放宽。

## 九、安全事项（迁移前必做）

1. 轮换 GitHub token：历史 SIM_ROOT 的 `central/aipaydev` 与 `workspaces/*/aipaydev` 的 `remote.origin.url` 实测内嵌真实 token（`x-access-token:gho_...`）。换新 token 后重跑 `mx-setup`（`gh_clone_sanitize` 会落无凭据 remote）。
2. `creds/` 目录含全部 matrix token 与 github.token：跨机同步只发目标档案所需的 token；不进任何归档或上传。
