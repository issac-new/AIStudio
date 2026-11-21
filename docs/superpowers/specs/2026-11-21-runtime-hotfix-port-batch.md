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
6. **模板残引/断链修正**（移植连带定谳，蓝军建议回填）：模板长期未部署，残留 v0.23.3 前旧生态——①`hermes_state_runtime`（v0.23.3 重构 d74e56806 拆入 persistence，模板 4 处残引）；②`hermes_state_local`/`hermes_state_wal`/`hermes_state_registry.acquire` 等 B 组换掉的断链路线（模块或方法全树不存在）；③`hermes_state_runtime` 同生态的 `authority.db` 属性访问（SessionAuthority 只有 `persistence` 属性）。修正一律对齐两树孪生先例：vendor `gateway/session_handoff.py:15`（AuthorityRefusal as RuntimeStoreError）、vendor `gateway/run_inbound.py` 同函数（authority_persistence→store.admissions.list）、宿主 `session_kanban.py`（bindings/local_session_id/store_location/store.sessions.get）。
7. **蓝军 P0-1 闭环**：审查抓出模板 `run_inbound._hm_stop_owner_turn`/`session_kanban.run_task` 保留的 repo 段本身即断链旧生态（`authority.db` AttributeError/`hermes_state_local` ImportError）——部署即崩 /stop、/new 与 kanban 卡片 RPC。修法=整段对齐 vendor 孪生/宿主生产形态（决策 6 的具体落点）；py_compile 与触域 pytest 未能拦住的原因=函数内延迟 import 无测试覆盖，故部署前加「宿主 venv 下对两文件做 import 级冒烟」为流程补强（见验证段）。
8. **定谳回填**（原留痕在 series 注释，蓝军建议入 spec）：kanban_db.py 宿主 verification 列已被 repo 超集（verification＋required_capabilities＋outcome_id 28 占位）完整包含，零改动；followups.py 宿主 set_meta/list_meta_prefix 路线在 repo SessionDB 包装上 AttributeError，repo state_meta API 为准（仅 4 行裁决注释）；两测试件宿主变体（hermes_state_messages 等不存在模块 import、惰性 body="b"）自身已坏，repo 为准；agent_init pc_cfg=旧方案（repo 新链 auto_start_cache_ttl 超集）；context_compressor 宿主变体为标点旧版。
9. **action_gate.py 收编**：模块本体原仅宿主存（16 件清单外），随本批入 `runtime/agent/action_gate.py`＋manifest 登记（71→72 条）；model_tools 侧在场探测（缺模块=门禁未部署跳过，在场=fail-closed 与宿主逐字一致）。
10. **盲区盯防清单**（部署后观察项，非阻塞）：smart_cache 行为零测试；locales cache 三键树内零消费者（消费在宿主 prompt_cache_clock 生态）；multiplex-active-primary 仅 named profile cron 路径；_stored_conversation 双路径；hosted_room_* 宿主模块群对 repo 版 hosted_rooms 的运行时假设。

## 验证

- **集包含双向断言**（脚本机检）：每移植文件，merged ⊇ repo 现行全部实质行 AND merged ⊇ 宿主全部实质行（弃置行须留痕理由）。
- `py_compile` 全过＋**host venv import 级冒烟**（决策 7 流程补强：延迟 import 不进 py_compile/触域 pytest——对 P0 涉及的 run_inbound/session_kanban 在宿主 venv 下做模块装载验证）。
- **pytest 拼合树全量**（vendor/hermes-agent 基线＋runtime/ 覆盖层，仓配方）＋根 vitest 全量。
- 补丁 813 clean+inject 重放验证；部署 dry-run 记数：kept/diff 归零（或仅剩已证安全项）。
- 部署后三板：网关进程链/error.log 时间窗 Traceback=0/gateway.log 业务行；studio 聊天探针再落 `hermes|200`。
- 主树 plain `npm run inject` 预检 complete 实证。

## 设计文档影响

DESIGN_SYNC: none——runtime/agent 文件级热修移植，`docs/DESIGN.md` 无对应章节（grep 实测同前批）；部署/收口机制沿用 N-1（spec 2026-11-06-runtime-patch-touched-deploy）语义，无机制新增。
