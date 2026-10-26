# Hermes Agent 统一配置管理

更新 2026-09-17 ｜ 本文件是 `~/.hermes` 舰队的配置地图：改什么、在哪改、怎么生效。

## 舰队地图（谁在哪）

| 位置 | 内容 | 事实源边界 |
|---|---|---|
| `~/.hermes/shared/profiles.yaml` | 47 个 profile 的差异清单（toolsets/plugins/skills/端口/assignee） | profile 差异唯一事实源 |
| `~/.hermes/shared/generate-configs.py` | 由 profiles.yaml 生成各 profile 的 config.yaml + .env（精简 override 模式） | 生成器，不要手改产物 |
| `~/.hermes/shared/.env.common` | 共享密钥/通用变量（`${VAR}` 引用注入 config.yaml） | 密钥唯一事实源 |
| `~/.hermes/shared/domain-registry.yaml` | 11 个域 → 看板 → profile 成员 → owner 映射 | 域划分事实源 |
| `~/.hermes/shared/owner-registry.yaml` | 模块级 ownership + matrix 号 + backup | 职责事实源 |
| `~/.hermes/shared/capability-graph.yaml` | 各 profile 能力/可靠度（done/(done+failed) 自动聚合） | 自动生成区勿手改 |
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
bash ~/.hermes/patches/apply-acp-client-codex-fix.sh     # 重铺 acp-client 补丁（含 zcode provider）
```

## 修改配置的流程

1. 改密钥/通用变量 → `shared/.env.common`
2. 改 profile 差异（端口/toolsets/assignee 等）→ `shared/profiles.yaml`
3. 运行生成脚本 → 产出各 profile 的 config.yaml + .env
4. 重启对应 Gateway → `hermes -p <profile> gateway run --replace`
5. 改角色行为 → 对应 `profiles/<name>/SOUL.md`（身份文件，运行时自动注入；改动下一次会话生效，无需重启）

## 设计原理（要点）

- config.yaml 中 `${VAR}` 由 `_expand_env_vars()`（`hermes_cli/config.py:6378`）展开；密钥只在 .env，config 可入库。
- 每 profile config.yaml 仅 ~60 行 override，其余由 `DEFAULT_CONFIG` 经 `_deep_merge` 补全；`mcp_servers` 等自动段保留不覆盖。
- 每 profile .env = `.env.common` 全量 + profiles.yaml `env_extra` 追加。
- 外部编码工具接入：worker-coder 经 acp-client 插件（opencode/codex/claude/zcode 四 provider）；任意仓库接入统一交付标准用 `bash ~/.hermes/delivery/install-into-repo.sh <repo>`。

## 备份纪律

- 改动前备份到 `~/.hermes/backups/<日期-主题>/`，保留相对路径。
- 历史 config 备份已归档 `~/.hermes/backups/config-bak-sweep-20260917/`（37 件，含 MANIFEST 与 sha256）；根目录与 shared/ 不再散放 .bak。
