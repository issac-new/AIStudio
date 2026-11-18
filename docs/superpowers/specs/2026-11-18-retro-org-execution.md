# run31 复盘：修复执行组织面与 G2 重放起点

## 变更

本变更只调整 `simharness/aipay-scenario.sh` 及其场景内新增助手，不改 `mx-run.sh`、`mx-lib.sh` 的供给面，目标是让缺项修复从「判词正确但执行失联」变成可验收、可升级、可代位的执行链，并消除 G2 等待环的前序全链重放。

1. 缺项修复任务书统一追加强制验收锚：完成定义必须同时包含提交、推送和结论行；验收锚必须包含分支名、提交号、评审卡号；明确「无提交=未完成」，只回执或只留本地 WIP 不算交付。覆盖 G1 缺项补齐、G2 安全与架构退回、修订催办、G5 退回及 owner 分派、缺陷修复合同；既有 `DEV-DONE-*`、`FIX-DONE-*`、`ARCH-GATE-*`、`SECURITY-GATE-*`、`READY-GATE-*` 断言行不改名。
2. 复用 `wait_truth`、`wait_alive_truth`、`mx_wait_revive` 已有的 `MX_TICK_FN` 等待拍点，新增组织执行巡检，不创建守护进程。巡检扫描修复责任人主工作区及其 git worktree：工作区有未提交改动、同一 HEAD 的脏态已连续被观察至少 1800 秒、且距 HEAD 提交至少 1800 秒时，登记 `wip-timeout` 并向导演台与属主 DM 催办。两个时间条件同时成立才触发，避免把旧基线上刚产生的改动误报为超时。指纹由 HEAD、porcelain 状态和 diff stat 共同生成；同一工作区同一指纹只告警一次，HEAD 变化重新计时，工作区干净后复位。
3. 同一巡检读取本轮 G2 安全卡、G2 架构卡和 G5 准出卡。卡片仍为 `todo` 且 `created_at` 距当前至少 1800 秒时，导演台通过既有 kanban `assign` 接口指派对应复评 owner，并以 DM 派发含卡号、分支和提交锚的复评任务书；同一卡同一创建时间只代位一次，发送失败不幂等落键，下拍重试。
4. G2 未过且系分评审已完成时，场景入口把前序续跑起点映射为 `archgate`，不再从 `smoke` 等前序步骤重放。显式 `MX_FULL_REPLAY=1` 保留人工全链复演通道；`UNTIL_STEP` 截止于 `archgate` 之前时不改映射，避免空执行区间。判词检索时间锚、复审改判、熔断计数和复位签名均不改。

## 决策记录

- 阈值取 30 分钟（1800 秒），WIP 与复审代位共用 `MX_ORG_WIP_TIMEOUT` / `MX_ORG_REVIEW_TIMEOUT` 两个可测覆盖、生产同默认值的旋钮。来源是 run31 实录：chen 148 文件 WIP 约 13 小时未提交，bella 四卡 blocked 且复审卡停留 todo；现有开发任务书本就要求 T+30 出现首个可推送里程碑，因此 30 分钟既能给正常实现留出时间，又远小于 13 小时失控窗口。复审代位采用同族阈值，避免多套时钟造成判据漂移。
- WIP 采用「持续脏态观察 + HEAD 年龄」双条件，不直接拿旧提交时间当脏改年龄。run31 的核心不是文件修改本身，而是修改后长期没有提交；HEAD 变化代表出现新提交，必须重新计时。内容指纹只用于幂等，不用于重置超时，防止持续编辑反而永不告警。
- 复审代位只改 owner 和发任务书，不代替评审、不写 PASS、不走卡 done，保持 G2/G5 判词与闸门语义。看板任务只有 `created_at` 可稳定提供秒级时间戳，故以其为 todo 年龄锚；缺卡号、缺时间戳或查询失败均 fail-soft，不猜数。
- G2 重放起点取最近未过闸位 `archgate`。run31 每个等待循环重放前序全链约 12.5 分钟、共 9 轮，消耗的是已完成的派发与采集回合而非修订或复评；`review_done` 已落且 `g2_arch_pass` 未落正好标识该闸位。入口映射只缩短无效前序，不跳过 archgate 内部安全前置、架构判词和修订闭环。
- 不新增脚本或后台机制，避免新增机制预算与运维面；测试通过提取场景内纯函数和巡检函数做行为验证。

## 验证

1. 新增 `simharness/tests/retro-org-execution.test.sh`：覆盖验收锚三要素与既有结论锚保留；WIP 未达阈值不触发、达阈值触发、同指纹幂等、HEAD 变化复位；复审 todo 达阈值代位、非 todo/未达阈值不代位；G2 起点映射及人工全链复演例外。
2. 用临时 git 仓制造真实未提交改动和 worktree，用 stub 替代 Matrix、看板与状态存储，验证 DM、issue 和 assign 的实际调用，不只 grep 实现文本。
3. 对 WIP 时间比较、复审 todo 判据和 G2 起点映射分别做变异验证：临时复制场景脚本并反转关键条件，守门必须失败；测试结束恢复，不提交变异体。
4. 执行 `bash -n simharness/aipay-scenario.sh`、`bash simharness/tests/retro-org-execution.test.sh` 和 `bash simharness/tests/run-gates.sh`。worktree 先执行 `npm run inject` 建链；若 `node_modules` 为实体目录，先隔离再链接主检出共享实例。
5. 本变更不做真实 run32 全流程推演，不验证 Matrix/生产看板的端到端时延；交付时明确标注此未验证项。

## 设计文档影响

DESIGN_SYNC: none。变更只修复推演 harness 的执行调度与守门实现，不改 AIStudio 产品架构、整合正本、数字总账、上游钉版基线或对外契约；spec 自身记录判据与验证命令即为本机制事实源，无其他设计文档需要同步。
