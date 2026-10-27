# 四模块发布清单：RELEASE-MANIFEST 与 release:check（2026-10-26）

分支：`fix/core-coding-chain-v2`

## 变更

用户裁定本项目发布时包含四个独立模块：**驾驶舱（含推演程序）、agent teams、Ycode、yuan skill**。经 AskUserQuestion 三项实答收敛范围后落地：

1. **`RELEASE-MANIFEST.json`（仓根）**：四模块各一条——name/version/versionCarrier/buildCommand/artifacts/install/notes，版本号从现有载体**抄录**（真源仍在 carrier，清单不造第二真源）；vendorBaseline 引用 `vendor/VENDOR.md`（上游钉版台账，独立坐标系）。
2. **`scripts/verify-release-manifest.mjs`（`npm run release:check`）**：fail-fast 门禁——结构完备、四模块版本串对 carrier 逐条对账、Ycode 活跃补丁数与 series 一致、驾驶舱"simharness 不随安装包"裁定必须在 notes 声明、buildCommand 引用脚本在位；任一失配非零退出＋人话错误。
3. **守门测试**（`scripts/__tests__/verify-release-manifest.test.ts`，10 断言）：真实读文件对账（非 mock）＋篡改 fixture 防漂移负例（`AIStudio_TestCarrierOverride` 注入隔离路径，不碰真文件）。
4. README 文档节补发布视角入口行；附录 A 补录本 spec（348）。

## 用户三项裁定（原文实答，2026-10-26）

1. 四模块"独立"程度＝**单仓＋发布清单**：继续单仓开发，新增机器可读清单＋门禁；不拆仓、不建独立安装包、不动现有分发通道。
2. 推演程序分发＝**仅仓内**：simharness 不随 DMG，清单如实标注"装机包不含推演，需仓内运行"，零打包工程。
3. Ycode 版本＝**以基线代版本**：不新建 VERSION 文件，版本=series 头 `origin/main@3c5b2276`（v3.16.1 系列）＋活跃补丁数（当前 8），manifest 直接引用该行。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 清单抄录版本、真源留 carrier | 单一事实源；carrier 变更→门禁红→同步清单，漂移即拦 | 清单成为版本真源（否决：与 RELEASE-NOTES/CHANGELOG 双源漂移） | 是 |
| D2 | release:check 只对账不构建 | 门禁秒级；构建昂贵属各模块自身发布流程 | check 触发四模块构建（否决：分钟级，日常不可挂） | 是 |
| D3 | Ycode 版本=基线 commit＋补丁计数 | 裁定 3；series 头即身份，可机械对账 | 新 VERSION 文件（否决：用户裁定明确不要） | 是 |
| D4 | 驾驶舱 notes 强制含"simharness 不随安装包" | 防未来静默改回随包分发违背裁定 2 | 不校验 notes（否决：裁定无门禁=空文） | 是 |
| D5 | vendorBaseline 独立一节、不与模块版本互推 | 上游钉版（0.7.39/0.22.5/3c5b2276）与产品版本（2.37/v3.3.0/v2.95.0）是两套坐标系 | 合并坐标系（否决：语义混乱） | 是 |

## 设计文档影响

DESIGN_SYNC: none —— 整合正本 §3.2"五组件"是运行时架构视角；本批立"发布视角=四模块"（Matrix 为外部基础设施不入发布物、推演并入驾驶舱），两视角并存不冲突，正本无需改写；README 接线行已提供发布视角入口。若后续正本升版需要入册，由吸收轮随批补一句即可（挂账）。

## 验证

- `npm run release:check` → ✓ 四模块对账全绿（cockpit=2.37 agent-teams=v3.3.0 ycode=3c5b2276 yuan-skill=v2.95.0）。
- `npx vitest run scripts/__tests__/verify-release-manifest.test.ts` → 10/10（结构 3＋对账 4＋门禁 3，含防漂移负例；fixture 隔离，真 CHANGELOG 零污染实证）。
- 首轮 RED：清单/脚本缺失时 ENOENT 全红；篡改负例先红（输出走 stderr 通道修正后收绿）。

## 挂账

- 驾驶舱 2.x 版本号线自 2.37 断线（RELEASE-NOTES 自记）——清单如实引用，补记轮统一对账。
- agent teams v3.3.0 为散文载体（无 semver 真源文件）——按裁定不新建，若未来要机械化需单独立项。
- 正本"发布视角=四模块"入册（见设计文档影响）留吸收轮。
