# NOTICE — 版权链与许可

## 三方来源链

```
danyuchn/asd-ste100-skill（英文原版，MIT）
  ├── timwhitez/asd-ste100-zh-skill（最小中文适配，MIT）
  │     └── 贡献：保真纪律（执行者不凭空指定/要求强度四档/条件前置/风险前置）、
  │           英文分支完整保留、英文 linter fail-closed 设计
  └── lemonhall/asd-ste100-skill-zh（中文原生重写，MIT）
        └── 贡献：中文失败模式重写的规则主体、中文 linter ste-lint-zh.py、
              8 组前后对照、规则全集与上游九节对应表
```

## 本目录构成

- **上游原样保留**：`scripts/ste-lint-zh.py`、`references/writing-rules.md`、
  `examples/before-after.md`、`examples/after-only.md`（lemonhall）；
  `scripts/ste-lint-en.py`、`references/writing-rules-en.md`、`examples/before-after-en.md`、
  `examples/linter-edge-cases-en.md`（timwhitez）。
- **hermes 化增补**（不删改上游正文）：SKILL.md 头部「Hermes 使用纪律」段、frontmatter
  metadata、文末「三层分工」节；三方版权链 NOTICE.md（本文件）。
- 两上游 README 中安装说明未收录；上游 docs/ 图片与公众号文稿未收录（非运行时资产）。

## 许可

- 两个上游仓库均为 MIT（见 `LICENSE-lemonhall`、`LICENSE-timwhitez`）。
- lemonhall 上游声明：规则类别参考 danyuchn（MIT）；未复制其文字、示例与代码。
  timwhitez 上游声明：完整保留 danyuchn Git 历史与 MIT LICENSE（Copyright (c) 2026 Dustin Yuchen Teng），
  新增中文说明与代码改动同样以 MIT 发布。
- ASD-STE100 标准正文与约 900 词受控词表**不在本仓库**：标准免费获取但不可自由再分发
  （Issue 9 页 2 授权条款），本技能只复述规则类别，词汇规则降级为「方向」。
- 本技能不提供任何官方中文受控词表或 ASD-STE100 合规认证。
