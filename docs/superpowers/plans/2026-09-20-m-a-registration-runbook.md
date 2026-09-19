# M-A 前置：Synapse bot 注册通道 runbook

日期：2026-09-20（实测通过，随 M-A 轮入库）
适用：fleet / sim 共用的 matrix-synapse 容器（docker）

## 实测记录

```bash
docker start matrix-synapse
# → matrix-synapse（容器从全停状态拉起，约 3 秒可用）

docker exec matrix-synapse sh -c 'grep -n "registration" /data/homeserver.yaml | head -5'
# 30:registration_shared_secret: "<存在，值略>"
# 38:# Enable registration for testing
# 39:enable_registration: true
# 40:enable_registration_without_verification: true
# 41:registration_requires_token: false

curl -s http://localhost:8008/_synapse/admin/v1/register
# {"nonce":"c8bc6eca...ac14"}（新 API 通道可用）
```

## 判据（三过）

1. `registration_shared_secret` 存在（homeserver.yaml:30）。
2. 注册开启且免验证（测试域策略，homeserver.yaml:39-40）。
3. Admin v1 register 端点返回 nonce。

## bot 账号注册方式（M-B 起消费）

- 优先：共享密钥 HMAC 注册（`GET nonce` → `POST /_synapse/admin/v1/register` 带 `mac = HMAC-SHA1(secret, nonce\x00username\x00password\x00not-admin)`），沿用 `overlay/scripts/fleet/fleet-setup.sh` 既有账号创建函数，勿另写。
- 免验证通道开着，`/_matrix/client/v3/register` 亦可直注册——生产/长生命周期环境应关掉 `enable_registration`，只留共享密钥（登记为 fleet 配置 backlog，不在 overlay 改）。
- 命名遵守裁决 C：集群 bot 一律 `@<用户名>-agent:<域>`。

## 结论

M-A 前置项闭环；注册通道可用，无需 Synapse 配置调整。
