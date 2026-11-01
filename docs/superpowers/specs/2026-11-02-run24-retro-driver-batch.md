# run24 复盘驱动面根治批（六件）

- 日期：2026-11-02
- 分支：`chore/run24-retro-fix`（worktree `.claude/worktrees/run24-retro-fix`，基于 `origin/main`）
- 范围：`simharness/` 驱动与 mux 工具面（不动产品能力、不动 `vendor/**`）

## 变更

本批把 run24 复盘识别出的六个**驱动面**缺陷一次根治。每件都有 run24 实录锚，锚点写进
代码注释，避免同型问题下次以“新问题”面目复发。

### ① DM 直达后备（`mx-scenario-lib.sh`）

- 新增 `mx_dm_send <token> <agent_mxid> <body>`：按 run24 值守配方建房
  `POST /_matrix/client/v3/createRoom {"is_direct":true,"preset":"trusted_private_chat","invite":[<agent>]}`
  再向该房发 `m.text`；房号按收件人 mxid 缓存到 state（`dm_direct_<mxid>`），重复调用不重复建房。
- 新增 `mx_nudge_dm_once <agent> <desc> <text>`：同一收件人本轮被催办计数（state 键
  `nudge_cnt_<agent>`）达 **2** 时，除群消息外再 DM 直达。开关 `MX_NUDGE_DM`（缺省 1）。
- 接线三处静默提醒路径：`wait_alive_truth` 单锚催办、`wait_alive_truth_multi` 分桶催办、
  defect 段测试员（qi/fei）个体静默催办。

**锚**：run24 群内动员令 15 分钟零响应，同一责任人改走 DM 秒触发（四例）；群消息被催办/
回灌/进度行稀释，DM 是直达会话的强提醒。

### ② 复测预启动（`mx-scenario-lib.sh` + `aipay-scenario.sh`）

- 新增 `pretest_prestart_once`：defect/testpass 等待环每拍（节流 `MX_PRETEST_CHECK_SEC`，
  缺省 120s）看 `origin/integration/<RFD>` tip；提交标题含 `[LEAD-MERGE]` 即向 qi/fei 发
  「修复已合入，立即增量复测 X 片」（群 + DM）。
- 幂等键 `pretest_prestart_<sha 前 7 位>`：同一合入提交只发一次。
- 片别推断按合并提交触及路径分 BE/FE，不可判时如实标「按全片」——不假装精确。

**锚**：run24 修复合入 integration 后测试侧仍按“等正式派单”节奏，增量复测起步晚。

### ③ early-start 预备步（`mx-scenario-lib.sh` + `aipay-scenario.sh`）

- 新增 `mx_prep_early_start_tick`：G5 阶段每拍检查三键，未落即一次性派发（群 + DM，
  幂等键即该 state 键），派发后 `sset prep_* 1`：
  - `prep_uat` → audit：`docs/acceptance/<RFD>-uat-evidence-matrix.md`（AC × 证据源对照表草稿，只集料不判词）；
  - `prep_release` → ops：`docs/delivery/<RFD>-release-notes-draft.md`（发布说明骨架 + 灰度三档表草稿）；
  - `prep_retro` → fanfan：`docs/governance/<RFD>-retro-metrics.md`（治理度量预收集）。
- 触发器：G5 段入口 `sset_once g5_phase 1` + `MX_TICK_FN=_g5_tick`（等待环每拍）+
  `mx_gate_breaker_check` 内调用（熔断判定前给一次派发机会）。
- 正式段定稿口径：`prep_finalize_hint <草稿> <产出方>` 在位时，G5 评审派发、UAT 派发、
  复盘度量派发/发版卡面改为「在既有草稿上定稿」，不重复索料。

**锚**：run24 G5 熔断等待期全员空转，UAT 证据矩阵/发布说明/复盘度量本可并行预做，却都压到
正式步才起步。

### ④ 跨域依赖看护（`mx-scenario-lib.sh` + `aipay-scenario.sh`）

- 新增 `dependency_watch_once`：每拍（节流 `MX_DEPWATCH_CHECK_SEC`，缺省 300s）
  `git ls-remote origin 'refs/heads/fix/*'` 取 fix 分支，逐个 `git merge-base --is-ancestor
  <sha> origin/integration/<RFD>` 判未合；未合的按分支名推断域 lead
  （`DEF-BE-*`→wei、`DEF-FE-*`→mei、其他→fanfan），距上次催 ≥600s（`MX_DEPWATCH_NUDGE_SEC`）
  则群 + DM 催「分支已就绪待你 lead 合并」；state 键 `depwatch_<分支名>` 存上次催时刻。
- 对象缺席（未 fetch 到该 sha）→ 定向补取一次，仍缺则跳过（未知不猜）。

**锚**：run24 fix/DEF-* 分支推上去了、域 lead 没合并，integration 缺修复，复测侧空等，
只有人工巡检才发现。

### ⑤ 工作区 origin 单一立法（`mx-setup.sh` + `mx-prelaunch-check.sh`）

- `mx-setup.sh` 第 5b 段新增 `CENTRAL_BARE="${MX_CENTRAL_BARE:-$SIM_ROOT/central-origin.git}"`
  与两个幂等函数：
  - `mx_central_bare_ensure`：bare 缺失即 `git init --bare`；空仓时从导演 clone 种子化
    （先按 `refs/remotes/origin/*` 铺底、再以本地分支覆盖同名——刚 clone 的导演仓往往只有
    远端跟踪引用，只推 `refs/heads/*` 会推空），并把 bare `HEAD` 指到 `main`；
  - `mx_origin_to_bare <repo>`：origin 不等于 bare 即改指 bare，GitHub 地址保留为具名
    remote `github`（只作 bare 的同步上游）。
- 新工作区直接 `git clone "$CENTRAL_BARE"`（origin 生来就是真值锚、不带 token）；存量工作区
  每次 mx-setup 归一一遍（幂等）。
- 导演 clone 同样归一（origin=bare，GitHub 留 `github` remote）：驱动真值锚
  （`repo_has`/`branch_fresh`/`merge-base`）与 agent 推送目标从此同一入口。
- `mx-prelaunch-check.sh` 新增 **⑩d 各工作区 origin 单一性**：任一
  `workspaces/*/aipaydev` 的 origin ≠ `$SR/central-origin.git` 即红，指引=mx-setup 重跑；
  计数器文案「三十三项」→「三十四项」六处同批（prelaunch 头注/尾行、README、方案正本、两处测试）。
- **多机边界（显式收窄）**：`MX_ROLE=agent` 节点仍以 GitHub 为跨节点中枢（本机 bare 只有
  导演机那一份，各节点各建一份会让「谁推的算数」二次漂移）——mx-setup 在 agent 角色跳过
  bare 建/归，⑩d 在该角色下打「跳过」并如实标注，不计为暗中放行。

**锚**：run24 双仓分裂——agent 工作区 origin=GitHub 真远端旧根，驱动真值锚查本机 bare，
四路系分推 GitHub 驱动一条都认不到（agent 自认已交付、gate 判未交付）。

### ⑥ G5 风暴去重 + 快照 out 守卫（`aipay-scenario.sh` + `mx-closure-snapshot.sh`）

- G5 两族重复记单改 `issue_once`（既有函数，签名 `issue_once <type> <subject> <desc>`，
  同类型+主体只记一单）：`g5-ready-fail`、`g5-fail-settled`。**保留**每轮事实
  `mx_gate_breaker_trip g5`（每轮一次是真实轮次证据，由治理服务持久化）。
- `mx-closure-snapshot.sh` `--out` 双语义：以 `.json` 结尾 → 按文件处理（`mkdir -p $(dirname)`
  后写该文件本身，逐端点文件落同目录）；其他/以 `/` 结尾 → 目录语义（`<out>/summary.json`，
  旧行为不变）。

**锚**：run24 `g5-ready-fail` 25 条、`g5-fail-settled` 18 条同文刷单；`--out .../summary.json`
被当目录 mkdir，审计读 `summary.json` 报 `Is a directory`。

## 决策记录

1. **DM 只作第二次起**：首次催办仍只走群（避免对正常在干活的 agent 造成打扰与噪音），
   第二次起才升级为直达；计数落 state 而非内存，重启后不会把“第二次”重新算成第一次。
2. **计数阈值与开关**：`MX_NUDGE_DM` 缺省开（run24 四例实证收益远大于噪音成本），
   可一键回退；阈值 2 与 `MX_NUDGE_MIN_HALF` 的“静默过半才催”叠加，避免过早打扰。
3. **复测预启动以 `[LEAD-MERGE]` 为唯一触发信号**：该标记是既有立法（lead 合并提交固定口径，
   pre-push 客户端钩子已拦），不新增协议；非标记提交一律不触发，避免“任意提交都派单”的噪音。
4. **片别推断用路径前缀而非分支名**：合并提交可能跨片，分支名只反映 fixer 的域；
   路径不可判时按全片并如实标注，不用猜测值冒充精确值。
5. **early-start 只集料不判词**：预备件明确禁止写“通过/不通过”或根因判定，判词严格留在正式段
   （UAT 判词归 bella、复盘判定归汇总人），保真边界不因提前量而松动。
6. **prep 只在 G5 阶段起效**（`g5_phase` 键门）：避免在 devimpl/defect 早期就把 UAT/复盘件
   派出去，造成“过早预做→返工”的新浪费。
7. **依赖看护不猜未知**：sha 对象不在本地时定向补取一次，仍缺即跳过并留痕，不把“没取到”
   当成“未合并”催人。
8. **工作区 origin 单一入口，GitHub 降级为具名同步上游（限导演/单机）**：真值锚必须唯一，
   否则“谁推的算数”随机器状态漂移；保留 `github` remote 是为了出入库搬运能力不丢。
   多机 `MX_ROLE=agent` 节点例外（GitHub 仍是跨节点中枢），边界在代码与 ⑩d 输出里显式声明。
9. **bare 种子化不改远端**：只在 bare 为空时从导演 clone 灌入，不反向操 GitHub、不带 token；
   `HEAD` 显式指 `main`，避免工作区 clone 落在 `master` 空引用上。
10. **熔断等待 tick 的落点**：本批在 `mx_gate_breaker_check`（每次熔断重入）、等待环
    `MX_TICK_FN` 与 G5 段入口三处触发。**supervisor 的 120s 证据等待内环不在本批文件归属内**
    （`run-driver-supervisor.sh` 由主会话同批处理），故“驱动已退出、监督器死等”那段
    目前只靠下一次熔断重入触发——这是本批已知的行为边界，见“验证/未覆盖”。

## 验证

实跑命令与结果（均在本 worktree 执行）：

1. 语法：`bash -n` 五个脚本全过
   （`aipay-scenario.sh`、`mx-scenario-lib.sh`、`mx-setup.sh`、`mx-prelaunch-check.sh`、
   `mx-closure-snapshot.sh`）。`python3 -m py_compile` 不适用（本批无 `.py` 改动）。
2. 守门：`npx vitest run --root simharness tests/harness-gate-integrity.test.ts` → 128/128 通过
   （新增 7 条：DM 计数与开关、`mx_dm_send` 建房一次、复测预启动 sha 幂等与无标记不触发、
   依赖看护域映射与 600s 节流、early-start 三键与 G5 门、⑩d 与计数三十四项、`issue_once`
   去重与 `--out *.json` 行为）。
3. 相邻守门：`tests/dm-send-tracked.test.sh`、`tests/multi-owner-stall.test.sh`、
   `tests/nudge-branch-intel.test.sh` 全 PASS；`tests/v846-governance-closure.test.ts` 7/7 通过
   （计数文案随批改到三十四项）。
4. 轻量幂等（`AIPAY_SIM_ROOT` 指向 mktemp 目录，不碰真实 `SIM_ROOT`）：
   - `mx-closure-snapshot.sh --out /tmp/.../summary.json` → 产出**文件**而非同名目录，
     同目录并存逐端点 json；`--out <dir>` 行为不变。
   - `pretest_prestart_once` 二连调 → 群 1 次 + DM 2 条（qi/fei），state 只落
     `pretest_prestart_<sha7>` 一键。
   - `dependency_watch_once` 二连调 → 分支级 DM 1 条、`depwatch_fix_DEF-BE-1` 落时刻。
   - `mx_prep_early_start_tick`：`g5_phase` 前 0 派发；置键后 3 派发 + 3 DM；再调 0 新增。
   - `mx_dm_send` 二连调 → `createRoom` 只 1 次（房号缓存），消息 2 条。
   - `mx-setup` 的 `mx_central_bare_ensure`/`mx_origin_to_bare`：bare 首建 + 种子化 +
     `HEAD=main`，GitHub origin 归一为 bare 且保留 `github` remote；二次运行零输出（幂等）。

## 设计文档影响

DESIGN_SYNC: touched——方案正本 `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`
的 prelaunch 行计数（「开跑前三十三项核验」→「三十四项」）与本批同源，须同批修订；
prelaunch 清单条目 ⑩d 的判定口径正本=本 spec §⑤与 `mx-prelaunch-check.sh:⑩d` 注释自述。
同批六件的语义正本（阈值/开关/幂等键/边界）分别落在被改脚本的函数头注释，本 spec 为决策
事实源；方案正本的章节级补写（§2.6.14 驱动面六件）由主会话统一收口时同批落地。
