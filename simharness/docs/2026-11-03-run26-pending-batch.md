# run26 待办台账（采集面补流批挂账，2026-11-03）

来源：run25 收官后采集面补流批（spec 见 AIStudio `docs/superpowers/specs/2026-11-03-run25-collection-gaps-backfill.md`）。三段结构=待办 / 已裁定不处置 / 计数。

## 一、待办（N10 起，接续 run25 台账 N01-N09 编号）

| # | 事项 | 锚点/根因 | 验收判据 | 状态 |
|---|---|---|---|---|
| N10 | 18b 运行时验证面程序接线：aipay-scenario.sh 增加 runtime-verify 执行/核验点（方案 §2.5 步18b 已声明、产品端点已就位） | 前置条件=miniprogram-automator SDK 落仓（产品仓与中央仓实测 require.resolve 均 absent）+探针 health 进 mx-prelaunch-check；缺席时硬接线会把 G3⑦ 变必然熔断 | SDK 依赖入仓；prelaunch-check 含 runtime-verify health 项；run26 首跑 18b 核验位有 runtime-proof 实锚 | 待办 |
| N11 | 审计意见书新模板三字段（豁免五字段核对/双人复核记录/支付红线对账三条）＋G4 报告评测族五字段（评测门禁判定三态/过程双指标行/指标治理读数/评估器三角读数/能力维度覆盖——评测节未发起声明已补在 docs/test/RFD-001-test-report.md §12） | run25 审计时点早于模板字段演进（fc3658f 批）；评测当轮未发起（G4 评测 GAP 如实放行）——两族字段均依赖实际未发生的过程数据，代写=虚构，按红线不补 | run26 审计环节由 audit-agent 按新模板执行并产出三字段；评测族字段随 run26 评测发起产出；run25 两件维持原样（矩阵「在仓不符 2」即此挂账的呈现） | 待办 |
| N12 | 中央仓本地 main 与 origin/main 分叉仲裁（本地领先 6/落后 26，run25 审计环重写血统遗留；本地工作区另有 staged 删除 completeness-check 与 4 件未提交修改的残留脏态——补流后该文件已在 origin/main@0cee15c，本地同步时注意） | `git rev-list --count` 双向 6/26；reflog 尾=本地 1495097 审计意见书系列 | 内容级对账：本地 6 提交中与 origin 重写版逐文件 diff，等价者弃、独有内容补推；中央仓工作区脏态清零（staged 删除 unstage） | 待办 |
| N13 | 行覆盖率采集通道接入（G4 报告「覆盖数值化」字段的声明态部分） | run25 G4 补流批实测：coverage 汇总通道未接入 | 各 app vitest coverage 汇总进测试报告，G4 字段以实测数替换声明态 | 待办 |

## 二、已裁定不处置（当轮）

- **integration/RFD-001 全量 192 提交不合流**：run25 已收官无在途开发，全量合流会混入未经评审的开发面；本批只补采集缺失件（商户文档/模板补全/runtime-proof/completeness/G4 三件）直接落 main。integration 分支保留，合流与否由 run26 开轮决策。
- **步 15 G2 评审记录「文件域无独立工件」**：按设计在评审卡（arch-governance 板）上，报告如实标注，非缺件。

## 三、计数

- 本批补流进中央仓 main：五笔（5286557 商户文档 / 976ce03 模板七件字段 / 35f5c57 runtime-proof+completeness / 0cee15c G4 报告三件+字段）。
- 补拍帧：dispatch_done 2 帧 + report_done 2 帧 + mp_runtime_proof 首帧 1 帧（frame-verify 3/3 过）。
- 报告终态：交付物矩阵 25 行=在仓 24（模版符合 22 · 不符 2）+缺件 0；审计四查全过（A3a 容差对齐 R8）。
