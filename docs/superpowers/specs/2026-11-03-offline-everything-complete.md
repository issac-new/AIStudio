# 2026-11-03 离线包 everything 档口径：R145 全内嵌修订已撤销（恢复 R134）

## 变更

1. `skills/swarm-yuan/scripts/make-offline-bundle.sh`：`--everything` **恢复 R134 口径**（`--no-vendor` + knowledge + docs + github-src），帮助文本同步；R145 的全内嵌改动已回退。
2. 重新产出并替换发布资产：`swarm-yuan-offline-v1.0.9-overlay-everything.zip` 回到 **72M 档**（知识库 318 条＋docs＋github 源包，**不含** npm/pip 运行时），GitHub 与 ModelScope 双通道统一替换，`SHA256SUMS-v1.0.9-overlay.txt` 同步。

## 决策记录

- **最终裁定（2026-11-03 用户明确指令）**：「可以通过 pip/npm 连接镜像源安装的内容，不要包含打包」。R134 口径成立且为唯一口径——**能走源装的一律不打包**，离线包只承载源装不了的（知识库／docs／github 源包）。理由：镜像源在目标机可用时，重复内嵌只是体积浪费与版本漂移风险；离线包大小从 127M 回到 72M。R145 记录保留如下，供追溯，不再生效。
- **问题（2026-11-03 用户质询触发）**：用户问「aistudio-yuan-skill / aistudio-full 是否含 everything 版本的内容」。实测发现**两档互补而非包含**——默认档含 9 个 npm tgz＋1 个 pip whl（61M）但零知识库；`--everything` 档含知识库 318 条＋docs＋github 源包但**零运行时**（R134 口径「可经 npm/pip 源装的不内嵌」）。断网机器拿任何一档都会缺件，只能靠诚实降级。
- **裁定依据**：用户令「离线包 everything 档要能一次装齐」。R134 的省体积考量在断网场景不成立——目标机没有源可走，省下的 60M 换来的是功能降级。
- **口径修订（R145）**：`--everything` = 全内嵌。体积代价 61M → 127M（ecc 源包 37M 已含在内），换取断网可装齐。默认档保留（联网机用，体积小）。
- **不做的事**：不把运行时本地包塞进两个「源码包」（`aistudio-yuan-skill-*-src` / `aistudio-full-*-src`）——源码包口径是 git 跟踪文件，掺入 npm 产物会破坏可审计性；离线需求由 everything 档唯一承载。
- **命名不变**：仍叫 `-everything.zip`（语义从「只带源装不了的」变成「一切都带」，与档名一致后反而更准确）。

## 验证

- 包内容实测：`vendor/npm/*.tgz` 9 个（gitnexus 20.6M / comet 17.5M / claude-mem 8.0M 等）、`vendor/pip/graphifyy-0.9.95-py3-none-any.whl`、`vendor-knowledge` 318 条、`docs/` 218 条、`vendor/github` ecc-src.zip 37M＋superpowers-src.zip，总 4123 文件 / 127M。
- `bash -n` 脚本语法门通过；构建日志 `npm 失败 0 / pip 失败 0 / --no-vendor 跳过 0`。
- 双通道回下载 `shasum -a 256 -c` 待发布后执行（见 RELEASE-NOTES 更新）。

## 设计文档影响

DESIGN_SYNC: touched——skill 打包口径（R134→R145）属技能发行面设计约束，记于本 spec 与 `make-offline-bundle.sh` 帮助文本；无产品行为面变化。
