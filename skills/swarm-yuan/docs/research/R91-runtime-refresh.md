# R91 运行时刷新轮（2026-10-05，用户 /goal 三目标②触发）

> 口径：例行刷新轮。5 移动物化（claude-mem v13.31.0 / gsd-core v1.16.0 / ruflo v3.52.0 / graphify v0.9.76 / dsh 克隆对齐），1 项克隆漂移修复。方法：`git fetch origin --tags` + tag 世系核验 + 版本间提交通读；stable release 以 GitHub release（非 prerelease）为准。

## 移动清单

| 运行时 | 前值 → 新值 | 幅度 | 判定 |
|---|---|---|---|
| claude-mem | v13.29.0 → v13.31.0 | 45 commits（跨 13.30 线） | watch 维持；三条方法论样本入 `references/memory-persistence.md` |
| gsd-core | v1.15.0 → v1.16.0 | 161 commits | 实质 minor；`references/gsd-patterns.md` 增 v1.16.0 要点段 |
| ruflo | v3.51.1 → v3.52.0 | ~12 commits | 注记级；表行回写 |
| graphify | v0.9.75 → v0.9.76 | 8 commits | 修复轮；表行回写不开档 |
| dsh | 克隆 0.2.0-rc.2 → dsh-v0.2.1-alpha.1 | tag=master tip 5badb15009 | 克隆漂移修复（基线 R88 已深读 0.2.1-alpha.1，无新深读） |

## 未移动核对（behind=分支领先量非漂移，release 口径零移动）

codex-cli rust-v0.160.0（0.161 全 alpha 不取）、claude-code npm 2.1.289（live CLI 同版）、comet 0.4.4、ECC v2.2.3、openspec v1.14.0、semantica v0.7.0、superpowers v6.4.2、mattpocock-skills v1.3.1、pua v3.5.1、better-harness（克隆 package 0.6.6 领先 release 面 0.4.1，以克隆为参照不动）。

## 吸收决策（两问）

1. **是否出现新的方法论原语？** 是——gsd-core「检查动词全部收编为 gate 模块」（门禁单点化谱系从遏制谓词扩展到全部检查面）与「计划工件写入 seam 单点化」（写通道单一事实源）；claude-mem「压缩保真观察上下文」（压缩不吃结构化证据链谱系新宿主侧样本）与「本地优先 newest-N 冷启动」（冷启动证据经济学）。
2. **是否改变本仓既有结论？** 否——四条均为既有族（单点化/压缩保真/死线传播）的正向补强，无边界修正。

## 产物

- `docs/upstream-baseline.md`：5 行回写（claude-mem/graphify/gsd-core/ruflo/dsh）。
- `Swarm-yuan/references/memory-persistence.md`：claude-mem 治理要点 +4 条。
- `Swarm-yuan/references/gsd-patterns.md`：新增「gsd-core v1.16.0 要点」段（6 条）。
- `Swarm-yuan/research/` 克隆：claude-mem/graphify/gsd-core/ruflo/dsh 五克隆 checkout 至新 tag。
