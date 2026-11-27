# 2026-11-27 送审后卡片被改动即拒绝凭旧验收报告完成（交付版本过期校验）

> **这份文档让读者做的决定**：独立验收档的任务，在送审之后被改动过正文或附件，能否凭送审时那份验收报告直接完成。本规格的答案是拒绝，并给出重新送审的指引。
> **读者**：看板与验收功能的维护者、审查独立验收流程的会话。
> **缘起**：用户裁决（2026-11-27，「按建议完成裁决」）立项修复文档刷新批挂账 R-12。文档刷新批用探针复跑发现：验收报告绑定的是送审时记录的交付版本，但评审期间改说明文字、改某条验收条件的措辞或新增附件，旧报告仍能通过；只有增删验收条件才被拒。

## 变更

### 事实

- 交付版本的内容校验和覆盖任务正文与附件清单（`runtime/hermes_cli/delivery_version.py`），只在 `request_review` 与 `complete_task` 两个时点记录。
- `complete_task` 的独立验收校验（`runtime/hermes_cli/kanban_db.py` 的 `_independent_acceptance`）只比对「报告里的版本号与校验和」和「最新交付版本」，没有回头核对卡片当前内容是否还等于那个版本。
- 完成时还会再记一次交付版本：内容变了就新建。所以评审期间改过的卡片凭旧报告通过后，完成那一刻会把改动后的内容记成新版本，验收报告绑定的版本和实际交付的版本对不上。

### 改动

1. `runtime/hermes_cli/delivery_version.py`：新增 `current_delivery_checksum(conn, task_id)`，按与 `record_delivery_version` 相同的算法计算卡片当前内容（正文加附件）的校验和；`record_delivery_version` 改为调用同一处内容计算，不保留第二份算法。
2. `runtime/hermes_cli/kanban_db.py` 的 `_independent_acceptance`：最新交付版本自校验通过后，再算卡片当前内容的校验和。与交付版本不一致即拒绝完成，新增拦截码 `delivery_version_stale`，标题「卡片在送审后被改动」，指引是「实现方改完卡片后重新 `kanban_request_review` 生成新版本，审查者按新版本重新审查并提交新报告」。工具层只把拦截条目的说明文字返回给调用方，所以这段指引同时写进说明文字。拒绝照旧落 `acceptance_blocked` 事件。
3. vendor 侧用一枚新补丁把同样的改动打到 `vendor/hermes-agent/hermes_cli/` 下两份文件。原因：Python 测试面以 `vendor/hermes-agent:runtime` 为模块路径，`hermes_cli` 取的是 vendor 里注入后的那份；不回打，测试就对模板改动失明（814 号补丁当初就是为了这个）。
4. 测试（`runtime/tests/hermes_cli/test_acceptance_gate.py`、`test_delivery_version.py`）补五例：送审后改正文被拒；只改某条验收条件的措辞被拒；新增附件被拒；卡片改动后打回并重新送审，生成新版本，旧报告因版本不匹配被拒，新报告通过，且完成后最新版本就是重新送审的那个；`current_delivery_checksum` 与已记录版本在卡片未变时相等、改动后不等。
5. 文档同步：六团队手册 §7.2 的边界表改为修复后的行为；设计正本 §4.4「独立验收与交付版本」补一句过期校验，§6.4 的「独立验收的版本绑定」登记行改写为已修复。文档刷新批规格的挂账 R-12 由本规格清偿：那份规格声明触及四份设计正本，提交检查不允许单独改动它（两份工作台档案与本修复无关），所以它的 R-12 一行保留成文时点的表述，清偿事实以本规格「缘起」一节为准。
6. `config/mechanism-budget.json`：补丁上限 504 改 505，并登记本补丁的变更记录与退役条件（仓规第 13 条：机制预算的上限与退役条件随批登记）。

### 验收

验收方式：每条在「验证」一节有对应的命令与输出。

- 卡片在送审后正文、验收条件措辞或附件有任何变化时，凭旧版本报告完成被拒，拦截码为 `delivery_version_stale`，任务仍在评审状态，并落 `acceptance_blocked` 事件。
- 卡片未改动时，合法报告照常完成（原有用例不回归）。
- 重新送审后新报告照常完成；完成后最新交付版本等于重新送审时生成的版本，不额外新增版本。
- `runtime/` 模板与 vendor 注入后的两份文件内容一致。
- Python 测试面 `py-runtime` 全过；合并档回归全过。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 在验收校验里核对「卡片当前内容等于交付版本」，而不是在每次改卡片时自动生成新版本 | 改卡片的入口多（编辑正文、增删附件、导入），逐个挂版本生成容易漏；校验放在完成这一个关口，一处生效。自动生成新版本还会让「版本在送审时冻结」的语义变模糊 | 改卡片时自动记版本（否决：入口多、易漏，且改动语义） | 是 |
| D2 | 附件变化也算卡片被改动 | 交付版本的内容本来就包含附件清单；评审期间新增附件后凭旧报告完成，报告绑定的就不是实际交付的那份内容 | 附件不计入（否决：与 `delivery_checksum` 的既有定义相悖） | 是 |
| D3 | 只管独立验收档，不动标准档与 PR 档 | 缺口是「旧验收报告不作废」；标准档没有验收报告，完成时会按最终内容记新版本；PR 档的依据是代码仓的检查结果，与卡片正文无关 | 三档都拦（否决：对没有验收报告的档是新增限制，超出本次裁决） | 是 |
| D4 | 两个越过开关保持不变 | `force=True` 与 `HERMES_KANBAN_ACCEPTANCE_OVERRIDE=1` 是人工越过通道，关闭它们是另一项裁决；过期校验位于它们之前，正常路径上生效 | 顺手关闭越过开关（否决：越权） | — |
| D5 | vendor 侧打新补丁而不是改写 814 号补丁 | 814 号补丁已合入主干并多次重放；改写它会改变已有补丁的内容指纹。新补丁只叠加本次增量，回滚时撤掉这一枚即可 | 重生成 814 号补丁（否决：改动已合入的补丁，影响面大） | 是 |

## 验证

以下为 2026-11-27 在独立工作树 `fix-delivery-version-guard`（基于主干 `e4dc94d77`）上的实测结果。

- [x] **先红后绿**：只加测试、未改代码时，`runtime/tests/hermes_cli/test_acceptance_gate.py` 三个「应拒绝」用例失败（3 failed, 11 passed），缺口重现；落修复后两个测试文件 19 例全过。
- [x] **变异探针**：把 vendor 侧的过期校验临时改成恒假，三个「应拒绝」用例立刻变红（3 failed, 11 passed）；还原后 vendor 文件与运行时模板逐字节一致。
- [x] **Python 运行时测试面全量**（`py-runtime`）：`PYTHONPATH=vendor/hermes-agent:runtime <解释器> -m pytest runtime/tests -q -p no:cacheprovider`，281 passed（原 276 加新增 5）。
- [x] **补丁可应用与两边一致**：`npm run clean` 后 `npm run ensure-injected`，状态 complete，日志有 `applied patch: 822-agent-kanban-delivery-version-stale-guard.patch`；`cmp` 核对 vendor 注入态的 `kanban_db.py`、`delivery_version.py` 与 `runtime/hermes_cli/` 模板逐字节相同。改模板后首次注入被部署预检中止（工作区影子部署目录里是旧版文件），把影子目录移到隔离位置后重跑即 complete；未使用强制覆盖，未触碰宿主。中途一次重生成补丁取错了基线（取了已打过第一版 822 的文件），注入器预检失败并整体回滚该通道；改用打 822 之前的基线副本后通过。
- [x] **文档检查四件 51/51**；`docs:check`（routes=130）、`release:check`、`gen-doc-indexes --check`（787/787）、`merge-invariants --check` 全过。
- [x] **机制预算**：首轮合并档回归因 `patches=505 > 504` 失败（根测试面 2 例与 `governance-budget` 面）；登记并把上限调到 505 后 `node scripts/governance-lint.mjs --budget` 0 problem，`budget-retirement` 与 `regression-matrix` 两个测试文件 37 例全过。
- [x] **合并档回归**：最终代码状态上 `npm run regress -- --scope merge` 结果 **15 个测试面 15 通过、0 失败、0 未执行**，退出码 0；根测试面 10420 条通过、12 条跳过。

### 未覆盖

- **宿主部署未做。** 只读试运行（`node scripts/deploy-agent-runtime.mjs --runtime ~/.hermes/hermes-agent`，默认只报告不写入）显示：宿主与仓内模板本来就有 31 个文件不一致（待裁决的宿主覆盖层混合态）；本批改动后多 1 个（`delivery_version.py`，`kanban_db.py` 原本就在清单里）。修复要在这台机器上生效，须等宿主运行时与模板同步；本批不动宿主。
- 两个越过开关（`force=True`、`HERMES_KANBAN_ACCEPTANCE_OVERRIDE=1`）保持不变。
- 看板界面不展示验收拦截原因（现状如此，本批未改界面代码）；拦截码与指引通过工具层的错误文字返回给调用方，没有在真实会话里走查。
- 本批改动没有做独立审查。

## 设计文档影响

DESIGN_SYNC: touched —— 本批修订 `docs/DESIGN.md`：

- §4.4「独立验收与交付版本」补一句：送审后卡片（正文或附件）有任何改动，凭旧版本报告完成一律被拒（`delivery_version_stale`）。
- §6.4「独立验收的版本绑定（2026-11-26 实测）」登记行的现状列改写为已修复，并写明测试位置。
