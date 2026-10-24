# 攻击图 — <TARGET_SLUG>

> 档案 7 件套 ④/⑦。mermaid 攻击图（借鉴 bface-agent 项目黑板 DAG：节点=事实，
> 边=因果）。纪律：每确认一条新边立即更新本图并追加 timeline；聚合报告前核对
> 本图与 vulnerabilities.md / footholds.md 一致。

## 图（mermaid）

```mermaid
graph LR
  ENTRY["入口: <待填>"] --> HOST1["主机/服务: <待填>"]
  HOST1 --> DATA["数据/权限: <待填>"]
```

## 边台账

| edge_id | from 节点 | to 节点 | 边类型（access/credential/trust/dataflow） | 依据（finding_id / CR-### / 证据指针） | 状态（hypothesis/confirmed） | 确认时间(UTC) |
|---------|-----------|---------|--------------------------------------------|----------------------------------------|------------------------------|---------------|
| E-001   |           |         |                                            |                                        | hypothesis                   |               |

## 路径结论

- 当前最短可达路径：
- 未打通的候选路径（对应账本 Theoretical 项）：
