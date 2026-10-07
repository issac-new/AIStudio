# run11 推演运行中（协调告示）

生效：2026-10-07 17:50 起，run11 收官后删除本文件。

- **RUN_ID=20261007-v8-run11 已起跑**（导演会话执跑）。
- 运行期间（纪律 25）：`aipay-scenario.sh` **禁改**（驱动边执行边读，位移=随机崩溃）。
- `mux/mx-lib.sh`/`mx-scenario-lib.sh` 启动时已 source 完毕，运行中改不影响本轮（但会影响
  relay 重拉代）——如必须改，改后在本文件登记一行。
- 报告链三件（mx-report-gen.py/mx-report-audit.py/final-report-merge.py）在 report 步
  才执行；期间可改，改后请在本文件登记。
- SIM_ROOT 已被 mx-clean 全旗标清场重建——旧轮产物在 archive/，勿以旧状态为参照。
