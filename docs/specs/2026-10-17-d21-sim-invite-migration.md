# D21 仿真账号供给切邀请流

日期：2026-10-17｜分支：feat/d21-invite-flow-migration｜状态：已验证（守门 181/181）

## 背景与决策

用户 2026-10-17 裁定：「把仿真推演的 30 个账号也切到新的邀请流」。现状 mx-lib.sh 的 gov_provision_user 走 POST /api/governance/matrix-users，口令为脚本侧约定式（Aipay_\<user\>_2026）；D20 已在产品侧落地邀请流端点 POST /api/governance/invites（服务端生成一次性初始口令，建号即 roster+invites 双台账）。

## 改动

1. gov_provision_user 改调 invites 端点：body 去 password/displayName（invites 端点暂不收 displayName），expiresInHours=720（一轮 20h 量级推演留足余量）。
2. 服务端返回的 initialPassword 落 creds/\<user\>.invite-pass（0600），与既有 creds 目录归档纪律同处置。
3. 兼容回落：invites 端点未就绪（404/无 invitesCommit，旧 studio 树）时自动回落 matrix-users 旧通道并 log 标注——产品升级窗口内不阻断开轮。
4. mx-setup.sh 注释同步（供给通道描述）。

## 验证

- bash -n 两文件语法通过。
- harness-gate-integrity.test.ts 128/128（真实 source mx-lib 的行为断言）。
- 全量 run-gates.sh 181/181。
- 不动在跑 sim 栈：本改动仅在下次开轮供给账号时生效（账号在位即跳过，幂等不变）。

## 决策记录

- D21-a：有效期取 720h 而非默认 24h——仿真账号生命周期是一轮推演（约 20h）加复盘窗口，24h 会在轮次中途过期造成台账与实际不符。
- D21-b：保留回落而非硬切——studio 注入树升级有部署窗纪律，硬切会把开轮阻塞在产品部署上；回落通道在产品全量升级后自然死路径。
- D21-c：invite-pass 文件落 creds/ 与 .token 同目录——creds 目录已有轮次归档与三机同步纪律，新文件自动纳入，不另造目录。
