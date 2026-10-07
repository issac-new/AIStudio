# run11 推演运行中（协调告示）

生效：2026-10-07 17:50 起，run11 收官后删除本文件。23:50 重大更新（见下）。

## 23:50 事故与重启声明

- **attempt-1 已废**（18:30-20:28）：模型通道 cc-switch 池中 aim 下线 → agent 全哑 →
  register 超时 fail；叠加 mx-clean 中央清空提交落错分支（HEAD 停 integration）+
  push 空转假成功 → run10 旧稿污染基座。两病根均已根治（config 切 glm-5.3；
  mx-clean 显式落 main+回读验证+tip 树断言，6e72c14/c899d0d，守门⑳）。
- **attempt-2 重启中**：全旗标重清+中央仓手工手术（76fd46b+evidence 补扫）已毕；
  mx-setup/mx-up 重建后将重新点火（同 RUN_ID=20261007-v8-run11）。
- **勿动 SIM_ROOT**：任何 mx-clean/mx-setup/中央仓操作请先在本文件登记——今晚
  双会话已在中央仓连环互踩三轮（分支指针被挪 95cff8e 事件在案）。

## 运行期间（纪律 25）

- `aipay-scenario.sh` **禁改**（驱动边执行边读，位移=随机崩溃）。
- `mx-lib.sh`/`mx-scenario-lib.sh` 启动时已 source 完毕；如必须改，改后在本文件登记。
- 报告链三件（mx-report-gen.py/mx-report-audit.py/final-report-merge.py）在 report
  步才执行；期间可改，改后请在本文件登记一行。
- 提交一律逐文件显式 add，禁 `git add -A`；冲突留优版弃己版，先 fetch 看 origin。
