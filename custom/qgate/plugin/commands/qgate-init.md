---
description: 在当前项目初始化 .qgate/ 骨架（启用 QGate）
---

在项目根执行 `qgate init` 创建 `.qgate/` 目录与默认配置，项目级 opt-in 从此生效：

```bash
node "<CLI_PATH>" init
node "<CLI_PATH>" validate-config
node "<CLI_PATH>" run --all
```

`<CLI_PATH>` 同 /qgate-status 的解析方式。

生成的 `.qgate/qgate.yaml` 默认 `profile: feature-close`；`qgate init` 同时创建 evidence / risks / waivers / cache / runs 子目录。未 init 的项目，QGate 插件与 CLI 全部静默放行。
