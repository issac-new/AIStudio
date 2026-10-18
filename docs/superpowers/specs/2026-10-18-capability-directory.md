# 舰队能力发现面（2026-10-18）

分支：`feat/fleet-capabilities`
来源：teamai-cli 调研多机修正轮。集群为多机 Matrix 协作（tri-node 方案定案"跨机零新增服务：matrix 房间派活回执 + git 交付真值"），能力管理四层中"发现"是唯一真空：委托前"哪台机的哪个角色有什么能力"没有数据面（channel_directory.json 空壳，roster 含凭据禁入 git）。

## 设计

- **数据源**：中央仓 `capability-reports/<machine>.json`。每机由 `_shared/ops/provision-pull.sh`（mac=launchd `ai.hermes.shared-pull` 每日 06:40；win=计划任务同脚本）生成并提交推送。零新增服务，与 tri-node 纪律一致。
- **上报口径**：与 skillprovision 对齐——技能=含 SKILL.md 的目录 basename，跟随符号链接；角色=中央 manifest 匹配（精确>最长后缀>最长前缀>`*`）。生成器 `_shared/ops/gen-capability-report.py` 单文件可独立运行。
- **聚合面**：`GET /api/skillgov/provision/fleet`（skillprovision/fleet.ts）——机器清单+新鲜度（>48h 标 stale；generatedAt 缺失按过期）+每机 profile×角色×技能数；坏文件记名跳过（fail-soft）。UI=供给对账页签"舰队能力"块：机器卡片（展开看 profile 表）+客户端搜索（机器/账号/技能名）。
- **不在本层**：`hermes peer` 委托前的自动查目录（下一层：委托词生成时注入目录摘要）；Matrix 目录房（中央仓文件已满足当前规模，规模大了再上）。

## 决策记录

- D-1：上报走中央仓文件而非 Matrix 房间。理由=git 交付真值是既定决策，文件可 diff 可回滚；Matrix 房留给派活回执语义。
- D-2：全量技能清单随上报入仓（单机约 340KB）。理由=发现面搜索需要全集；本地 bare 仓量级可承受。规模增长后可裁剪为"清单哈希+按需查询"。
- D-3：新鲜度阈值 48h（每日上报，容忍一个周期失败+一个周末）。

## 验证

- `custom/server/skillprovision/__tests__/fleet.test.ts` 5 项：多机聚合+新鲜度、坏文件跳过、目录缺失如实、generatedAt 缺失按过期、env 覆盖。
- 真机首跑：`capability-reports/m5u.json` 生成（50 profile）、launchd kickstart 现场触发 last exit 0、自动提交推送进中央仓。
