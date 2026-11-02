# 板围栏全名册供给——run24/run25 双轮复发的围栏拒派根治（mx-setup 供给侧）

日期：2026-11-02 ｜ 类型：fix（simharness 供给面）｜ 状态：implemented（run25 值守立查立改批）

## 变更

run25 G2 环（20:15-20:26）复现 run24 同款病：kanban dispatcher `skipped_nonspawnable`
16-18 次/tick、ready 队列非空但 0 workers spawned。根因链：

1. mx-setup 第 5 段 `set_board_team "$slug" "$(agent_profile …)"` 给每板围栏只挂
   **板主单一 agent profile**（如 fei-test-mp → `fei-tester`）。
2. 推演中卡的 assignee 面远大于板主：缺陷卡指到工作流归属子编制
   （`xiao-csw-cashier-mp`）、修订/评审卡指到基名（`fanfan`）。
3. patch 391 围栏 fail-closed——不在表内即拒派；run24 收口批只修了当轮 4 板的
   运行态 board.json（未入 mx-setup），mx-clean 清场重建后模板态复发。

修法（供给侧根治）：

- `mx-lib.sh set_board_team` 改收多 agent-id：`meta['profiles'] = sorted(set(sys.argv[2:]))`，
  单参调用向后兼容。
- `mx-setup.sh` 第 5 段：先合成**全编制名册**（node_users 基名＋各账号 agents_of 全部
  子编制 profile），每板 `set_board_team "$slug" $ROSTER`——SIM 单 home 内 42 profile
  全部是合法领卡人；围栏对「别的 home」（真机 orchestrator）的隔离语义不变。
- `mx-board-supply-check.sh` 头部供给配方注释同步为多名册形态（该检查只断言
  board.json 带 profiles 键，不钉名册内容，无需改判定）。

同批补收第二处供给缺口（run25 20:40 现场续锤，同文件收口）：

- **板 default_workdir 供给缺位**：agent 缺陷卡/驱动 G2 退回卡不带 workspace_path，
  板又无 default_workdir 时 worker 起不来→卡 blocked（`workspace_kind=worktree but no
  workspace_path`；skills/requirements-analyst/SKILL.md 已把该形态记为已知坑，
  mx-scenario-lib 应用资产表也约定「board.json default_workdir 指向工作区」，但供给层
  从未落码）。修法：`mx-lib.sh set_board_workdir`（board.json.default_workdir=板主
  `workspaces/<u>/aipaydev`）＋mx-setup 第 5 段建板时同步设置。路径在 §5 时点尚不存在
  （§5b 才克隆）无碍——default_workdir 是派生时读的指针，非建板时校验项。

## 决策记录

- 全名册而非「板主＋已知缺陷目标」枚举：枚举必再漏（run24 修 4 板→run25 复发即证）；
  SIM 板是单 home 单租户，围栏的隔离对象是外部 home，不是自家编制。
- 运行态与本轮已建的 28 板当场回灌全名册（值守立查立改面），供给侧改动保证
  下轮 clean→setup 后不复发。
- 不删围栏整键（run24 期望值给过的另一选项）：保留 fail-closed 形态，供未来
  多 home 推演拓扑复用。

## 验证

- 前置已实测：手工补齐 fanfan-review/fei-test-mp 两板实际 assignee 后，拒派告警止于
  20:26:04、两板 ready 清空、3 缺陷卡＋1 修订卡全部派生，G2 安全评审 20:26 过闸。
- default_workdir 运行态实测：28 板补设后重排 7 张真伤卡（G2 修订/3 FE 缺陷/T01/T02/T03），
  全部 worker 起跑 running、consecutive_failures 清零、拒派面只剩 PM 镜像卡的 1 例
  unattributed（设计态）。
- 本批落地后：`bash -n` 语法门＋`bash tests/run-gates.sh` 守门套件全绿＋28 板
  board.json 回读名册数=编制名册数。

## 设计文档影响

DESIGN_SYNC: none——simharness 供给面内部修复，围栏契约（patch 391 fail-closed 语义）
不变，仅供给名册口径从「板主单 profile」扩为「本 home 全编制」。
