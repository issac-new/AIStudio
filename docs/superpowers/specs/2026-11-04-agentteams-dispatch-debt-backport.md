# B1 双树漂移既有债清偿：dispatch 链全量回灌补丁链（739）

来源：批一 spec（2026-11-04-agentteams-project-workflow.md）D8 决策登记的既有债——
`runtime/hermes_cli/kanban_db_dispatch.py` 领先注入态 163 行（4 个已提交特性无补丁背书）。
用户 2026-11-04 令「清既有债」。分支 feat/dispatch-debt-backport。

## 变更

**patch 741（24 文件）把 runtime 领先的全部债一次性回灌补丁链**，恢复 manifest
「镜像=upstream+series 全链零漂移」不变量：

- 12 个双树差异文件回灌（kanban_db / kanban_db_dispatch / kanban.py / kanban_parser /
  kanban_db_connect / kanban_decompose / kanban_tools / kanban_tools_schemas /
  efficiency_ledger / kanban_watchers_common / session_kanban / kanban dashboard plugin_api）。
  内含批一 D8 点名的 4 特性：decision-grant/needs_decision（73bfd9cc6）、board_team_keys
  team_raw 集成、estimate 轻载重排 `_reorder_ready_by_workload`（df13a10e3）、DoD 完成契约
  env 注入（10425b642），以及 guardrail 层等更早积累（原 kanban_db.py 条目注记「series 树
  自身缺 guardrail 待 607 移植收编」一并清偿）。
- 3 个 overlay 原生模块因被回灌代码 import 而入链（vendor 树自洽）：hermes_cli/
  board_team_keys.py、completion_contract.py（根）、gateway/noise_filter.py。
- 9 个 runtime 专属测试入链；其中 2 个布局敏感测试加双布局容忍解析器：
  test_decision_grant.py 的 fixtures 定位（repo/宿主双候选+缺席跳过）、
  test_zcode_acp_delegate.py 的脚本定位（宿主 hermes-skills → 仓内 runtime/hermes-skills
  双候选+缺席跳过）。两文件 runtime/ 与 vendor/ 副本逐字节一致（零漂移口径）。
- manifest 陈旧注记刷新（kanban_db.py 的「待 607 移植收编」与 dispatch.py 补 739 收编说明）。

## 决策记录

| # | 决策 | 备选 | 取舍理由 |
|---|---|---|---|
| D1 | 一张补丁全量回灌（12+3+9） | 只回灌 D8 点名的 dispatch.py | 根治口径：漂移是系统病（多会话热修落 runtime 不落补丁），只清一处等于宣告其余为合法漂移；全清后 manifest 不变量才真恢复 |
| D2 | overlay 原生模块中被 import 的三个入链 | 维持 overlay-only | vendor 树不自洽则 repo 内 pytest 无法导入回灌代码（board_team_keys 实锤 ModuleNotFound）；不被 import 的（style-charter/studio-file-approval/coding-delegate 脚本等）保持 overlay-only |
| D3 | 布局敏感测试加双布局解析器 | 测试留在 runtime-only | 测试跟着被测代码入链才能守住回灌面；宿主/仓内两布局都是一等公民，缺席跳过不造假绿 |
| D4 | py312 跑 vendor pytest 的环境性红不属本批 | 修 168 个环境红 | 主树基线实测同跑 168 红（hermes-agent 套件设计跑 .venv 解释器），非本批引入；净差集定谳见验证节 |

## 验证

- 零漂移终验：worktree vendor（注入态+739）vs runtime/ 全部双树清单文件 cmp **0 处差异**
- `git apply --check --reverse -p1 --directory=vendor/hermes-agent patches/739-*` 通过
- 回灌 9 测试文件 pytest（py312）**70/70 绿**（含决策授权/DoD 契约/团队键/估算/委托脚本）
- kanban 族差集定谳（实测）：py312 基线（主树）168 环境性红 vs 回灌树 173——净差 3 =
  TestReplanRound 三例顺序敏感（全族语境下 monkeypatch 错配，单跑/子集/--lf 全绿）。修复=
  测试顶部统一绑定 kd（结构免疫，两树同改）；venv 正牌解释器全族复跑 TestReplanRound 0 失败
  （171 环境红与基线同源，非本批面）
- 全量 `npm test`（干净树全链重放后）：7621 过/0 测试失败；1 文件级失败=linux-sandbox 测试
  import `../../../../upstream/...` 兄弟路径工件（worktree 内不存在，主树有——与批二
  specialist-presets 同类环境项，非本批回归；主树合入后复核）
- 重放台账：`.overlay-injected.json` 尾=739；clean 守门（活体服务）需本树作用域
  OVERLAY_ALLOW_LIVE_CLEAN=1（教训：clean 失败会静默短路 && 链，台账与树态失配=假账）
- 部署：runtime/ 未改动（本来就是权威态），manifest 注记变更不影响部署内容

## 设计文档影响

DESIGN_SYNC: none
补丁链治理动作，不改产品能力面。

## 追记：撞窗事故与本批扩权修复（2026-11-04 晚）

- 合并窗口与并行 v0.22.7 升级会话相撞：对方 3 个再生成补丁（408/470/593）在 v0.22.7 干净
  基线上套不上（再生成基底错），fail-soft WARN 静默跳过致新克隆断链；另有 4 文件 runtime
  保有而链丢失、VENDOR.md 载体漏改 0.22.7、helpers.py 定义缺失（宿主历史部署残留承载）。
- 本批处置：739 让号 740 → **741**；408/470/593 以真前缀基底重建（新文件取对方补丁 +侧、
  改文件 fuzz 落位+手工补 hunk，语法校验过）；新增 **742** 收编 4+1 文件（cron room 目标/
  typing_metadata/tool_selection_key/tool_executor memo/helpers 定义）；VENDOR.md→v0.22.7。
- 终验：clean+inject 全链（含 741/742）0 失败；manifest 双树漂移 **0**；pytest 73+13 绿；
  全量 npm test **7688/0**（含 release 载体守门）。
