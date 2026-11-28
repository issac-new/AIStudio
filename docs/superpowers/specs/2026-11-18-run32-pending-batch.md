# run32 开跑前挂账台账（N32 起；来源=run31 复盘 §三-B/§四）

## 待办（run32 前处置）

> 2026-11-26 run32 方案程序同步批回填：七项状态落锚（spec `2026-11-26-run32-plan-sync.md`）。

| # | 项 | 锚点 | 根因层 | 验收判据 | 状态 |
|---|---|---|---|---|---|
| N32-1 | usage 真值持久化补丁（provider usage 对象落 state.db/messages.token_count 或独立 usage.jsonl） | token-meter.py 转录级估算口径声明；token_count 列全史为 0 实测 | 计量基建缺口 | 下轮起 token 读数为 provider 真值非估算 | **已定谳（2026-11-18 复盘批改判）**：真值一直在 `session_model_usage`（turn_usage.py 持久化，provider 回报）——无需补持久化补丁，口径换源即清偿；报告生成器已读真值（mx-report-gen.py:5133），转录估算口径退役 |
| N32-2 | 审计 DISP 降级写入器补齐（帧缺口键自动落 `ISSUE\|frame-capture-failed\|step-<n>`） | mx-report-audit.py:130/197/220；tri-disp 归桶 0 键实锤；13 轮不收敛实录 | 机制面断链 | 帧缺口自动降级一轮过；配对测试锚=步 23/25 缺帧例 | **已清偿**：tri-disp-backfill 自动落降级凭证（spec 2026-11-18-retro-disp-writer，提交 34f6ba07 一线） |
| N32-3 | 断点定位改「最近闸前段」（archgate/close/plan done 缺时不得从 devimpl 起） | run31-resume.log START_STEP=devimpl；g2_arch_pass 缺位推进实录 | 断点定位缺陷 | g2 缺位时续跑从 archgate 起；守门测试锚＝闸前段判据 | **已清偿**：断点取首个缺失键（mx-recovery-lib.sh:49，spec 2026-11-18-retro-resume-provision，提交 48a1b45f） |
| N32-4 | 值守手术收编：patches/ 5 枚重造（586/593/599/609/723）＋探针 403 双合法判据＋SIM 树供给 stamp 改内容面 | 工作区 patches/ diff；mx-capability-probes.mjs:549 区；15:30 重灌污染实录 | 在途未提交＋供给触发条件缺陷 | 收编提交＋run-gates 绿＋反向验证过；stamp 不再因 docs-only 提交触发重灌 | **已清偿**：五枚重造补丁收编=保留原版（SIM 树重造与基线不匹配）；探针 403/409 双合法已入库；供给键改内容指纹（mx-lib.sh:823-847，spec 2026-11-18-retro-resume-provision） |
| N32-5 | G2 判词缺项显示畸形修复（`)。））`截断） | driver.log 21:08:40 行；gate-verdicts.jsonl 缺项序列化 | 治理服务序列化缺陷 | 缺项文本完整可读；owner 可解析 | **已清偿**：判词按行尾提取剥尾括号＋截断 120→240（提交 37b363a，驱动侧展示面）——owner 解析所需缺项文本恢复完整 |
| N32-6 | kanban version/verification 读面扩列（`_TASK_DICT_FIELDS` 序列化两列） | kanban_output.py:16；批 S spec 决策 6 挂账 | 写面有锁读面无钥 | REST 可构造 expected_version；组 17 正例解锁 | **已清偿**：补丁 793 扩列（patches/series:1319）；组 17 正例判据随 2026-11-26 同步批更新（§5.11 组 17） |
| N32-7 | G5 放行路径与 G2 闭环一致性复核（g5_supplement 在 g2_arch_pass 缺位下放行的语义合法性） | state.env g5_supplement=1＋g2 键缺位 | 闸门一致性待证 | 复盘 spec §五补对账段；若判为缺陷→六闸核对加 G2 前置 | **已定谳**：run31 复盘正本 §一/§五如实呈现（g5 经补件路径放行＋G2 全轮未闭环并列终态，复盘 2026-11-18-run31-full-retrospective §五对账段）；放行语义=补件路径设计内通道，未加 G2 前置硬门——复盘批以「断点回退最近闸位」（§5.16 第 4 条）承担同层防绕行 |

| N32-8 | G2 房间源发送链路根治：secops 响应经 gateway Transient-retry 路径后 Matrix 发送静默失败（入队日志在、sent event 回执缺、synapse 房间 200 条深拉 0 条 secops 消息铁证）——判词只落卡面单源 | runs/burn-20261128-105949/evidence/gate-verdicts.jsonl（source=combined:room=无,card=FAIL）；profiles/secops/logs/agent.log 13:41/14:47；第十轮 waive 理由 | gateway 发送链路断链（batch flush→PUT 静默失败） | 判官判词行双源齐（房间行首＋卡面）；守门探针＝发送后 sent event 回执必达 | **待复盘批根治**（2026-11-28 十轮实录定谳，waive 留档） |
| N32-9 | 复审改判通知闭环：修订入仓（518091b5）后复审派发与判官产出断链——a3 复审窗 1800s 内 secops 零响应，改判 PASS 判词未落双源任一 | aipay-scenario.sh:1108 复审判读；driver-a3.log 14:37-15:07 窗 | 通知依赖房间消息（N32-8 断链）＋判官复审触发无保障 | 修订入仓→复审派发→改判 PASS 双源可见全链一轮走通 | **待复盘批根治**（同上定谳；与 N32-8 同批修） |
| N32-10 | 磁盘水位值守线：内置盘 100%（3.5G）逼近系统 10GB 自动暂停线——runs/logs/evidence 全在系统盘，run32 全程写入无缓冲 | SessionStart 告警 2026-11-28 22 时；df 3.5G→外移后 9.2G | 供给面无水位巡检 | 值守巡检加 df 判据（<15G 告警/<10G 拒起跑）；大目录外移 NVMe 惯例化 | **部分清偿**（2026-11-28 应急外移 backups+SIM archive 6.8G→nvme2230/lab-disk-rescue-20261128，符号链接保路径；巡检判据待值守批落） |

## 已裁定不处置

- **automation 平台三缺陷**（一次性＋CronUpdate 被吞／值守轮两窗被吞／CronDelete 路由重定向）＝环境层事实非本仓代码问题；兜底＝prompt 内建自删指令＋人工面板删（已执行 CronPauseSelf）。
- **凌晨烧机豁免的「外部归因」**＝成立但非唯一因（日间同型复现定谳），豁免留档不回改；修复链组织面失效的根治归 run31 复盘 D1 课题（bella/chen 排单组织机制重构属产品面新立项，非 harness 批）。
- **系统盘 98% 慢性病**＝机器级清理任务，非仓内工作；值守已用可逆通道处置当轮险情。

## 计数

待办 7 全部清账（1 定谳换源＋5 已清偿＋1 已定谳留档）；不处置 3。
