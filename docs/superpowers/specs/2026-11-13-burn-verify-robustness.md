# 凭证核验健壮性根治——burn-20261113 虚报误判实录（2026-11-13）

## 变更

背景（burn-20261113-075643 烧机实录）：fanfan 于 08:10:50 推送 ef1c046（含 `docs/analysis/RFD-001-tasklist.md`，98 行）后，步骤 10 凭证核验对该**真实存在的凭证**连续误判「commit 里没有 tasklist.md——虚报」共 **196 次**（两轮驱动进程内稳定失败：第一试 08:31-08:36 ×50、续跑第二试 09:17-09:35 ×146），09:36:05 同进程同参数通过。期间：

- 核验链 git 调用 stderr 全被 `2>/dev/null` 吞——git 层真实失败原因零留证，人工复现（同目录同命令含 pipefail 形态 12+ 次全通过）无法定谳；
- 回灌文案与真实失败原因无关（固定指向「card 用了需求编号」），agent 收到无关整改指令；
- agent 迟滞（idle 60 分钟，V3 已知）被核验空转放大：第一试整轮 60 分钟报废（07:56-08:56 两窗空转判死）、续跑环第二试再空转 20 分钟。

修复四件：

1. **stderr 留证**（`mx-scenario-lib.sh` verify_done_evidence）：cat-file/ls-tree 失败分支的 note 带 git 原始 stderr（截 200 字符），同步落 issues.log——复发即自动定谳。
2. **判定去管道化**：文件在树判定由 `git ls-tree -r --name-only "$sha" -- "*${rfd}-tasklist.md"` 直接以 git 退出码判定（路径通配由 git 引擎执行），消灭 `| grep -q` 管道语义面（SIGPIPE/pipefail/locale 等全部歧义路径）。
3. **连续同因失败交叉验证**：同一 sha 连续 ≥5 次文件核失败时触发第二通道 `git cat-file -e "$sha:docs/analysis/${rfd}-tasklist.md"`；两通道矛盾＝「核验通道异常」记 issue 并把判词从「虚报」改为「核验通道异常（暂不定罪）」——执法器自身故障不定罪 agent，也不虚放（fail-closed：等待通道恢复，不影响拒收回灌流程）。
4. **回灌文案动态化**（`aipay-scenario.sh` 步骤 10）：回灌消息携带本次核验的真实失败形态（未见 DONE 行／commit 不存在／文件不在树／卡反核失败／通道异常），替换固定 card 说教文案；card 说教仅在卡反核失败形态下附上。

## 决策记录

- D1：不等 L1（ls-tree 当时失败的确切 git 层原因）定谳即修。修复 2 绕开整条歧义管道路径、修复 1 使下次复发自动留证；「先根治可观测性与确定性，不猜 git 内部行为」。
- D2：交叉验证矛盾时**暂停虚报判词**而非放行——虚报是对 agent 的重罪指控，核验器自身异常时只记「通道异常」issue，误杀与虚放都不取。
- D3：定性——run29 归档同段「里没有…虚报」0 次；本轮为清场后新变量组合（截断后小树＋agent 早推慢报 DONE 21 分钟）触发的新缺陷面，放大器（迟滞×核验空转×误导回灌）属存量结构问题，随本批根治。
- D4：连续失败计数器放 verify_done_evidence 内（bash 关联数组，进程内有效）——不落盘；跨进程重启后从 0 计（两轮驱动各自 ≥5 次即触发交叉验证，语义足够）。

## 验证

- 新守门测试 `simharness/tests/run30-burn-verify.test.sh`：①ls-tree 路径过滤判定形态（脚本源内断言）；②失败 note 含 stderr 留证段；③交叉验证矛盾路径（`核验通道异常` 判词存在）；④回灌文案动态形态断言。
- `bash -n` 两脚本；`bash simharness/tests/run-gates.sh` 全绿；`run30-actions.test.sh` 不回归。
- 修复合入后重烧 `mx-burn-test.sh`（机制 digest 随本批变化，旧收据不认账）；烧机经历（2 试 196 次误判）留档本 spec 为缺陷证据。

## 设计文档影响

DESIGN_SYNC: none——harness 实现健壮性修复，不改方案语义与 DESIGN_DOCS 四正本内容；核验纪律的实现细节由本 spec 承载。
