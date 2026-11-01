# 722 补丁：EmptyStreamError 归类 timeout——流掐断回合自动恢复（run24 四现场根治，用户令「根治」）

日期：2026-11-01 ｜ 类型：fix（hermes-agent 错误分类，patches/722）｜ 关联：2026-11-01-chat-turn-recovery-design.md（本补丁为其第一块砖）

## 1. 变更
`vendor/hermes-agent/agent/error_classifier.py` classify_api_error 的 verdict 选择后加显式覆盖：`type(error).__name__ == "EmptyStreamError"` → `_v(FailoverReason.timeout, retryable=True)`。补丁=patches/722-agent-emptystream-ladder-classify.patch（series 已登记）。

## 2. 根因链（run24 四现场）
EmptyStreamError（terminal incomplete 物理重试耗尽抛出，707 补丁族）按字符串分类落入 `FailoverReason.unknown`——不在自动恢复梯子资格清单 `_LADDER_REASONS={overloaded,server_error,timeout}`（turn_recovery_autorecover）——回合耗尽即死、无自恢复，只能靠外部消息重触发（值守四现场：22:08 熔断群静默／23:49 系分停滞／03:11 编码中断／11:23 改判回合死）。归类 timeout 后梯子自动接住（15/30/60s 退避×5 周期，`agent.auto_recovery_cycles` 默认 5——产品能力本就存在，缺的只是分类入资格）。

## 3. 决策记录
- 显式 isinstance 式判定（type name）而非字符串特征：EmptyStreamError 无 status_code，字符串匹配不可靠。
- verdict 覆盖式（构造链完整走）而非早退 return：早退返回裸 dict 破坏 ClassifiedError 契约（实测抓出）。
- 未扩 _LADDER_REASONS 加 unknown：unknown 太宽（确定性错误也入梯=无效退避）；只精确收 EmptyStreamError。

## 4. 验证
- classifier 官方测试 192/192（venv pytest，HERMES_HOME 指 SIM）。
- 新分类实测：EmptyStreamError→timeout/retryable=True；SIM 快照 git apply --check 干净+实打+实例内 import 验证同结果。
- 网关热载：11:35:57 重启（G5 熔断等待窗口），双服务 200。
- 生效语义：agent 回合流掐断→梯子自动退避重试→不再死回合；下轮 run24 现场即真验。

## 5. 设计文档影响
DESIGN_SYNC: touched——2026-11-01-chat-turn-recovery-design.md 立项的第一块砖落地（配置+分类面根治；会话级恢复 prompt 注入面仍为后续块）。
