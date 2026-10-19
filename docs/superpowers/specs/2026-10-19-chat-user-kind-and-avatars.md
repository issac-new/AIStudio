# 群聊成员身份标识与默认头像（spec）

日期：2026-10-19
分支：`feat/chat-user-kind-avatars`
来源：用户需求——「协作沟通」群聊中通过不同图标区分人类员工与 AI 员工并展示成员名称；追加需求——创建时默认为每个人类员工分配互不相同的头像。

## 现状

- 成员名称展示已具备（`MatrixSenderProfile.vue` 映射 Synapse 成员 displayname，成员列表/成员详情同名展示），本次不动。
- 身份区分缺失：消息发送者、成员列表、成员详情均无「人类/AI」标识；头像仅有「已设图 vs 首字母占位」两形态。
- 建号链路：`registry-admin.ts provisionMatrixAccount` 建人类号 `@<name>:<server>` + 可选 AI 号 `@<name>-agent:<server>`（唯一建号入口，邀请流复用）；`admin-service.ts createMatrixUser` 走 synapse 管理端 `PUT /_synapse/admin/v2/users`（幂等 create-or-update）。

## 方案

**身份归类（客户端，白名单式）**：AI = 命中产品建号命名约定（localpart 以 `-agent` 结尾）；其余一律按人类渲染。约定正本在服务端 `registry-admin.ts`，客户端镜像判定 + 绊线测试钉住两端不漂移。

**徽标（客户端）**：`MatrixUserKindBadge.vue`（机器人图形 +「AI」字样小徽标）。接线三处：消息发送者昵称旁（`MatrixSenderProfile`，AI 显、人类不显——零错标风险）；成员列表行（`MatrixMemberList`，同 AI 显）；成员详情（`MatrixMemberInfo`，头部徽标 + 显式「AI 员工/人类员工」身份行，两态都显）。

**默认头像（服务端，运行时生成）**：`default-avatar.ts` 纯函数生成 128×128 PNG——人类款=首字母 + userId 哈希配色（16 色暖/中性板，色板内碰撞由首字母区分）；AI 款=机器人图形 + 冷色靛紫系（色系与人类分离，头像是第二重身份线索）。纯 JS PNG 编码（`node:zlib` + 手写 CRC32），零新依赖、零二进制入仓。同一 userId 确定性复现（补发幂等）。

**落位链路（服务端）**：`admin-service.ts assignDefaultAvatar` = 管理员 token 上传媒体（`POST /_matrix/media/v3/upload`，server admin 本身是真实 matrix 用户）得 `mxc://` → `PUT v2/users` 写 `avatar_url`（官方支持该字段，实核 synapse admin API 文档）。`provisionMatrixAccount` 建号后 best-effort 调用（人类款/机器人款）；存量补发走 `POST /api/governance/matrix-avatars/backfill`（superAdmin JWT + body adminToken 双闸，与 matrix-users 同款；默认只补头像为空的账号）。

## 决策记录

- D-1 归类白名单式：仅 `-agent` 后缀命中才标 AI，未命中一律按人类——宁可漏标 AI 不可错标人类（信任面）。团队注册表 `agentTeams` 是「人类账号名下的 AI 档案组归属声明」而非账号本身是 AI，不作归类信号。
- D-2 头像运行时生成而非静态资产：颜色由 userId FNV-1a 哈希决定 → 天然「每人不同」，且同 id 确定性复现，补发/重跑幂等。
- D-3 头像落位两步走（建号 createMatrixUser 不动签名，建号后 assignDefaultAvatar 单独 PUT avatar_url）：头像失败不阻断建号、不拒写 roster——建号防假成功语义（2026-10-06 修复）不因化妆性属性回退；失败态记录在响应 `avatars` 字段。
- D-4 上传者用 admin token（server admin 是真实 matrix 用户），不以新建用户身份登录——不动一次性初始口令的安全约定。
- D-5 徽标文案走模块内建词典 + computed locale（governance 先例），不 merge 全局 i18n 树——避开 `switchLocale` 重建词条树的合并时序竞态。
- D-6 客户端 `-agent` 判定与服务端建号模板互为镜像，用绊线测试（读 registry-admin.ts 源码断言模板未漂移）替代跨端共享常量（client 不 import server 模块）。
- D-7 补发默认只补「头像为空」的账号，显式 userIds 入参才覆盖已有头像——不覆盖用户自设头像。

## 变更清单

- 新增 `custom/server/matrix/default-avatar.ts`（PNG 编码 + 人类/AI 两款生成）
- 新增 `custom/server/matrix/__tests__/default-avatar.test.ts`
- `custom/server/matrix/admin-service.ts`：+`uploadMatrixMedia`、+`assignDefaultAvatar`（fetch 可注入）
- `custom/server/matrix/__tests__/admin-service.test.ts`：补两函数钉测
- `custom/server/governance/registry-admin.ts`：provisionMatrixAccount 建号后配默认头像（best-effort）；+`backfillDefaultAvatars`
- `custom/server/governance/governance-controller.ts`：+`POST /matrix-avatars/backfill`
- 新增 `custom/server/governance/__tests__/registry-admin-avatars.test.ts`
- 新增 `custom/client/matrix-chat/identity/user-kind.ts`（归类 + 词条词典）
- 新增 `custom/client/matrix-chat/components/MatrixUserKindBadge.vue`
- `custom/client/matrix-chat/components/MatrixSenderProfile.vue`、`MatrixMemberList.vue`、`MatrixMemberInfo.vue`：徽标接线
- 新增 `custom/client/matrix-chat/__tests__/user-kind.test.ts`（含服务端约定绊线）

## 验证

- `npx vitest run custom/server/matrix custom/server/governance/__tests__/registry-admin-avatars.test.ts custom/client/matrix-chat/__tests__/user-kind.test.ts` 全绿。
- overlay 全量 `npm test` 不回归。
- 合 main 后 serve-main 拉取重启 8647，8649 热更新走查：群聊消息 AI 发送者带徽标、成员列表 AI 行带徽标、成员详情身份行两态、建号/补发后头像落位。
