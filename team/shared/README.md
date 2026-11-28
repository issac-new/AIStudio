# Hermes Agent 统一配置管理

更新 2026-09-17 ｜ 本文件是 `~/.hermes` 舰队的配置地图：改什么、在哪改、怎么生效。

## 舰队地图（谁在哪）

| 位置 | 内容 | 事实源边界 |
|---|---|---|
| `team/shared/profiles.yaml` | 档位差异清单（toolsets/plugins/skills/端口/assignee）：现列 48 个档位条目，其中 27 个在本仓有目录，另 21 个只在宿主上；它是宿主登记的同步快照，不按本仓目录数计 | profile 差异唯一事实源 |
| `~/.hermes/shared/generate-configs.py` | 由 profiles.yaml 生成各 profile 的 config.yaml + .env（精简 override 模式） | 生成器，不要手改产物 |
| `~/.hermes/shared/.env.common` | 共享密钥/通用变量（`${VAR}` 引用注入 config.yaml） | 密钥唯一事实源 |
| `team/shared/domain-registry.yaml` | 10 个域 → 看板 → profile 成员 → owner 映射（`tests/test_board_ownership.py` 断言 10 板） | 域划分事实源 |
| `team/shared/paradigm-map.yaml` | 27 个 profile 的三范式归属（基座/领域/治理） | 范式事实源（2026-10-28 K11 落库；改判只改此表与 `tests/test_paradigm_map.py`） |
| `team/shared/owner-registry.yaml` | 模块级 ownership + matrix 号 + backup；当前覆盖 12 个 profile（`scope: legacy-partial`；现役 27 个），未覆盖者按 orchestrator 兜底 | 职责事实源（部分覆盖，见文件头） |
| `~/.hermes/shared/capability-graph.yaml` | 各 profile 能力/可靠度（done/(done+failed) 自动聚合） | 自动生成区勿手改 |
| `team/shared/acp-harness-catalog.yaml` | ACP harness 启动目录（binary/npx/args/cwdArgs/model.envKeys）；新增标准 harness 只加一条目录项 | 启动规格事实源；准入/退役仍以 `config/execution-contract.json` 为准 |
| `~/.hermes/profiles/<name>/` | 每 profile：`SOUL.md`（身份，运行时自动注入，不可改名挪位）+ config.yaml + .env | 角色细则事实源 |
| `~/.hermes/profiles/_shared/` | 跨角色规则六层（调度/组织/进化/评审/执行/观测）+ templates/ + workflows/ | 过程规则事实源；索引在 `shared-rules-reference.md` |
| `~/.hermes/delivery/` | 软件开发交付标准工作模板 v1.0.0（六阶段×六门禁，工具无关，2026-09-17 起） | 交付流程事实源 |
| `~/.hermes/patches/` | acp-client 插件补丁源 + 铺开脚本（单一事实源，重放幂等） | 插件修复 |

## 用法（生成器）

```bash
python3 ~/.hermes/shared/generate-configs.py --dry-run   # 预览不写入
python3 ~/.hermes/shared/generate-configs.py --diff      # 与现有差异
python3 ~/.hermes/shared/generate-configs.py             # 生成全部
python3 ~/.hermes/shared/generate-configs.py --profile orchestrator
cp team/shared/acp-harness-catalog.yaml ~/.hermes/shared/  # 部署 ACP 启动目录（插件解析序第二位）
bash ~/.hermes/patches/apply-acp-client-codex-fix.sh     # 重铺 acp-client 补丁（含 zcode provider）
```

## 修改配置的流程

1. 改密钥/通用变量 → `shared/.env.common`
2. 改 profile 差异（端口/toolsets/assignee 等）→ `shared/profiles.yaml`
3. 改 ACP harness 启动规格 → `team/shared/acp-harness-catalog.yaml`，复制到 `~/.hermes/shared/`（准入仍改 `config/execution-contract.json`）
4. 运行生成脚本 → 产出各 profile 的 config.yaml + .env
5. 重启对应 Gateway → `hermes -p <profile> gateway run --replace`
6. 改角色行为 → 对应 `profiles/<name>/SOUL.md`（身份文件，运行时自动注入；改动下一次会话生效，无需重启）

### 密钥变量（无值示例）

`team/shared/.env.common.example` 只列变量名，不含任何真实值。复制为 `~/.hermes/shared/.env.common` 后由账户所有者填值：`MATRIX_PASSWORD`、两个微信账号各自的 `K12EDU_WEIXIN_TOKEN` / `ORCHESTRATOR_WEIXIN_TOKEN`，以及 8 个 `*_API_KEY` 模型供应商变量。`profiles.yaml` 只保留 `${VAR}` 引用，不再保存可直接使用的密钥。

如果旧版 `profiles.yaml` 曾包含明文，当前脱敏不能替代轮换：必须由各账号所有者吊销并重新生成那些历史值，再填入本机 `.env.common`。不要把旧值复制到 Git、issue、聊天或测试输出中。

## 设计原理（要点）

- config.yaml 中 `${VAR}` 由 `_expand_env_vars()`（`hermes_cli/config.py:6378`）展开；密钥只在 .env，config 可入库。
- 每 profile config.yaml 仅 ~60 行 override，其余由 `DEFAULT_CONFIG` 经 `_deep_merge` 补全；`mcp_servers` 等自动段保留不覆盖。
- 每 profile .env = `.env.common` 全量 + profiles.yaml `env_extra` 追加。
- 外部编码工具接入：worker-coder 经 acp-client 插件（opencode/codex/claude/zcode 四 provider）；任意仓库接入统一交付标准用 `bash ~/.hermes/delivery/install-into-repo.sh <repo>`。

## 备份纪律

- 改动前备份到 `~/.hermes/backups/<日期-主题>/`，保留相对路径。
- 历史 config 备份已归档 `~/.hermes/backups/config-bak-sweep-20260917/`（37 件，含 MANIFEST 与 sha256）；根目录与 shared/ 不再散放 .bak。
