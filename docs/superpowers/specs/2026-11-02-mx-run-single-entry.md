# mx-run 单入口——监督器随开跑自动携带＋驱动 _sens 重入路径未绑定修复

日期：2026-11-02 ｜ 类型：fix（simharness 启动面）｜ 状态：implemented（run25 值守批）

## 变更

1. **`mux/mx-run.sh` 单入口**：`--run <RUN_ID>` 缺省拉起 run-driver-supervisor（监督器
   自拉驱动、report_done 自退、stop 文件即退），幂等（同 RUN 监督器在位只报不重拉；
   stop 文件在位明示先清）；裸跑须显式 `--no-supervisor` 并打警告。README 快速上手
   的裸跑行替换为单入口，并标注 run25 实锤事故形态（裸跑驱动 21:07 熔断退出后
   34 分钟无人续跑——run24 靠值守人肉挂监督器掩盖缺口）。
2. **`aipay-scenario.sh:1091 _sens 未绑定**：`_sens` 只在 security_review_done 未置位
   的分支（:850）赋值；熔断复位重入路径该键已置→赋值被跳过→:1091 裸引用报
   unbound variable。修法：引用处改 `"${_sens:-}"`（该检查本被 security_review_done=1
   短路，语义不变，纯重入路径卫生）。

## 决策记录

- 单入口而非「驱动自 spawn 监督器」：监督器是驱动的自愈层，驱动自杀式拉起自己的
  看护者存在归属倒挂（驱动熔断退出时监督器是否该被 kill 的语义含混）；监督器在前、
  驱动由其拉起的既有拓扑（run-driver-supervisor 设计）不动，只收口启动入口。
- 不在 prelaunch 加「监督器在位」断言：监督器随 run 启动、先于 prelaunch 时不该在位；
  断言挂错时序。由 mx-run 缺省行为保证。

## 验证

- `bash -n mux/mx-run.sh` 语法门；`--run` 缺参/未知参数出口码 2；幂等分支与 stop 文件
  分支人工核对。
- _sens 修复回归：熔断复位重入路径不再出现 `line 1091: _sens: unbound variable`
  （run25 后续轮次驱动日志为证）。

## 设计文档影响

DESIGN_SYNC: none——启动入口收口与重入路径卫生，无契约/判据/阈值变化。
