# Matrix Fleet · 独立桌面应用多用户协作部署设计

- 日期：2026-09-18
- 受众：要在单机上模拟「多名用户、每人一台电脑、各自跑 SwarmStudio + hermes 集群、经 Matrix 协作交付项目」的验证与演示场景
- 前置阅读：`specs/2026-09-17-multiuser-matrix-collab-sim-report.md`（协议层已 35/35 验收）

## 0. 结论先行

09-17 的 sim 验证的是**协议与流程**（dev 树生产构建 server + 浏览器访问）；本设计把同一协作流程搬到**独立部署安装的桌面应用形态**：每用户一份完整 `SwarmStudio.app` 副本 + 独立 HOME 沙箱，仅预置 Matrix 账号与 access token，即可与同伴完成需求交付全流程。工具包落 `scripts/fleet/`，运行态落 `/Volumes/nvme2230/lab/ncwk-fleet`。

## 1. 与 sim 的差距（本设计要补什么）

| 维度 | sim（09-17） | fleet（本设计） |
|---|---|---|
| 应用形态 | dev 树 `dist/server/index.js` + 浏览器 | 独立安装的 `SwarmStudio.app` 副本 ×3，各自开窗口 |
| 实例隔离 | 环境变量分目录 | 每用户完整 HOME 沙箱（electron userData + `.hermes` + `.hermes-web-ui`） |
| agent 运行时 | 共享 `~/.hermes/hermes-agent` venv | 每实例自带 bundled runtime（python venv + node，预置拷贝） |
| Matrix 配置 | setup 预写 profile `.env` | 同左（账号 + token 即全部配置），另可走应用内 matrix-teams 面板 |
| 测试工具链 | 共享 venv pytest | 每实例 venv 自装 pytest |

## 2. 关键机制事实（锚点）

1. 端口可注入：`HERMES_DESKTOP_PORT` 覆盖桌面默认 8748（`packages/desktop/src/main/index.ts:56`）；`GATEWAY_PORT` 覆盖网关默认 8650（`server/src/modules/hermes/services/gateway/autostart.ts:391`）；`HERMES_AGENT_HEALTH_URL` 覆盖健康代理目标（`server/src/bootstrap/http.ts:575`）。
2. 目录可注入：`HERMES_HOME`/`HERMES_WEB_UI_HOME` 环境变量优先于 `homedir()` 推导（`desktop/src/main/paths.ts:575-585`），并透传给 server 子进程（`webui-server.ts:721-722`）。
3. 运行时可预置：打包态 hermes/python/node 运行时从 `HERMES_WEB_UI_HOME/desktop-runtime/hermes/<ver>/mac-arm64` 发现（`paths.ts:104-130`），预拷贝即可免下载。
4. 多实例可行：Electron 单实例锁按 userData 区分；实例 HOME 不同 → 锁不同。启动器 PATH 经 `userSearchPath` 并入 server/网关/agent 环境（`webui-server.ts:585-592`），homebrew git 可达 agent。
5. Matrix 接入面：每用户网关 profile `.env` 写 `MATRIX_HOMESERVER/ACCESS_TOKEN/USER_ID/HOME_ROOM/ALLOWED_ROOMS/ALLOWED_USERS` 五件套（09-17 sim 实证）；应用内 matrix-teams 面板（TeamsManagePanel，2.27 已含）提供人工配置入口。
6. 已装 `/Applications/SwarmStudio.app` = 2.27 构建（0.7.22，含 matrix-teams），无 quarantine 属性，整包复制即可运行。

## 3. 方案决策

1. **每用户沙箱 = 独立 .app 副本 + 独立 HOME**。`ncwk-fleet/users/<u>/` 下放 `apps/SwarmStudio.app`（1.3G）与 `home/`（该实例 `$HOME`）。HOME 隔离一次性解决 electron userData、`.hermes`、`.hermes-web-ui` 三层落位，等价于「另一台电脑」。
2. **启动 = 环境变量注入直启二进制**。`HOME/HERMES_HOME/HERMES_WEB_UI_HOME/HERMES_DESKTOP_PORT/GATEWAY_PORT/HERMES_AGENT_HEALTH_URL/BIND_HOST=127.0.0.1` 后台启动 `<app>/Contents/MacOS/SwarmStudio`。零产品代码改动。
3. **Matrix 复用本机 Synapse，另开新会话**。同一 homeserver（matrix.test）同一批账号（alice/bob/carol ± agent），fresh login 取新 token、另建 fleet 项目房间，与旧 sim 房间互不串扰（ALLOWED_ROOMS 收敛到各自房间）。
4. **运行时预置拷贝**（每实例 1.4G）而非共享：venv 运行期会写 `__pycache__`，共享树引入跨实例写竞争；磁盘 317G 充裕。bundled venv 缺 pytest，setup 时每实例 `pip install pytest`（默认清华镜像，`FLEET_PIP_INDEX_URL` 可覆盖）。
5. **场景与验收复用 sim 七步法**（RFD→分解→建卡→并行实现→集成验证→审批→发布），导演只扮演人类打字，一切以 central 裸仓「地面真值」验收；新增 fleet 独有断言（每实例独立进程/独立 DB/独立 userData/端口绑定）。

## 4. 目录与端口布局

```
/Volumes/nvme2230/lab/ncwk-fleet/
├── users/<u>/
│   ├── apps/SwarmStudio.app            # 独立应用副本
│   ├── home/                           # 实例 $HOME
│   │   ├── Library/Application Support/  # electron userData（自动）
│   │   ├── .hermes/                      # active_profile + profiles/<u>/{config.yaml,.env}
│   │   └── .hermes-web-ui/               # .token + desktop-runtime/…（预置）+ hermes-web-ui.db
│   └── workspace/stringops/            # central 裸仓的各用户检出
├── central/stringops.git               # 共享裸仓（地面真值）
├── creds/  logs/  pids/  evidence/  state.env
```

端口：studio 8762/8763/8764（alice/bob/carol），gateway 8782/8783/8784。避开真实实例 8748/8650 与旧 sim 870x/872x 段。

## 5. 脚本清单

| 脚本 | 职责 |
|---|---|
| `fleet-lib.sh` | 路径/端口/Matrix/Studio 公共库（自包含，不依赖 dev 树） |
| `fleet-setup.sh` | 幂等置备：app 副本、runtime+pytest、账号 token、房间、profile 配置、中央仓 |
| `fleet-up.sh [user...]` | 启动实例（等 studio ready + 网关 health） |
| `fleet-down.sh [user...]` | 网关优雅停 + 应用进程收尾 + 端口兜底清扫 |
| `fleet-scenario.sh` | 需求交付全流程七步（断点续跑 `START_STEP`） |
| `fleet-evidence.sh` | 验收门断言 + 证据导出 + run-report.md |

## 6. 验收门（evidence 断言清单）

1. 实例独立：三实例 `/health/ready` 各自 200；各自 `.app` 副本路径的进程 ≥1 且 server 子进程跑在**自身副本**的 Resources 下；三份 `hermes-web-ui.db` 独立存在；各实例 userData 落在沙箱 HOME 内。
2. 网关集群：三网关各自 `/health` 200。
3. 房间：成员 6（3 人类 + 3 agent），agent presence online。
4. 轨迹：RFD-001 / DECOMPOSE / IMPL-DONE-T1 / IMPL-DONE-T2 / VERIFY-PASS / APPROVED / SHIP-DONE 关键消息齐备。
5. 交付真值：central 有 feat/slugify、feat/truncate、tag v0.1、main 含 RELEASE.md；导演在 alice 工作区用**实例自带 venv** 复跑 pytest 全绿。
6. Kanban：T1/T2/T3 终态 done（alice 实例 API）。

## 7. 风险与对策

| 风险 | 对策 |
|---|---|
| macOS Electron userData 是否跟随 `$HOME` | 冒烟单实例先行验证；若不跟随，追加 `--user-data-dir` 启动参数（Electron 原生支持） |
| 三实例共享登录钥匙串 | AUTH_TOKEN 走 env、JWT 走各实例 localStorage，理论无冲突；冒烟观察，异常再隔离 |
| 后台会话起 GUI 应用缺 WindowServer 权限 | 直启二进制优先；失败改 `open -na <app> --env` 通道（macOS 13+ 支持 --env） |
| bundled venv 装 pytest 走外网失败 | `FLEET_PIP_INDEX_URL` 可换镜像；装不进则场景测试命令回落系统 python3 |
| 与旧 sim（alice 8701 仍活）互扰 | 端口/房间/凭据目录全分离；同账号双会话（旧 token 在旧房间）Matrix 语义允许 |
| LLM 回合不稳定 | 沿用 sim 对策：真值轮询 + `START_STEP` 断点续跑 + 不许谎报结论行 |

## 8. 使用（速查）

```bash
cd overlay/scripts/fleet
bash fleet-setup.sh                 # 置备（幂等，全量三用户）
bash fleet-up.sh                    # 三实例起（冒烟可 bash fleet-up.sh alice）
bash fleet-scenario.sh              # 七步交付全流程
bash fleet-evidence.sh              # 验收门 + 证据
bash fleet-down.sh                  # 收尾
```
