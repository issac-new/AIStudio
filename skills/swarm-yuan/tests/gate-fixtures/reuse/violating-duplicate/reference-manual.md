# 参考手册

## 4. 组件清单

| 单元名 | 类型 | 签名 | 路径 |
|--------|------|------|------|
| auth-store | store | useAuth() | src/stores/auth.ts |
| http-client | 组件 | request(cfg) | src/lib/http.ts |

## 5. 依赖链路

| 单元名 | 上游 | 下游 |
|--------|------|------|
| user-page | auth-store | http-client |
