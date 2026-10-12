---
name: weixin-multiplex-orch
description: Orchestrator-side deltas for weixin multiplex gateway ops.
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [weixin, multiplex, gateway, bank-aliases, profile-boundary]
    related_skills:
      - weixin-channel-configuration
      - weixin-multi-account-delivery
      - hindsight-bank-strategy
---

# Weixin Multiplex Gateway — orchestrator 侧增量

> 权威源声明：default profile 的 `weixin-channel-configuration` 是全量参考
> （其 Multi-account multiplex / Per-member memory banks 两节已是当前架构）。
> 本件只存三类增量：①验证方法 ②default 侧失真警告 ③跨 profile 写入边界。不复制机制全文，防双事实源漂移。

## When to Use

- 在 orchestrator profile 会话里做多账号微信网关 / pairing / per-member bank 操作
- 读到 default 侧 weixin/hindsight 技能与现状矛盾时
- 验证 bank_aliases 路由是否正确时

## 验证 bank_aliases 路由：加载活代码，勿用合成 id 断言

用 importlib 从 `plugins/hindsight/settings.py` 加载真实模块 + 真实
`config.json`，按 `resolve_bank_aliases → _resolve_bank_id_template`
顺序算 bank id。**勿**拿一个不在 `bank_aliases` 表里的合成“第二微信号”
去断言共享 bank——未映射 id 按设计走独立 per-user bank（`[已移除]-<id>`），
合成 id 必然“失败”但机制无损；共享断言只对表内 id 成立。

## default 侧失真警告（读到即纠正，勿照做）

- `weixin-multi-account-delivery`：Architecture 节仍是退役的 8651 双网关
  布局 + 已废弃账号 `<[已移除]-bot-account-id>@im.bot` + per-profile `weixin/accounts/`
  路径。现行架构 = 单 8650 multiplex 网关，双账号经 `profiles.yaml`
  `env_extra` 注入，账号文件统一在 `~/.hermes/weixin/accounts/`。
- `hindsight-bank-strategy`：Bank ID Resolution 节缺 bank_aliases 折叠步
  （fold 在 template 渲染前跑）；且 Model C「全集群静态 per-team bank」
  已被细化——[已移除] 用 `bank_id_template: [已移除]-{user}` + aliases 做
  per-member 隔离，空 user（cron/CLI）回落静态 `bank_id`，其余 team 仍 Model C。

## 跨 profile 写入边界（本件存在的原因）

上述 default 技能在 orchestrator 会话里 skill_manage 拒写
（`not found in active profile`）。可写路径：①前台 `hermes -p default`
会话直改；②本 profile 建增量件（即本件）。session 内 `patch` 工具
曾直改 default 文件成功，但纯 skill 管理工具的复盘 pass 无此能力——
失真警告落在本件里兜底。

## Related Skills

- `weixin-channel-configuration` — 全量权威参考（default）
- `orchestrator-profile-skill-writeback` — 落位规则全文
