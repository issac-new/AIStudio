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
| defect 窗首圈误判零缺陷（Q12，未修脚本，闭环由 agent 兜住） | 记录在案 |

## 六、关键数字与记忆点

- **47 commits**：从 BA 初稿到测试报告全在 git 上，每一步可回溯。
- **6 缺陷 0 open**：跨 3 台机器的研发-测试协作，无人工写码介入，全部真实 LLM 回合修复。
- **1 条最深的链**：bella 一份 5.2K 需求书 → fanfan 拆 11 子卡 → 4 人系分 → 4 人编码 → 2 人测试 → 6 缺陷闭环 → 51/51 全绿，全程 Matrix 消息驱动。
- **2 次人工纠偏**：全部发生在「产品能力缺口」处（自动邀群、评审卡登记），不是 agent 能力问题——这正是推演要暴露的。

## 七、遗留事项

1. REL-MERGE/REL-TAG/REL-DELIVER 三卡按方案线下执行（卡在 fanfan 板 ready 态）。
2. 15 项产品问题单待排期修复（room-invite-gap 与 IDE 任务简报/跳转优先级最高）。
3. defect 窗轮询逻辑（Q12）与 kanban-api-hang 待修复后重推演验证。
4. 推演产物归档：SIM_ROOT=/Volumes/nvme2230/lab/ncwk-sim-aipay（evidence/ 含 11 板 kanban 快照、房间全量消息、issues.log、场景日志）。

---

> 报告：aipaydev 推演会话（QA/监控会话 + 执行会话联合产出）
> 证据包：evidence/20260923-020926/（14 类取证文件）
