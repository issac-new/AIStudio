# run32 开跑前挂账台账（N32 起；来源=run31 复盘 §三-B/§四）

## 待办（run32 前处置）

| # | 项 | 锚点 | 根因层 | 验收判据 | 状态 |
|---|---|---|---|---|---|
| N32-1 | usage 真值持久化补丁（provider usage 对象落 state.db/messages.token_count 或独立 usage.jsonl） | token-meter.py 转录级估算口径声明；token_count 列全史为 0 实测 | 计量基建缺口 | 下轮起 token 读数为 provider 真值非估算 | open（B 类补丁批） |
| N32-2 | 审计 DISP 降级写入器补齐（帧缺口键自动落 `ISSUE\|frame-capture-failed\|step-<n>`） | mx-report-audit.py:130/197/220；tri-disp 归桶 0 键实锤；13 轮不收敛实录 | 机制面断链 | 帧缺口自动降级一轮过；配对测试锚=步 23/25 缺帧例 | open（rootfix-1） |
| N32-3 | 断点定位改「最近闸前段」（archgate/close/plan done 缺时不得从 devimpl 起） | run31-resume.log START_STEP=devimpl；g2_arch_pass 缺位推进实录 | 断点定位缺陷 | g2 缺位时续跑从 archgate 起；守门测试锚＝闸前段判据 | open（rootfix-2） |
| N32-4 | 值守手术收编：patches/ 5 枚重造（586/593/599/609/723）＋探针 403 双合法判据＋SIM 树供给 stamp 改内容面 | 工作区 patches/ diff；mx-capability-probes.mjs:549 区；15:30 重灌污染实录 | 在途未提交＋供给触发条件缺陷 | 收编提交＋run-gates 绿＋反向验证过；stamp 不再因 docs-only 提交触发重灌 | open（收编批） |
| N32-5 | G2 判词缺项显示畸形修复（`)。））`截断） | driver.log 21:08:40 行；gate-verdicts.jsonl 缺项序列化 | 治理服务序列化缺陷 | 缺项文本完整可读；owner 可解析 | open（rootfix-5） |
| N32-6 | kanban version/verification 读面扩列（`_TASK_DICT_FIELDS` 序列化两列） | kanban_output.py:16；批 S spec 决策 6 挂账 | 写面有锁读面无钥 | REST 可构造 expected_version；组 17 正例解锁 | open（产品债） |
| N32-7 | G5 放行路径与 G2 闭环一致性复核（g5_supplement 在 g2_arch_pass 缺位下放行的语义合法性） | state.env g5_supplement=1＋g2 键缺位 | 闸门一致性待证 | 复盘 spec §五补对账段；若判为缺陷→六闸核对加 G2 前置 | open（复核项） |

## 已裁定不处置

- **automation 平台三缺陷**（一次性＋CronUpdate 被吞／值守轮两窗被吞／CronDelete 路由重定向）＝环境层事实非本仓代码问题；兜底＝prompt 内建自删指令＋人工面板删（已执行 CronPauseSelf）。
- **凌晨烧机豁免的「外部归因」**＝成立但非唯一因（日间同型复现定谳），豁免留档不回改；修复链组织面失效的根治归 run31 复盘 D1 课题（bella/chen 排单组织机制重构属产品面新立项，非 harness 批）。
- **系统盘 98% 慢性病**＝机器级清理任务，非仓内工作；值守已用可逆通道处置当轮险情。

## 计数

待办 7（rootfix 5 中 3 件已含 N32-2/3/5；收编 1；产品债 1；复核 1）；不处置 3。
