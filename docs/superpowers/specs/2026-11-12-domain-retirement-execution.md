# 服务端域退役执行（27 域删除，2026-11-12）

## 变更

执行盘点正本（`2026-11-12-domain-retirement-inventory.md`）候选退役批次：删除 27 个五信号全零的服务端域目录（含各自 `__tests__/`），共 54 文件 / 2073 行 / 27 个测试文件。删除后 `custom/server` 域数 172 → 145（本分支基点 d064043fa 口径；盘点正本的 171 为其基点 034e94138 口径，+1 属盘点后 main 新增域、不在本批名单）。

### 最终删除清单（27）

`agentsmd/ autosteps/ bashcontract/ browserloop/ changedfiles/ cmdmeta/ commandtask/ configlayers/ crdt/ distillgate/ fileundo/ goalpreempt/ managerhub/ permpresets/ prdelivery/ rulesscope/ secguidance/ sessionfork/ squadcoord/ taskgroups/ teamsummary/ tooldesc/ tuicopy/ urgencyesc/ windowshift/ workerabs/ wsgroups/`

与盘点表 29 个候选的对账：**剔除 2 个**（见决策记录 R-1/R-2），其余 27 个名单与盘点表逐一核对一致、无出入。

### 复核剔除（2）

| 域 | 剔除理由 |
|---|---|
| `benchmarkforge/` | 复核发现盘点五信号未覆盖的真实消费方：`scripts/forge-benchmark.mjs:9` 动态 import `../custom/server/benchmarkforge/forge-cli.ts`，且 `package.json:32` 有 npm 别名 `bench:expert`。盘点 serverX 信号只扫 custom/server，scripts/ 面漏采。**有活消费，不删**。 |
| `disclosurerules/` | 该域唯一文件 `__tests__/disclosure-prompt-gate.test.ts` 不是死域代码，而是活补丁 563/564（Disclosure of Limits 系统提示注入）的**内容级漂移守门**——全仓唯一内容守卫（`custom/__tests__/patches-series-guard.test.ts` 只守 series 编号形态，注释里提到 563/564 但不校验内容）。删它=拆活补丁的验收，零清理收益（34 行）。**移交需裁决档**。 |

### 清理面

- `custom/server/AGENTS.md` 域索引：27 域零登记（关键域索引只列 approval 族等），无需改动。
- `config/features.ts`：27 域无对应开关（reserved 开关为 matrixAuth 等无关项），无需改动。
- `typecheck:harness` 与 vitest 均按文件系统动态发现（`find custom/server` / glob），无静态清单需同步。

## 决策记录

- **R-1 benchmarkforge 剔除**：删除前复跑五信号（任务要求防盘点后新增引用）时扩大到全仓词边界扫描，命中 `scripts/forge-benchmark.mjs` 动态 import＋`package.json` npm 脚本。判定为代码级活消费，从本批剔除并报告——是否随 CLI 一并退役属用户新决策面。
- **R-2 disclosurerules 剔除**：五信号口径度量「谁消费该域」，但该域自身内容恰是别人（patch 563/564/568）的守门测试，零消费者≠死代码。按「自动化必须带验收」红线移交需裁决档，不在本批删。
- **R-3 注释级残渣不清理**：幸存文件中 4 处词边界提及（`harness/rsi-maturity.ts:172` 与 `heldout/held-out-store.ts:6` 提及 distillgate、`harness/nine-layers.ts:182` 与 `permmodes/permission-modes.ts:6,35` 提及 permpresets）均为注释/路线图文案、非代码引用，不改幸存文件；另 2 处提及方（commandtask→cmdmeta、squadcoord→workerabs）本身在本批删除，随宿主消失。历史文档（docs/reports、docs/upstream-analysis、runtime/hermes-records 退休研究档）与 `.swarm-yuan/notes/inventory/server-domains.txt`（点时快照，本就落后 148/171）按历史归档原则不动。
- **R-4 客户端同名义组件确认无消费**：`IdeTeamSummaryBar.vue`/`IdeTaskGroupsPanel.vue` 均读 `chatStore`（上游 store 的客户端镜像，组件头注释明示），无 server 域 import/API 调用；kebab 变体（team-summary/task-groups/changed-files）全量扫描仅命中 testid 与语义文案。
- **R-5 域间互删耦合确认**：cmdmeta↔commandtask、workerabs↔squadcoord 的互提及只在注释且双方都在本批删除，无幸存方引用被删域的 import。

## 验证

- **删除前复核**（全 29 域逐个）：五信号 grep 复跑全零（client/registries/inv/patch 词边界＋serverX import 路径 `['\"]…/<域>/` 含 4 层深度与 `@custom/server/<域>` 形态）；全仓词边界宽扫（排 vendor/自身/specs 档案）仅命中 R-1/R-3 所列注释与文档级提及；共享测试目录（`custom/server/__tests__`、`custom/__tests__`）零 import。
- **typecheck:harness**：删除后 rc=0（全目录制 `find custom/server` 动态文件表，通过即证明无幸存代码引用被删类型）。
- **全量测试**：删除前后各跑一次 `npx vitest run`。前：Test Files 2 failed|1150 passed|6 skipped（1158），Tests 2 failed|8844 passed|11 skipped（8857）。后：Test Files 2 failed|1123 passed|6 skipped（1131），Tests 2 failed|8780 passed|11 skipped（8793）。用例面：测试文件 −27（恰为被删 27 个域测试）、用例 −64（被删测试内含用例数）。失败面：删除前基线在干净基点 d064043fa 上就有 2 处预存红，与本次删除无关——①设计索引契约（interactive-training-manual.test.ts，基线时提交态索引与 frame-reshoot 文件不齐；本批 `gen-doc-indexes --write` 再生成后已复跑转绿，属顺手修复）②qgate 仓库 scope 围栏（qgate-repo-scope-fence.test.ts，基线预存红：scope 清单含 3 个具体文件条目——frame-reshoot spec＋simharness/mux/frame-verify.py＋simharness/tests/frame-verify-empties.test.sh；本批 diff 零触及 .qgate/ 与 simharness/，属治理配置问题移交属主会话）。即：本次删除引入的新失败 = 0。
- **文档索引**：`node scripts/maintenance/gen-doc-indexes.mjs --write`＋`--check` 通过（659 specs 全链接）。
- **合并不变量**：`node scripts/merge-invariants.mjs --check` 通过（receipts 339 行 pass；qgate-health pass）。
- **治理预算**：`node scripts/governance-lint.mjs --budget` 0 problem（40 warning 均为预存 sunset 自然语言告警）；域删除不属于预算类目、未动 features.ts 开关，无 changes 登记。

## 设计文档影响

DESIGN_SYNC: none
理由：纯删除五信号全零的死域，不改任何存活域的契约/阈值/格式；不触及整合正本与数字总账。域索引载体 `custom/server/AGENTS.md` 本就未登记这 27 域。

---

## 后续修订（2026-11-12 同日，用户裁决推翻本批执行）

**用户裁决**：产品处于设计开发阶段，「当前无人调用」是正常态而非死代码证据；吸收矩阵落地件是规划中的能力储备（每域头注带矩阵行号即规划凭证）。**域退役的唯一合法判据＝经多轮推演确认该能力明确不会被人类或 agent 使用**；五信号零（当前消费方为零）只是必要观察材料，不是充分条件。

**处置**：27 域全量恢复（`git checkout 81bf252d3^ -- custom/server/<27 域>`，54 文件原样回植，含测试）。本 spec 的删除执行记录保留作历史；其结论作废，以本节为准。盘点正本（inventory）中「候选退役」语义同步作废——25 个「需裁决」域维持不动，未来任何域退役须先走推演轮证据。
