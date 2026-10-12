---
name: orchestrator-closeout-verification
description: "TUI/CLI 直执行多 commit 工作线收口：只读独立验收+共享仓路径限定 commit 对账"
version: 1.0.0
metadata:
  hermes:
    tags: [orchestrator, closeout, acceptance, shared-git]
    related_skills: [worker-completion-independence-verification, shared-workspace-git-commit]
---

# 直执行工作线收口纪律（orchestrator-closeout-verification）

> orchestrator profile 自有件。共享仓 commit 全量纪律以 default 的
> `shared-workspace-git-commit` 为准，独立验收完整力法以
> `worker-completion-independence-verification` 为准；本件只补两者未覆盖的
> 直执行场景增量，勿在此复述全量。

## 触发

- TUI/CLI 直执行（无 kanban worker 卡）的多 commit 工作线要收口
- 用户裁决「移交 review / 独立验收 / 收口补录」类方案

## 收口流程（顺序执行）

1. **外部事件依赖复查**：挂起的 gap 若等外部事件（版本 GA 等），先低成本双源复查
   （Docker Hub tag + 官网 release 页），未到事件就不硬造工作，给编号方案交裁决
2. **台账收口段**：在对应台账条目内追加收口段（实测结论/证据链指针/commit 链/唯一遗留），
   纯追加不动既有内容
3. **只读独立验收**（见下节）；ALL PASS 才继续
4. **commit + numstat 对账**（见下节）
5. 收口记录写明审查 transcript 路径；hindsight 沉淀关键裁定

## 一、delegate_task 只读独立验收（执行者≠验收者）

直执行场景没有 worker 卡，自评不作数——派 delegate_task 子代理做只读机械验收：

1. 清单每项=机器可执行命令+判据：grep 计数、md5 全等、`git show --stat` 范围核对、
   标题序列严格递增断言、代码围栏偶数——禁「通读打分」式指令
2. 明确声明只读、禁文件修改
3. 清单只放真实观测过的锚（job id/哈希/commit）——臆造示例值会消耗审查者的
   防编造核查
4. 清单命令先验证可执行或写成允许等效替代的形式（不存在的旗标会浪费子代理轮次）
5. 有 FAIL 先修再重验，不带病收口

## 三、「自报 vs 事实」生效判据（配置/风格/运行中服务改动必查）

自评「已修复/已生效/已重启」不作数。改的是**运行中 agent 或外部服务**时，实证三查全过才算落地：

1. **产物存在查**：改动对象真实存在且值对——`grep`/`stat` 直查，不信「已提交/已配置」自报
2. **生效时机查**：新进程/agent 的启动或构造时刻 **晚于** 改动时刻——`ps -p <pid> -o lstart` 对比 `stat -f '%Sm' <config>`。改动定格进 agent 的 `ephemeral_system_prompt` 之类「构造时快照」的，文件改对 ≠ 活进程用上，必须重启进程且重启晚于改动
3. **运行证据查**：日志里出现新连接/新加载的实证（如 `weixin: ... Connected`、`api_server connected`），而非仅「配置已改」

**判据盲区**：某类证据只在异常时产生（如 LLM 调用失败才 dump 请求），**无该证据 ≠ 无问题**，不能反过来当「已生效」的证明。缺口显式标注，不静默当通过。

## 二、共享仓路径限定 commit 对账

**机制**：`git commit -m ... -- <path>` 提交的是该文件**当前全部内容**（含他人
已写入的 staged/unstaged hunk）——它隔离文件，不隔离 hunk。

1. commit 后必 `git diff HEAD~1 HEAD --numstat -- <file>` 对行数：超出自己
   预期增量=混入并行内容
2. 动手前 `git diff --stat` 看不到别人已 staged 的部分——numstat 事后对账是唯一机械判据
3. 处置分流：内容合法且本要入库 → `git commit --amend` 在 message 如实标注归属
   （仅限未 push）；不该入 → `git reset --soft HEAD~1` 与并行会话协调分次提交；
   绝不明吸后沉默

## 反模式

| 反模式 | 修正 |
|---|---|
| 直执行多 commit 后自己写「全部完成」 | delegate 只读子代理逐项机械验收 |
| 路径限定 commit 后不核行数 | numstat 对账，混入内容 amend 标注或 reset 分流 |
| 审查清单里带未验证的示例值/不可执行命令 | 只放真实锚；命令先验或允许等效替代 |
| mtime 新于工作线起点即判越界 | skill_view/加载器会 touch 已有文件 mtime（无内容变化）；归因先看内容指纹（关键域词 grep=0）+ mtime 与本会话加载时刻吻合，再定性 |
