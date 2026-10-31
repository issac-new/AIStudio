# 产品能力收尾批：群时间线第二根源根治（710）+ 企业种子七维映射 + G5 产品通道函数化测试

日期：2026-10-31 ｜ 类型：fix（产品正身）＋feat（评测维度）＋test（harness）

触发：用户裁定「同意所有建议，根治所有问题并落地到产品能力」——上一批遗留清单逐项根治。

## 1. 变更

### 一、群时间线间歇不挂载第二根源根治（patches/710，run23 挂账收案）

**根因链（源码级定位）**：`vendor/hermes-studio/packages/client/src/stores/hermes/group-chat.ts` `loadRooms()`——`rooms.value = res.rooms` 无形态守卫；`listRooms()` 回包无 rooms 字段（网关瞬时降级/错误体 200）时 rooms 被写成 undefined，且随后的 `sortRoomsByActivity()` 对 undefined 展开先抛 TypeError 被 catch 吞掉（error.value 只存文案），rooms 永久停留在 undefined → `GroupChatView.vue` 两处 `store.rooms.length`（:45/:99）抛「Cannot read properties of undefined (reading 'length')」→ onMounted catch 吞 → 时间线整页不挂载。**间歇性来源**=仅当该次 listRooms 回包形态降级（run23 网关不稳实录）；第一根源（activeRoom null 竞态）已由 3d3275734 根治，本件为第二根源收案。

**修法**（overlay 710 补丁，HERMES_CUSTOM[GroupRoomsShapeGuard] 标记）：`loadRooms()` 增 `Array.isArray(res?.rooms)` 守卫——形态降级时保留既有 rooms 列表并置 error 提示（fail-soft：不静默、不清空、不把 undefined 写进状态），回包正常路径零变化。配套回归测试 `custom/client/hermes/__tests__/group-chat-rooms-guard.test.ts`：stub listRooms 三形态（无 rooms 字段/rooms 非数组/正常）断言状态不变 undefined。

### 二、企业约束种子库 9 任务七维映射（生成器根治＋回填通道）

- `custom/server/eval/enterprise-seed.ts`：新增 `ENTERPRISE_TASK_DIMENSIONS`（任务→维度单一事实源，逐题裁定注释）＋`dimensionForEnterpriseTaskId`；`buildEnterpriseSeedTasks()` 逐题带 `dimension`。映射（用户 2026-10-31 授权裁定）：
  - permission 轴 3 题 → `privilege_injection`（跨用户读取/范围外访问/租户越界，皆越权语义直配）；
  - long_horizon 轴 3 题 → `long_task_state`（交接不丢约束/约束漂移/续跑状态，长任务状态语义直配）；
  - compliance 轴逐题裁定：`ent-comp-approval-first` → `human_escalation`（操作先审批=人工升级直配）；`ent-comp-pii-exfil`/`ent-comp-audit-trail` → `unclassified`（数据安全红线与留痕完整在七维无对应类目——按 product-capability D4 纪律禁硬塞冒充覆盖，显式未分类如实单列，与红队社会病理向量同款处置）。
- `custom/server/eval/store.ts`：`labelSetDimensions` 增 `backfill:'enterprise-seed'` 分支（与 redteam-seed 同款：按映射回填存量集、只补未标注、显式标注优先、版本递增、密封集拒绝）。
- 测试：enterprise-seed.test.ts 增「9 任务全带 dimension 且与映射表键一致」断言；eval-baidu-registry.test.ts 增 enterprise 回填断言（回填 6 显式维度+3 unclassified）。
- 边界：SIM 库现存 eset-002（红队 150 题）与归档库不回填——已归档证据不篡改（D4/D6 纪律）；新生成集自带 dimension（根治）。

### 三、G5 human-gate 产品通道函数化＋端到端 stub 测试（harness）

- `simharness/mux/mx-scenario-lib.sh`：G5 块三动作抽为可测函数——`g5_humangate_register`（注册批准单→回显 request id）、`g5_humangate_decide`（代批走产品 decide，404 幂等语义由调用方判）、`g5_humangate_history_probe`（审批历史反查探测）；aipay-scenario.sh G5 块改调三函数（行为零变化，strict 中继逻辑留原地——真值函数内联属等待环本体）。
- `simharness/tests/g5-humangate-channel.test.sh`：sed 提取三函数＋stub `studio/studio_login/issue_once/note`，断言注册取 id/decide 传参与失败记单/探测 grep 判定——上一批 G5 接线只有语法验证，本批补端到端调用形态测试面。

### 四、遗留#5 收案（零改动）

历史 run 旧 gate 兼容（无 checks 只有 gapKeys）已随 run23 产品能力批落地：`custom/server/eval/e2e-verdict.ts:103-104` 兼容分支在案（保持既有文案、不猜原因码）。附录 B#5 关闭。

## 2. 决策记录

- **D1 守卫保旧值而非清空**：回包形态降级时用户已看到的房间列表是有效状态，清空=可用性倒退；error 提示保证不静默。守卫在 store 单点（rooms 永不为 undefined 的不变量），View 层两处 .length 读法随之安全，不在 View 打补丁。
- **D2 补丁而非 custom 覆盖**：group-chat.ts 是上游钉版基线文件且无 overlay 定制挂载点，行为变更走 patches/series（仓库规则：改上游行为必须走补丁）。
- **D3 维度映射禁拉伸**：pii-exfil/audit-trail 不硬塞 privilege_injection（越权≠数据外发≠留痕）——unclassified 显式单列的读数成本低于假覆盖的判据风险。
- **D4 G5 函数化零行为变化**：抽函数只动组织结构（可测性），调用序列/幂等语义/note 文案与上一批逐字一致；strict 中继留在等待环真值函数内（内联属其本体，抽出反而割裂双源判定）。
- **D5 归档库不回填**：维度回填只对新生成集生效；run23 归档评测库（eset-002 等）保持归档时点真值。

## 3. 验证

- 补丁：对干净 vendor 基线 `git apply --check` rc=0；patches-series-guard PASS；注入后 `grep HERMES_CUSTOM\[GroupRoomsShapeGuard]` 在位。
- 客户端：`npx vitest run custom/client/hermes/__tests__/group-chat-rooms-guard.test.ts` PASS（三形态断言）。
- 评测：`npx vitest run custom/server/eval` 全绿（含新增两断言面）；`npm run typecheck:harness` 零错。
- harness：`bash simharness/tests/g5-humangate-channel.test.sh` PASS；`bash simharness/tests/run-gates.sh` sh 段零 FAIL。
- 实测（2026-10-31，worktree fix/product-capability-finalize）：
  - 补丁：`node scripts/inject.mjs` 全序列重放 `[inject] done`，`GroupRoomsShapeGuard` 标记×2 落位（vendor 注入态；patches-series-guard 随 vitest 40 文件全绿）。
  - 客户端：`npx vitest run custom/client/hermes/__tests__/group-chat-rooms-guard.test.ts` → 3/3（无 rooms 字段保旧值+提示／rooms 非数组同款／正常路径零变化）。
  - 评测：`npx vitest run custom/server/eval …` 26/26（含企业映射锁定与 enterprise-seed 回填断言：updated=9、untagged=0、unclassified=2、三维护度计数、显式标注优先）。
  - G5 通道：`bash simharness/tests/g5-humangate-channel.test.sh` → 8 断言 ALL-PASS（注册取 id/失败记单/decide 成功/404 幂等分诊/真失败 rc1/探测命中与缺席/场景脚本三调用点在位）。
  - `bash simharness/tests/run-gates.sh` sh 段零 FAIL；`npm run typecheck:harness` rc=0；`npm run typecheck:client` rc=0（错误在基线内，基线文件已还原未入库）。
  - 附记：bash 3.2 全角括号吞变量名坑复现（`$OUT）`→unbound），测试内已花括号护名——与 run23 既有坑同族。

## 4. 设计文档影响

DESIGN_SYNC: none——三件均为执行层/数据映射修复（客户端状态守卫/评测种子标注/驱动函数化），无契约、阈值、口径变更；七维定义与 unclassified 语义沿 product-capability 批 D4 既有立法，映射表注释即裁定事实源。
