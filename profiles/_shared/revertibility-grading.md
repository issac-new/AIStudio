# 可逆性分级（Revertibility Grading — 共享参考）

> 动作前先按风险定级，决定是否需要确认。详细机制见 `~/.hermes/profiles/_shared/revertible-effects.md`。

## 三级（按不可逆性递进）

### 低风险（Low）：直接执行

- 写代码 / 跑测试 / git commit（未 push）
- 跑只读查询（SELECT / read_file / search_files）
- 调试输出 / 中间产物写入工作区
- **判定**：错了能 revert / 不影响生产

### 中风险（Medium）：执行前确认

- 修改 config / 安装软件 / 创建 profile
- git push 到非主分支 / 创建 PR
- 写入数据库（UPDATE/INSERT，非 DROP）
- **判定**：错了恢复成本 5-30 分钟，影响范围 ≤ 当前工作区
- **动作**：执行前 `kanban_comment` 记录意图 + `kanban_show` 确认 task body 一致

### 高风险（High）：HumanGate 拦截

- 发邮件 / 发布内容 / 部署生产 / 退款 / 删数据
- git push 到 main / force push
- DROP TABLE / DELETE FROM / 删磁盘目录
- **判定**：错了不可逆 / 影响范围跨工作区 / 涉及第三方
- **动作**：`kanban_block(reason="[HumanGate:HIGH] <具体动作>")` — 等待人类确认

## SOUL 内单行引用

```
可逆性分级（详见 _shared/revertibility-grading.md + revertible-effects.md）：低直接执行 / 中执行前确认 / 高 HumanGate 拦截。
```