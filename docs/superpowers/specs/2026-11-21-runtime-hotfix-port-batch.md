# 宿主热修移植批：runtime/agent 双向分歧收敛（16 件）

> 状态：实施中（2026-11-21 晚开工，worktree `.claude/worktrees/hotfix-port`，分支 feat/runtime-hotfix-port）。前置=spec 2026-11-21-model-pool-unification 批三③ dossier。

## 1. 背景

模型池统一批三走查扯出宿主 runtime 半同步残态：63 纯新增模块已外科补拷（零 .bak），但 **18 件双向分歧**遗留——宿主独有热修（hosted_rooms authority/admissions 子系统、approval smart_cache、agent_init prompt_caching、model_tools action-gate、kanban verification 列等）vs repo 独有近三日批次（dual_sign、required_capabilities、notice throttle 等）。整灌倒退 repo、直接覆盖毁热修；用户裁决（2026-11-21「按建议执行」）＝立项移植批：**repo 为结构基，宿主热修 hunks 加法回植，产出超集**。精确清单以部署 dry-run 复核为准（本仓 63+9 已收敛后）。

## 变更

1. **纯拷方向 2 件**（无歧义，主会话直接执行）：`tools/file_tools.py` 宿主⊇repo→runtime 模板:=宿主版；`tools/kanban_tools.py` 宿主==注入版→runtime 模板:=注入版。
2. **混合移植 14 件，三域并行**（每文件单一写入属主，子代理产出、主会话复核）：
   - A 网关域（runtime 侧）：hosted_rooms/run_inbound/session_kanban/platforms.base
   - B CLI 域（runtime 侧）：kanban_db/kanban_db_connect/kanban_db_dispatch/cron/followups/locales.en_yaml
   - C agent/tools 域：runtime 侧 tool_executor＋vendor 侧 5 件（agent_init/context_compressor/approval/gateway.run/model_tools）
   - 产出落位：runtime 侧改 `runtime/<f>`（repo 原生直改）；vendor 侧改注入树文件→**补丁 813**（`813-hermes-host-hotfix-port.patch`＋series 登记）。
3. **部署收敛**：移植后模板/注入版=超集（含宿主全部热修行＋repo 全部新行，集包含断言机检）→ `deploy-agent-runtime --apply --force` 覆盖宿主（.bak 自动留底；此番 --force 合法性=超集已证，覆盖零丢失）→ 网关 kickstart 换血。
4. **主树解锁**：收敛后 plain `npm run inject` 部署预检应 complete（kept/diff 归零）——批三③ 遗留的 RUNTIME_DEPLOY_TARGET 隔离配方退役为应急手段。

## 决策记录

1. repo 为结构基、宿主 hunks 加法回植；同区直接冲突取 repo 新版并留痕报告（repo 承载已合并的正式批次，宿主热修多为未版本化现场态）。
2. vendor 侧热修进补丁链（813）而非 runtime overlay——deploy 触碰面以注入版为源，overlay 与补丁同文件会双源漂移。
3. `--force` 部署仅在本批超集证明后使用；.bak 全留底可整批回滚。
4. 并发防漂移：移植前后对宿主文件做 md5 快照比对，漂移文件重移植（防热修作者会话同时在途）。
5. kanban.py/kanban_output.py（谱系 MATCH 祖先）与 toolsets.py（repo 超集）＝宿主过期，随 --force 直接覆盖，无 repo 改动。

## 验证

- **集包含双向断言**（脚本机检）：每移植文件，merged ⊇ repo 现行全部实质行 AND merged ⊇ 宿主全部实质行（弃置行须留痕理由）。
- `py_compile` 全过＋host venv import 冒烟关键模块。
- **pytest 拼合树全量**（vendor/hermes-agent 基线＋runtime/ 覆盖层，仓配方）＋根 vitest 全量。
- 补丁 813 clean+inject 重放验证；部署 dry-run 记数：kept/diff 归零（或仅剩已证安全项）。
- 部署后三板：网关进程链/error.log 时间窗 Traceback=0/gateway.log 业务行；studio 聊天探针再落 `hermes|200`。
- 主树 plain `npm run inject` 预检 complete 实证。

## 设计文档影响

DESIGN_SYNC: none——runtime/agent 文件级热修移植，`docs/DESIGN.md` 无对应章节（grep 实测同前批）；部署/收口机制沿用 N-1（spec 2026-11-06-runtime-patch-touched-deploy）语义，无机制新增。
