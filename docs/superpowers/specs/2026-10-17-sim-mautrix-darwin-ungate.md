# SIM mautrix darwin 解门控（补丁 643，2026-10-17）

## 主旨

上游 hermes-agent 把 `matrix` extra 整体门控 linux-only（`mautrix[encryption]` 连带的 python-olm 在现代 clang/MSVC 编不过），裸 mautrix 纯 Python 可装却被一并门掉。macOS 上 pm 正规 sync 因此永不装 mautrix——SIM 的 matrix 能力历来靠旁路 pip/uv 注入 pm 代际环境苟活，pm 迁移/重建代际即丢失，网关重启才现形（2026-10-17 17:11 实录：01:14 旧实例靠旧代际 3b3e 苟活 15h，重启后全部 home_* 适配器 `No module named 'mautrix'`、adapter creation 全灭）。

本补丁只加一条 `mautrix==0.21.1; sys_platform != 'linux'`（E2E 加密仍仅 linux），让正规安装路径在 darwin 合法获得裸 mautrix。

## 决策记录

- **为什么是解门控而不是继续旁路**：旁路注入与 pm 代际生命周期对抗，每次环境重建即丢、且网关常驻化（launchd KeepAlive）后任何重启都会现形；根治=让 pm 自己装得上。
- **为什么只解裸 mautrix 不解 [encryption]**：python-olm 的 sdist 在 darwin/win 编不过是上游门控的真实理由，保留；SIM/桌面形态不需要 E2E（宿主 .venv 与历史 SIM 环境从未装过加密面）。
- **双保险分工**：本补丁（B 案）= 正路，配套快照 `uv.lock` 已 `pm lock` 重解（须官方 pypi 源——镜像源无 upload-time，过不了 hermes 3 天发布龄检查），新代际环境 `pm install` 合法含 mautrix（d10ca884/8bc8b3ee 两代实测）；simharness `mux/mx-sim-mautrix-ensure.sh`（A 案）= mx-up 起跑前 bootstrap 同链探针+旁路注入兜底，覆盖「快照锁被再供给覆盖回 linux 门控」等 B 路失效场景。
- **应用面**：仅 SIM 快照 `hermes-agent-src`（simharness `mx_apply_agent_patches` 注册 643），不进 studio 注入 series，不回写 upstream。
- **编号**：原拟 638 与既有 `638-server-simcenter-routes.patch` 撞号（agent/server 同一编号空间），改 643。

## 验证锚

- 快照重打：`git apply` 正向 + `--reverse --check` 幂等检测双过。
- 正规链路：`pm lock`（UV_INDEX_URL=官方源）→ 清 facts → `pm install --extra anthropic --extra matrix` → 新环境 site-packages 实含 mautrix → `import hermes_bootstrap` 后 `import mautrix` 探针过。
- 兜底链路：人为移除 mautrix → `mx-sim-mautrix-ensure.sh check` 检出 → `ensure` 22 环境自愈 + 网关 kickstart → 复验过（10+ synapse 长轮询恢复）。
