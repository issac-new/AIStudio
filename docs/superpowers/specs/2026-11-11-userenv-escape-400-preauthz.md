# 2026-11-11 userenv 路径逃逸先于授权判 400（N29-19）

> run29 G4 userenv 负例实证：`profile=..%2f..%2fetc` 期望 400 实得 403——平台授权中间件（requireProfileParameterAccess）先于控制器把未知 profile 判成 403，控制器的逃逸 400 判（补丁 743 面）被前置拦截永远不可达。

## 变更

`custom/server/platform/authz/middleware.ts`：profile 参数含 `/`、`\`、`..`、`%`、NUL 判畸形请求，先于授权返回 `400 invalid_profile`（problems 点名「路径逃逸」）。设计文档口径兑现（方案 §5.11 组 11「逃逸先于 404 判」——403 把畸形请求伪装成授权问题，且泄漏面与 400 等价但语义错档）。测试：`policy.test.ts` 增逃逸→400 断言（23/23 绿）。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | 授权中间件内前置判而非控制器内保留 | 控制器判已存在但不可达（中间件在前）；修复必须放在拦截点之前 |
| D2 | 黑名单字符集（/\..% NUL）而非白名单 | profile 命名面历史宽（含中划线/数字）；白名单误伤存量档名，黑名单精准覆盖逃逸向量 |
| D3 | 400 不带 code 细分 | 与既有 invalid_profile 形态对齐（problems 已点名原因） |

## 验证

- `npx vitest run custom/server/platform/__tests__/policy.test.ts --config vitest.config.ts`——23/23 绿（含新断言：逃逸 profile → 400 先于授权，next 不被调）。
- run29 活体：部署后 userenv 组负例探针转绿（值守跟踪）。

## 设计文档影响

DESIGN_SYNC: none——授权层输入校验前置，不触及 DESIGN_DOCS 四正本；方案 §5.11 组 11 判据不变（产品侧兑现）。
