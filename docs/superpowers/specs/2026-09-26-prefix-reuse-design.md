# 长会话已验证前缀复用（独立设计轮）

> 状态：设计 v1 + 数据面已落（`custom/server/prefixreuse/`）。实施分层推进——
> 数据面（本轮）→ 会话存储指纹链接线（hermes_state 增量面，下一轮）→ 请求链路
> 接线（provider 调用侧，随真实长会话验证）。

## 1. 问题

长会话（百轮级）每轮请求都全量重发消息历史：带宽、provider 侧 token 计费、
以及 hermes_state 会话重放时的全量校验开销。minimax（长会话性能批）实测痛点。
prompt cache 在 provider 侧解决了部分计费，但客户端-网关-引擎链路上的**重复
序列化/校验/传输**不受益。

## 2. 核心设计：指纹链 + 增量校验

- **链式指纹**：`prefixHash[n] = hash(prefixHash[n-1] || msg[n])`——每条消息
  追加后只算一次增量哈希，前缀完整性由链式结构传递保证（改任何一条历史，
  其后所有指纹全变）。
- **已验证前缀点**：会话存储侧记 `lastVerifiedIndex + lastVerifiedHash`——
  上次请求成功（2xx 且响应被引擎接受）时的前缀终点。
- **增量复用**：下次请求先校验 `[0..lastVerifiedIndex]` 指纹一致（防中途篡改/
  分叉/压缩介入），一致则只序列化/传输 suffix（新增消息）；不一致回退全量。
- **失败回退**：复用请求被 provider 拒（4xx/上下文不齐）→ 全量重发一次并重置
  验证点（fail-safe：复用是优化不是语义依赖）。

## 3. 与既有机制的关系

- **prompt cache（provider 侧）**：正交叠加——前缀复用省的是链路开销，
  cache 省的是 provider 计费；前缀稳定本身也提升 cache 命中。
- **compaction/compact 六段（400）**：压缩改写历史 → 指纹链必然断裂 →
  复用点重置到压缩后起点（`verifyPrefix` 返回 mismatch 自动覆盖此路径）。
- **会话 fork（session-fork 域）**：fork 前缀 [0..atIndex] 与源会话共享指纹链
  （同 chain 截断），fork 后各自延伸。

## 4. 决策记录

| 决策 | 取舍 |
|---|---|
| 链式哈希而非逐条哈希数组 | 逐条数组校验 O(n) 传输；链式只传一个 `lastVerifiedHash` 即可校验整段 |
| 复用为优化非语义依赖 | 任何 mismatch/失败都回退全量，正确性不依赖复用成功 |
| 验证点由"请求成功"推进 | 响应被接受才推进，请求失败/中断不推进（防半发送状态） |
| 指纹算法 sha1（数据面） | 非密码学场景（防漂移不防攻击），sha1 够快；接线层可换 |

## 5. 分层与接线点

1. **数据面（本轮）**：`prefix-reuse.ts`——buildPrefixChain / verifyPrefix /
   reusePlan 三纯函数+守门测试（指纹链断裂检测/回退语义）。
2. **存储接线（下一轮）**：hermes_state 会话表增 `prefix_chain_head` 列
   （upstream patch）——会话落库时更新链头。
3. **请求接线（随真实长会话）**：provider 调用侧（agent_runtime_helpers 会话
   循环）——发送前 verifyPrefix，一致走增量信封（需 provider/网关支持增量
   帧或复用缓存语义），不一致全量。

## 6. 风险

- provider 无增量帧协议时，"只传 suffix"需要网关侧缓冲拼装（多一跳信任点）；
  若不可接受，则数据面仅用于**校验省略**（跳过全量重放校验）也有收益。
- 长链指纹中途任何 compact/编辑都会重置复用点——收益取决于会话形态
  （无压缩的百轮会话收益最大）。
