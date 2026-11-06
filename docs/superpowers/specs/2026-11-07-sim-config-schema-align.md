# 2026-11-07 SIM config schema 对齐（v52 盖章步）

## 变更

- `simharness/mux/mx-setup.sh` 新增 **4d 步「config schema 对齐」**（排在 4b provider 归一、4c 会话轮换归一之后，第 5 段 kanban 之前）：对 `$HERMES_ROOT/config.yaml` 与 `$HERMES_ROOT/profiles/*/config.yaml` 逐份调用 hermes 产品自身的 `migrate_config(interactive=False, quiet=True)`，把三生成器（write_root_config/write_user_profile/write_agent_profile）产出的 legacy `custom_providers`（列表四键形态）收敛到当前 schema（`providers` map + `_config_version` 盖章）。
- 语义断言护栏：每份迁移后校验「变更键 ⊆ {_config_version, providers, custom_providers} 且版本戳已落」，超出即回滚该份原件、`log` 告警并跳过——fail-soft 不阻断 setup（与 4b/4c 同风格）。
- 解释器走 `_mx_yaml_py`（首选宿主 venv python，依赖齐备）；`HERMES_HOME` 逐份指向该 config 所在目录（profile 目录即完整 home 骨架），代码路径取 `AGENT_SRC` 快照（与网关实际执行码同源）。
- 新增守门测试 `simharness/tests/sim-config-schema-align.test.ts`（源契约式，CI 无宿主依赖）。

## 决策记录

- **为什么用 4d 归一步而不是改三生成器产新 schema**：生成器是 mx-lib 内三段同构 heredoc（改任一份须同步另两份，历史多次漏改），且 `apply_direct_channel` 产 legacy 键在运行时完全有效（`get_compatible_custom_providers` 兼容读取层两种键都认、按 name+base_url+model 去重）。走 4b/4c 既有的「生成后归一」模式只动单点，用产品自身迁移逻辑作单一事实源，生成器零改动、既有测试（sim-direct-channel）零改动。
- **为什么现在做**：2026-11-07 磁盘清理轮发现宿主 `~/.hermes` 已在 v0.23.0 且 config 全量 `_config_version: 52`，SIM 42 profile 无版本戳停在旧 schema（用户指令「要对齐，profile 内容也要对齐」）。当日已对存量 42 份 profile 按产品迁移路径手动盖章（PASS=42/FAIL=0，逐份备份 `config.yaml.pre-v52-20261107.bak`），本步保证下次 mx-setup 重生成后自动回到对齐态、不回退。
- **回滚**：单份异常自动回滚该份；整步可通过删除 4d 段回退（迁移本身幂等：已盖章配置 current_ver==latest 不再改写）。

## 验证

- 存量迁移活体实证（2026-11-07）：42/42 profile 迁移 PASS、零语义违例；fanfan 抽样运行时读取面 `get_compatible_custom_providers(load_config())` 解析出 xglm/sglm 双通道（base/mode/model.default/fallback 全对）。
- 幂等性：`migrate_config` 在 `current_ver == latest_ver` 时不落盘（代码路径 `if current_ver < latest_ver … _persist_migration`），重复跑零改写。
- 守门测试（本批新增）：断言 4d 段存在于 4c 与第 5 段之间、覆盖根 config＋profiles glob、`HERMES_HOME=dirname` 逐份调用、三键白名单护栏、`_mx_yaml_py` 解释器、fail-soft 不阻断。运行 `npx vitest run simharness/tests/sim-config-schema-align.test.ts`。

## 设计文档影响

- DESIGN_SYNC: none（纯 harness 供给面变更，未触及整合正本 `docs/DESIGN.md` 的机制/数字/口径；附录 A 与设计文档索引仅登记本 spec 条目）。
