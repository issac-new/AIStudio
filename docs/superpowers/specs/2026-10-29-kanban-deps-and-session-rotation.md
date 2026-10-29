# 卡依赖图停滞看门狗与会话尺寸轮换（run23 实锤双根治）

日期：2026-10-29 ｜ 状态：已实施（分支 feat/run23-systemic-cure）｜ 背景事实源：docs/superpowers/specs/2026-10-29-agent-self-reflection.md（run23 中毒会话实录）；本 spec 为两案改动的决策事实源。

## 变更

run23 收官后用户令「务必根治」的两项实锤，一案一根治：

**案一：卡依赖图锁死——kanban 停滞父卡看门狗（产品服务层）**
- `custom/server/controllers/sim/board-staleness.ts`（新增）：`GET /api/sim/board-staleness?board=<slug>&staleHours=<h>`——检出「blocked 超过阈值（默认 2h）且仍有在途子卡」的父卡，返回 `{available, board, staleHours, scannedAt, staleParents:[{id, title, blockedHours, blockedSinceSec, blockKind, children:[{id, title, status}]}]}`。fail-soft 读模型：env/板库缺席、库无 tasks 表一律 200 `ok:true + available:false + note`（lib/http `unavailable` 出口）。
- `scripts/board-staleness-watchdog.mjs`（新增，`npm run watch:board-staleness`）：可被 cron/监控调用的薄封装——读端点（Bearer token 认证）→ 检出即输出驱动侧可消费的 issues 留痕行 `ISSUE|board-stale-parent|<父卡id>|<描述>`（simharness issues.log 同格式，描述含 blockedHours 与在途子卡清单）；退出码 0=无停滞/源缺席、1=看门狗自身故障（网络/非 2xx，必须可见）、3=检出停滞。
- 挂载补丁 `patches/706-server-sim-board-staleness-route.patch`：bootstrap/routes.ts import+mount（循 704 fleet-utilization 同模式）。
- 不改 kanban complete 依赖守卫本身（vendor/hermes-agent/hermes_cli/kanban_db.py 的 unsatisfied-parents 拒绝是对的，错在锁死后无人看见——只补检测告警面，不动执法面）。

**案二：低占空比根因——会话上下文尺寸触发轮换（vendor 补丁 705）**
- `patches/705-agent-session-size-rotation.patch`：`gateway/session_rotation.py`（603 会话轮换模块）加第四触发判据——回合末上下文绝对尺寸 `last_prompt_tokens ≥ soft_rotate_tokens`（默认 60000，env `HERMES_SESSION_SOFT_ROTATE_TOKENS` 覆盖，config.yaml `session_rotation.soft_rotate_tokens` 同可配）即以 reason `context-size` 走既有轮换漏斗；同补丁在 `tests/gateway/test_session_rotation.py` 加守门用例与 env 隔离。
- 触发点为 603 既有的回合末检查点（run_turn.py 调用位），零改动；随既有 mode 漏斗（off/report/auto，SIM 自 run16 起 auto）。

## 决策记录

- **D1 案一「非 blocked 子卡」收窄为「在途子卡」（status NOT IN blocked/done/archived）**：done/archived 子卡挂阻塞父是已完成历史不是锁死，计入会淹没告警；run23 锁死形态的子卡停在 review/running/ready（结卡被拒后非终态滞留），收窄后精确覆盖。
- **D2 blocked 时长锚点＝最新一对 blocked/unblocked 事件中的 blocked 侧 created_at（epoch 秒）**：同 vendor `_has_sticky_block` 的取法；无事件或最新是 unblocked（直改库漂移）＝时长不可断定，如实跳过不猜数（fail-soft 不造假）。再 blocked 场景取最新 blocked 段，不被早前旧事件虚增。
- **D3 板库解析序＝HERMES_KANBAN_DB 钉住 → OBS_SIM_ROOT/SIM_ROOT 推演根**（`<root>/hermes/kanban.db` default 板、`<root>/hermes/kanban/boards/<slug>/kanban.db` 命名板）：钉住与 vendor `kanban_db_path` 同名同义；推演根只认显式 env（同 fleet-utilization 口径，不做盘位启发）。直读走 `node:sqlite`（clusterinspector 实锤：studio 进程 PATH 无 sqlite3 CLI）。
- **D4 检测面进产品服务层、消费面独立成脚本**：端点供面板/监控/巡检复用（K19 统一出口 + 架构棘轮只减不增），看门狗脚本无状态可直配 cron；退出码三分（0/1/3）让监控按语义分支而非解析文本。
- **D5 案二判据用绝对尺寸而非水位百分比**：run23 实录上下文 76K-241K 时上游流截断，而 76K/400K=19% 水位判据永不咬合——中毒形态只有绝对尺寸对得上；`last_prompt_tokens`＝回合内末次 API 调用 prompt 尺寸（回合内单调增长，末值即峰值，602 遥测回合后已写入 entry，原生数据源非补丁合成）。判据优先级置于累计迭代之后（先命中先报因，既有因优先）。
- **D6 尺寸触发随既有 mode 漏斗，不新增开关面**：report/auto/off 与冷却窗（防风暴）语义原样继承；SIM 侧 `flip-governance-enforcement.sh` 自 run16 已置 auto，补丁生效即真实轮换，无需 SIM 配置变更。
- **D7 补丁链路在 worktree 完成**：worktree 自持 vendor 检出，注入→快照→改→diff 产补丁→clean 还原→series 登记→inject 重放全链在本树闭环；clean 因主树 8647 活服被拒时以 `OVERLAY_ALLOW_LIVE_CLEAN=1` 放行——活服 cwd 在主树（lsof 实证），跨树无同树分裂态风险。

## 验证

- `npx vitest run custom/server/controllers/sim/__tests__/board-staleness.test.ts`：12/12 绿——run23 形态夹具（blocked 26h 父+review/running 子卡）检出、blockedHours/children 如实；阈值内/子卡全 blocked/全终态/事件漂移/无事件五类不检出；路径解析（env 缺席/钉住优先/default 与命名板两落点）；端点 fail-soft（env 缺席与非看板库均 `available:false`）与 staleHours 夹取。
- `npx vitest run scripts/__tests__/board-staleness-watchdog.test.ts`：5/5 绿——ISSUE 行四段格式（竖线归一防撕裂）、退出码 0/1/3 三态、--issues-log 追加留痕。
- 补丁重放（worktree 全链实测两轮）：`npm run clean` 后 vendor 归零 → series 登记 705/706 → `npm run inject` 全 700+ 补丁干净应用（705→hermes-agent、706→hermes-studio，零 WARN/FAILED）→ 重放态 grep 标记齐全（context-size/soft_rotate_tokens×6、boardStalenessRouter×2）。
- vendor 侧守门：`pytest tests/gateway/test_session_rotation.py` 13/13 绿（含新增 test_reason_context_size：76K@水位19% 命中 context-size、59999 不转）；`python3 -m py_compile gateway/session_rotation.py` 过；判定逻辑另以 7 态快测独立跑过（命中/低于阈值/env 覆盖 30000/坏 env 回落 60000/冷却窗抑制/累计迭代优先级保留）。
- 未验证项：端点经真实 studio 8647 全链（活服在跑，属合并批/主树验证）；看门狗对真 cron 消费链（simharness 侧接线不在本批范围，不动 simharness）；SIM 内网环境 60000 阈值的实占标定（run24+ 对照指标：同形态卡滞时长与人工删会话次数，预期小时级→分钟级）。

## 设计文档影响

DESIGN_SYNC: none——两案均为内部观测面（fail-soft 只读端点+看门狗脚本）与运行时触发判据扩展，整合正本（2026-10-23-swarmstudio-integrated-design.md）与数字总账（2026-10-23-swarmstudio-design-ledger.md）未记载 kanban 健康检测端点、/api/sim 观测族与会话轮换判据面（同族先例 704 舰队遥测亦未入正本，grep 实证），本批不新增正本记载面；run23 实证叙事的决策事实源仍为背景 spec 2026-10-29-agent-self-reflection.md，本批不改动它。
