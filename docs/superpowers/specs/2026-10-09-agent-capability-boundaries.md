# Agent 能力声明与边界自动划分（run13 设计稿）

2026-10-09 用户架构裁定：五角色硬编码不通用——hermes agent teams 分布式部署后每台电脑
都可能持续新增 agent，边界必须由 profile 能力声明自动划分，而非中央改码。本稿定义目标态
与迁移路径；v2 注册表文件化（role-boundary-registry.json + agent-role-overrides.json +
解析链）是本稿的过渡承载，已落地。

## 一、能力声明 schema（四维）

每个 agent profile 携带 `capabilities` 声明（组织注册表与本地 profile 双写，注册表为准）：

```json
{
  "agent": "@hu-agent:matrix.test",
  "role_template": "dev",
  "capabilities": {
    "deliverable-kinds": ["code", "test-report"],   // 文档/代码/测试/判词/报告 五类
    "vcs-scope": "own-branch-only",                  // own-branch-only | main-docs-only | none | director
    "domain-scope": ["csw-channel-wechat"],          // 归属域；空=不限（高危，默认拒绝写）
    "integration-authority": "none"                  // none | own-domain | director
  }
}
```

**边界生成规则 = 否定式合成**：任务书边界条款由"任务要求的能力 ∩ profile 未授权的维度"
自动生成（例：任务要求写代码而 profile.deliverable-kinds 不含 code → 注入"禁写实现代码；
该交付物需转交有权限者"）。角色模板退化为四维组合的快捷方式（analyst=doc+main-docs-only+
integration:none），新增角色=新增组合，无代码变更。

## 二、组织注册表联动（单一事实源挂载点）

- 端点扩展：`PUT /api/governance/registry/org` 的账号条目增加 `capabilities` 字段
  （现有 role 字段升级为 role_template 引用）；`GET /api/governance/registry/org?expand=capabilities`
  供派发侧解析。
- 派发侧解析链（替代 agent-role-overrides.json 过渡文件）：
  任务显式 boundaryRole > **org 注册表 assignee→capabilities 四维合成** > 产物形状推导 > generic。
- 变更治理：capabilities 属治理域字段，修改走注册表既有"保存即 git 提交"通道（留痕可审计）。

## 三、分布式 fleet 注册协议

新 agent 上线（任一电脑）：
1. 本地 profile 声明 role_template 或显式 capabilities；
2. 向所在 fleet 的 studio 发起注册（复用 roster 通道：POST /api/governance/matrix-users 的
   扩展字段），注册表落库即生效——派发时自动按声明合成边界，**中央零代码变更**；
3. 声明缺失的 agent 走 generic 最小边界（仅做任务书明示事项、不推共享主干），宁紧勿松。

## 四、迁移路径（三步）

| 步 | 内容 | 状态 |
|---|---|---|
| M1 | 五角色注册表文件化 + 解析链 + per-agent 覆盖文件 | ✅ 2026-10-09 已落地（本稿随附） |
| M2 | org 注册表 capabilities 字段 + 端点扩展 + 派发侧改读注册表 | run13 落地（产品 API 面） |
| M3 | 否定式合成器（四维→条款生成）+ fleet 注册协议 + capabilities 变更审计 | run13 后半，随首个真实分布式节点接入验证 |

## 五、验收判据

1. 新增角色仅改注册表文件（M1）/仅改 org 注册表（M2），派发即带正确边界——守门测试
   task-boundaries.test 的"新角色零代码接入"用例持续在位；
2. 声明缺失 agent 一律落 generic 最小边界（红线：宁紧勿松）；
3. 边界条款与既有 bash 派发词（run13-boundary-guards.patch 口径）语义一致——单一事实源
   以本稿 schema 为准，两侧口径漂移由守门测试互查。
