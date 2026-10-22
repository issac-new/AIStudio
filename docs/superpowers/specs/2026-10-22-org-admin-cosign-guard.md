# 治理者守卫：org 编制 admin 行双人会签 + break-glass 紧急通道

> 2026-10-22 用户裁定「补完缺口」：单 admin 可改任何编制行（含自我扩权/自我移除），
> 「治理者由谁治理」无机制答案。本轮落双人会签 + 紧急通道强制审计。

## 改动

- **守卫**（governance-controller PUT /registry/:kind，仅 org）：保存前 diff 编制表
  admin 行（账号=admin 或角色含「治理裁决」，registry-admin.ts `detectAdminRowChange`
  整行规范化比对），触及增/删/改即 409 `org_needs_cosign`（code 供前端判别）。
  豁免：此前无任何 admin 行（空表/首次建编）放行直写——删光 admin 行本身被拦，
  豁免不可成为绕路。
- **双人会签**：POST /registry/org/cosign 发起（变更全文暂存 docs/admin/org-cosign.md，
  单槽——已有 pending 再发起 409）；GET 读 pending；POST …/approve 落盘 org.md
  +闭单+审计留痕，POST …/reject 闭单留痕不落盘。资格（`cosignEligible`）：会签人
  编制在册且为治理岗（admin 行或角色含「审计」）且 ≠ 发起人（同人自签=守卫正主，
  403）。批准时复核暂存单仍触及 admin 行（编制已被他人改过则拒批，403）。
- **break-glass**：PUT 带 breakGlass+breakGlassReason（必填）→ 单人放行，commit
  强制 `[BREAK-GLASS]` 前缀 + docs/admin/audit-trail.md append-only 留痕
  （与离职③同模式）。
- **审计留痕**（`appendAuditRow`）：org-break-glass / org-cosign-approve /
  org-cosign-reject 三类动作全量入 audit-trail.md。
- **前端 OrgEditor**：保存被 409 拦截即弹「治理者守卫」对话框（发起会签 / 输理由
  紧急落盘 / 取消）；常驻「待会签变更」块（发起人/明细/批准/驳回）。adminRegistry
  api 客户端同步四函数 + saveRegistry 增 breakGlass 可选参（向后兼容）。

## 不改

- roster/app-registry/invites 等其他 registry 的写路径不加守卫（非治理者数据，
  superAdmin 闸既有）。
- writeRegistry 库函数不加守卫（守卫在 controller 层——会签落盘自身须走库函数
  直写；offboard 等既有调用方行为不变）。
- 审批流（review-governance）与本体不合并——会签是台账写入闸，审批是变更业务流，
  编制变更接审批流属后续轮。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 1 | 守卫对象=admin 行而非全部编制行 | 缺口正主是「治理者自我变更」；全编制行都拦会把普通入离职逼去走重流程，使用面恶化 | 全编制行会签（否决：低频高危≠高频低危一刀切） | 是 |
| 2 | 会签资格=admin 行或角色含「审计」 | run22 编制已含独立审计岗（汇报 admin 不隶属 lead），监督线天然第二签手；角色文本判定与 org.md 语义一致 | 引入新权限字段（否决：org.md 加列牵连全链，文本判定够用） | 是 |
| 3 | 初始建编豁免（before 无 admin 行放行） | 生产仓是空表，首填编制被锁死则功能自锁；删光 admin 行本身被拦，豁免无绕行路径 | 无豁免（否决：空仓死锁） | 是 |
| 4 | 会签单存治理仓 git（org-cosign.md）而非服务端内存 | 治理审计要求留痕+重启不丢+git 历史可回溯暂存全文；已决单闭单后全文仍在 git 历史 | 服务端状态（否决：重启丢单、无审计） | 是 |
| 5 | break-glass 单人放行+强制留痕而非禁死 | 真实运营必有「第二签手不在场」的紧急窗口；禁死会逼人绕到文件系统直改 git（更不可审计），留痕通道把紧急行为拉回审计面 | 完全禁止单人（否决：催生旁路） | 是 |
| 6 | 409 用 code=org_needs_cosign 供前端判别 | 上游 request 把 status/code 挂到抛错对象；前端据此弹守卫对话框而非普通报错 | 前端解析 error 文本（否决：文案耦合脆） | 是 |
