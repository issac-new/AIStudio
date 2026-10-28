# 挂账清偿轮：守卫默认值、模板回灌、测试隔离与死件下线

日期：2026-10-28 ｜ 分支：fix/debt-clearance ｜ 触发：用户指示「完成当前项目所有挂账、未做与未验证项；孤儿目录如确认无用，可以删除」。

本批清偿上一轮目录整理（`2026-10-28-repo-structure-tidy.md`）登记的全部挂账，并给出两条被要求「确认无用才删」的对象的核实结论。

## 变更

| 项 | 处置 |
|---|---|
| 运行时模板落后于宿主（挂账 5） | `runtime/hermes_cli/kanban_db_connect.py` 回灌宿主已有的 `kanban-guardrail-envgate` 段（`HERMES_KANBAN_WRITE_GUARDRAIL=1` 时装载 sanctioned-writer 触发器）；`runtime/tools/kanban_tools.py` 回灌 `workspace_kind` 字符串归一化（默认 `worktree`）。两份均为宿主已知良好态，纯增量，无删除行 |
| 部署守卫默认值（挂账 5 后半） | `scripts/deploy-agent-runtime.mjs` 增加 `--force`：目标与模板不同时**默认保留目标并报告**，只有 `--force` 才备份后覆盖；汇总行增加「保留目标」计数。`inject` 仍以 `--apply` 调用（不带 `--force`），因此注入不再剥离宿主侧修复 |
| 测试污染仓根派生配置（挂账 6） | `scripts/inject.mjs` 增加 `OVERLAY_STATE_OUT`：派生 `vite.config.overlay.ts` 与 `.overlay-injected.json` 可重定向输出目录（默认仍是仓根）。`scripts/__tests__/inject-absent-tree.test.ts` 改用之，并新增两条断言：派生 config 落在临时目录、仓根同名文件不被创建或改写 |
| 生成器占位符取值面（挂账 1） | `skills/swarm-yuan/scripts/detect-profile-drift.sh` 的 PROJECT_DIR 取值改走 `spf_conf_val`（引号感知剥注释、`${PROJECT_DIR:-...}` 剥壳、占位符判据），库缺席时回退亦补齐自引用剥壳与占位符判据。新增 `skills/swarm-yuan/tests/test-precheck-conf-project-dir.sh`（`tests/index.tsv` 登记，level 1）：断言模板 conf 经 source 取值恰为 `<项目根绝对路径>`，并静态拦截「裸取 `^PROJECT_DIR=` 整行」的消费者 |
| 治理仓根外机兜底（挂账 3） | `custom/server/governance/repo-root.ts` 末级回落由 `/Volumes/nvme2230/...` 改为 `resolve(process.cwd(), 'governance')`（本地基建目录，与 `serve-server.mjs` 缺省同源）。新增 `custom/server/governance/__tests__/repo-root.test.ts`（3 例：显式 env 优先、SIM 根拼 `central/aipaydev`、末级不含外机路径） |
| 根 `docker-compose.yml`（挂账 4） | 下线：该文件是旧多仓 aipaydev 推演期占位件（网络名 `ncwk-network`，`Dockerfile.server`/`.ide`/`.leader` 从未存在），`docs/windows-x64-setup.md` §6 第 2 条改写为「本仓不提供可运行容器编排，容器路线用 hermes-agent 官方 compose」，并写明恢复命令 |
| `npm run sync` 未验证 | `scripts/sync-upstream.sh` 增加 `--dry-run`：只解析并打印 ROOT、UPSTREAM_DIR、是否 git 检出与计划步骤，不执行 clean/fetch/inject/install；目标不是 git 检出自带告警 |
| evidence 二进制入库（未做项） | 按「冻结存量、禁新增」处理：新增 `custom/__tests__/evidence-binary-freeze.test.ts`，把 34 个历史 PNG 冻结为白名单，新增或静默丢失都红；`docs/README.md` 增「证据与档案分轨」表，写明五轨职责与禁止合并的理由 |
| 多轨档案合并（未做项） | 明确不做，理由成文（见 D3）：五轨契约不同，合并打断可追溯性与打包边界 |
| 孤儿目录 `.claude/worktrees/upstream`（挂账 2） | 核实结论：**是符号链接而非目录**（指向 `lab/upstream`），且被 `custom/client/__tests__/provider-prompt-gateway-profile.test.ts:17` 的 vitest `../upstream` 别名、`scripts/runtime/runtime-doctor.mjs:26`、`scripts/zcode-engine.mjs:26`、`scripts/maintenance/drift-audit.mjs:13` 的兜底路径依赖。删除会断测试与兜底，故保留 |

## 决策记录

- **D1 部署默认改为「保留目标」而不是「备份后覆盖」**：原实现的备份虽可回滚，但每次 `inject` 都会把宿主侧比模板新的修复静默剥离——2026-10-28 实测两次（10:16 与 10:26，两次都是并行会话跑 inject 触发），且事故形态与仓规记录的 D3 事故同族。改默认后代价是模板更新不会自动到达宿主，需要显式 `--force`；这个代价可接受，因为「宿主被悄悄降级」比「更新需多敲一个参数」严重得多。模板与宿主不一致时的正解是回灌模板（先例 `3edd5e32e`），不是强推。
- **D2 模板回灌按「宿主为准」而非「重建」**：两份文件与模板的差异经逐行核对为纯增量（`kanban_db_connect.py` 12 行新增零删除；`kanban_tools.py` 1 换 2），且宿主侧代码带自述来源注释（`t_d37428d2`、上游 10-23 收编 UDF 层），属修复而非本地私改，故直接回灌。
- **D3 多轨档案不合并**：`evidence/`（本仓走查证据，冻结集）、`custom/qgate/evidence/`（qgate 子项目自证，随子项目打包）、`.qgate/`（可再生运行态）、`.archived-patches/` 与 `patches/_skip-*`（退役/移存补丁）、`runtime/hermes-records/research/retired-docs/`（脱敏记录镜像）分属五个契约。合并会同时打断打包边界（qgate 独立发布）、历史可追溯性（退役补丁的 series 语义）与记录镜像的不可去重性。歧义用文档消除（`docs/README.md` 分轨表），不用物理搬迁消除。
- **D4 evidence 二进制冻结而非删除**：34 张 PNG 是 2026-09-28 至 10-18 的走查证据，删掉不可复现；而仓规「二进制不入库」的真实痛点是增量堆积。冻结白名单 + 守门同时满足两条：历史留档不动，新产物进不来。
- **D5 docker 路线下线而非补齐**：补齐意味着新写三个 Dockerfile、把 6.9GB vendor 树做进镜像、并真实验证 `docker compose up`——那是新的容器化交付项目，不是挂账清偿；且该 compose 的网络名与场景都停留在旧多仓 aipaydev 期。文档已指向 hermes-agent 官方 compose，下线不留能力空洞。
- **D6 孤儿符号链保留**：`/Users/cuishi/lab/AIStudio/.claude/worktrees` 曾是本次任务的「待删对象」之一，核实后发现它是符号链接且被 vitest 别名与三个脚本兜底依赖。用户授权的前提是「确认无用」，事实相反，故不动；结论写入本 spec 防止下轮再被当成垃圾。
- **D7 sync 只做到 dry-run 为止**：真跑 `npm run sync` 会 `npm run clean` 撤销注入态、对共享 upstream 做 `fetch/checkout -f` 并重装依赖，在并行会话使用同一套 upstream 的环境中不可接受。本轮把「路径假设」这一唯一改动面做成可验证的 dry-run（`--dry-run` 实测在无检出与有检出两种形态下都给出正确解析），fetch/checkout 主体逻辑未改，风险面已收敛。

## 验证

- `npx vitest run scripts/__tests__/inject-absent-tree.test.ts`：2/2 通过；仓根不产生 `vite.config.overlay.ts` 与 `.overlay-injected.json`（实测 `ls` 均 absent）。
- `npx vitest run custom/server/governance/__tests__/repo-root.test.ts custom/server/governance/__tests__/change-governance.test.ts`：3/3 + 8/8 通过。
- `npx vitest run custom/__tests__/evidence-binary-freeze.test.ts`：2/2 通过。
- `bash skills/swarm-yuan/tests/test-state-machine.sh`、`test-r129-tail-closure.sh`、`test-precheck-conf-project-dir.sh`：全 PASS。
- `bash skills/swarm-yuan/scripts/detect-profile-drift.sh skills/swarm-yuan`：rc=0 无报错。
- `node scripts/deploy-agent-runtime.mjs`（dry-run 对真实宿主）：清单 50 ｜ 相同 50 ｜ 保留目标 0 ｜ 差异 0；临时目录三态实测：无 `--force` 时保留并报告、`--force` 时备份后覆盖。
- `bash scripts/sync-upstream.sh --dry-run`：worktree 形态（无检出）与 `OVERLAY_UPSTREAM_ROOT` 指向主检出两种形态均输出正确解析。
- `bash -n` / `node --check` 覆盖本批改动的脚本。
- 全量 `npx vitest run`（本工作树已注入）：946 个测试文件通过、6 跳过；**6836 用例通过、11 跳过、0 失败**（总计 6847），退出码 0。
- 真实 `npm run inject` 复跑：exit 0，运行时部署汇总「清单 50 ｜ 相同 50 ｜ 已同步 0 ｜ 差异 0」，宿主 `kanban_db_connect.py` 的 guardrail 标记仍为 2 处——新默认值在真实链路里不再剥离宿主修复。

## 设计文档影响

DESIGN_SYNC: none

理由：本批改的是工程纪律与守卫默认值——部署默认值、测试隔离、conf 取值面、治理仓根末级回落、死件下线。整合正本 §4.5 的路径表所列路径不变；数字总账 §D 明确补丁/路由/测试数量不入账。`AGENTS.md` 增规则 10（部署默认值）与规则 8 的冻结说明属工作纪律，不在两正本（整合正本、数字总账）管辖范围内。

## 遗留

- `npm run sync` 的 fetch/checkout/inject/install 端到端仍未跑（D7），只有 dry-run 与静态核对。
- `custom/server/governance/repo-root.ts` 末级缺席时由调用方 fail-soft（`existsSync` 为假或 `git -C` 失败）；若将来要让治理面在纯本仓检出下工作，需把 `governance/` 目录纳入本地基建立法或在部署面注入 `GOVERNANCE_REPO`。
