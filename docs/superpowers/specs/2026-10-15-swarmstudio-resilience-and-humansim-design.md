# SwarmStudio 韧性与人类模拟通道产品方案（PR-1~PR-7）

> **文档定位**：2026-10-15 推演治理轮（方案 V8.29 §2.6.5 代偿清偿门）的产品侧正本。每笔代偿对应一个产品缺陷（PR-N），清偿判据=本方案条款在 overlay 落码合入 main（带 commit 锚）。与推演方案互引：代偿台账 `evidence/compensation-ledger.tsv` 的 defect 列指向本文件 PR 编号。
> **裁定来源**：用户 2026-10-15 三次质疑复盘+当日裁定（代偿在下一轮推演开跑前必须根治后合入 SwarmStudio 产品能力；标准姿态为缺省）。
> **边界**：upstream 只读，全部落码走 overlay（custom 组件+patches）；本文档只立条款与验收锚，不写实现。

## 一、四个运行韧性缺陷（代偿的直接病灶）

### PR-1 网关派发器卡死自监护

- **问题**：ready 卡滞留数小时零孵化（run12 实录 3h，run19 复现），根因至今未明；推演哨兵被迫用 CLI `kanban dispatch` 绕网关直派（代偿型 gw-dispatch-bypass，八轮在账）。
- **产品条款**：①派发队列指标暴露——`GET /api/hermes/dispatcher/health` 返回 ready 深度/最老卡龄/最近孵化时刻/连续失败计数；②卡死自检——最老 ready 卡龄超阈值（缺省 900s，env 可调）自动重入队或重建 worker，动作留痕；③studio 运行中心（/app/runs）呈现派发健康卡。根因排查用①的数据面开展——先让病可见，再谈根治。
- **验收锚**：健康端点实测输出+运行中心帧+一轮无 gw-dispatch-bypass 代偿记录。
- **落点**：hermes-agent 网关（overlay patch）+ studio client/cockpit。

### PR-2 审批通道与驱动生命周期解耦

- **问题**：驱动缺席期待批令 5 分钟无人应答即被拒（run16 fanfan/qi 两笔实锤），修复链在权限门口饿死；approval-proxy 代批环因此常驻（代偿型 auto-approve）。
- **产品条款**：①服务端审批队列持久化（现有 server/approvals 基础上），审批请求不随任一会话退出而失效；②TTL 策略可配：超时动作=重试提醒/升级（@主管+收件箱红点），缺省不再静默拒绝；③审批收件箱（/app/inbox）刷新与队列同源。
- **验收锚**：驱动全退场后注入待批令，队列在案且收件箱可见；TTL 到期走升级而非拒绝的端到端帧。
- **落点**：hermes-agent 审批路由（patch）+ overlay custom/server/approvals 扩展。

### PR-3 agent 收工休眠状态机产品化

- **问题**：Turn ended 后群消息只触发 reaction 假活跃（run14 第七形态；run19 五发主管指令全失效；run20 隔夜停滞），真做判据可识别但无产品级唤醒通道；哨兵群提醒与 idle-nudge 均为代偿（sleep-wakeup/nudge）。
- **产品条款**：①休眠状态机三态 sleeping→nudged→escalated，@提及带真做判据校验（非 reaction 计数）；②profile 状态暴露（state.db/指标端点），studio 后台条可见「谁在休眠」；③升级态动作可配（重建会话/通知主管）。
- **验收锚**：注入休眠后 @唤醒真做恢复的端到端记录+后台条帧+一轮无 sleep-wakeup/nudge 代偿。
- **落点**：hermes-agent 运行时（patch）+ studio 后台条。

### PR-4 kanban 写路径启动自检

- **问题**：判词进群不进卡（run14 G5 根因=kanban_write_sanctioned 未注册）；驱动补卡/代走 done 为代偿（card-backfill/card-walk-done）。
- **产品条款**：①网关/CLI 启动时校验 sanctioned 写函数注册表完整性，缺项 fail-fast（带缺失清单）；②写路径自测探针（启动后发一次无害写读回环）。
- **验收锚**：故意摘除注册项的启动失败输出+正常启动探针通过记录。
- **落点**：hermes-agent（patch，与 run14 修复回查同源）。

## 二、三个结构性缺口（治理轮新识别）

### PR-5 闸死锁处置通道

- **问题**：闸 FAIL 且派修链断裂时整轮死锁（run20 G2 悬置 75 分钟，人工回滚 7 组闸键重放=最重代偿 gate-replay）。
- **产品条款**：①闸 FAIL→派修单→复审 PASS 的状态机进产品（boards/闸卡流），悬置超时自动升级提醒（复用 PR-2 升级通道）；②闸键写入只认组织侧判词（V8.29 §2.6.5 闸键语义补则），外部回放需 super_admin 审计口。
- **验收锚**：一次 FAIL→派修→复审→放行的全产品内完整循环记录（零脚本回放）。

### PR-6 集成合并流水线面

- **问题**：步 16b 集成合并由驱动代做（driver-merge）——产品无 CI/合并流水线。
- **产品条款**：studio 提供受控合并执行面：`POST /api/hermes/pipeline/merge`（参数=分支集/目标/策略），执行带 precheck 钩子+日志留痕；运行中心呈现合并历史。严格姿态下驱动只调此面不做 git。
- **验收锚**：端点完成一次真实合并的留痕+运行中心帧+一轮无 driver-merge 代偿。

### PR-7 自组织支撑（PM 自主派发）

- **问题**：派发词/拆分/人日全部脚本预写（dispatch-preset，单轮 40+ 笔），fanfan-agent 的规划派发能力从未被考。
- **产品条款**：①pm-planning 技能产品化闭环（输入=G1 冻结单，输出=结构化任务卡集，挂 /app/eng 编排面）；②autosched（已有 server 组件）与排期步对接——排期产物由产品生成而非脚本；③任务纪律模板库（纪律条款作为可引用模板注入派发词，agent 自选）。
- **验收锚**：一轮 strict 姿态中 fanfan-agent 自主完成拆分派发（零 dispatch-preset）+编排面帧。

### PR-0（附）人类模拟通道与可观测性（推演程序合规基建）

- **问题**：推演程序模拟人类角色需直调 synapse API（curl+token 散落 14 处）；监测靠翻日志文件。
- **产品条款**：①humansim 通道：`POST /api/hermes/humansim/send`（as/room/body/kind），以人类账号通道代发并全量审计留痕（audit log）——P1 边界原则的产品化落点；②可观测性端点：`GET /api/hermes/observability/run-state`（读 state.env/代偿台账/健康面，SIM_ROOT 走 env 配置）——mx-state-query.sh 的远期替代。
- **验收锚**：humansim 发送+审计记录实测；observability 返回 posture/闸态/台账摘要 JSON。
- **落点**：overlay custom/server/humansim + observability（B 类 patch 挂载 bootstrap/routes.ts，同 402 模式；**挂载待部署窗口**——run20 在跑期间禁 inject）。

## 三、产品能力×推演面对照（采集与产出物挂钩点）

产品功能面（/app 路由与 server 组件实存清单）→ 推演消费点：

| 产品面 | 路由/组件 | 推演采集位 | 产出物挂钩 |
|---|---|---|---|
| 看板（12 页签） | /app/board | 既有 13 步拍摄位 | 任务卡/追溯/交付健康帧（既有） |
| 审批收件箱 | /app/inbox | **新增**：G1 冻结步+G5 批准步各一帧 | 审批留痕（approved.events 同源） |
| 运行中心 | /app/runs(/:id) | **新增**：开跑帧+report 帧 | runs 注册表产物 |
| 交付案例 | /app/cases | **新增**：deliver_gate 步帧 | delivery-contract 案例投影 |
| 编排（autosched） | /app/eng | **新增**：plan_done 步帧 | 排期产物（PR-7 后产品生成） |
| 治理中心 | /app/board?tab=gov-* | 既有（gov-registry/gov-harness 等） | 治理报告/六域体检 |
| BPA 工作台 | /app/bpa | **新增**：analysis_done 步帧 | 流程分级清单 |
| 本体工作台 | /app/ontology | 既有锚+**新增**全量轮一帧 | 语义契约快照 |
| 评测工作台 | /app/eval | 既有锚 | 评测报告 |
| 技能治理 | /app/skillgov | 既有锚 | 装载面扫描账本 |
| 会话历史 | /app/history(/session) | **新增**：anexec 步一帧（会话证据面） | 会话轨迹锚 |
| 群沟通直达链接 | /app/s/room/:id | **三态 none**（采集环境同步未修，事件锚 ?event= 未实现——产品缺口另记） | matrix event_id 锚（文字锚替代） |
| 派发健康（PR-1 后） | /app/runs 健康卡 | **预留**：defect 段帧 | 健康端点输出 |
| 审批队列（PR-2 后） | /app/inbox 队列态 | **预留**：修复链段帧 | 队列 TTL 轨迹 |

## 四、清偿门执行口径

resolve 判据=对应 PR 条款在 overlay 落码合入 main（commit 锚写进 resolution 字段）；「记了单」「方案在纸面」不算。waive 须用户批准理由。机械执法=mx-prelaunch-check.sh ⑯（read check-clearance）。
