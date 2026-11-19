# ACP Harness 目录化：从硬编码分支到声明式启动规格

> 日期：2026-11-19
> 状态：实施中（用户指令「继续 完成所有」）
> 来源：SoduWork 调度智能支柱的声明式 `agent_catalog.json` + 统一 ACP bridge
> 关联：`2026-10-26-acp-client-hardening.md`、`2026-10-26-core-coding-chain-alignment.md`
> 读者：需要新增/切换 ACP harness 的运维与开发

## 变更

### 问题

`team/profiles/worker-coder/plugins/acp-client/__init__.py` 的 `_resolve_provider()` 是四个硬编码 `if/elif` 分支（opencode/codex/claude/zcode），新增一个标准 ACP harness 要改：

- 4 个分支 + 错误文案 + `_PROVIDER_DESC`；
- 21 份 per-profile `__init__.py` 副本；
- `team/patches/acp-client-codex-fix__init__.py` 重铺源；
- 21 份 `config.yaml` 与 SOUL 提示词；
- 测试与文档。

且当前仓库已有漂移：21 份副本 2 个哈希、patch 源落后 worker-coder、`profiles.yaml` 丢失 `HERMES_ACP_PROVIDER: zcode`。

### 范围

**新增**

- `team/shared/acp-harness-catalog.yaml`：四个 provider 的声明式启动规格（strategy/candidates/package/args/cwdArgs/model.envKeys/status/registry_id）。
- `team/tests/test_acp_harness_catalog.py`：目录 schema、准入对账、四种 strategy 解析、模型 env、21 副本与 patch 源一致。

**修改**

- `team/profiles/worker-coder/plugins/acp-client/__init__.py`
  - 新增 `_load_harness_catalog()`/`_catalog_provider()`/`_find_npx()`/`_binary_available()`/`_resolve_from_catalog()`。
  - `_resolve_provider()` 先查目录，未命中回落内置四分支（向后兼容）。
  - `start()` 的 cwd 参数改由目录 `cwdArgs` 决定（旧部署回落 opencode 特判）。
  - `_resolve_model()` 支持目录 `model.envKeys`（旧部署回落 `ZCODE_ACP_MODEL`）。
  - `_PROVIDER_DESC` 与 unknown-provider 错误按目录动态生成。
- 21 份 per-profile `__init__.py` 与 `team/patches/acp-client-codex-fix__init__.py` 同步为同一字节（修复既有漂移）。
- `team/shared/profiles.yaml`：恢复 worker-coder `HERMES_ACP_PROVIDER: zcode`（既有测试已断言）。
- `team/shared/README.md`、`team/skills/devops/acp-provider-selection/SKILL.md`：登记目录、部署位与新增 provider 的正确做法。

**不做**

- 不把 `runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py` 纳入目录：它仍是 zcode 专用 L1 引擎驱动；两套客户端合并留待后续批。
- 不改 `config/execution-contract.json` 的准入/退役名单：目录只是启动规格，`registry_id` 仅用于对账。
- 不做真实 harness e2e（需外部二进制/账号）。

### 验收判据

1. 目录 schema 完整：每个 provider 有 displayName、launch.strategy、必要 candidates/package、model.envKeys。
2. active provider 的 `registry_id` ⊆ `execution-contract.codingBackends.whitelist`；legacy ⊆ `retired`。
3. 四种 strategy（binary/binary_or_npx/npx/command）解析出预期 argv。
4. `model.envKeys` 生效：`ZCODE_ACP_MODEL` 经目录读取；显式 `model` 仍最高优先。
5. unknown provider 错误列出目录 id。
6. 21 份副本与 patch 源字节一致（修掉既有漂移）。
7. 既有 `test_acp_client_hardening.py` / `test_core_coding_chain.py` 全绿。

## 任务卡

### 完成条件

新增标准 ACP harness 只需追加一条目录项 + 部署文件；21 份插件副本与 patch 源字节一致；既有 provider 行为不回退。

### 输入与来源

`team/shared/acp-harness-catalog.yaml`；部署位 `~/.hermes/shared/`；解析序 `HERMES_ACP_CATALOG > ~/.hermes/shared/... > 插件目录同名文件 > 内置四分支`。

### 工作流边界

只改 acp-client 启动解析与目录资产；不改 ACP 协议实现、权限/fs/terminal 边界、execution-contract 准入。

### 工具与副作用

目录加载只读 YAML；未命中回落旧分支；不自动安装/启动 harness（解析阶段只做可执行存在性检查）。

### 结果与证据

`_catalog_provider(id)` 返回目录项；`_resolve_provider(id)` 返回 `(argv, displayName)`；测试断言 21 副本与 patch 源同一哈希。

### 异常与恢复

目录文件坏 → 记 warning 并继续尝试下一个路径，最终回落内置分支；binary/package 缺失 → `FileNotFoundError` 带候选；未知 strategy → `ValueError`。

### 验收反例

active 登记在退役名单应失败；21 副本哈希不一致应失败；command strategy 空命令应失败；npx 无 package 应失败；目录缺失时旧四 provider 仍应可解析。

## 决策记录

### D1 目录放 `team/shared/`，部署到 `~/.hermes/shared/`

与 `profiles.yaml`、`capability-graph.yaml` 同层，沿用共享资产部署模式；不放插件目录（21 份复制会重演漂移），不放 gitignore 的 `config.yaml`。

### D2 解析序：env > 宿主共享 > 插件目录 > 内置

允许运维用 `HERMES_ACP_CATALOG` 做灰度；旧部署没有目录文件时完全走内置分支，零行为变化。

### D3 目录是启动规格，不是准入

`registry_id` 只用于与 `execution-contract.json` 对账；active/legacy 状态不改变治理白名单。理由：准入是治理决策，不能让一个部署文件绕过。

### D4 strategy 覆盖四类启动方式

`binary`（必须有候选）、`binary_or_npx`（先 binary 后 npx）、`npx`（包名）、`command`（自由 argv）。新增 harness 不需要改 Python。

### D5 同步 21 副本与 patch 源

一次性把 canonical 复制到全部副本与 patch 源，修复既有漂移；测试锁字节一致。部署脚本仍以 patch 源为准，未来改客户端代码后重跑同步。

### D6 恢复 worker-coder 默认 zcode

`profiles.yaml` 的 `HERMES_ACP_PROVIDER: zcode` 在 live 快照同步中丢失，既有测试已断言；本批恢复，避免省略 provider 的调用回落到 `default_provider: claude`。

## 验证

```sh
cd .claude/worktrees/sodowork-followups
~/.hermes/hermes-agent/.venv/bin/python -m pytest \
  team/tests/test_acp_harness_catalog.py \
  team/tests/test_acp_client_hardening.py \
  team/tests/test_core_coding_chain.py -q
```

结果：**23 passed**。

未覆盖：真实 harness 启动（需 `zcode-acp-server`/账号）；delegate 的 provider 目录化；`~/.hermes/shared` 实际部署（运维步骤）。

## 设计文档影响

DESIGN_SYNC: none

理由：新增部署资产与启动解析层，不触及整合正本、数字总账或架构图；目录 schema 以 YAML 头部注释与 spec 为单一事实源。
