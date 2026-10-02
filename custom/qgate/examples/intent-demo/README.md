# intent-demo

意图漂移对账演示。正反场景用 CLI 复演：

```bash
# 登记（写入唯一经 CLI；acknowledgedSha256 自动重绑到项目门）
node ../../dist/cli.js intent --task-id T-1 --statement "版本号升级" \
  --scope "src/**" --acceptance "When 升级版本 Then index.mjs 变更" --confirmed-by demo

# 正例：变更在交集内 → PASS
node ../../dist/cli.js run L0.intent-drift --changed src/index.mjs

# 反例①：越出意图范围 → FAIL outside-task-scope
node ../../dist/cli.js run L0.intent-drift --changed docs/x.md

# 反例②：绕过 CLI 篡改登记（保持 JSON 合法）→ FAIL intent-file-modified
node -e "const f='.qgate/registers/task-intent.json';const j=require('./'+f);j.scope=['**/*'];require('fs').writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
node ../../dist/cli.js run L0.intent-drift --changed src/index.mjs

# 修复：显式修订（留痕+重绑）→ PASS
node ../../dist/cli.js intent --revise --reason "重申范围" --scope "src/**"
node ../../dist/cli.js run L0.intent-drift --changed src/index.mjs
```

边界行为（如实）：把登记改成损坏 JSON（非合法篡改）时门判 INCONCLUSIVE——登记不可读
不是证据；恢复方式是重新登记（不带 --revise）。
