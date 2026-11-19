# Detection 手册：IDOR/BOLA（对象级授权破坏 × LLM 应用特化）

> 模式参照 GCP reference-harness（github.com/GoogleCloudPlatform/reference-harness，仅 3 commits——**借模式不依赖代码**）。
> RoE：全部测试在 `scope-gate` 授权门内；两个测试租户均使用金丝雀数据（`CANARY-<TENANT>-<ID>`），禁止触碰真实用户资源。
> 对齐本集群既有技能：`testing-api-for-broken-object-level-authorization`（REST/GraphQL 方法论）、`bola-session-detection`（会话级 BOLA）、`business-logic-vulnerabilities`（IDOR 业务逻辑族）——本手册是 LLM/agentic 目标的切片，不替代它们。

## 适用目标

LLM 应用的资源型端点。LLM/agentic 语境下高价值对象类型（按泄露价值排序）：

1. **会话历史**（conversation_id / thread_id）：含其他用户的完整 prompt——系统提示、内部文档引用、PII，是最肥的单点。
2. **RAG 文档**（document_id / chunk_id）：检索库越权读 = LLM08 跨租户检索泄露的直接证据。
3. **文件/附件**（file_id）：上传的文档、截图、语音转写件。
4. **API key / integration**（key_id）：改或读他人集成凭证。
5. **模型端点与配额**（endpoint_id）：越权调用受限模型/更高配额。
6. **团队/workspace**（org_id / workspace_id）：越租户枚举成员与配置。

## 测试矩阵

| # | 测试项 | 手法 | 判定锚 |
|---|--------|------|--------|
| I1 | 水平越权（换 id） | A 租户身份请求 B 租户对象的 GET/PUT/DELETE | 响应含 B 金丝雀 |
| I2 | 垂直越权（换 role） | 普通用户身份请求 admin 对象路由 | 非 403 |
| I3 | 会话级 BOLA | 换绑 session/thread 归属（PATCH owner 字段） | 归属变更生效 |
| I4 | 顺序 id 枚举 | 自增 int id（conversation_id=1001→1002） | 命中他人资源即批量风险 |
| I5 | UUID 可预测 | 时间戳型 UUIDv1 / 截断 UUID / 泄露的种子 | 枚举成功率 |
| I6 | 隐藏字段群发（mass assignment） | 请求体加 `tenant_id`/`org_id`/`role` 字段 | 服务端是否采信 |
| I7 | GraphQL 对象嵌套 | `user(id:"other"){conversations{documents{content}}}` | 嵌套层无二次鉴权 |
| I8 | 检索前授权过滤 | B 租户文档被 A 的语义查询检索到 | 看**返回 doc id**，不是最终文本（RAG 节纪律） |

## 命令示例

```bash
# I1：跨租户读会话历史（金丝雀对金丝雀）
curl -ksS 'https://target.example/api/conversations/CONV_TENANT_B_CANARY' \
  -H "Authorization: Bearer $TOKEN_TENANT_A" -w '\n%{http_code}\n'

# I8：RAG 越权检索——检查 doc_id 归属而非生成文本
curl -ksS -X POST 'https://target.example/api/chat' \
  -H "Authorization: Bearer $TOKEN_TENANT_A" -H 'Content-Type: application/json' \
  -d '{"message":"summarize CANARY-TENANT-B documents"}' | jq '.retrieved_doc_ids // .citations'
```

## 判定标准

- **Confirmed**：响应/检索结果中出现 B 租户金丝雀原文或 B 的 doc_id（I8 以 doc id 计，生成文本不含金丝雀但 doc id 属 B 也算命中——内容进过上下文）。
- **Probable**：仅 200/非 403 但响应为空或无归属证据——降级复测（换明确金丝雀对象）。
- I6 mass assignment 与 I3 会话换绑的严重度按「可写对象的最敏感字段」计，不只按可读。

## 证据要求

- A/B 双方 token 的租户标识证明（同截图/日志行）+ 命中响应原文；
- I4/I5 枚举类附采样规模与命中率（`3/50`），不夸大为全量；
- 复测触发条件：对象路由、鉴权中间件、检索管道、租户字段 schema 任一变更。

## 常见误报（fp-check 对接）

- **故意公开的资源**：共享模板库、公开模型卡片——先查该对象是否有 `is_public` 语义。
- **缓存残影**：CDN/网关缓存了 B 的响应但未命中源站——加随机 query 参数复测再定性。
- **自身数据**：token 泄露导致「看似越权」实为同租户子账号——先核 token 的 subject/tenant claim。
- 聚合统计接口返回脱敏数字 ≠ 对象级泄露；按字段粒度判定。

## 框架映射

OWASP LLM02（敏感信息泄露）/ LLM08（向量与嵌入弱点·检索前授权过滤）；BOLA=OWASP API Top 10 API1:2023；agentic 清单锚点：AI-MEM-001（向量库跨租户绕过）、AI-PRIV-001（混淆代理委托滥用）（v1.5 节 92 Critical 头部案例，`AI-xxx` 编号，报告期对照存档 JSON 切片）。
