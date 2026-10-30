# run23 在册挂账批：DM 死信守门 + kanban stuck 假阳性 + terminal-incomplete 重试面 + venv 包面守卫

日期：2026-10-30 ｜ 轮次：20261028-v8-run23 推演收官后在册挂账 ｜ 类型：fix（四项 run 中实录缺陷根治）

## 变更

1. `simharness/mux/mx-scenario-lib.sh` + `simharness/aipay-scenario.sh`（挂账①：G1 回灌 DM 死信）：
   - 新增 DM 送达保障三件套（dm_room 之后）：`_gateway_dropped`（网关容量丢弃判据，单一事实源）、`_dm_readback_has`（回读确认：mx_messages 查 event_id 在房）、`dm_send_tracked`（发送→回读确认→死信检测→自动重发，幂等=重发消息内嵌原 event_id 去重锚；三试全败记 ISSUE dm-send-failed 且退避重试一次，仍败如实返回 SEND-FAILED 不谎报送达）。
   - `_verify_dispatch_delivery` 改用共享 `_gateway_dropped`，并顺带根治其 pipefail 缺陷（见决策记录第二条）。
   - aipay-scenario.sh 两处 DM 派发改走 dm_send_tracked：BA 需求私信（败果不落 ba_dm_marker，下轮驱动自然重试）；G1 准入退回回灌 DM（旧形态 `>/dev/null 2>&1 || true` 全静默——本次死信的直接形态，现留送达结果日志）。
2. `custom/server/clusterinspector/`（挂账②：kanban stuck 假阳性）：
   - `collectors.ts`：RunningCard 增 `last_event_at` 字段；新增 `enrichCardsWithLastEventAt`（遍历各板 kanban.db，取每卡 task_events ∪ task_comments 的最大 created_at 注入行，node:sqlite 直读，fail-soft）。
   - `cluster-inspector-controller.ts`：三个卡面 provider（blocked/done/ready+todo）收敛为共享 `kanbanListWithActivityClock` CLI 桥并接注入。
   - `inspector.ts`：`pickLastTouched` 回退链插入 last_event_at 于第二位；三个卡面映射透传该字段。
   - `detectors.ts`：`detectBlockedStale` 与 `detectReviewFailStall` 的「最后推进时刻」链同步插位（detectUnassignedStale 刻意以建卡为钟，不动）。
3. `patches/707-agent-codex-terminal-incomplete-retry.patch`（挂账③：terminal-incomplete 不进重试面；series 已登记）：`agent/codex_runtime.py` 的 `run_codex_stream`——Codex Responses 流以 terminal status=incomplete 收尾时不再「告警后照常 return final」：有重试余额先物理重试（与 transport 错误同面）；耗尽抛 `EmptyStreamError`（与 anthropic/bedrock 流掐断同族语义）走瞬态失败面，回合不再落 settled，下一轮准入面视为可重入（非终态）。
4. `simharness/mux/mx-lib.sh` + `simharness/mux/mx-up.sh`（挂账④：venv 包面无守卫）：新增 `preflight_venv_packages_assert`——必在包 import 断言（缺省清单 hindsight_client,aiohttp_retry,anthropic,yaml；MX_VENV_REQUIRED_PACKAGES 可整体覆盖、显式置空=禁用），解释器与执行面同源解析（HERMES_BIN 同目录 python → wrapper exec 行 python → 失联即红）；挂入 mx-up.sh prelaunch 段（preflight_capacity_assert 之后），任一缺席=起跑前红。
5. `simharness/tests/run-gates.sh`（验证门解锁，bash 3.2 同族坑）：line 60 报错文案 `（$_ovr）` 裸变量后跟全角括号——bash 3.2 在 C locale 把高位字节并进变量名解析，`set -u` 下报 `_ovr…: unbound variable` 杀脚本。本批在 worktree（无 node_modules，走到该分支）实测触发，挡住全量守门验证；最小修复=花括号护名 `${_ovr}`。c9c4d59c3 引入的既有缺陷，非本批改动引入。

配套守门测试：`simharness/tests/dm-send-tracked.test.sh`（四场景）、`simharness/tests/venv-packages-preflight.test.sh`（五场景）、`custom/server/clusterinspector/__tests__/enrich-last-event.test.ts`（三场景）+ cluster-inspector.test.ts 增 run23 误报形态用例（有活动零报/真卡滞仍报）。

## 决策记录

- **挂账① 根因双锚**：(a) G1 回灌 DM 以 `>/dev/null 2>&1 || true` 全静默发送——mx_send 三试全败返回字面 SEND-FAILED 且退出码 0（mx-lib.sh:411-431），消息未达即死信、无单无重试无 marker，run23 只能人工回灌；(b) 既有群派发回读确认 `_verify_dispatch_delivery` 的网关丢弃判据在驱动 `set -euEo pipefail` 下恒失效——`{ grep A; grep B; } | grep -qF` 形态中第二个 grep（Capacity retry）无命中退出 1 经 pipefail 污染整管道，丢弃行命中也判 MISS。修法=`_gateway_dropped` 单 grep 双 -e 先收拢（`|| true` 归零）再查，生产与测试同 posture 下验证。选「回读确认+死信重发」而非只修 pipefail：run23 死信的 marker 是真实 event_id（网关已收、agent 侧未达），仅修判据不覆盖该形态。
- **挂账② 根因锚**：tasks 表 UPDATE 从不触碰任何时间列（vendor/hermes-agent/hermes_cli/kanban_db.py:776-815 schema 实锚；1471/2081/2086 各 UPDATE 均无时间列）——卡面改判/评论/状态迁移只落 task_events/task_comments；旧回退链（updated_at??heartbeat??completed??created_at）落到 created_at，卡有真实活动仍按建卡时间报卡滞。选「事件面活动钟」而非 agent.log mtime：后者是网关心跳噪音（run23 教训）。fail-stall 的旧注释「result 更新即重置球钟」与 schema 不符，已订正。
- **挂账③ 落点取舍**：死信点在 vendor 钉版基线（禁直改），走 patches/ 新补丁 707（下一可用号，series 登记）。选「重试+耗尽抛 EmptyStreamError」而非仅告警升级：与 anthropic_adapter（无 message_stop 即抛 EmptyStreamError）、bedrock（无 messageStop 抛）、aux 面（incomplete 残响一律拒收）三处既有语义对齐——不完整的响应不得提交。response.failed 保持旧告警行为（error 帧另有 `_raise_stream_error` 通道），不扩大爆炸半径。
- **挂账④ 清单口径**：缺省清单=事故实录包（hindsight_client、aiohttp_retry）+ 推演必经基础面（anthropic、yaml）；不追求全量依赖树（重装面归 mx-setup），只守「起跑即可判红」的最小充分集。与 mxp_worker_smoke 分工：import 断言抓缺包，worker smoke 真打模型往返抓版本冲突（V8.29 教训：import 抓不住 httpx2 分叉类冲突），互补不互代。
- **无已消项**：四项调查均未发现被 sys-cure 批（feat/run23-systemic-cure）或其他批次修掉——706（board-staleness 路由）与本批 ②（blocked-stale 谓词）相邻但不同缺陷面；705（会话规模轮转）治「上下文中毒起因」，707 治「掐流残响被当完成结算」，互补不重复。

## 验证

- ①：`bash -n` 两脚本过；`bash simharness/tests/dm-send-tracked.test.sh` PASS（送达确认/死信重发/容量重递/败果如实四场景，测试本身跑在 set -uo pipefail 下=生产 posture）。
- ②：`npx vitest run custom/server/clusterinspector/__tests__/{enrich-last-event,cluster-inspector,route-hint,session-telemetry-detectors}.test.ts` 4 文件 54 测全过；`npm run typecheck:harness` 零错。
- ③：补丁对干净 vendor 树 `git apply --check` rc=0；修改副本 `python3 -c "import ast; ast.parse(...)"` 过；`npx vitest run custom/__tests__/patches-series-guard.test.ts` PASS（series 登记一致性）。
- ④：`bash -n` 两脚本过；`bash simharness/tests/venv-packages-preflight.test.sh` PASS（五场景）；真机只读实测：HERMES_BIN=真 hermes-sim wrapper → exec 行解析出 ~/.hermes/hermes-agent/.venv/bin/python，hindsight_client/aiohttp_retry 当前均可 import（run23 后已补装，守卫对清包形态起跑即红）。
- 全量：`simharness/tests/run-gates.sh` sh 段 ALL-PASS（含新增 dm-send-tracked/venv-packages-preflight 两件；先被 run-gates.sh:60 bash 3.2 unbound 缺陷挡住，花括号修复后干净跑完）；vitest 段经 `npx vitest run --root simharness` 补跑=14 文件 217 测全过（worktree 无 node_modules，走主检出解析）。注意：以 `MX_OVERLAY_ROOT=<主检出>` 调 run-gates 会把 secret-scan/isolation-boundary 的扫描面扩到主检出全树产生假 FAIL（既有语义面，本批评测确认、未动）；两测试在 worktree 默认 env 下复跑均 PASS。

## 设计文档影响

DESIGN_SYNC: none——四项均为执行层缺陷修复（harness 送达保障/检测器判据/上游行为补丁/preflight 断言），未触及整合正本与数字总账的契约、阈值或口径变更；DM 重发幂等语义、last_event_at 回退链位次、707 补丁语义均已在本 spec 决策记录留档为事实源。补丁 707 的部署面（aipay-agent-sync DEFAULT_PATCHES 是否纳入）留待推演轮验证后另批决定，不在本批扩散。
