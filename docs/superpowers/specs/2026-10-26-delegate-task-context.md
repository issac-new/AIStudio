# delegate 驱动任务上下文装配与机器回执（2026-10-26，Task 4B）

分支：`fix/core-coding-chain-v2`

## 变更

九段架构第 8 点要求 Ycode 以 kanban 任务 workspace 为项目根并携带任务上下文。此前 prompt 里的任务信息靠 worker 手工抄写，且证据只有人读日志。本批给 `runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py` 增两件事：

1. **`--task <卡号> [--board <slug>]`**：驱动加载任务（`kanban_db.get_task`），把 `build_worker_context` 全文（正文、验收、上游 handoff、评论、历史尝试——与 dispatcher spawn 同源）程序化拼进 prompt（`## 本轮实现指令` 前置），cwd 取任务规范 workspace（绝对直用；相对锚定板 workspaces 根，`../` 逃逸拒绝；scratch 空路径按 `<root>/<task-id>` 预测），覆盖 `--cwd`；工作区未物化/任务不存在即 exit 2，不猜路径。
2. **`materials/delegate-result.json`**：全部退出路径（引擎缺席/握手/建会话/setModel/超时/早退/协议错/成功）统一经 `finish()` 落机器可读回执——taskId/board/title/status/assignee/branch、sessionId、规范 cwd、engineBin(+source)、model、stopReason/stage、exit、prompt sha256/长度、usage、起止时间；tmp+rename 原子写，落盘失败不掩盖主结果。

SKILL.md 同步用法：带 `--task` 时不再要求 worker 抄写任务上下文；G3/报告按 `delegate-result.json` 取证。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 上下文注入在驱动层而非提示词层 | 与 spawn 同源（build_worker_context），零抄写失真；调用方只给实现指令 | 要求 worker 把上下文抄进指令文件（否决：实测靠模型摘抄必失真） | 是 |
| D2 | cwd 以任务规范 workspace 覆盖 --cwd | --task 语义即"以任务为根"；两源并存必漂移 | 允许 --cwd 覆盖任务根（否决：路径证据可被调用方改写） | 是 |
| D3 | 未物化/逃逸/缺任务 exit 2 | 驱动不猜路径——预测值当真值是历史事故面 | 预测路径直接用（否决：引擎写错目录且污染任务外文件） | 是 |
| D4 | 回执覆盖全部退出路径、原子写 | 失败证据与成功证据同等可审计；半行 JSON 不是证据 | 只在成功时写（否决：失败轮更需机器证据） | 是 |

## 设计文档影响

DESIGN_SYNC: none —— 全流程方案 V8.54 §5.4.3 已立"编码委托证据位"，本批是该证据位的运行时载体实现，不改正本口径。

## 验证

- 拼合树（vendor/hermes-agent + runtime 覆盖）`python3.14 -m pytest runtime/tests/hermes_skills/test_zcode_acp_delegate.py team/tests runtime/tests/hermes_cli/test_decision_grant.py runtime/tests/hermes_cli/test_board_team_keys.py runtime/tests/hermes_cli/test_board_team_fence.py -q` → **46/46**（新增 4 项：prompt 组装序、相对锚定/逃逸拒绝/scratch 预测、缺任务/未物化/物化后装配、回执原子落盘无 tmp 残留）。
- `py_compile` 通过。板围栏测试在合并树通过，清偿前批"合并树未验证"挂账一例。
- 未验证项：真实引擎回合（额度 2026-10-27 02:17 重置）；`--task` 与真实桥 session/new 的 cwd 回读对账（待 E2E）。
