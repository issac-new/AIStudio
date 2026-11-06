# AIStudio 的 AI-Friendly CLI 契约（机读输出、错误修复建议、进度事件）

## 变更

把「给 Agent 调用的 CLI 该输出什么」从各脚本各自为政收敛为一份可执行契约，先落 3 个试点入口，再用静态棘轮防回退。

- 新增 `config/cli-contract.json`：契约单一事实源（退出码、状态枚举、错误类别词表、结果信封字段、事件名）。
- 新增 `scripts/lib/cli-contract.mjs`（Node）：`parseArgv` / `emitResult` / `emitEvent` / `fail` / `redactSecrets` / `configInspect`；显式 `--format json|human`，**不按 TTY/CI 自动切换**；`--events ndjson` 与 `--format json` 互斥。
- 新增 `simharness/mux/mx-contract.sh`（Shell）与 `simharness/mux/mx_cli_contract.py`（Python）：同一词表的薄镜像，`mx_log` 一律走 stderr；镜像与 JSON 的一致性由守门测试断言。
- 迁移 3 个试点入口：
  - `simharness/mux/mx-gate-timing.sh`：新增 `--format json|human`（保留 `--json` 兼容别名），修掉「`--json RUN` 被当成 RUN_ID」的位置参数缺陷；失败改结构化信封。
  - `simharness/mux/mx-capability-probes.mjs`：新增 `--format json`（stdout 只出结果信封，进度与失败明细走 stderr）、`--inspect-config`；未知参数报 `usage`。
  - `simharness/mux/mx-eval-summary.py`：新增 `--format json` 与 `--inspect-config`；删除两个从未被读取的死参数 `--max-unknown`/`--max-redteam-fp`（阈值正本在产品 `EVAL_MAX_UNKNOWN`/`EVAL_REDTEAM_FP_MAX`）；GAP 退出码由 2 改为契约的 `partial=4`。
- 修正退出码消费者：`simharness/mux/mx-eval-lib.sh` 与 `simharness/aipay-scenario.sh` 按新码分流——**环境/用法失败不再被当成 GAP 放行**（原实现 `2` 同时表示 GAP 与建集/发起失败，导致环境失败也置 G4 通过，属 fail-open）。
- 新增 `scripts/lib/cli-contract-lint.mjs` 并挂到 `node scripts/governance-lint.mjs --cli-contract`：枚举入口、静态判定四项（显式机读模式、stdout 净度、错误信封、凭据脱敏），基线 `config/cli-contract-baseline.json` 只许减；新入口不合规即失败（fail-closed）。
- 新增 `custom/__tests__/cli-contract.test.ts`：库单测、JSON/Shell/Python 词表一致性、棘轮行为（祖父项放行/新违规失败）、3 个试点入口的机读行为（stdout 可整段解析、错误信封含 category/reason/remediation、耗时事件可逐行消费）。
- 机制预算登记（`config/mechanism-budget.json`）：scripts +2（契约库与棘轮检查器 lib）/-1（`scripts/maintenance/regen-473.mjs` 退役——0.7.26 一次性 locale 重生成已执行、引用扫描零命中、git 历史留档），上限 123→124；另配对降级＝删除 `mx-eval-summary.py` 两个从未被读取的死参数。sunset 登记 `cli-contract`（owner=quality，reviewBy=2026-12-20，基线清零且并入 pre-push 后降级为单测断言）。

## 决策记录

### 一、为什么先做 CLI 契约（而不是评测黄金集或决策回执）

三篇文章分别对应「Agent 如何调用工具」「决策如何可验证」「评测如何可回归」。审计 78 个 CLI 入口后的实测：显式 `--format json` 0 个、错误信封 0 个、NDJSON 事件流 0 个、`config inspect` 0 个、重跑计费语义 0 个；stdout 污染总根因是 `simharness/mux/mx-lib.sh:175` 的 `log()` 走 `echo`，被 16 个入口 source。Agent 驱动这些脚本时只能靠人话和退出码猜，与文章二描述的四类事故（停在确认提示、JSON 混进日志、配置不生效、报错不退）同形。

选它作为第一批判据：它是 B（决策回执）与 C（评测黄金集）的公共底座——回执与评测结果都要能被 Agent 机械读取；且改动集中在 `scripts/lib`、`simharness/mux` 三个入口与文档，不触产品服务端行为。

### 二、契约不发明新语义，只把既有约定固化

退出码沿用仓内既有占多数的约定，避免制造第二套口径：

| 码 | 含义 | 来源证据 |
|---:|---|---|
| 0 | 成功（`ok`） | 全仓通行 |
| 1 | 已执行但业务结论为负（`failed`） | `mx-capability-probes.mjs`、`mx-eval-summary.py` |
| 2 | 环境/前置不满足（`environment`），未执行 | `mx-gate-timing.sh` 缺 state.env、`mx-capability-probes.mjs` 基座不可达 |
| 3 | 用法错误（`usage`） | `mx-gate-timing.sh` 缺 RUN、`mx-clean.sh` |
| 4 | 部分成功（`completed_with_errors`） | 新增；对应文章二的「部分失败仍返回摘要」 |

错误类别词表：`usage` / `config` / `auth_required` / `environment` / `upstream_unavailable` / `timeout` / `partial_failure` / `gate_failed` / `internal`。每条错误必须同时给 `reason`（发生了什么）与 `remediation`（下一条该跑什么命令），这是文章二最硬的一条：只报「登录状态异常」等于没报。

### 三、机器可读与人类可读必须显式选择

`--format` 默认 `human`；**禁止**探测 `isatty`/CI 变量自动切换。理由：同一条命令在本地与 CI 返回不同格式，会让「本地能跑、流水线解析失败」变成不可复现的偶发。`--events ndjson` 与 `--format json` 互斥，避免两条 JSON 流混在一起。JSON 模式下 stdout 只允许出现最终结果信封；所有进度、告警、第三方输出走 stderr。

### 四、试点选型：修缺陷优先，不为迁移而迁移

- `mx-gate-timing.sh` 选它是因为它已经有一个**真实解析缺陷**：`FORMAT="${2:-tsv}"` 让 `mx-gate-timing.sh --json RUN` 把 `--json` 当成 RUN_ID；迁移顺带修掉。
- `mx-capability-probes.mjs` 是 G4 的唯一能力探测入口，调用方靠 rc=2 区分「基座不可达」与「能力失效」，正好验证「结构化分型」。
- `mx-eval-summary.py` 是 G4 判定组装器，且有两个从未被读取的死参数——这是「参数存在但不起作用」的典型，比新增功能更该修。

不迁移 `mx-lib.sh` 的 `log()`：该文件正被在途分支 `refactor/platform-rewrite` 修改，本轮改它会制造跨 worktree 冲突。它作为基线祖父项登记，下一轮在 `platform-rewrite` 合入后单独清理（挂账见 §五）。

### 五、退出码 2 的双重语义是真缺陷，不是风格问题

`mx-eval-lib.sh:266-268` 在建集/发起失败时 `return 2`，而 `:277-278` 又把 GAP 返回为 2；`aipay-scenario.sh:2097` 把 2 统一当「GAP 放行」，且 `:2106` 用 `_eval_rc != 1` 判定 G4 通过。结果是**评测集建不起来、评测运行发起失败时，G4 仍然置位**。本批把 GAP 改为 4，并让 2/3/其它一律按「未验证」处理（不置 `g4_pass`，记 `g4_eval_blocked`），与「未验证不发布」的既有纪律一致。

### 六、执行层强制用棘轮，不动 pre-push 时长

新契约若只写在文档里，下一批入口会继续各自手拼 `--json`。检查器挂到既有 `governance-lint.mjs` 的 `--cli-contract` 模式（不新增脚本计数），基线把当前 78 个入口的存量违规祖父化，**只许减不许增**；新增入口未接契约直接失败。本轮不把该模式接进 pre-push 阻断——先观察误报率一轮，与用户裁定的「只落地+单测+棘轮」一致。

### 七、明确不做

- 不做交互式向导：78/78 入口本就没有 `read -p`，保持非交互。
- 不把凭据写进日志/回执：`mx_model_channel.py` 明文输出 API key 是既有反例，本批在契约层提供 `redactSecrets` 并登记为基线违规，不在本轮改该脚本。
- 不做 `--retry-failed` 通用实现：各入口的重跑语义不同（有的幂等、有的重复烧模型），先由契约要求「文档化重跑语义」，具体实现留到各入口所属批次。
- 不引入 OpenTelemetry/Langfuse 等外部后端：本轮只做 NDJSON 事件流，消费方可以是任意日志管道。

## 验证

- `npx vitest run custom/__tests__/cli-contract.test.ts`：库单测 + 三语言词表一致性 + 棘轮行为 + 试点入口行为断言。
- `npx vitest run simharness/tests/mechanism-behavior.test.ts simharness/tests/capability-probes.test.ts simharness/tests/eval-fullflow-integration.test.ts`：既有行为不回归（含 GAP=4 的新断言）。
- 手工取证（结果贴交付说明）：
  - `bash simharness/mux/mx-gate-timing.sh --format json <fixture-run>` → stdout 可整段 `JSON.parse`，stderr 无结果混入。
  - `node simharness/mux/mx-capability-probes.mjs --format json --base http://127.0.0.1:1` → 退出 2，stdout 为 `status=failed`、`error.category=upstream_unavailable`、`remediation` 非空。
  - `python3 simharness/mux/mx-eval-summary.py --dir <fixture> --out /tmp/x.json --verdict-file <fixture>/verdict.json --format json` → GAP 时退出 4、`status=completed_with_errors`。
  - `node scripts/governance-lint.mjs --cli-contract` → 基线内条目放行、退出 0；人为给新入口加违规 → 退出 1。
- `python3 -m py_compile simharness/mux/mx-eval-summary.py simharness/mux/mx_cli_contract.py`、`bash -n` 三个 shell 脚本。
- 机制预算：`node scripts/governance-lint.mjs --budget` 通过（脚本数不变，sunset 已登记）。

## 设计文档影响

DESIGN_SYNC: none——本批只固化 CLI 输出契约与退出码分类，不触整合设计正本与数字总账的设计参数；`docs/manuals/aistudio-design-document-index.md` 与附录 A.1 按机械登记流程同批更新（新增本 spec 一行与计数），不属于设计口径变更。

## 挂账（下一轮）

- `simharness/mux/mx-lib.sh:175` 的 `log()` 改 stderr：等待 `refactor/platform-rewrite` 合入后单独执行，避免跨 worktree 冲突。
- `simharness/mux/mx_model_channel.py:145` 明文 API key：需改成只输出 env 名与脱敏值；本轮仅登记。
- 其余 75 个入口的契约迁移：按「被 Agent 调用频率」排序分批，棘轮基线只减不增。
