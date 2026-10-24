# 多用户 Matrix 协作交付模拟（ncwk-sim）设计

日期：2026-09-17
状态：已定稿（自主执行，依据 /goal 指令）
受众：需要复跑/扩展该模拟的本仓库开发者

## 0. 三句话主旨

在一台 mac 上模拟 3 名成员各自在"独立电脑"部署 Hermes agent 集群 + SwarmStudio，经本机 Synapse 协作完成一次真实的小项目需求交付（需求 → 分解 → 并行实现 → 集成验证 → 审批发布）。模拟的"独立电脑"由环境变量隔离的数据根 + 独立端口组实现，不依赖虚拟机。全部协作用真实进程跑（真实 Matrix 协议、真实 LLM agent、真实 git），导演脚本只扮演"人类打字"。

## 1. 目标与非目标

目标：
1. 3 个 Studio 实例 + 3 个 gateway 集群同机共存，互不串数据。
2. 跨用户协作走 Matrix 房间：人类发言 + 各集群 agent bot 被 mention 后真实执行任务。
3. 走完需求交付全流程并留全量证据（房间消息、git 图谱、kanban 快照）。

非目标：
- 不验证 Loop Graph / Daily Brief / team-approval 全量机制（凭据链已兼容，留作后续场景）。
- 不做 E2EE、联邦、多 homeserver。
- 不修改 upstream 产品代码；如模拟暴露产品缺陷，记录不就地修。

## 2. 拓扑

### 2.1 共享层

| 组件 | 说明 |
|------|------|
| Synapse | 已运行容器 `matrix-synapse`，:8008，server_name=`matrix.test`，开放注册 |
| 中央仓库 | `$SIM/central/stringops.git`（bare，模拟公司远端 Git） |
| 项目房间 | private room，6 成员：`@alice/@bob/@carol`（人类）+ `@<u>-agent`（各自 gateway 的 Matrix 平台 bot） |

### 2.2 每用户"电脑"（u ∈ alice/bob/carol，i = 1/2/3）

| 项 | 值 |
|----|----|
| 数据根 | `$SIM/users/<u>/` |
| HERMES_HOME | `$SIM/users/<u>/.hermes`（active_profile=`<u>`；root `.env`=API_SERVER_KEY；`profiles/<u>/.env`=MATRIX 五件套——镜像真机 `~/.hermes` 布局） |
| Studio 后端 | 生产构建 `upstream/hermes-studio/dist/server/index.js`，`PORT=870i`，`HERMES_WEB_UI_HOME=$SIM/users/<u>/webui` |
| Gateway | hermes v0.21.3（`~/.hermes/hermes-agent/venv/bin/hermes`），由 Studio autostart 拉起，api_server 端口 `872i`（写入该用户 config.yaml） |
| 浏览器 UI | `http://127.0.0.1:870i`（后端伺服 dist/client；首登 admin/123456） |
| 工作区 | `$SIM/users/<u>/workspace/stringops`（central 的独立 clone，模拟各自电脑上的检出） |

数据目录 `$SIM = /Volumes/nvme2230/lab/ncwk-sim`（仓库外，避免污染 ncwk）。

### 2.3 关键机制锚点

- 实例隔离：`HERMES_HOME`（agent 数据根，`detectHermesHome` 最高优先级）、`HERMES_WEB_UI_HOME`（Studio SQLite）、`PORT`、`HERMES_AGENT_HEALTH_URL`（后端 /agent-health 代理目标）、`HERMES_BIN`。锚点：`upstream/hermes-studio/packages/server/src/modules/hermes/services/runtime/path.ts:22`、`modules/studio/public/config.ts:56`、`bootstrap/http.ts:575`。
- agent 接入 Matrix：gateway 平台插件 `plugins/platforms/matrix/adapter.py`，凭据 = profile `.env` 的 `MATRIX_HOMESERVER/ACCESS_TOKEN/USER_ID`；mention 触发（`MATRIX_REQUIRE_MENTION` 默认 true）。
- kanban 触发器污染教训（共享 SQLite UDF）：各用户独立 `HERMES_HOME` 天然规避，严禁把 sim gateway 指向 `~/.hermes`。

## 3. 需求交付场景（stringops v0.1）

产品：Python 包 `stringops`，交付 `slugify()` + `truncate()` + pytest 全绿 + tag `v0.1` + `RELEASE.md`。
角色：alice=产品/集成负责人；bob=工程 A（slugify）；carol=工程 B（truncate）。

| 步 | 动作 | 执行者 |
|----|------|--------|
| 1 | 房间发布需求 RFD | alice（导演以其 Matrix 身份发消息） |
| 2 | mention @alice-agent 分解任务契约 T1/T2/T3 | alice-agent（真实 LLM） |
| 3 | alice Studio kanban 建 3 卡 | 导演调 alice Studio REST |
| 4 | bob/carol 各自 mention 本集群 agent：在各自 workspace 分支实现+测试+push | bob-agent、carol-agent 并行 |
| 5 | 完成回报（房间 DONE + 分支名），卡片流转 | agent + 导演 |
| 6 | mention @alice-agent：fetch 两分支、合并、在 alice workspace 跑 pytest、结果发房间 | alice-agent |
| 7 | alice 发审批 `APPROVED: ship v0.1`；mention @alice-agent 打 tag + 写 RELEASE.md + push | 人类 + alice-agent |
| 8 | 取证导出 | 导演脚本 |

导演脚本 = 人类行为模拟器：用各人类账号的 Matrix 凭据发消息；对 agent 的每次 mention 轮询房间 timeline 等回复（单次超时 10 分钟，失败重试 1 次后如实记录失败）。

## 4. Harness 组成

落点 `overlay/scripts/sim/`（feat 分支开发，验证后合 overlay main）：

| 文件 | 职责 |
|------|------|
| `sim-lib.sh` | 公共库：synapse 管理操作（注册/登录/建房/邀请/token）、用户表、端口表、curl 封装 |
| `sim-setup.sh` | 注册 6 个 Matrix 账号、建房邀请、生成 `$SIM` 目录树（config.yaml/.env/active_profile）、初始化 central bare 仓 + 基线提交 |
| `sim-up.sh` / `sim-down.sh` | 拉起/停止 3 组 Studio 后端（gateway 由 Studio autostart）；健康检查 |
| `sim-scenario.sh` | 第 3 节全流程编排 + 超时重试 |
| `sim-evidence.sh` | 导出房间消息、git 图谱、kanban、gateway/studio 健康 → `$SIM/evidence/` + 断言验收门 |

构建前提：`upstream/hermes-studio/dist` 为当前注入态的产物（若 dist 早于 overlay main HEAD 则先 `npm run build:full`）。

## 5. 验收门（sim-evidence 断言，全过才算跑通）

1. 三 Studio `/api/health` 200，各自 webui DB 独立存在。
2. 三 gateway `:872i/health` 200；房间成员 6 个；3 个 agent bot presence online。
3. 房间 timeline 覆盖 8 步关键消息，sender 真实含人类与 agent。
4. central：2 个 feature 分支 + main 合并 + tag v0.1；alice workspace pytest 退出码 0。
5. kanban 3 卡终态 DONE。
6. `$SIM/evidence/` 含 messages.json / git-log.txt / kanban.json / run-report.md。

## 6. 风险与对策

| 风险 | 对策 |
|------|------|
| gateway 全新 home 首启 bootstrap 慢/失败 | 先 alice 单用户冒烟再全量 |
| LLM provider 并发不稳（custom:cc-switch） | bob/carol 并行试跑；不稳则降级串行 |
| dist 过期 | 构建时间戳 vs overlay main HEAD 比对，旧则重建 |
| 端口冲突（遗留 8647 栈、桌面版 8650） | 全部用 870x-872x 段；不动遗留进程 |
| agent 回合失败 | 导演脚本超时+重试；二次失败记录现场继续后续步骤，不伪造成功 |

## 7. 清理

- 导演注册的 Matrix 探针账号（probe_exists）在收尾 deactivate。
- `$SIM` 保留供复查；提供 `sim-down.sh` 全停。
