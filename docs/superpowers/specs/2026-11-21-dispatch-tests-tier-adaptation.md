# 2026-11-21 dispatch 族测试 tier 适配批（换血批 N-5 清偿）

> 背景：hermes-agent v0.23.3 换血批挂账 N-5（原归因「project_pause 派发链语义漂移随 732/741 域跟进批」）。本轮探因**推翻原归因**：真因=2026-11-19 批二立法 `unmarked_decision_tier()`=T2（从严默认，防漏标绕过 HumanGate；tools/kanban_tools.py:80-85）落地时，dispatch 族存量测试未随批适配——测试卡 body 无 tier 标记→缺省 T2→`authorize_task_execution` 无持久化 grant→`missing_grant`→`needs_decision` 不派发。运行时探针实证：隔离 home＋monkeypatch profile 存在后 `dispatch_once` 返回 `needs_decision: [(task, 'missing_grant')]`（profile 面/allowlist 面/暂停面全部正常）。与基线无关（v0.23.2/v0.23.3 同红），与换血批零关系。

## 变更

1. `patches/732-agent-kanban-project-pause.patch`：`_make_task` 的 `kb.create_task(conn, title=title, assignee=assignee)` 增 `body="tier=T1"`——该文件 6 用例全部经此建卡，一处覆盖。测试面语义=暂停过滤（与授权语义正交），T1 直通即恢复对正交面的检验。
2. `patches/419-agent-board-concurrency-gate.patch`：测试卡 `body="b"` 全量改 `body="tier=T1"`（同正交理由——该文件测板级并发闸）。
3. 零产品代码改动：门行为（未标层=T2 fail-closed）是批二立法正身，不放松。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 适配测试而非放松门 | 门是结果授权地基（团队立法 completion-contract.md「未标层按 T2 从严」）；测试本就不该隐式依赖「未标层可派发」的旧世界。与 test_decision_grant.py 显式 grant 面互补：存量正交面测试用 T1 直通 |
| D2 | N-5 原归因作废并在挂账行更正 | 实证链：探针 needs_decision 实锤＋unmarked_decision_tier 立法时间（2026-11-19 批二）与红引入时刻吻合＋与基线无关。换血批 spec 挂账行由本批同批更正（SPEC_REBIND） |
| D3 | 只修 dispatch 族 5 枚 | 其余 9 红（delegate/memory/followup/subagent/dreaming）非 missing_grant 病（已抽验 delegate/concurrency 族失败形态不同），不属本批范围 |

## 验证

- [x] worktree 净基线 clean+inject manifest complete（493/493）。
- [x] test_project_pause.py 9/9 绿＋test_kanban_board_concurrency.py 全绿（修前 3F＋2F）。
- [x] 全补丁测试清单复跑：红集 14→9（消失的 5 枚=本批 5 枚；余 9 与主检出存量同集，净红=0）。
- [x] patch 正文与树上面（注入产物）一致（重放后 diff 验证）。

## 设计文档影响

DESIGN_SYNC: none 附理由——纯测试适配：改的是补丁自带测试的建卡 body（tier 标记），产品行为零变化；不触及设计正本。换血批 spec 的 N-5 行更正属挂账台账修订（随批 SPEC_REBIND）。
