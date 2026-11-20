# studio vendor 升级 v0.8.28 批＋构建与本机重装（2026-11-19）

> 用户指令（/goal 两目标之一）：自动更新 upstream 组件至 GitHub 最新稳定版本，配套 swarm studio 升级迁移重构；仅构建 mac arm dmg 与 windows x64 zip（构建物暂不上传 github 及 modelscope）；重新安装本机软件到最新版。本 spec 覆盖 vendor 面与构建面；目标二（swarm-yuan 运行时刷新与发版）另立 spec。

## 变更

1. **hermes-studio 基线 v0.8.21（`312425cca`）→ v0.8.28（`5e4fb6354`）**：谱系前进 67 提交/647 文件（+41213/−10191；357 A/280 M/9 D/1 R）。热点=packages/server 226、packages/client 133、tests/server 84、tests/e2e 58、plugin-sdk 35。主题：App 会话恢复（channel open resume）/文件覆盖防护与时区感知调度（闰日/DST）/clarification confirmations 投递/CC-Switch provider catalog 修复/模型代理凭据按需恢复/DeepSeek reasoning replay 与 gateway keep-alive 修复/codex 版本预览改独立插件（删 claude-code-proxy+codex-proxy 控制器路由）/插件 SDK MIT 化/Antigravity 流式退出 0 兜底/Bot Hermes 协议校验修复。依赖变化：+`vue-draggable-plus@0.6.1`、+bin `ekko-studio`、build 链前置 `plugin-docs-harness` 步。
2. **其余 vendor 面盘点（2026-11-19 实测，均免动）**：hermes-agent 最新稳定仍 v0.23.2（canary 流 2026-11-19 不追，VENDOR.md 口径）；zcode origin/main 与钉版 `fec97590` 同 commit。
3. **构建面**：`build:full` 五步链后按 `build:dmg:mac`＋`build:dmg:win` 产出 mac arm dmg＋win x64 zip；产物仅留本地 dist/，**不上传** GH/MS（用户令）。
4. **本机重装**：dmg 安装替换 /Applications 现装版。
5. **伴生台账同步**：vendor/VENDOR.md 钉版行＋批注、RELEASE-MANIFEST.json vendorBaseline、README/AGENTS vendor 表行、设计总账 §C 基线行、docs 索引随批。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| D1 | 升 v0.8.28 而非 tag 字面最大的 v1.1.0 | v1.1.0 tag 内 package.json=0.8.27（营销 tag 谱系，v1.0.9=0.8.11 同先例）；v0.8.28 为 releases/latest 权威最新稳定（2026-11-18 发布）且 v1.1.0 是其祖先 | 升 v1.1.0（否决：少 5 个修复提交，非最新稳定） |
| D2 | agent/zcode 维持现基线 | agent 最新稳定 tag=v0.23.2=现基线；zcode main 同点零增量 | 追 canary/main（否决：钉版策略=稳定 tag/同点，VENDOR.md 口径） |
| D3 | 构建物只 mac arm dmg＋win x64 zip 且不上传 | 用户显式指令 | 全平台/上传（否决：越权） |
| D4 | 新依赖 vue-draggable-plus 经补丁入册 | upstream 缓存树禁手改锁；overlay 新依赖走 patches/ 先例（017/080/103/136-138/573） | vendor 直改（否决：基线漂移，pre-commit 撤出） |

## 验证

（随批补实测）
- vendor-sync 文件面与上游 `git diff --stat v0.8.21..v0.8.28` 吻合；pristine 抽验。
- 净基线 clean+inject 全量重放零失败（studio 补丁失配处置明细随批记录）。
- `npm test` 全量、`npm run typecheck:harness`、`npm run release:check`。
- 构建产物存在性与体积；本机安装后版本回读。

## 设计文档影响

DESIGN_SYNC: touched —— vendor/VENDOR.md（钉版台账正本）、RELEASE-MANIFEST.json（vendorBaseline）、README.md/AGENTS.md（vendor 表行）、`2026-10-23-swarmstudio-design-ledger.md` §C 基线行随批修订；A.1 登记。
