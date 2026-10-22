# 治理台账仓缺省链统一：开发测试缺省指推演中央仓

> 2026-10-22 用户裁定（选项 1+2）：开发测试环境统一指向推演仓，根除「重启未带
> GOVERNANCE_REPO → 缺省落空生产仓 → 驾驶舱组织/账号页空表」事故类；生产仓
> ncwk/governance 留给真实编制，同批补 GitHub 私有远端。

## 改动

- `scripts/serve-server.mjs` GOVERNANCE_REPO 缺省注入从「缺省指 ncwk/governance」
  改三态链：显式 env 尊重不动（生产部署指生产仓）→ SIM_ROOT/central/aipaydev
  存在（开发测试机常驻推演中央仓）缺省指它 → 皆缺回落生产仓 ncwk/governance。
  注入位置移到 OBS_SIM_ROOT 缺省注入之后（新逻辑依赖其已解析）。
- 生产仓 ncwk/governance 挂远端 github.com/issac-new/governance（私有，master
  已推送、跟踪已建立）。本项为仓配置非代码提交，随本 spec 记档。

## 不改

- `custom/server/governance/repo-root.ts` 回落链（显式 > OBS_SIM_ROOT/central >
  NVMe 兜底）不动——serve-server.mjs 注入 GOVERNANCE_REPO 后 repo-root.ts 走
  显式分支，两层缺省方向自此一致；纯 ts-node 直跑场景仍由它兜底。
- SIM_BRANCHES_REPO/SIM_ANCHOR_REPO 缺省逻辑不动。
- 生产仓内容不动（D20 清理后空表占位）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 1 | 开发测试缺省指推演中央仓 SIM_ROOT/central/aipaydev | 组织台账唯一有数据的来源在推演仓（run22 十五人编制）；空表事故根因=缺省指空生产仓，两层脚本缺省打架 | 维持缺省指生产仓+约定重启显式带 env（否决：2026-10-22 已实际咬人一次，靠约定不可靠） | 是 |
| 2 | 生产仓保留作回落落点而非删除 | 真实编制投产时的落点占位；推演中央仓不存在的部署机（生产机）自动回落它 | 删除生产仓（否决：投产再新建丢 D20 历史锚点） | 是 |
| 3 | 生产仓补 GitHub 私有远端（issac-new/governance） | 本机单点零远端，磁盘一挂数据即失；现在是空仓，补远端成本最低 | 投产前再补（否决：有真实数据后再补多一次迁移风险窗口） | 是 |
