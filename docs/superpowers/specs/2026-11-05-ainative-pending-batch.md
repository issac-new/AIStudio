# 2026-11-05 AI Native 吸收批挂账台账

## 待办

（空——N01 已于 2026-11-05 同日清偿，见下）

## 已清偿

### N01 权限最小化（D1）——resolved 2026-11-05（用户令「直接做完」）

- **锚点**：`config/default-tool-policies.json`、`custom/server/managedsettings/managed-settings.ts`、`team/shared/role-tool-matrix.yaml`、`custom/server/toolpipeline/enforce-gate.ts`（masterSwitchOn）
- **根因层**：探查确认的四缺口——执法总闸默认关（规则在位不拦）、策略文件缺席=无治理裸放、无组织级锁定面、无按角色工具矩阵；`.git` 无写护栏；路径沙箱相对路径豁免
- **清偿内容**：
  1. 总闸默认开（`HERMES_TOOL_ENFORCE` 未设或=1 执法，显式=0 逃生门；managed 可锁死）
  2. 策略文件缺席回落仓内默认策略包（三 deny 红线：凭证路径/.git 写/破坏性 shell；两 require_approval：包安装/git push——推演场景由审批环代批；只读放行；permissive 未命中不拦）
  3. managed-settings 组织锁定面（部署侧 ~/.hermes-web-ui/ 与仓内 config/ 双源，锁定总闸＋extraDeniedTools 并入策略链最前；端点 GET /api/harness/managed-settings）
  4. 角色工具矩阵 8 角色×30/30 profile 全覆盖（守门测试断言新 profile 必须归角色）
  5. 路径沙箱补强：exec 相对路径按入参 cwd 解析后判定（相对路径不再是豁免通道）
- **验收**：`custom/__tests__/role-tool-matrix.test.ts` 9 断言（含策略包执法语义集成：.env 拒/push 审批/sudo 拒/普通读放行）；doctor permission 项 pass；评分卡 no-broad-permission 升 pass、least-privilege 保持 partial（沙箱半边 roots 未配默认不拦——按需配置项非缺口）
- **遗留（观察项，非缺口）**：OS 级沙箱接 Agent terminal 主执行面保持 opt-in（exec-sandbox 已接 qgate 执行器与红队探针；全量接入需 vendor patch＋真实跑验证，独立立项）

## 已裁定不处置

（空）
