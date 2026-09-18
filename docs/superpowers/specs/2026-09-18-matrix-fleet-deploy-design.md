# Matrix Fleet · 独立桌面应用多用户协作部署设计

- 日期：2026-09-18
- 受众：要在单机上模拟「多名用户、每人一台电脑、各自跑 SwarmStudio + hermes 集群、经 Matrix 协作交付项目」的验证与演示场景
- 前置阅读：`specs/2026-09-17-multiuser-matrix-collab-sim-report.md`（协议层已 35/35 验收）

## 0. 结论先行

09-17 的 sim 验证的是**协议与流程**（dev 树生产构建 server + 浏览器访问）；本设计把同一协作流程搬到**独立部署安装的桌面应用形态**：应用共享本机安装（版本与所有安装强一致），每用户一个独立 HOME 沙箱，仅预置 Matrix 账号与 access token，即可与同伴完成需求交付全流程。工具包落 `scripts/fleet/`，运行态落 `/Volumes/nvme2230/lab/ncwk-fleet`。

## 1. 与 sim 的差距（本设计要补什么）

| 维度 | sim（09-17） | fleet（本设计） |
|---|---|---|
| 应用形态 | dev 树 `dist/server/index.js` + 浏览器 | 本机安装 `/Applications/SwarmStudio.app` 直接多开（共享一份，各自开窗口/托盘） |
| 实例隔离 | 环境变量分目录 | 每用户完整 HOME 沙箱（electron userData + `.hermes` + `.hermes-web-ui`） |
| agent 运行时 | 共享 `~/.hermes/hermes-agent` venv | 全 fleet 共享单份 runtime（`HERMES_DESKTOP_RUNTIME_DIR` 重定向，venv + pytest 只装一次） |
| Matrix 配置 | setup 预写 profile `.env` | 同左（账号 + token 即全部配置），另可走应用内 matrix-teams 面板 |
| 测试工具链 | 共享 venv pytest | 共享 venv 装 pytest 一次 |

## 2. 关键机制事实（锚点）

1. 端口可注入：`HERMES_DESKTOP_PORT` 覆盖桌面默认 8748（`packages/desktop/src/main/index.ts:56`）；`GATEWAY_PORT` 覆盖网关默认 8650（`server/src/modules/hermes/services/gateway/autostart.ts:391`）；`HERMES_AGENT_HEALTH_URL` 覆盖健康代理目标（`server/src/bootstrap/http.ts:575`）。
2. 目录可注入：`HERMES_HOME`/`HERMES_WEB_UI_HOME` 环境变量优先于 `homedir()` 推导（`desktop/src/main/paths.ts:575-585`），并透传给 server 子进程（`webui-server.ts:721-722`）。
3. 运行时可预置：打包态 hermes/python/node 运行时从 `HERMES_WEB_UI_HOME/desktop-runtime/hermes/<ver>/mac-arm64` 发现（`paths.ts:104-130`），预拷贝即可免下载。
4. 多实例可行：Electron 单实例锁按 userData 区分；实例 HOME 不同 → 锁不同。启动器 PATH 经 `userSearchPath` 并入 server/网关/agent 环境（`webui-server.ts:585-592`），homebrew git 可达 agent。
5. Matrix 接入面：每用户网关 profile `.env` 写 `MATRIX_HOMESERVER/ACCESS_TOKEN/USER_ID/HOME_ROOM/ALLOWED_ROOMS/ALLOWED_USERS` 五件套（09-17 sim 实证）；应用内 matrix-teams 面板（TeamsManagePanel，2.27 已含）提供人工配置入口。
6. 已装 `/Applications/SwarmStudio.app` = 2.27 构建（0.7.22，含 matrix-teams），无 quarantine 属性，同一二进制多开互不干扰（隔离全靠 userData）。
7. 运行时可整体重定向：`HERMES_DESKTOP_RUNTIME_DIR` 环境变量令 `desktopRuntimeDir()`/`runtimeResourceDir()` 全部解析到指定树（`desktop/src/main/paths.ts:329-333,363-366,401-406`），多实例可共享单一运行时副本，且该覆盖优先于 active-version.json 固化值。

## 3. 方案决策

1. **应用共享本机安装，沙箱只放配置与状态（v2，用户指令）**。不复制 `.app`：三实例直接以 `/Applications/SwarmStudio.app` 二进制多开，版本与本机所有安装强一致，升级后重启实例即跟随；节省 3×1.3G。每用户 `home/` 沙箱承载 electron userData、`.hermes`、`.hermes-web-ui` 三层，等价于「另一台电脑」；实例身份由 `--user-data-dir` 唯一区分。
2. **启动 = 环境变量注入直启二进制**。`HOME/HERMES_HOME/HERMES_WEB_UI_HOME/HERMES_DESKTOP_PORT/HERMES_DESKTOP_RUNTIME_DIR/GATEWAY_PORT/HERMES_AGENT_HEALTH_URL/BIND_HOST=127.0.0.1` 后台启动本机安装二进制。零产品代码改动。
3. **Matrix 复用本机 Synapse，另开新会话**。同一 homeserver（matrix.test）同一批账号（alice/bob/carol ± agent），fresh login 取新 token、另建 fleet 项目房间，与旧 sim 房间互不串扰（ALLOWED_ROOMS 收敛到各自房间）。
4. **运行时全 fleet 共享单份（v2，用户指令）**。`shared/desktop-runtime`（约 1.4G）从装源拷贝一次，pytest 只装一次，实例经 `HERMES_DESKTOP_RUNTIME_DIR` 指向。刻意不直接指向真实 `~/.hermes-web-ui` 运行时树：避免向真实环境注入 pytest，也隔离真实应用升级时的树替换。多实例并发导入的 venv 字节码缓存写入为 Python 原子操作（临时文件 + rename），共享安全；pip 仅在 setup 期运行。
5. **场景与验收复用 sim 七步法**（RFD→分解→建卡→并行实现→集成验证→审批→发布），导演只扮演人类打字，一切以 central 裸仓「地面真值」验收；新增 fleet 独有断言（每实例独立进程/独立 DB/独立 userData/端口绑定）。

## 4. 目录与端口布局

```
/Volumes/nvme2230/lab/ncwk-fleet/
├── shared/desktop-runtime/hermes/<ver>/mac-arm64/   # 共享运行时（全 fleet 一份，~1.4G）
├── users/<u>/
│   ├── home/                           # 实例 $HOME（配置与状态层）
│   │   ├── Library/Application Support/SwarmStudio/  # electron userData（--user-data-dir 指定）
│   │   ├── .hermes/                      # active_profile + profiles/<u>/{config.yaml,.env}
│   │   └── .hermes-web-ui/               # .token + hermes-web-ui.db（状态）
│   └── workspace/stringops/            # central 裸仓的各用户检出
├── central/stringops.git               # 共享裸仓（地面真值）
├── creds/  logs/  pids/  evidence/  state.env
```

应用 = 本机 `/Applications/SwarmStudio.app`（零副本）。端口：studio 8762/8763/8764（alice/bob/carol），gateway 8782/8783/8784。避开真实实例 8748/8650 与旧 sim 870x/872x 段。

## 5. 脚本清单

| 脚本 | 职责 |
|---|---|
| `fleet-lib.sh` | 路径/端口/Matrix/Studio 公共库（自包含，不依赖 dev 树） |
| `fleet-setup.sh` | 幂等置备：共享运行时（一份）+ pytest、账号 token、房间、profile 配置、中央仓；含 v1 遗留副本清理 |
| `fleet-up.sh [user...]` | 启动实例（等 studio ready + 网关 health）；`FLEET_HIDDEN=1` 隐藏窗口启动（托盘保留） |
| `fleet-down.sh [user...]` | 网关优雅停 + 应用进程收尾 + 端口兜底清扫 |
| `fleet-scenario.sh` | 需求交付全流程七步（断点续跑 `START_STEP`） |
| `fleet-evidence.sh` | 验收门断言 + 证据导出 + run-report.md |

## 6. 验收门（evidence 断言清单）

1. 实例独立：三实例 `/health/ready` 各自 200；各实例进程命令行含**本实例** `--user-data-dir` 沙箱路径；各实例端口监听进程的命令行来自**本机安装** `/Applications/SwarmStudio.app`（版本一致性）；三份 `hermes-web-ui.db` 独立存在（inode 级）；各实例 userData 落在沙箱 HOME 内；共享运行时单份就绪。
2. 网关集群：三网关各自 `/health` 200。
3. 房间：成员 6（3 人类 + 3 agent），agent presence online。
4. 轨迹：RFD-001 / DECOMPOSE / IMPL-DONE-T1 / IMPL-DONE-T2 / VERIFY-PASS / APPROVED / SHIP-DONE 关键消息齐备。
5. 交付真值：central 有 feat/slugify、feat/truncate、tag v0.1、main 含 RELEASE.md；导演在 alice 工作区用**共享 venv** 复跑 pytest 全绿。
6. Kanban：T1/T2/T3 终态 done（alice 实例 API）。

## 7. 风险与对策

| 风险 | 对策 | 实测结果（09-18 轮） |
|---|---|---|
| macOS Electron userData 是否跟随 `$HOME` | 冒烟单实例先行验证；若不跟随，追加 `--user-data-dir` 启动参数（Electron 原生支持） | **已发生**：HOME 覆盖不迁移 userData，单实例锁与真实实例共键秒退；`--user-data-dir` 指进沙箱后解决，已固化进 fleet-up |
| 弹出的应用窗口被人工 Cmd+Q 退出 | `FLEET_HIDDEN=1` 传 `--hidden`（托盘保留，点开即显窗口）；场景断点续跑 | **已发生两轮**（非崩溃，before-quit isQuitting=false 的外部退出）；隐藏模式后未再复发 |
| 三实例共享登录钥匙串 | AUTH_TOKEN 走 env、JWT 走各实例 localStorage，理论无冲突 | 未观察到冲突 |
| 后台会话起 GUI 应用缺 WindowServer 权限 | 直启二进制优先；失败改 `open -na <app> --env` 通道 | 直启成功，未需兜底 |
| bundled venv 装 pytest 走外网失败 | `FLEET_PIP_INDEX_URL` 可换镜像 | 清华镜像一次装成 |
| 与旧 sim（alice 8701 仍活）互扰 | 端口/房间/凭据目录全分离；同账号双会话 Matrix 语义允许 | 无串扰（旧房间静默） |
| LLM 回合不稳定 | 真值轮询 + `START_STEP` 断点续跑 + 不许谎报结论行 | **已发生**：三 agent 并发触发共享模型代理限速/空流，回合失败静默；错峰补派 + 代理自愈后通过 |
| 共享 venv 多实例并发写 | Python `.pyc` 原子写（临时文件 + rename），并发导入安全；pip 仅 setup 期运行 | v2 设计取舍，随 alice 冒烟复验 |

## 8. 使用（速查）

```bash
cd overlay/scripts/fleet
bash fleet-setup.sh                 # 置备（幂等，全量三用户）
bash fleet-up.sh                    # 三实例起（冒烟可 bash fleet-up.sh alice）
FLEET_HIDDEN=1 bash fleet-up.sh     # 长跑场景推荐：窗口不弹出（托盘可见）
bash fleet-scenario.sh              # 七步交付全流程（断点续跑 START_STEP=impl）
bash fleet-evidence.sh              # 验收门 + 证据
bash fleet-down.sh                  # 收尾
```
