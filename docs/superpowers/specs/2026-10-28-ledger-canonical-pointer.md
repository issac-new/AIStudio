# 组件台账双源合一：现行指针统一到终态单文件（2026-10-28）

分支：`docs/ledger-canonical-pointer`（基于 main `1f5a2686a`）。
来源：三置顶会话收口复盘发现——并行会话已把组件台账整合为
`team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`
（自我声明唯一事实源），而 `docs/upstream-analysis/component-ledger.md`
旧正本仍在，且整合正本附表 C 与吸收域 README 仍指向旧版，形成双源。

## 变更

1. 整合正本附表 C「技术组件调研与版本核对」指针改到终态单文件。
2. `docs/absorption-domain-README.md` 两处现行指引改到终态单文件。
3. `docs/upstream-analysis/component-ledger.md` 保留全文作历史档案，
   头部加退役指针，不再作为现行正本维护。
4. 历史 spec 与索引不改写；本 spec 登记附录 A。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 以 team/shared/research 终态单文件为唯一现行正本 | 该文件由最新整合批建立，含 HexStrikeAI RETIRED 等最新判级；旧版停止维护 | 继续双正本（否决：数字与判级必然漂移） | 是 |
| D2 | 旧正本降级为指针而非删除 | 保留 2026-10-27 立账原文可反查；历史 spec 链接不断 | 直接删除（否决：丢失历史语境） | 是 |

## 验证

- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`。
- `npm run release:check`。
- 新 spec 过 gongwen-lint 机械首查。

## 设计文档影响

- DESIGN_SYNC: touched
  - `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`
    —— 附表 C 组件台账指针随唯一事实源迁移修订。
