# 第三方组件及 skill 运行时台账刷新（2026-11-03）

用户指令：更新依赖的第三方组件及 skill 等运行时台账到最新版。六面逐一与上游实测核对（git ls-remote / npm registry，2026-11-03 实测；github 连通经 SFM 重连恢复）后，两面有更新、四面无更新。

## 变更

1. **exa-mcp-server 3.4.1 → 3.4.3**（npm dist-tags.latest 实测）：`runtime/exa/manifest.yaml` transport.args/version/锁定注释三处进位；`patches/396-agent-exa-mcp-catalog.patch` 随正身重生成（new-file diff，目标 `optional-mcps/exa/manifest.yaml`）。
2. **zcode 底线 3.17.1 → 3.17.2**（上游 main a60ba6a7 → a9fe401e，+1 提交「chore: sync ZCode source v3.17.2」；同步口径=上游 main 变更非版本 tag，2026-10-25 用户裁定）：`upstream/zcode` 缓存树 checkout 新基线（顺带治理缓存树落后——原 HEAD 3c5b2276，违反 pristine 规则「HEAD 与钉版同 commit」）；`vendor/zcode` 整树 git archive 换血（VENDOR_SYNC=1）；`zcode-patches/series` 头部基线注记进位；8 条活跃补丁（002-009）新基线重放。
3. **伴生台账同步**（ycode 版本进位载体）：`RELEASE-MANIFEST.json`（version/notes×2/vendorBaseline）、`vendor/VENDOR.md`（zcode 行+批注记）、`README.md` vendor 表、根 `AGENTS.md` vendor 表、`team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`（§一/§五/§八）、`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md` §C 两行。
4. 本批**不是发布轮**：台账进位不触发 GitHub/ModelScope 发布。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| D1 | semantica/pua/hermes-agent/ekko-studio 四面无动作，仅记核对结论 | 上游实测：semantica 最新 tag 仍 v0.7.0；pua main HEAD 仍 e6e6cd2；hermes-agent 无 v0.23+（最大 tag v0.22.6）；ekko-studio 最新 tag 仍 v1.0.9（dad736a93=钉版） | — |
| D2 | hermes-agent 上游 main（74b2ed6）领先 v0.22.6 tag 但不追 | 钉版策略=稳定 tag（VENDOR.md 台账口径与历次升级批先例）；zcode 才是追 main 口径 | 追 main（否决：放弃稳定 tag 锚点，回归窗口不可控） |
| D3 | zcode 缓存树（upstream/zcode）落后两档（3c5b2276）顺带治理到新基线 | VENDOR.md pristine 规则：缓存树 HEAD 须与 vendor 钉版同 commit；上次同步批漏治 | 留脏（否决：下次 vendor:sync 从错误 HEAD 出发） |
| D4 | exa 升 3.4.3 保持 npx 版本锁形态 | manifest 既有供应链决策：不锁版本则每次启动解析 npm latest 并携带 EXA_API_KEY 运行任意新代码 | 解锁 @latest（否决：供应链面） |

## 验证

- `npm run clean && npm run inject` 二连（2026-11-03 实测）：zcode 8 条（002-009）首注 applied、clean 反向 8 条全 reversed 且两面归零（完整性证明）、二注 8 条 applied 零 WARN；patches/ 全量（含 396 新版）applied。
- `node scripts/zcode-engine.mjs ensure` rc=0（worktree：pnpm install＋zcode-cua ESM 构建＋server `build:remote` dist/remote/zcode-server.cjs 产出）。插曲=上游 3.17.2 engine 声明 node 24.14.0 与本机 24.22.1 不匹配的 pnpm WARN（非阻断，构建绿）。
- `npm run release:check` ✓ 四模块对账全绿（ycode=3.17.2、activePatchCount=8 与 series 一致）。
- `npm run catalog-check`：3.17.2 无快照 → `--refresh` 重建 `docs/superpowers/notes/zcode-3172`（7284 键/104 命名空间，随批入库；上一版 3.17.1 未建快照属 10-31 批漏项，本批补位）。
- `npm run runtime:doctor` ✓ 硬检查 6 过 0 败（semantica/pua/patch 375 逐字节对账）。
- `npm run typecheck:harness` ✓。
- `custom/__tests__/docs-ssot-guard.test.ts` 6/6 绿（新 spec A.1/设计索引三处同批登记）。
- 全量 `npm test`：**1019 文件 / 7488 用例全绿 0 失败**（11 skipped 为既有跳过面；与 main 基线 7488/0 持平，零新缺陷），93s。

## 设计文档影响

DESIGN_SYNC: touched——设计总账 §C（`2026-10-23-swarmstudio-design-ledger.md`）版本基线两行随批进位；组件台账（tech-components-ledger）§一/§五/§八随批登记。
