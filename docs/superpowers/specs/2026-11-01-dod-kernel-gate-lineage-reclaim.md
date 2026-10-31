# 完成契约门下沉内核＋主 gateway 血统收回（dod-drill 实锤根治）

日期：2026-11-01
状态：implemented
触发：真实卡片端到端演练（dod-drill 板 R1/R2）两轮穿透实锤——worker 收到了完整契约 env（`HERMES_KANBAN_DOD_CONTRACT` 已实测在 worker 进程环境），但模型绕开 `kanban_complete` 工具、用终端跑 `hermes kanban complete` CLI 完成无回执关单（`blocked.txt` 如实记录 `UNEXPECTED-PASSED-WITHOUT-RECEIPT`）。深挖发现两层根因：① 门只装在工具层，CLI 完成面无门；② `hermes update` 自更新把运行树劫持到 `~/.hermes/installs/<hash>/environments/<env>/workspace/`（editable finder 覆盖 sys.path），我们部署通道（runtime-manifest → `~/.hermes/hermes-agent`）自该次自更新后不再触达主 gateway/worker 的 CLI 解析（PATH 里 `hermes` → `.hermes/bin/hermes` 代理 → installs）。

## 变更

- **门下沉内核**：`runtime/hermes_cli/kanban_db.py` 新增 `_gate_completion_contract` 并在 `complete_task`（唯一完成边界，工具/CLI/面板共用）内执行——env 契约＋源哈希锁＋回执校验；warn 档违规留 `completion_contract_warning` 事件不拦；拒绝留 `completion_blocked_contract` 事件；通过则把规范化回执写入 `metadata.completion_receipt`。部署缺 `completion_contract` 模块时 fail-closed（拒完成并指引 re-deploy），不再静默无门放行。
- **工具层纯转发**：`runtime/tools/kanban_tools.py` 删除工具层门与死辅助函数，`_handle_complete` 把 `receipt`/`workspace` 透传 `kb.complete_task`。
- **CLI 补回执通道**：`runtime/hermes_cli/kanban.py` `_cmd_complete` 新增 `--receipt`（JSON 字面量或 `@file`；多 id 禁用），透传内核；内核拒绝（ValueError 族）结构化进 `fail_msg` 而非裸 traceback。`runtime/hermes_cli/kanban_parser.py` 注册参数。
- **宿主血统收回（host 操作，不入库）**：`~/.hermes/hermes-agent/.hermes/bin/hermes`（自更新代理启动器，备份 `.bak-dualtree-<ts>`）替换为静态 shim `exec .venv/bin/hermes "$@"`——gateway（launchd 调同路径）与 worker PATH 的 `hermes` 全部回到本树血统（`.venv` 无 installs editable finder，实测解析到 hermes-agent 树）。launchd plist 环境加 `HERMES_SKIP_UPDATE=1` 防自更新再劫持（SIM 同款先例）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 门放 `complete_task` 内核而非补 CLI 面 | 单一边界覆盖所有写面（工具/CLI/面板/未来面）；防复发 | CLI 再加一道（否决：面会继续增多，边角永堵不完） | 是 |
| D2 | 部署缺模块 fail-closed | 演练证明「缺门静默放行」就是穿透形态 | fail-open（否决：R1/R2 实锤） | 是 |
| D3 | shim 收回血统而非改 installs 树 | installs 是自更新领地（会被重写/校验）；`.venv` 是自更新前完整血统且 launchd 本就指向 hermes-agent 路径——收回＝恢复部署通道声明的架构 | 向 installs workspace 部署（否决：版本混架＋自更新清场）；重装上游（否决：丢全部 overlay） | 是（备份原启动器） |
| D4 | `HERMES_SKIP_UPDATE=1` | 自更新＝本次劫持根因；SIM 已用同款；升级走仓内 vendor:sync 受控通道 | 继续允许自更新（否决：部署通道随时再被旁路） | 是 |

## 验证

- 拼合树 `PYTHONPATH=<树> python3.14 -m pytest runtime/tests/hermes_cli/{test_completion_contract_gate,test_completion_contract,test_kanban_idempotency_unique}.py` → **25 passed**（内核门 5：无回执拒/坏回执拒/好回执过/源改拒/无契约直通）。
- `python3.14 -m py_compile` 三文件通过；`runtime/tests` 全量 94+（见交付说明）。
- 演练 R3（真实板 dod-drill、真派发、真 worker、真模型）：负例卡先无回执完成被拒（`completion_blocked_contract` 事件＋worker 收到结构化错误）后带回执过门；正例卡回执校验通过且 `completion_receipt` 落库——结果随演练实记于交付说明。
- 诚实边界：warn 档只留痕不拦（设计如此）；`force=True` 操作员覆盖不豁免契约门（门在 force 判定前）；installs 树仍存在（休眠），其他 launchd 面是否引用它未逐一排查。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-31-model-resilience-hardening.md`：A 层机制行补注「门位于 complete_task 内核边界（2026-11-01 下沉）」；补双树分裂与血统收回事实。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记。
