# Matrix Fleet · 独立桌面应用多用户协作交付 · 运行报告

- 日期：2026-09-18
- 对象：`scripts/fleet/` 部署工具包 + 3 个独立 SwarmStudio 应用实例
- 设计文档：`specs/2026-09-18-matrix-fleet-deploy-design.md`

## 0. 结论先行

**验收门 45/45 全绿。** 三名用户（alice/bob/carol）各持一份独立安装的 `SwarmStudio.app` 副本与独立 HOME 沙箱，仅预置 Matrix 账号与 access token，在本机模拟「三台电脑」完成 stringops v0.1 需求交付全流程：RFD → 任务分解 → kanban 建卡 → 并行实现 → 集成验证 → 人类审批 → 发布（tag v0.1 + RELEASE.md）。全程 119 条房间消息（agent 109 / 人类 10），一切以 central 裸仓地面真值验收。

与 09-17 sim（dev 树 server + 浏览器，35/35）相比，本轮验证的是**部署形态**：应用副本独立进程、独立 userData、独立状态库、自带工具链。

## 1. 环境与形态

| 维度 | 取值 |
|---|---|
| 应用 | `/Volumes/nvme2230/lab/ncwk-fleet/users/<u>/apps/SwarmStudio.app` ×3（源：本机 2.27 构建 0.7.22） |
| 每实例隔离 | `--user-data-dir` 沙箱内独立 userData；独立 `.hermes`（网关 profile + matrix 凭据）；独立 `.hermes-web-ui`（状态库 + 预置 1.4G runtime） |
| 端口 | studio 8762/8763/8764，gateway 8782/8783/8784（真实实例 8748/8650 无扰共存） |
| Matrix | 本机 Synapse（matrix.test），fleet 房间 `!GQpmjxHwvzUSFRSTtl`，6 账号新会话（与旧 sim 房间零串扰） |
| 工具链 | 每实例 venv 自装 pytest（清华镜像）；导演复跑用 alice 实例 venv |

## 2. 验收结果（45/45）

1. **实例独立（16 项）**：三实例 `/health/ready` 200；pgrep 各自 `.app` 副本路径进程存活；server 子进程由**自身副本**的 Resources 承载；userData 落沙箱；三份 `hermes-web-ui.db` inode 全不同。
2. **网关集群（9 项）**：三网关 `/health` 200；房间成员 6；三 agent presence online。
3. **协作轨迹（7 项）**：RFD-001 / T1 / IMPL-DONE-T1 / IMPL-DONE-T2 / VERIFY-PASS / APPROVED / SHIP-DONE 关键消息齐备。
4. **交付真值（5 项）**：tag v0.1、feat/slugify、feat/truncate、main 含 RELEASE.md、导演在 alice 工作区用**实例自带 venv** 复跑 pytest 全绿。
5. **Kanban（3 项）**：T1/T2/T3 终态 done（alice 实例 API）。
6. **证据文件（4 项）**：messages.json / git-log.txt / kanban.json / scenario.log 非空。

证据目录：`/Volumes/nvme2230/lab/ncwk-fleet/evidence/`（run-report.md、pytest.txt、git-tags.txt 等）。

## 3. 过程亮点（agent 真实工程行为）

- **bob-agent 交付 T1 后自沉淀技能**：完成后触发 Self-improvement review，创建 `fleet-task-delivery` 技能——agent 运行时的自我改进机制在分布式形态下正常工作。
- **代理故障韧性**：三 agent 并发触发共享模型代理限速/空流时，agent 按设计走 fallback 链并如实报「Provider returned an empty response stream」，失败不谎报结论行。
- **carol-agent 断点续作**：网关中断重启后从房间同步捡回任务，在半成品分支上接着完成 T2 并推送。

## 4. 事故与处置（如实记录，不影响验收结论）

| 事故 | 现象 | 根因 | 处置 |
|---|---|---|---|
| 单实例锁秒退 | 首启 `quitApp reason=tray` 即退 | macOS 上 HOME 覆盖不迁移 Electron userData，锁与真实实例共键 | `--user-data-dir` 指进沙箱，固化进 fleet-up |
| 应用被外部退出 ×2 | bob/carol（12:4x）、三实例（13:3x）干净退出，`before-quit isQuitting=false`，无崩溃报告 | 桌面弹窗被人工 Cmd+Q（外部 AppleEvent 退出，非产品路径） | `FLEET_HIDDEN=1`（`--hidden`，托盘保留）隐藏启动后未再复发 |
| 模型代理限速风暴 | 两 agent「empty response stream ×3」后静默 19 分钟 | 三 agent 并发打满共享 cc-switch 代理限速；失败回合不会自愈 | 探明代理恢复后错峰补派 mention；场景真值轮询 + `START_STEP=verify` 断点续跑 |
| bash3.2 多字节变量名 | `$APP（` 被并入变量名致 unbound | 老坑复发（sim 轮已知） | 全角标点前统一 `${VAR}` 花括号 |

## 5. 复跑与扩展

```bash
cd overlay/scripts/fleet
bash fleet-down.sh && rm -rf /Volumes/nvme2230/lab/ncwk-fleet   # 全新重置（可选）
bash fleet-setup.sh && FLEET_HIDDEN=1 bash fleet-up.sh          # 置备 + 隐藏拉起
bash fleet-scenario.sh && bash fleet-evidence.sh                # 全流程 + 验收门
```

- 断点续跑：`START_STEP=<rfd|decompose|cards|impl|verify|approve|ship> bash fleet-scenario.sh`。
- 增加用户：fleet-lib 的 `USERS` 数组 + 端口基线各加一项，重跑 setup/up 即可（账号、房间、沙箱全自动）。
- 换一台真电脑：安装 SwarmStudio → 沙箱同构目录 → 仅需 matrix homeserver/账号/token 三项配置即可入房协作（本轮已证明不依赖 dev 树与共享 agent 安装）。

## 6. 遗留状态

- 三实例现以隐藏模式**在跑**（托盘可见）；停止用 `bash fleet-down.sh`。
- 旧 sim（ncwk-sim，8701 alice 实例）未动，与 fleet 并存。
- 模型代理并发限流是环境瓶颈：多实例长跑建议错峰派发任务（本轮实测 3 agent 同时开工可触发限速）。
