# Matrix 对端账号台账（matrix-peers）

> 维护人：图爸 / orchestrator
> 更新日期：2026-08-20
> 用途：记录 Matrix 网络中的账号性质，供 `MATRIX_IGNORE_USER_PATTERNS` 黑名单配置与跨机协作路由参考

---

## 本机 bot（对外通讯出口）

| MXID | 显示名 | 性质 | 对应 profile | 职责 |
|------|--------|------|-------------|------|
| `@swarm:matrix.test` | Swarm | **本机 bot** | orchestrator | 统一对外通讯（unified gateway @8650），负责跨机协作 |

## 本机人类账号（不屏蔽）

| MXID | 显示名 | 性质 | 备注 |
|------|--------|------|------|
| `@cuishi:matrix.test` | Verify User | **人类（图爸）** | 管理员/验证用户，**不可加入黑名单** |
| `@testuser2:matrix.test` | testuser2 | **人类** | 测试账号，**不可加入黑名单** |

## 对端机器 bot（跨机协作对象，需黑名单屏蔽）

| MXID | homeserver | 性质 | 职责 | 状态 |
|------|-----------|------|------|------|
| *暂无* | — | — | — | 待对端上线后补充 |

> ⚠️ **黑名单配置原则（2026-08-20 认知纠偏）**：
> - **对端账号可能是人，也可能是 bot——MXID 无法区分。** 因此黑名单只是**辅助**，主防靠七层防线（按消息特征+对话结构，见 `matrix-collaboration-termination.md`，2026-08-21 对齐）。
> - 只有 **100% 确认为纯 bot**（明确部署的自动化 agent，无人类使用）才加入 `MATRIX_IGNORE_USER_PATTERNS`。
> - **人类账号一律不屏蔽**——否则 @swarm 收不到人类指令。
> - 新增对端账号时，先确认性质记录到本表；纯 bot 才配黑名单，格式为正则：`@peer-bot.*:server\.org`。

## 当前黑名单配置状态

- **配置位置**：`~/.hermes/profiles/orchestrator/.env` → `MATRIX_IGNORE_USER_PATTERNS`
- **当前值**：*空*（2026-08-20 确认：两个已知 MXID 均为人类账号，无需屏蔽）
- **生效层**：第 1 层（入口屏蔽）当前为空配置；第 2 层（m.notice 不回）源码级已生效；第 3 层（运行时熔断 N=8/上限30/超时30min）靠 SOUL 行为约束。

## 关联文档

- 终止规则：[`_shared/01-scheduling-bus/matrix-collaboration-termination.md`](../../../matrix-collaboration-termination.md)
- 跨机编排：[`orchestrator_rules.md §0.8`](../../../../orchestrator/orchestrator_rules.md)
