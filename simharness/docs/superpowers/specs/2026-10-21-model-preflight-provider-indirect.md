# 模型通道预检支持 provider 间接引用格式（2026-10-21）

## 背景

run22 起跑即拦：`aipay-scenario.sh` 起点模型通道预检报 14 实例全部 unreachable。实测通道本体健康
（cc-switch 127.0.0.1:15721 在听、/v1/models 200、真补全探针拿到 glm-5.3 真响应）——假红。

根因：profile config.yaml 为宿主快照 0.22.x 新格式，`base_url`/`api_key` 不再内联在 `model:` 下，
而是 `model.provider: custom:cc-switch` 指向 `custom_providers[]` 条目（api_key=PROXY_MANAGED，
鉴权由 cc-switch 本地代理接管）。mx-setup 4b 的归一写入器 2026-10-19 已适配此形态，但
`mx-lib.sh` `model_preflight()` 的解析侧仍只认旧内联格式，读出空 URL 即报 unreachable。
预检 30 项不含模型通道探针（它在驱动起点才执行），故 10-19 的 30/30 绿未能暴露此缺口。

## 改动

`mux/mx-lib.sh` `model_preflight()` 解析段：`model.base_url` 缺席且 `model.provider` 为
`custom:<名>` 时，到 `custom_providers[]` 按名解析 base_url/api_key/model。旧内联格式保留
（两态都认）。实测 `model_preflight_report` 14/14 通过；监督器下一轮 30s 断点续跑自动生效
（已实测起跑过闸）。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 解析侧兼容新旧两格式，不改写入侧回旧格式 | 写入侧（归一）适配的是宿主快照真形态，回退会造成 SIM 配置与快照漂移；消费侧适配是收敛方向。 |
| D2 | `api_key=PROXY_MANAGED` 照常作为 x-api-key 发送 | cc-switch 本地代理接管鉴权，占位键不影响探活；与 agent 实际调用形态一致。 |
| D3 | 不在预检 30 项里加「模型通道」项 | 驱动起点已有同款硬门（本次拦下即证有效）；预检项面向开跑前可修的环境面，通道探活每轮起跑时实测更准。 |
