# chat 回合跨回合恢复（补丁 725）：回合终态失败后同会话续做

日期：2026-11-02 ｜ 类型：feat（hermes-agent 网关；补丁 725）｜ 完成立项：2026-11-01-chat-turn-recovery-design.md 第二块

## 变更

1. 新增 `vendor/hermes-agent/agent/chat_turn_recovery.py`：
   - `max_recovery_attempts()`：`HERMES_CHAT_TURN_RECOVERY`（缺省 1，0/false/no/off 关闭，上限 3）；
   - `should_recover_chat_turn(result, attempt, interrupted)`：非零回合退出码＋有失败记录＋非中断＋非确定性原因（auth/billing/policy/context 等不重试）＋预算内；
   - `chat_recovery_prompt()`：同会话续做提示（先核对磁盘落点、从断点继续、按原任务回执、无剩余则一行说明）；
   - `run_chat_recovery(turn_fn, get_result, sleep_fn, emit, interrupted_fn)`：有界重试循环（5s/15s 退避），行为与 `kanban_turn_recovery` 同构但无卡/无 claim。
2. `gateway/run_turn_runner.py` `_run_conversation_with_approval`：回合调用返回后接恢复层——同 agent 同历史再跑一次；恢复回合剥离 `persist_*`/`prelude`/`moa_config`/`title_user_message`（不重复持久化用户原始消息），任何异常只告警不破坏结算路径。
3. 登记：`patches/series`、`mx_apply_agent_patches` 白名单、守门断言（722/723/725 三补丁必在清单）。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 恢复=同 agent 注入续做提示，不重跑整个回合 | 重跑会重复工具副作用；同历史续做保留已读/已写上下文（与 kanban 版同构） |
| D2 | 缺省只恢复 1 次（上限 3） | 722 已在回合内重试 5 周期；跨回合再叠加易在真宕机时放大负载，1 次覆盖绝大多数瞬态 |
| D3 | 确定性失败（auth/billing/policy/context/payload）不恢复 | 重试不能修，只烧配额并延迟如实报错 |
| D4 | 恢复回合剥离 persist_*/prelude | 否则用户原始消息二次落库、onboarding 前置重复注入 |

## 验证

- 五态功能自测（venv python 实跑）：恢复一次后成功→`attempts=1`；`HERMES_CHAT_TURN_RECOVERY=0`→0；连续失败→预算 2 次即停；auth 原因→不恢复；用户中断→不恢复；成功回合→不恢复。
- 补丁：路径相对 vendor 根、纯净树 `git apply --check` 过＋应用后 `py_compile` 两文件过。
- `gateway/run_turn_runner.py` `py_compile` 过；`bash -n mx-lib.sh` 过；守门断言更新。
- 运行面：`mx-up` 重放后 SIM 快照 `agent/chat_turn_recovery.py` 在位、网关重启加载（本批执行）。

## 设计文档影响

DESIGN_SYNC: touched——方案纪律 92（长任务执行面）的执行底座补齐：chat 单回合失败不再只能靠外部唤醒；2026-11-01-chat-turn-recovery-design.md 第二块标「已落地」。
