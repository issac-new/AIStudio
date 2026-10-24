# R43 运行时刷新档（2026-09-22，用户 /goal 三目标②触发）

## 结论

**2 移动（均薄轮）+ 16 零移动**。物化 checkout：comet `0.4.3`、open-code-review `v1.12.9`（merge-base 祖先核验同线成立）。live CLI 零漂移（claude 2.1.278 / codex 0.155.1，R42 同日已消漂移）。吸收两段：subagent-orchestration R43（comet）、review-methodology R43（ocr）。台账两行版本格/最新核/状态列同步。预算实测发版轮口径不变，本轮注记增量约 2.6KB 在裕量内（发版轮复算）。

## 移动明细

### comet 0.4.2 → 0.4.3（tag 2026-09-22 22:45 +0800，2 commits）

`feat: improve project memory and workflow runtime (#450)`：
- **project-knowledge 索引重建可恢复**：重建失败不损毁既有索引（破坏性操作守卫族：重建=事务性操作，失败回原状）。
- workflow CLI 检查性能优化 + Windows daemon 任务挂起修复且保留加速路径（修复轮成对验证族：修复不得回退既有性能）。
- skill 项目记忆完成指引恢复（指导丢失即恢复）+ manifest 与原生技能预算对齐（发布面一致性）。
- archive workflow-cli-performance 专项（性能专项完成即归档）。

### open-code-review v1.12.8 → v1.12.9（10 commits，安全与一致性批）

- **credential 命令执行前校验**：`validateKeyCmd()` 拒绝 shell 元字符（命令分隔符/反引号/重定向）进 `api_key_cmd`/`auth_token_cmd`，明文凭据告警（#1291）——配置值进 shell 前校验，防篡改/误配执行破坏性表达式（fail-closed 命令通道族）。
- **config 更新保留未知 JSON 字段**（#1508）——配置写回不得静默丢弃不认识的字段（向前兼容守卫，与 openspec「坏输入不动原物」同族）。
- **findings 跨文件重命名保持**（#1529）——评审状态与路径解耦迁移。
- gitlab 多行评论与建议（#1000，平台适配面）；--commit 后台通道隔离 git stderr（#1467，机器通道防污染）；CI action 钉全 SHA（#856，供应链面）；.gitattributes binary 标记扩展；viewer 移动端元数据换行（查看器面不吸收）；token 边界 fixture 稳定化 + 引号路径解析改真实 git 子进程钉行为（测试卫生族）。

## 零移动核对记录

claude-code npm 2.1.278（stable 通道 2.1.267 分裂持续）/ codex stable 0.155.1（0.157-alpha.8 前移不取）/ dsh v0.1.7-alpha.1（alpha 不取，触发点仍=0.1.6 stable）/ gitnexus v1.6.13-rc.28（rc+license-risk 双不取）/ ruflo npm 3.42.5（仅 triage 分支新增）/ claude-mem GitHub v13.25.3 / codex-security npm 0.1.29（main 有推进无 tag）/ openspec GitHub v1.13.1 / graphify v0.9.65 / superpowers v6.4.1 / gstack v1.87.5.0（commit subject）/ ECC v2.2.1（main 推进无 tag）/ gsd-core v1.14.0（next 分支推进无 tag）/ better-harness（alpha 线）/ harnesseval-w / impeccable（候选级 R16 裁决）。

**上游异常观察**：openspec 的 npm registry 版本回归 `0.0.0`（R34 时为 1.13.1）——发布异常或刻意回钉，oracle 口径=GitHub tag 不受影响，登记观察不计漂移。

## 纪律执行

同日复核废止条款适用（R42 同日），本轮由用户 /goal 显式触发为 R43；patch 级移动只更新表行不开调研轮；吸收注记两段（约 2.6KB），薄轮不改 SKILL.md、不发版、不升门禁。
