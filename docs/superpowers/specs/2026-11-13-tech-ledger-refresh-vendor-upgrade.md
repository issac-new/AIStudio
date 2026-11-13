# 2026-11-13 技术组件台账点名刷新＋vendor 双升级批

## 变更

台账 §一.2 点名触发（用户令「根据调研及技术组件台账，更新到最新版，依据此间差异，完善AIStudio及swarm yuan skill」）。本批六件：

1. **hermes-studio 基线 v0.8.20 → v0.8.21**（上游 2026-11-11 发布；`cedaceaef`→新 tag，3 提交/72 文件：BOT 协作历史统一聊天卡片 #3746＋STT 空 transcript 修复 #3753＋release chore #3767）。走 `vendor:sync` 通道＋补丁重放验证。
2. **zcode 基线 v3.18.0 → v3.18.2**（上游 main 两 sync 提交 `b95ebaff`→`fec97590`；148 文件 +5870/−692，主题=apps/zcode-cli memory-diagnostics×8、packages/shared credential-security×4、desktop microphone-access、ui voice-input、model-provider、windows-runtime-host）。按「跟 main」政策同步；zcode-patches 重放验证。
3. **rea-agents 6.9.0 能力差异盘点入台账 §4**（npm 2026-11-12 发布；本机实测 `rea --version`=6.9.0 已最新，无需升级动作——首次查询报 6.8.0 系陈旧缓存，三次复核定谳 6.9.0）。
4. **三 delta 重跑**（用户裁决）：Cybermes v3.5.1 复活 71c（原「代码零漂移/吸收决策期」结论过期）、OpenExecutive v0.7.3（11-09 delta 收口 v0.7.0 后又发 3 tag）、CyberStrikeAI v1.8.0（11-13 跨 minor 发布）。报告落 `~/.hermes/shared/research/<x>-delta-20261113/`。
5. **台账全量刷新落盘**（`team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`）：全部 11-13 实测写回＋判级刷新＋变更日志。
6. **swarm-yuan 面随批**：mattpocock/skills v1.3.2...main 5c 记档（implement-spec 每票新实现者子代理 #1342/chief-of-staff shared wiki #1363/software-factory 术语）；镜像物化基线=tag v1.3.2 纪律不动，等 v1.3.3+ 整刷。

## 决策记录

1. **UserChallenge·批次范围**：全做（vendor 双升级＋rea＋台账＋swarm-yuan 随批）＋三 delta 重跑——用户 2026-11-13 裁决（AskUserQuestion 双问全选最大面）。
2. **rea 已最新定谳**：本机 6.9.0（npm ls -g＋rea --version 双通道复核），台账 6.8.0 行系滞后；动作从「本机升级」改为「能力差异盘点入账」。
3. **mattpocock 镜像跟 tag 纪律**：MANIFEST 物化基线=tag v1.3.2（R143 已刷新至该 tag）；main 5c 不打 tag 不刷镜像，记档待 v1.3.3+。chief-of-staff 在上游 in-progress 目录、属不取清单，5c 对本仓镜像的实际触点仅 implement-spec。
4. **Cybermes 判级重判**：🟡（吸收决策期）→ 复活活跃线，71c 增量按 delta 实测重判（hack 域 Scope Guard 必吸收结论需复核）。
5. **hermes-agent 不动**：v0.23.1 仍最新稳定（main +5475c canary 流不追——既定纪律）。
6. **RETIRED 5 线复核**：AP2/ACP/openclaw-sec/HexStrikeAI/openagentontology 静默 98–150 天，全部无复活，维持退役。
7. **addyosmani/agent-skills 打破静默**：10-14 后 ≥100c（封顶），11-01 push（review findings 验证主题）——🟢 观察线复活，升观察位记档不派卡。

## 验证

- vendor:sync 后 `npm run clean && npm run inject` 零 WARN（studio/zcode 两树分别）；zcode `node scripts/zcode-engine.mjs ensure` 构建绿。
- pristine 抽验：`git show :vendor/<tree>/<file> | md5` 对 upstream 树同文件抽 3/3。
- 台账机械对账：分域行级计数与判级汇总一致（§三行数=§二合计）。
- delta 报告验收冻结五件齐（精确 commit 总数 compare API/主题聚类/基线过期结论清单/吸收建议三档/sha 锚点）。
- `npx vitest run <受影响目标>`＋合并前 `npm test` 全量。

## 设计文档影响

DESIGN_SYNC: none。本批不触及 `docs/DESIGN.md` 整合正本与数字总账；vendor 台账（`vendor/VENDOR.md`）与技术组件台账（`team/shared/research/.../tech-components-ledger.md`）为独立账本随批更新，属本批变更本体非设计正本。swarm-yuan 面仅记档不动 capability-map/facts.conf（mattpocock 镜像跟 tag 纪律、FACT_MATTPPOCOCK_SKILLS=27 不变）。
