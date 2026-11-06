# AIStudio 平台重写 P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Speed mode: two mega-batches (Task 1-2, Task 3-5), one review each.

**Goal:** 推演运行单所有权、清场债务不灭、烧机收据绑定真身、文档与催办投影只读真载体——完成平台重写的最后一域，进入最终切换。

**Architecture:** SIM 运行时核心在 `scripts/platform/runtime/`（TS CLI：owner/driver-lock/resident/clean-lease/receipt），product supervisor 与 Bash/relay 经它仲裁；文档生成器 `scripts/platform/docs/`；DISP 终态在 `custom/server/governance/run-metrics.ts` 已有基础上收紧。P0/P1 的全部挂账扫尾并入 Task 4。

**Tech Stack:** Node 24 ESM、bash 适配层、Vitest、jq/py 夹具、route-manifest 复用。

## Global Constraints

- 工作树 `/Users/cuishi/lab/AIStudio/.claude/worktrees/platform-rewrite`；测试 HOME=/tmp/aistudio-platform-p0-home.cTijpN；SIM 测试用临时 SIM_ROOT，不碰宿主运行态、不杀非本任务进程。
- 单一所有权判定=PID+命令身份+instance token+规范化 SIM_ROOT 四因子；禁全局 pgrep/pkill 作为执行依据。
- 收据必须绑定机制文件 digest+coverage+日志摘要；最新失败覆盖历史成功；dry-run 不算收据。
- 清场在第一个停栈/归档/删除动作之前检查全部常驻角色；未闭环债务跨清场存活。
- 文档/页签/路由计数只从载体生成；催办未发送不得显示送达。
- 每任务负例先红；vendor 只走 patch；最后一次性切换前置项（真启动冒烟在本计划 Task 5）。

---

### Task 1: SIM 运行时核心——owner/driver-lock/resident/clean-lease CLI + 四消费方接线

**Files:**
- Create: `scripts/platform/runtime/guard.mjs`（owner acquire/release/adopt、driver-lock、resident register/unregister、clean begin/assert/end、isAlive 四因子判活）
- Create: `scripts/platform/runtime/guard-cli.mjs`（子命令入口：owner-acquire/owner-release/driver-acquire/resident-register/clean-begin/clean-assert/clean-end/lock-status）
- Modify: `custom/server/simrun/supervisor.ts`（start 经 CLI 抢 owner；遇他人 owner 让位落事件；单进程 start/tick 互斥）
- Modify: `simharness/mux/mx-run.sh`、`run-driver-supervisor.sh`、`mx-relay.sh`（经 CLI；Bash supervisor 不再按 pgid 杀"外国驱动"）
- Modify: `custom/server/simcenter/sim-launch.ts`（有 owner 时委托，无则 standalone 仍走统一锁）
- Test: `scripts/__tests__/runtime-guard.test.ts`、`custom/server/simrun/__tests__/supervisor.test.ts` 扩展

**Interfaces:**
- Produces: `ownerAcquire({simRoot,kind,runId,pid,cmdMatcher})` → `{ok,instance}|{ok:false,holder}`；陈 owner 原子 mv 接管；release 匹配 pid+instance；`driverAcquire` 同构；`residentRegister(role,runId)`；`cleanBegin()` 取清场租约（在租约后注册失败）；`assertNoActiveResidents()` 列出活角色。
- 三启动顺序验收：product→bash、bash→product、并发——全程恰一 owner、恰一 driver、败方让位/退出有事件。

- [ ] 负例：双活 owner 拒绝、陈 owner 接管、PID 复用（cmdMatcher 不符不算活）、三顺序让位、清场遇活 resident 在首个 mutation 前拒。
- [ ] 实现+接线+测试绿后提交 `feat(platform): SIM 运行时单一所有权核心`。

### Task 2: 烧机收据 digest 绑定 + 清账投影 + DISP 终态严格化

**Files:**
- Create: `simharness/mux/mx-mechanism-receipt.py`（digest: 机制文件清单 length-prefixed 哈希；收据 schema 2 写入+核验；json 序列化替代 shell 拼 JSON）
- Modify: `simharness/mux/mx-burn-test.sh`（改用 guard 锁状态读 info；产收据带 digest/coverage/driver_log_sha256；写 .qgate/burn/burn-receipts.jsonl 索引）
- Modify: `simharness/mux/mx-prelaunch-check.sh`（㉛ 改为：工具自检+当前 digest 最新收据 status=pass 且 coverage 达 archgate；旧 pass/dry-run/坏 JSON/后 fail 全拦）
- Modify: `simharness/mux/mx-clean.sh`（清场前原子写 clearance 投影 var/clearance/<RUN>/{compensation-ledger.tsv,issues.log}+current；归档 tar 冻结不回改）
- Modify: `simharness/mux/mx-compensation-ledger.sh`（轮目录已清时回落 clearance 投影；append-disp 显式命令）
- Modify: `custom/server/governance/run-metrics.ts`（DISP 配对改"每键最后适用 DISP"按行序；行增 closed/valid/closureError；generic 不批量关不同 subject）
- Test: `simharness/tests/mechanism-behavior.test.ts` 扩展、`custom/server/governance/__tests__/run-metrics.test.ts` 扩展、`simharness/tests/issue-clearance.test.sh` 扩展

**Interfaces:**
- 收据字段：mechanism_digest/mechanism_file_count/coverage/status/run_id/started_at/finished_at/driver_log_sha256/receipt_path。
- DISP 判定：末次适用=exact>generic>single 取行序最后；已修/已闭环需证据锚、观察需复核理由、延后 valid 但不 closed。
- 机制文件清单（MECHANISM_FILES）：aipay-scenario.sh、run-driver-supervisor.sh、mx-{lib,scenario-lib,gate-lib,recovery-lib,relay}.sh、runtime/guard.mjs、custom/server/simrun/supervisor.ts、governance/lifecycle/breaker.ts、相关 runtime/patch 载体——守门测试锁"清单覆盖机制地图且不纳入无关面"。

- [ ] 负例：内容变化即 digest 失效、后 fail 覆盖前 pass、dry-run 无收据、coverage 不足拦、清场后 open/延后仍拦（跨 clean）、新 generic 不遮旧 exact 终态、缺锚"已修"不 valid。
- [ ] 实现绿后提交 `feat(platform): 烧机收据真身绑定与清账跨清场存活`。

### Task 3: 文档投影生成器 + 催办三态 + 培训分层

**Files:**
- Create: `scripts/platform/docs/sync-training-docs.mjs`（复用 scripts/regression/route-manifest.ts 真注册链+package.json+RELEASE-MANIFEST+features.ts；marker 块写版本/路由计数/全量清单；--write/--check）
- Modify: `package.json`（docs:sync/docs:check；release:check 消费同一 check）
- Modify: `custom/server/kanban/owner-routed-nudge.ts`（delivery.state='routed-only'，sent/received=null）
- Modify: `custom/client/kanban/views/SwarmKanbanView.vue`、`KanbanBulkBar.vue`（按钮/提示改"解析催办路由；未发送消息"）
- Modify: `docs/manuals/aistudio-training-and-user-guide.md`（章节指引修正：产品 2/7、项目 7-12、运维 13、审计 14；催办三态定义）
- Modify: `docs/manuals/aistudio-interactive-training.html`（每幕 layer='simulation' 标注+practiceRef 指手册 17.x；命令块标"本页不执行"）
- Test: `scripts/regression/route-manifest.test.ts` 扩展、`custom/server/kanban/__tests__/owner-routed-nudge.test.ts`、`custom/__tests__/interactive-training-manual.test.ts` 扩展、新增 `scripts/__tests__/sync-training-docs.test.ts`

- [ ] 负例：版本/路由漂移时 --check 非零；UI 不得出现"已发送/已接收"成功语义；六团队指引全部命中真实章节标题。
- [ ] 绿后提交 `feat(platform): 文档投影单一载体与催办诚实三态`。

### Task 4: P0/P1 挂账扫尾（backlog sweep）

**Files:**（各一行级，按台账清单）
- `custom/server/platform/authz/route-guard.ts`（trailing-slash 归一入重叠判定）
- `custom/client/governance`（GovEventDomainDto/治理 UI 补 sandbox 域）
- `custom/server/governance/run-metrics.ts` 或 shell 注释（M4 空洞注释措辞）
- `custom/server/toolpipeline/enforce-gate.ts`（re-export SkippedNoContext）
- `scripts/__tests__/release-gate.test.ts`（补中间步失败用例+junit testsuites 顶层属性正则）
- `scripts/__tests__/inject-executor.test.ts`（多补丁叠加回滚字节断言）
- `scripts/build.mjs`（单文件资产 src 下沉 runtime-assets.mjs）
- `custom/platform/contracts/execution.ts`（sandboxNetworkViolation 上移至沙箱硬边界段——P1 终审挂账②）
- `scripts/platform/release/release-gate.mjs`（bundle 身份终检复算比对 bundleId+commit，封 touch/跨树重放面——复审建议加固）

- [ ] 每项负例或断言先红（无法红的纯注释项直接改）；一笔提交 `chore(platform): P0/P1 挂账扫尾九项`。

### Task 5: P2 验收 + 真启动冒烟

**Files:**
- Modify: `docs/superpowers/specs/2026-11-05-platform-rewrite-design.md`（「P2 实施验证」小节）

- [ ] SIM 三启动顺序活体夹具（隔离 SIM_ROOT）录事件流证恰一 owner。
- [ ] 烧机收据链真跑（UNTIL_STEP=smoke..archgate 短场景，隔离根；跑不动真实网关则以 dry-run+夹具证链路并如实标注未活体）。
- [ ] 清场-清账跨轮：造 open 债→clean→下一轮仍拦→resolve 放行。
- [ ] docs:check 绿；release:check 绿；release:gate 在最终提交树重跑全绿。
- [ ] 真启动冒烟：隔离 env 起 serve（npm run serve，随机端口 env），curl /livez 与 /health 200 后即停——P0 终审前置⑥。
- [ ] 变异探针三连：双 owner 并发放行、后 fail 收据放行、清场删债放行——各红→还原绿。
- [ ] spec 写真实计数后提交 `test(platform): P2 推演与文档域验收`。

P2 完成后进入最终切换批（迁移演练、旧路径退役、主干合并与回归）——独立计划另出。
