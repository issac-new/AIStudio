# Swarm Studio 全流程推演 V2.0 运行手册（单 gateway 多路复用拓扑）

写给：推演导演与验收方。本文是 V2 拓扑下 20 步全流程推演的**唯一执行手册**，与已迁移的 `overlay/scripts/aipay/aipay-scenario.sh`（步骤 1-11）和 `aipay-scenario2.sh`（步骤 12-20）逐一对账；拓扑依据与可行性论证见 `2026-09-24-multiplex-multiuser-feasibility-and-plan-v2.md`（取代 V1 设计文档 §4/§7 的拓扑口径）。

日期：2026-09-25　状态：P0/P1 已落地实测，P2（全流程重跑）人工驱动执行

## 1. 拓扑总览

一个 gateway、一个 studio、24 个 matrix 账号模拟分布式多用户集群：

| 维度 | V2 形态 |
|---|---|
| gateway | **1 个多路复用**（:8801，服务 root 下全部 profile，无 `--force`，隔离锁目录与真机 :8650 共存） |
| studio | **1 个多账号**（:8802，matrix-login 换 JWT，ACL 只见本账号档案与任务） |
| 用户定义 | **matrix 账号 + 账号下多块独立 kanban + 各 kanban 的 agent teams**（无"机器"概念） |
| profile | 33 个 = 11 Orchestrator（仅账号+配置独立）+ 22 研发专职 agent（`<user>-<agent-id>` 模板同构） |
| kanban | 每账号 2 块独立板（一板一库），board.json `profiles` 键挂 team 认领围栏；`default` 板零任务作串板哨兵 |
| matrix 账号 | 24 个（12 人类 + 12 `-agent` 机器人），密码 `Aipay_<账号>_2026` |
| 数据根 | `SIM_ROOT=/Volumes/nvme2230/lab/ncwk-sim-mux`（hermes root=`$SIM_ROOT/hermes`） |

## 2. 编制表（账号 × 板 × agent teams）

| 账号（角色） | 板 1（team） | 板 2（team） |
|---|---|---|
| admin（主管，不起实例） | — | — |
| bella（BA） | bella-req-intake（bella-requirements-analyst） | bella-req-analysis（bella-researcher） |
| fanfan（PM） | fanfan-pm-plan（fanfan-sys-analyst） | fanfan-review（fanfan-researcher） |
| wei（支付后端 lead） | wei-pay-core（wei-lead-reviewer） | wei-pay-review（wei-researcher） |
| mei（前端 lead） | mei-cashier-mp（mei-lead-reviewer） | mei-cashier-review（mei-researcher） |
| chen（研发） | chen-pay-core（chen-csw-pay-core） | chen-pay-api（chen-researcher） |
| hu（研发） | hu-channel-wechat（hu-csw-channel-wechat） | hu-channel-test（hu-researcher） |
| lin（研发） | lin-channel-alipay（lin-csw-channel-alipay） | lin-channel-test（lin-researcher） |
| xiao（研发） | xiao-cashier-mp（xiao-csw-cashier-mp） | xiao-cashier-ui（xiao-researcher） |
| qi（测试） | qi-test-pay（qi-tester） | qi-test-integration（qi-researcher） |
| fei（测试） | fei-test-mp（fei-tester） | fei-test-ui（fei-researcher） |
| arch（架构治理） | arch-governance（arch-governance-reviewer） | arch-review（arch-researcher） |

agent profile 名即 `<账号>-<agent-id>`；卡片 assignee 只能是板围栏内的 team 成员（板外认领被拒、卡片滞留 ready 可观测）。账号工作区：`$SIM_ROOT/workspaces/<账号>/aipaydev`（中央仓 issac-new/aipaydev 每账号一棵工作树）。

### 2.1 hindsight 家族共享记忆（用户裁决 2026-09-25）

**同一 matrix 用户名下的全部 kanban 及各 kanban 的 agent teams 共享一个 hindsight 记忆仓库**；仓库按"**用户名 + MAC 地址**"区分：

- `bank_id = hermes-<mac12>-<用户名>`——与宿主既有约定 `hermes-b24d7ac5d9c4-aiteam` 同构。
- mac12：本机模拟取**由用户名确定性派生的 12 位伪 MAC**（跨轮稳定，`AIPAY_USER_MAC` 可统一覆盖）；真机部署取宿主网卡 MAC（同用户不同机器天然分仓）。
- 模式 `local_external`，共享宿主 hindsight 服务（:8888，`MX_HINDSIGHT_API` 可覆盖）；recall 档位对齐宿主（hybrid / observation,world,experience / 4096 tokens）。
- 落点：家族内全部 profile（orchestrator + 研发专职 agents）的 `<home>/hindsight/config.json` 落同一 bank_id + `config.yaml` 激活 `memory.provider: hindsight`；kanban 本身无记忆，共享语义由"家族同 bank"达成。
- 改配置后需重启 gateway 生效；`mx-setup` 前置检查 hindsight 服务健康，缺服务即 fail（不静默降级）。

> C1 口径（用户裁决 2026-09-25）：专职 agent **每账号一套**（本表口径）；flow-review 文档原 `csw-<app>-dev` 共享命名口径已注记废止。人 agent 仍是 team leader 入口。

## 3. 运行手册

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay

bash scripts/aipay/mux/mx-setup.sh        # 幂等准备：24 账号、33 profile、22 板+team 围栏、
                                           #   fleet-manifest、技能同构副本、运行时 patch 390/391 部署
bash scripts/aipay/mux/mx-up.sh            # 单 gateway(:8801) + 单 studio(:8802)，无 --force
bash scripts/aipay/mux/mx-smoke.sh         # G1-G5 门禁取证（拓扑验收，非推演必跑）

# 全流程推演（P2，人工驱动）
bash scripts/aipay/aipay-scenario.sh       # 步骤 1-11，下半场自动 exec aipay-scenario2.sh
```

控制旋钮：

| 变量 | 语义 |
|---|---|
| `RUN_ID=<轮次>` | state/evidence 按轮分家（`$SIM_ROOT/runs/<轮次>/`），防"假完成"复用旧闸门 |
| `START_STEP=<步>` | 断点续跑（步骤名见 §5；`REDISPATCH=1` 强制重发步骤 8 派单） |
| `UNTIL_STEP=<步>` | 区间上界（如 `UNTIL_STEP=smoke` 只实跑步骤 1-5） |
| `RFD_ID/RFD_SLUG` | 需求参数化（缺省 RFD-001 收银台；RFD-002 退款分账；RFD-003 对账字段与凭证 OCR——需求书 `materials/RFD-003-ocr.md`，OCR 双路验证脚本 `aipay-ocr-verify.sh`） |

开局即做模型通道预检（11 账号实探 `/v1/chat/completions`，quota/auth/unreachable/noreply 如实报，不把额度耗尽记成产品缺陷）；`UNTIL_STEP=smoke` 的步骤 1-5 冒烟不消耗 LLM 回合，免预检。停机用 `mx-down.sh`（只管 :8801/:8802，不碰真机 :8650）。

## 4. 验收门禁（mx-smoke，G1-G5）

| 门 | 断言 | 实测基线 |
|---|---|---|
| G1 路由 | 24 账号 whoami；双用户 DM 往返（A 账号发消息只有 A 的 profile 响应，异 profile state.db 零触碰） | 2026-09-24 全绿 |
| G2 板隔离 | 钉板（不带 board= 落本账号板，patch 390）；default 板零任务哨兵；matrix-login role=admin 且档案 ACL 双向不可见（patch 392）；任务按请求账号过滤 | 2026-09-24 全绿 |
| G3 team 围栏 | 板外 assignee 拒认领（patch 391，status 滞留 ready、零 task_runs） | 2026-09-24 全绿 |
| G4 派发执行 | 板内 team agent 实派生执行到 done（task_runs.profile=team 成员） | 2026-09-24 全绿 |
| G5 共存 | gateway 无 --force；真机 :8650 起止健康 | 2026-09-24 全绿 |
| G6 家族记忆 | 11 家族各一 bank（用户名+MAC）、成员共享、provider 全激活、hindsight 服务健康 | 本轮新增 |

## 5. 二十步全流程（V2 口径完整版）

导演只扮演"人类打字/点击"与核验地面真值；一切 agent 动作都是真实 gateway+LLM 回合。步骤名即 `START_STEP`/`UNTIL_STEP` 合法值。

**步骤 1-5　smoke（账号 / 配置 / 登录 / 功能就绪 / profiles）**
24 账号 token whoami 全通 → 单 gateway(:8801)/单 studio(:8802) 健康 → 11 账号 matrix-login 换 JWT + 账号板 kanban 可达 + **自动登录链路端点 `/api/matrix/gateway-credentials` 按契约应答（登录×2 模式之二，C2 修复 384；V2 下 `configured:false` 为预期常态——单 studio 多账号 root 无 matrix 凭据，客户端回落账号 matrix-login）** → profiles 清单与每板 team 围栏装载核对（board.json 含 `profiles` 键）。真值行：`步骤 1-5 全部完成 ✓`。

**步骤 6　ba（BA 需求分发）**
bella 把 `RFD_DOC` 提交 aipaydev `docs/requirements/` 并推送（email 通道禁用）；DM fanfan 送达需求（仓库地址 + 一行概述）。

**步骤 7　room（建群）**
fanfan 建「支付收银台需求分析讨论群」，邀 fanfan-agent 入群。

**步骤 8　dispatch（需求派发给 Orchestrator）**
fanfan @fanfan-agent 派发：加载 requirements-analyst 技能做系统分析（登记协作 kanban → 文档要素评估 → 三清单匹配 → SMART 拆分 → RACI 派发）；**建主卡与派发子卡必须填结构化 raci 字段（--raci JSON 四元组，B1 链），派发契约不再只写正文**。结论行必须带双凭证：`ANALYSIS-DONE-<RFD> commit=<commitId> card=<主卡ID>` 或 `ANALYSIS-BLOCKED-...`；**card 必须能在 fanfan 账号的板（账号板）可查**，无凭证一律视为未完成。

**步骤 9　register（kanban 登记）**
等真值：fanfan 账号板出现 RFD 任务卡（900s）。超时不退出——回灌拒收（"@fanfan-agent 你账号的板查无 RFD 卡，补登记后重报凭证"）再等 900s；二轮仍缺记问题单并中止。

**步骤 10　analysis（系统分析 + RACI 派发）**
① 等仓库出现 `docs/analysis/<RFD>-tasklist.md`（2400s，**硬失败**——tasklist 是后续派发的唯一依据）；② `verify_done_evidence` 反向核验：commit 真在 aipaydev origin 且含分析稿、card 真在 fanfan 账号板（600s，不过则回灌要求用真实卡 ID 重报，再等 900s）；③ 四组 RACI 派发消息核验（@chen-agent+@wei-agent、@hu+@wei、@lin+@wei、@xiao+@mei，各 1200s，观察项）；④ **主卡结构化 raci 观察项**（带 raci 列 ✓；未填记 `raci-not-structured` 问题单，不阻断）；⑤ 8 位关联人（chen/hu/lin/xiao/wei/mei/qi/fei）自动进群核验——未邀则导演补邀并记 `room-invite-gap` 问题单。

**步骤 11　triage（分诊登记 + lead 确认）**
chen/hu/lin/xiao 各自**账号板**出现 RFD 任务卡（各 1800s，缺失记问题单）；导演代 lead wei/mei 在各自账号板把卡 triage→todo。

**步骤 12　anexec（四路系分执行，错峰 2+2）**
派 AN-PAYCORE(chen)/AN-MP(xiao)/AN-CHWX(hu)/AN-CHALI(lin)：在账号工作区建 worktree、读 tasklist 与架构文档、产出 `AN-*-analysis.md`（确认结论/待澄清/概设方案含接口签名+数据模型+错误码+幂等键/依赖/风险/工作量人日）、提交推送 origin main、群内发【完成回执】（双兜底 @lead-agent 与 @fanfan-agent）。真值：四份分析稿入库（各 3600s）+ 四条完成回执房间可见。

**步骤 13　review（汇总复核 + 线下评审）**
fanfan-agent 汇总复核：读四份 AN-*.md、消歧（金额一律「分」int64、字段 snake_case）、产出概设 `docs/design/<RFD>-architecture-design.md` 入库（2400s）、**账号板登记评审卡**（标题含 `<RFD>-评审`，status=review）。线下评审（虚拟架构小组）通过后评审卡走 done；未登记则导演补登并记问题单。

**步骤 14　close（主任务归档）**
fanfan-agent 收尾：全部关联子任务与过程档案汇总进主卡 body、主卡置 done（1200s；测试工作量按 0.3 系数叠加口径写入）。

**步骤 15　plan（排期）**
fanfan-agent 加载 pm-planning：产出 `docs/plan/<RFD>-schedule.md`（任务表：ID/模块/责任人/类型/工作量/时间窗口/依赖 + 里程碑；测试=开发×0.3 独立任务；整体 +15% 缓冲；任务 ID 固定 DEV-PAYCORE/DEV-CHWX/DEV-CHALI/DEV-MP、TEST-BE/TEST-FE）入库（2400s），账号板建排期父卡+子卡 link（**子卡填结构化 raci，responsible=对应账号 agent**），逐条 matrix 派发（@责任人-agent + @lead-agent）。

**步骤 16　devimpl（真实编码，错峰）**
后端核心先行：chen 实现 csw-pay-core（幂等下单、状态机 INIT→PAYING→SUCCESS/FAILED/CLOSED、查单/关单/回调验签幂等，金额单位分 int64，vitest ≥8 用例）推 `feat/DEV-PAYCORE`（3600s 分支真值）；随后 hu/lin 基于 pay-core 契约实现双渠道 ChannelAdapter（V3 jsapi / my.tradePay，渠道 HTTP 一律 mock，各 ≥6 用例）、xiao 实现收银台小程序（双端目录、15 分钟倒计时、结果三态、失败重试不重复下单，≥6 用例），各推分支（3600s）。结论行 `DEV-DONE-*`。

**步骤 16b　defect（集成 + 测试执行 + 缺陷闭环）**
导演把四条开发支合入 `integration/<RFD>` 并推送；qi/fei 分别执行 TEST-BE（接口/集成测试：下单幂等、双渠道调起、验签拒绝、重复回调、超时关单）/TEST-FE（收银台逻辑层），缺陷走 defect-loop 技能群内发【缺陷】@研发-agent。缺陷观测窗 5400s：只认**派发时间戳之后**的消息（防历史残留假完成），【缺陷】与 FIX-DONE 计数闭合 + 双测试结论（TEST-PASS/FAIL-BE、FE）齐出即过；零缺陷轮如实记录。

**步骤 17　testpass（测试报告）**
qi 出 `docs/test/<RFD>-test-report.md`（范围/用例数/通过数/缺陷清单/结论/通过 commit id）推 integration 分支（2400s），并把 commit id 通过 kanban 更新到关联任务——**"你能访问本账号的板；其他账号的由你发 matrix 通知其 owner-agent 更新"**（跨账号协作口径）。

**步骤 18　release（发版交付登记，线下执行在册追踪）**
fanfan 账号板登记三卡：REL-MERGE（integration 合入 main）/ REL-TAG（tag v1.0.0-cashier + RELEASE.md）/ REL-DELIVER（商户交付包与接入文档），置 todo。

**步骤 19　templates（模板套用 + 完备性检查）**
引用 DELIVERY-STANDARD-COMPLETE.md 模板；完备性双口径检查——fanfan 账号板任务覆盖（全卡状态清单）+ 仓库档案 9 项（需求书/tasklist/四分析稿/概设/排期）；完备性报告经**独立 main worktree** 提交推送 origin/main（防 DIRECTOR_CLONE 停在集成分支导致证据永不落库）。

**步骤 20　ide（IDE 工作台接入核验）**
单 studio `/ide` 路由 200；`ide?task=` 跳转参数处理代码存在；IDE 任务简报组件存在。UI 走查由导演另行执行。

## 6. 与 V1 的流程差异备忘（业务流不变，口径已换）

- 一切实例/端口断言 → 单 gateway/单 studio 断言（步骤 1-5）。
- "本机 kanban / 本机看板" → **账号板**（步骤 8 派单文本、9 拒收、10 凭证核验、11 分诊、13 评审卡、19 完备性）。
- "其他机器的由你通知" → **"其他账号的由你发 matrix 通知其 owner-agent"**（步骤 17）。
- 卡片读写全部显式板寻址（`?board=`），建卡缺省落该账号默认板；跨板操作自动定位卡所在板。
- 断点续跑不变（START_STEP/REDISPATCH），新增 UNTIL_STEP 区间闸门。

## 7. 状态与移交

- P0（拓扑+patch 390/391/392+mx harness）：完成，G1-G5 全绿（evidence/20260924-165456），main=652d92d。
- P1（场景迁移+步骤 1-5 实跑）：完成，`UNTIL_STEP=smoke` 全绿，main=fc4068f。
- 旧谱系（V1 aipay / fleet / sim）：全部停服、tar 归档 `_archive/sim-legacy-20260925/` 后删除（main=4ad29b8/c800d57）；每日 0:00 复跑定时已删除。
- **P2（本手册 §5 全流程重跑）**：待人工执行 `RUN_ID=<轮次> bash scripts/aipay/aipay-scenario.sh`，产出 V2 推演报告与问题台账。> 【V3 取代注记 2026-09-25】20 步口径已被 V3 全生命周期方案取代（25 步，含管理域 M1-M3/audit 与 G1-G6 硬闸），方案见 `2026-09-25-mux-v3-lifecycle-plan.md`，执行入口已合一为单文件 `bash scripts/aipay/aipay-scenario.sh`（原 aipay-scenario2.sh 已并入）。本文保留作 V2 拓扑手册。


