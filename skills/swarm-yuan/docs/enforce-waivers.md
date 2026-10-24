# enforce 分层豁免登记（WP6）

> 规则：`gates.tsv` 的 `enforce` 是声明有效级；`gen-enforce-level.sh` 校验器扫描真实 `fail()` 形态。
> 未登记的不一致 fail；已登记待批项 warn。改级须单独立项并更新 golden/usage。

| gate | 当前有效级 | R126 #1 静态计数线索 | 理由 | 登记日 |
|------|------------|----------------------|------|--------|
| authz | strict | 实际 5 fail（旧计数 3） | `&& fail` / helper fail 漏计；待 WP6 校验器复核 | 2026-10-21 |
| reuse | strict | 实际 5 fail（旧计数 3） | 同上 | 2026-10-21 |
| crypto | strict | 实际 4 fail | 同上 | 2026-10-21 |
| sensitive | warn | 实际 3 fail | 同上；是否升 strict 待批 | 2026-10-21 |
| requirements | warn | 实际 4 fail | conf 自述 ≥3=strict，但当前 warn；待批 | 2026-10-21 |

> 本表在 WP6 校验器落地前为“待批清单”；WP6 只修校验器，不在同一包改级。
