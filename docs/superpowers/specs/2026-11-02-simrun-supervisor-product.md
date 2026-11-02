# simrun 推演运行监督域——监督器落产品＋同类能力合一（进程监督单点化）

日期：2026-11-02 ｜ 类型：feat（产品 custom/server 新域）｜ 状态：implemented（run25 值守窗口批，用户令「监督器要落地到产品中＋整合同类产品能力」）

## 变更

### 背景（run25 实锤事故链）
裸跑驱动熔断退出后 34 分钟无人续跑（监督器是 harness 工具、无单入口、易漏挂）；
监督器/网关看护散在 harness 侧 bash 脚本，产品（studio）侧有卡面监督（clusterinspector）
与派发编排（pipeline-engine）但**进程监督层缺席**。

### 同类能力清单与归置（合一裁决）
| 能力 | 原位置 | 归置 |
|---|---|---|
| 驱动生命周期监督（死→断点续跑→report_done 止） | simharness `run-driver-supervisor.sh` | **本批并入产品** `custom/server/simrun/`（主通道）；bash 版保留为无 studio 通道时的 standalone 兜底 |
| 网关健康探测（:8801 health→重启） | simharness `mx-gateway-babysit.sh` | 本批并入为**监督面之二**：同 tick 采集＋事件落流；自动重启动作缺省关（`SIM_SUPERVISOR_GATEWAY_RESTART=1` 才接管——launchd 托管面重启权移交须单独验证），babysit 保留兜底 |
| agent 卡面监督催办 | 产品 `custom/server/clusterinspector/` | **不并入**：监督对象层不同（卡面/回合 vs 进程），已在产品侧；simrun 与其并列（未来消费其 stuck 信号） |
| 流水线派发编排 | 产品 `custom/server/pipeline/` | **不并入**：编排不是监督 |
| 网关回合自恢复 | 网关进程内（补丁 722/725） | **不并入**：进程内自愈不可外置 |

### 实装（MVP 边界）
1. `custom/server/simrun/supervisor.ts`——监督引擎（unref timer，30s tick）：
   - 启用门=OBS_SIM_ROOT 在位且 `SIM_SUPERVISOR≠off`（宿主 studio 不启用，SIM 专用）
   - adopt 语义：发现 run-progress.json 即认领在跑轮（不重复拉起）
   - 驱动死因环：进程探测（pid 文件+kill-0 语义）→ report_done 终态 → 证据指纹
     （scenario.log 证据行数＋integration tip＋main tip，与驱动/监督器三方同源判据）
     变化才重拉（spawn `aipay-scenario.sh`＋START_STEP=断点步，断点步=进度表
     doneSteps 的下一步，26 步序表随域内置）
   - 网关健康面：:8801/health 采集，3 连败记事件（缺省不重启，见上）
   - 事件流 JSONL 落 `$SIM_ROOT/logs/simrun-supervisor.jsonl`（产品/兜底双监督器可对账）
2. `custom/server/simrun/router.ts`——`GET /api/simrun/supervisor/status`（状态+最近事件）、
   `POST /api/simrun/supervisor/start`（{runId,startStep?}）、`POST /stop`（置停＋touch
   harness stop 文件让兜底监督器同步退场）
3. 挂载=补丁 727（上游 bootstrap/routes.ts import+startIfEnabled+routes，patch 582 同款）
4. 测试：tmpdir 夹具（假驱动/假 state.env/假 git 裸仓）断言 adopt/死亡重拉/证据门/
   report_done 终态/stop 语义

## 决策记录

- 产品重拉驱动=直接 spawn 驱动脚本（不经 bash 监督器）：产品即监督器，双层监督同一
  驱动会互踩；bash 监督器定位降级为「无产品通道兜底」（mx-run 显式选）。
- 证据门判据与 harness 双侧（`_mx_gate_evidence_sig`/监督器指纹）同源同构：
  scenario.log 行数＋itip＋mtip——三处一源防「产品复位而驱动不复位」的分裂。
- 网关重启动作缺省关：launchd KeepAlive 已是第一重启面，产品接管重启权＝移交流程，
  须先拿到「产品重启与 launchd 不互踩」的实测再开（MVP 只看见+落事件，诚实边界）。
- 单入口口径随批：`mux/mx-run.sh`（本日已落）在 studio 在线时提示产品通道可用；
  两通道互斥由 stop 文件+adopt 探测保证。

## 验证

- `npx vitest run custom/server/simrun/__tests__/supervisor.test.ts`（夹具五断言）
- `npm run typecheck:harness`（新服务端模块门）
- 活体（下一轮推演窗）：studio 重启后 /api/simrun/supervisor/status 报 adopt 态；
  驱动死亡→证据变化→产品重拉一轮（事件流留痕）。

## 设计文档影响

DESIGN_SYNC: touched——「全流程推演独立专区·运行监控/运行编排」能力面新增产品级进程
监督（监督器产品化＋同类合一归置表），随批同步整合正本对应节；本 spec 即裁决事实源。
