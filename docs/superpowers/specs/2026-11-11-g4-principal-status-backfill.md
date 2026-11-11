# 2026-11-11 G4 profile 访问 403 根治——principal status 回填（N28-3 补全）

> run29 实证：G4 能力探测 userenv 组两红（fanfan 自家 JWT 读自家 profile 403「无权访问该 profile」）导致 g4_pass 不冻结、ready 前置闸拦截。run28 帧内未披露 403 同源。

## 变更

**`custom/server/platform/authz/middleware.ts` N28-3 回填块补 `status` 缺席回填**：上游 `toAuthenticatedUser`（studio auth 中间件）构造的 JWT principal 不含 `status` 字段，而 `canAccessProfile` 要求 `status==='active'`——N28-3（db4ace62b）只回填 `profiles`，非 super_admin 的 profile 参数访问恒 403。补法：回填块内 `user.status ??= 'active'`（上游认证层已拒绝禁用/不存在用户——「User is disabled or does not exist」在其前 403，到达授权层的 principal 必然在役，缺场=在役语义成立）。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | 授权层回填而非改 toAuthenticatedUser 加 status | 上游类型 AuthenticatedUser 无 status 字段，改契约面大（vendor 面）；授权层缺场语义回填与 N28-3 profiles 回填同构、最小面 |
| D2 | 缺场=在役（而非查库核 status） | 上游认证中间件已做 status 检查并拒禁用户（vendor/hermes-studio auth.ts:495）；授权层重复查库=冗余 I/O 且引入新依赖 |
| D3 | `??=` 保留显式值 | 显式携带 status 的 principal（如测试夹具/未来契约扩展）不被覆盖 |

## 验证

- 单测：`custom/server/platform/__tests__/policy.test.ts` 增「JWT principal 无 status 无 profiles → 同名 profile 放行」断言（N28-3 原断言只测了 profiles 回填后的 includes，没穿透 canAccessProfile 的 status 条件）。
- `npx vitest run custom/server/platform/__tests__/policy.test.ts` 绿。
- run29 活体验证：修复部署（server bundle 重建+product-dist 刷新+studio 重启）后 userenv 组两探针转绿、g4_pass 冻结（值守跟踪回执）。

## 设计文档影响

DESIGN_SYNC: none——授权边界补全属 N28-3 同族收敛（既有机制的字段遗漏），不触及 DESIGN_DOCS 四正本；方案 §5.11 探测判据不变（是产品侧兑现而非探测面调整）。
