# architecture-dependency-demo

依赖图真实测量演示（上游 quality-gate v1.29 W3 本地方言）：
- `src/` 真实 .mjs 静态 import 扫描（状态机分类：注释/字符串/模板/正则不误计；
  副作用 import 与 export-from 不漏计；正则语境守卫）
- `layers.json` 声明分层与禁止方向（core→ui）
- 环检测：DFS 三色标记
- 场景：`QGATE_SCENARIO=violation`（注入 core→ui 违例文件）/ `cycle`（注入 a↔b 环）/
  默认 clean——注入文件 finally 自动清理

```bash
echo '{"runId":"r1"}' | node runner.mjs                  # clean：exit 0
QGATE_SCENARIO=violation sh -c "echo '{}' | node runner.mjs"   # 检出违例：exit 1
QGATE_SCENARIO=cycle sh -c "echo '{}' | node runner.mjs"       # 检出环：exit 1
```
