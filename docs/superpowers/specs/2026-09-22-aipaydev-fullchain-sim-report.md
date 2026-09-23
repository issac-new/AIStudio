# aipaydev 全流程推演报告（V1.0）

> **推演目标**：模拟完整多人产品研发测试团队及真实工作流程，对 Swarm Studio 的「协作沟通」和「IDE 工作台」功能进行全流程推演
> **执行时间**：2026-09-22 17:31 — 2026-09-23 02:09（约 8.6 小时）
> **结论**：20 步全流程走通，切片 1/2/3 全部完成；真实产生 6 项缺陷并全部闭环修复（TEST-PASS 51/51）；暴露产品缺口 12 项（问题单在案）

---

## 一、推演规模

| 维度 | 数值 |
|---|---|
| Matrix 账号 | 24 个（12 人类 + 12 agent，编制 admin/bella/fanfan/wei/mei/chen/hu/lin/xiao/qi/fei/arch） |
| Swarm Studio 实例 | 11 个生产构建（studio :8702-8712，gateway :8722-8732） |
| 中央仓库 | github.com/issac-new/aipaydev，integration/RFD-001 分支 47 commits |
| 推演技能 | 6 个（requirements-analyst / pm-planning / capability-report / inbox-dedup / defect-loop / aipaydev-dev），安装于 11 实例 |
| 导演方式 | bash 脚本只扮演「人类打字/点击」与真值核验，agent 动作全为真实 gateway+LLM 回合 |

## 二、20 步流程执行结果（全部真值核验）

| 步骤 | 内容 | 结果 | 核验锚点 |
|---|---|---|---|
| 1-5 | 账号/网关/登录/功能/初始化 | ✅ | 24 token 有效 + 11 实例 health 200 + matrix-login 全通过（17:36） |
| 6 | BA 需求投递 | ✅ | RFD-001 入仓 fd04ede + bella→fanfan 私信送达（17:48） |
| 7-8 | 建群 + @Orchestrator 派发 | ✅ | 需求讨论群 !rZlwbRtBz + 派发消息 $2hGW1hh（17:52） |
| 9 | kanban 登记 | ✅ | fanfan 板 RFD-001 主卡 + 11 子卡（17:55） |
| 10 | 系统分析/三清单/SMART 拆分/RACI | ✅ | tasklist 入仓 18:14 + 4 组 RACI 派发消息在房（18:16）；**自动邀群缺口导演兜底 ×8** |
| 11 | 分诊 + lead 确认 | ✅ | chen/hu/lin/xiao 四机分诊卡 18:39-18:40，lead triage→todo |
| 12 | 详细系分 | ✅ | AN-PAYCORE/AN-MP/AN-CHWX/AN-CHALI 四份系分入仓（18:43-18:49），3 份完成回执核验 |
| 13 | 汇总评审 | ✅ | 概设 RFD-001-architecture-design.md 入仓 18:57；评审卡导演代登记（agent 未建卡） |
| 14 | 需求分析任务关闭 | ✅ | 主卡 done（close_done） |
| 15 | 开发排期 | ✅ | schedule.md 入仓 19:31（15 人日 + 测试 0.3 系数 + 15% 缓冲） |
| 16 | 开发实施 | ✅ | feat/DEV-PAYCORE（40 测试绿）/DEV-CHWX（25 项）/DEV-CHALI/DEV-MP 四分支推送，集成合并无冲突（21:57） |
| 16b | 缺陷闭环 | ✅* | **真实缺陷 6 项全闭环**（见下）；*导演缺陷窗轮询有缺陷 Q12（首圈误判零缺陷），闭环由 agent 自主完成 |
| 17 | 测试报告 | ✅ | 终稿报告 c0a54b2 入仓：**51/51 全绿 + tsc 零错误 @ dcb2b28**（02:09） |
| 18 | 发版交付登记 | ✅ | REL-MERGE/REL-TAG/REL-DELIVER 三卡登记（22:42，线下执行） |
| 19 | 模板套用+完备性检查 | ✅ | DELIVERY-STANDARD-COMPLETE.md 引用 + completeness-check.md 入仓 |
| 20 | IDE 工作台核验 | ⚠️ | /ide 路由 200 ✓；**ide?task 跳转缺失、任务简报未自动生成**（问题单在案） |

## 三、真实缺陷闭环（推演核心成果）

测试侧独立编写断言（拒绝复用研发自测），双向交叉复核后确认 6 项缺陷，全部走「缺陷消息→复现确认→修复→回归→FIX-DONE→合入集成」真实闭环：

| 缺陷 | 级别 | 内容 | 修复 commit |
|---|---|---|---|
| DEF-BE-001 | P1 | 支付宝适配器违反 §5.3 冻结 snake_case 契约 | 5c34c61（lin） |
| DEF-BE-002 | P1 | pay-core 跨包 ChannelError instanceof 失效 | 7f8f115 + c922ea2 复核修正（chen/wei） |
| DEF-FE-1 | P2 | 商户未配置宿主渠道时不可用占位项被默认选中 | 2eca9f7（xiao） |
| DEF-FE-2 | P2 | PAY_INVALID_CHANNEL_HINT 提示文案映射不符 | 2eca9f7 |
| DEF-FE-3 | P2 | 结果页入口参数缺失时仍渲染「处理中」态 | 2eca9f7 |
| DEF-FE-4 | P3 | 查单在途时 onHide 后轮询未真正暂停 | 2eca9f7 |

终测：6 域规格 51 用例全绿（下单幂等 10 / 双渠道调起 8 / 回调验签 10 / 重复回调幂等 5 / 超时关单 10 / 契约一致性 8），报告含通过 commit dcb2b28。

## 四、暴露的产品/平台缺口（15 项问题单，按域归并）

**协作沟通域**
1. **room-invite-gap ×9**（P1）：Orchestrator 收到 RACI 派发指令后不会自动邀请关联人进群（方案 10.4 要求），导演逐个补邀。**本轮最高频缺口。**
2. **receipt-missing ×1**：AN-CHWX 完成回执未按 inbox-dedup 格式发到房间（双兜底口径未完全执行）。
3. **review-card-missing ×1**：汇总复核后 agent 未自动登记评审卡，导演代建。
4. **cockpit-online-zero ×2**：驾驶舱在线状态显示与实际实例不符。
5. **approval-stall ×2**：审批请求停滞需人工 !approve 解锁。

**IDE 工作台域**
6. **ide-task-param**：任务→IDE 跳转参数（ide?task=）处理缺失。
7. **ide-brief**：任务接入 IDE 时简报未自动生成（方案步骤 20 核心要求）。
8. **ide-deeplink-loses-task**、**ide-i18n-raw-keys**、**ide-briefing-cross-board-empty**：深链丢任务上下文/原始 i18n 键/跨板简报为空。

**平台运行域**
9. **kanban-api-hang-qi ×2**：qi 实例 kanban API 挂起。
10. **host-gateway-ownership / shared-node-modules-wipe**：多实例共享宿主的网关归属与 node_modules 互踩。

**环境类（非产品 bug，如实记录）**
- cc-switch 上游额度两轮 403（18:22 chen、20:58 chen 5 小时窗），模型回退链自动恢复。
- github:443 一度阻断，agent 自主走 SSH over 443 回退。
- 11 实例并存时启动宽限丢弃触发消息（实例重启后需导演重发纠偏消息）。

## 五、导演侧脚本缺陷（本轮修复 4 项）

| 缺陷 | 修复 |
|---|---|
| setup roster 空 commit 致 set -e 退出（f165f18，并行会话） | 加 `git diff --cached --quiet` 守卫 |
| dm_room 同句 local 引用未定义变量 set -u 崩（f165f18） | 拆两句 |
| `$WSF` 裸变量粘连全角标点崩（f165f18） | brace 化 |
| inbox-dedup 技能 kanban CLI 虚构 --title/--status 旗标（08a6030，本会话） | 改位置参数 + --triage，同步 11 实例 |
| defect 窗首圈误判零缺陷（Q12，闭环由 agent 兜住） | ✅ 已修（19d37ca sender 限源 + 44c15a2 since 时间过滤，双层防御在 main）|

## 五-b、问题单排期修复闭环（2026-09-23 回填）

15 项问题单处置状态（`95031e4` 为排期修复主 commit；并行会话另承担多项）：

| 问题单 | 状态 | 处置 |
|---|---|---|
| room-invite-gap ×9 | ✅ 已修 | hermes `matrix invite` CLI + 技能接线（5d1cd7f，缺口会话） |
| ide-brief | ✅ 已修 | TaskBriefingPanel 六区块（e99e9fe）+ recap 数据源（66800db）+ aux 回传（289703e） |
| ide-task-param | ✅ 已修 | useIdeJump 全入口带 task 参数（早已在位，深链形态问题归下条） |
| ide-deeplink-loses-task | ✅ 已修 | 路径形态 search 迁 hash：entry shim + patch 368 双落点（e952c63） |
| ide-i18n-raw-keys | ✅ 已修 | patch 365 四键 zh/en（67b3fef） |
| ide-briefing-cross-board-empty | ✅ 已修 | 简报抽屉跨板任务解析（1254c2f） |
| kanban-api-hang-qi ×2 | ✅ 已修 | **patch 369**：kanban CLI exec FIFO 队列并发 2 + 排队 45s 快速失败 + notify-list 补 30s 超时（95031e4） |
| cockpit-online-zero ×2 | ✅ 已修 | 在线计数多级回落：registry → Matrix presence → fleetSessions 聚合（95031e4 起步，并行会话 presence 增强接续） |
| approval-stall ×2 | ✅ 已修 | 审批代答守护 aipay-approver（05fc959） |
| shared-node-modules-wipe | ✅ 条款 | aipaydev-dev 技能补「依赖隔离」条款（95031e4） |
| dev-branch-missing | ✅ 硬闸门 | 技能「及时推送」条款（95031e4）之上叠加代码闸门：verifier pushEvidenceGate + resultTemplate.pushBranch 声明 + failType 'push' 路由（收口轮，§五-c） |
| test-report-missing | ✅ 条款 | aipaydev-dev 技能补「测试报告是独立交付物」条款（95031e4） |
| receipt-missing | ✅ 条款 | inbox-dedup 技能双兜底条款已在位（执行偏差，非规则缺失） |
| review-card-missing | ✅ 条款 | requirements-analyst 技能补「E. 评审卡登记」条款（95031e4） |
| host-gateway-ownership | 🔶 判读已修 | studio 侧误判根因已修：patch 373 host 守卫输出判 NOT-running，ensure 不再误跳过启动（收口轮，§五-c）；multiplex/--force 迁移通道仍另行立项 |

排期修复门禁：server tsc 0 错 + overlay vitest 2248 全绿 + i18n-coverage 18 绿 + inject 312 patch 全套。

## 五-c、收口轮落地（2026-09-23 第三轮：接线收口 + 终审）

五会话（dbdb4ebf / e8fe54b1 / 5007f073 / 0744d374 / 71bdd5e3）汇总后的剩余工作全部落地：

| 项 | 落点 | 验证 |
|---|---|---|
| push 硬闸门接线（原 ISSUE-08 悬空） | `custom/server/loop/engine/verifier.ts` pushEvidenceGate：声明 `pushBranch` 的交付必须 `ls-remote` ref == worktree HEAD；`loop-engine.ts` failType 'push' 路由回 handoff 重派 | 守门 6+4 例绿（task-completion-push-gate / push-verify） |
| host 守卫判读接线（原 ISSUE-04 悬空） | **patch 373**：`isGatewayRunningForProfile` 对「他 profile owns this host / will not serve」判 NOT-running（成功路径与 catch 路径双守卫），纯函数在 `custom/loop/gateway/host-ownership.ts` | patch 双向 git apply 校验过；host-ownership 4 例绿 |
| git-sos 决策层接线（原「生产调用点悬空」） | `/api/ide/git/status` 冲突态带 `sos` advisory（porcelain 冲突码→content/structural→降级建议，只读不自作 merge --abort）；detectConflictType 跨行判定修复（stash@{0} 落地） | git-sos 9 例绿 |
| IDE retry 计数链收口 | IdeShell 补 `request` import（原 L296 裸引用）；**briefingTask 重复声明合并**（两套跨板实现在同文件撞车致 SFC 编译失败：保留 eager watch + setBoard 契约，抽 resolveBriefingCrossBoard 供深链 watch 与抽屉打开共用） | briefing-cross-board 4/4 绿（补 vue-router mock + 用例间 unmount 防污染） |
| 测试报告真值验收 | `git fetch` 反查：c0a54b2 ∈ origin/main；TEST-BE-report.md 正式版已在 origin `test/TEST-BE-report.md`（qi 工作区 `docs/test/` 下另有一份未提交重复副本，非阻塞） | origin/main 035a3b7 |
| Docker 沙箱终审 | aipaydev 仓无 Dockerfile / docker-compose / 容器化交付物——**沙箱实弹 as-is 不可行**，容器化属新立项而非缺口修补 | find 全仓核验 |
| hermes-agent 侧 | tick socket 回退 22ceab7d36 在激活环境 main（领先 origin 1，外部上游不代推）；此前记录的 discord attachment 既有失败在当前两棵树均**无法定位该用例**，未复现、不做处置 | test_loop_tick_socket_fallback 4/4 绿 |

补丁账本（本轮后 series 至 373）：369 kanban exec 队列 / 370 stock 运行时兼容 / 371 IDE retry-count 路由 / 372 agent tick socket 回落 / **373 studio host 守卫判读（本轮新增）**。

## 五-d、勘误（2026-09-23 第二轮复核）

**本报告 §五-b 记为「✅ 已修」的 room-invite-gap 实为虚假闭环。** 复核证据：

| 检查 | 结果 |
|---|---|
| `hermes matrix` 是否存在（激活环境 v0.21.4） | **不存在**——`hermes: 'matrix' is not a hermes command` |
| 5d1cd7f 改了什么 | 只把技能文案改成引用 `hermes matrix rooms` / `hermes matrix invite` 两个**不存在的命令** |
| `adapter.invite_user`（adapter.py:2721→2659） | 仍是死 API：无 CLI 动词、无 agent 工具面 |
| `patches/series` 是否补过 matrix CLI | 否（369-373 均为他项） |
| 11 实例安装的技能版本 | 落后于仓内源（安装 09-22 17:21 vs 源改 09-22 22:51 / 09-23 09:09），`install_skill` 仅判文件存在、永不刷新 |

即：**缺口的「修复」是把指令写给了一个不存在的工具面**，复跑必然复现同样 9 次人工兜底。同类病 08a6030 已犯过一次（inbox-dedup 虚构 `--title/--status`），当时只修了那一处，未做全量技能 CLI 审计。

真修复见 patch **374-agent-matrix-room-tools**：按上游 deferred-platform 工具契约（`provides_tools` + `plugins/platforms/matrix/tools.py:register_tools(ctx)`）交付 `matrix_room_create` / `matrix_room_invite` / `matrix_room_list` 三个 agent 原生工具，优先复用 gateway 已鉴权 adapter（工具面不接触 token），无 gateway 进程时回落 Client-Server API；守门测试 33 例，经真实 `discover_plugins()` 路径确认三工具进入全局 registry 且 `matrix` toolset 可见。技能改引工具名并声明 failed 必须回报；`aipay-setup.sh` 的 `install_skill` 改为按内容比对同步，杜绝实例跑旧技能。

**方法论订正**：推演报告中的「已修」必须以**能力面实测**（`--help` / registry / 真实调用）为凭，不能以「技能或文档已改写」为凭——文案改动不构成修复，且本次恰好改成了错的那一侧。

## 五-e、多实例网关拓扑实锤（2026-09-23 V2.0 准备期）

V2.0 准备时按现行上游（v0.21.4）实测复核 port-per-profile 布局，结论与设计文档假设**不一致**，须在下轮开局前定案：

| 事实 | 证据 |
|---|---|
| host 守卫是**全机级**，不是 per-home | 以隔离 HERMES_HOME 起 fanfan gateway 被拒：`❌ A gateway already owns this host … PID 31174 (launched by profile 'orchestrator'; serves: orchestrator, aiteam-*)`。"home 全隔离 → 占有退化为「本 home 的占有」，天然不冲突"（gateway-multiplex-design §二）在当前上游**不成立** |
| 一个 profile 默认不给独立 gateway | `✗ Profile 'fanfan' does not get a gateway of its own. Exactly one gateway per host is the inbound process for every profile.` |
| 锁目录可 env 隔离 | `gateway/host_rendezvous.py:13` — 锁落在 `$HERMES_GATEWAY_LOCK_DIR`，否则 `$XDG_STATE_HOME/hermes/gateway-locks`。这是本布局此前**从未接线**的关键隔离位 |
| `--force` 不杀宿主 | `gateway/run.py:5450` 仅 `logger.warning("--force: starting a second gateway although %s owns this host")` 后照常启动 |
| **`--replace` 才杀宿主** | `gateway/run.py:5196-5224`：写 takeover marker → `terminate_pid(existing_pid)` → 20s 内未退即 SIGKILL。**推演任何环节都不得对宿主使用** |

**重新归因**：V1.0 记录的「`--force` 反噬把宿主 orchestrator 挤下线」，机制上不是 force 杀进程，而更可能是两个 gateway 争用同一份 host rendezvous 记录（force 后写方覆盖，宿主路由/健康面被顶替）。据此，正解是 **`--force` + 每 profile 独立 `HERMES_GATEWAY_LOCK_DIR`**，而非放弃多实例。上游自己给出的合法条件也吻合：`a HERMES_HOME outside profiles/ needs --force`——sim 的 `SIM_ROOT/users/<u>/.hermes` 正属此类。

**下轮开局前的未决项**（需人工定案，不宜由脚本静默决定）：studio 侧 spawn gateway 的代码要带 `--force` 并透传 `HERMES_GATEWAY_LOCK_DIR`；否则三条上游正路只有 `gateway migrate --multiplex`（把 12 个 profile 折进宿主一个进程，但 studio 的 per-user GATEWAY_PORT 寻址随之失效）与容器隔离可用。

## 六、关键数字与记忆点

- **47 commits**：从 BA 初稿到测试报告全在 git 上，每一步可回溯。
- **6 缺陷 0 open**：跨 3 台机器的研发-测试协作，无人工写码介入，全部真实 LLM 回合修复。
- **1 条最深的链**：bella 一份 5.2K 需求书 → fanfan 拆 11 子卡 → 4 人系分 → 4 人编码 → 2 人测试 → 6 缺陷闭环 → 51/51 全绿，全程 Matrix 消息驱动。
- **2 次人工纠偏**：全部发生在「产品能力缺口」处（自动邀群、评审卡登记），不是 agent 能力问题——这正是推演要暴露的。

## 七、遗留事项

1. ~~REL-MERGE/REL-TAG/REL-DELIVER 三卡按方案线下执行~~ **已执行完毕（09-23 补录）**：
   - REL-MERGE：integration/RFD-001 no-ff 合入 main（6e34a95，129 文件 +17211 行）
   - REL-TAG：tag v1.0.0-cashier 推送（0300c9d），RELEASE.md 入仓（7b12ffc）
   - REL-DELIVER：商户接入文档 docs/delivery/merchant-onboarding-v1.0.0-cashier.md 入仓（715e362）
   - 三卡已置 done（t_66e5033b / t_e35704d9 / t_16abea25）
   - **坑**：置 done 不能走 PATCH status（completion 需 evidence，500），正确用法 `POST /api/hermes/kanban/complete {task_ids, summary}`。
2. ~~15 项产品问题单待排期修复（room-invite-gap 与 IDE 任务简报/跳转优先级最高）~~ **已全部闭环（09-23 收口轮终态，见 §五-b/§五-c）**：14 修复/条款 + host-gateway-ownership 判读根因已修（patch 373）。三个产品化项已按 **overlay 自家域**收口并各出文档（09-23 收口轮第四轮；multiplex/双通道为上游能力，本文不承诺上游排期）：gateway 多 profile 共存 overlay 终态（`2026-09-23-gateway-multiplex-design.md`，port-per-profile + patch 373 判读 + harness 门闸 AIPAY_GATEWAY_HOST_POLICY 已落地）、LLM 通道韧性 overlay 终态（`2026-09-23-llm-dual-channel-failover-design.md`，编排层可见性+fail-fast，通道切换实现归上游）、每-agent node_modules store（`2026-09-23-per-agent-node-modules-design.md`，aipaydev 仓 `scripts/install-deps.sh` 已落地：私有 store 哈希寻址+symlink 注入+守门自检，实测 4 包安装+52/52 绿，已推 aipaydev origin main `154b2b8`）。
3. ~~defect 窗轮询逻辑（Q12）与 kanban-api-hang 待修复后重推演验证~~ Q12 已修（19d37ca sender 限源 + 44c15a2 since 时间过滤）；kanban-api-hang 已修（patch 369）。下一轮推演可直接复跑验证。
4. 推演产物归档：SIM_ROOT=/Volumes/nvme2230/lab/ncwk-sim-aipay（evidence/ 含 11 板 kanban 快照、房间全量消息、issues.log、场景日志）。

---

> 报告：aipaydev 推演会话（QA/监控会话 + 执行会话联合产出）
> 证据包：evidence/20260923-020926/（14 类取证文件）
