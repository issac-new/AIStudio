# pua 技能集 vendored 声明

- 上游仓库: https://github.com/tanweai/pua
- 同步 ref: main (commit `e6e6cd237ad17750d179674bff52f8184abea8fd`,2026-09-09T18:27:33+08:00)
- 许可: MIT(上游 plugin.json/README 声明;仓库根无独立 LICENSE 文件)
- 技能清单(12): ding, mama, p10, p7, p9, pro, pua, pua-en, pua-ja, pua-loop, shot, yes
- frontmatter 规范化(加引号): yes(YAML 1.1 布尔裸值兼容,详见 PIN)

本目录内容(script-owned,勿手改)由 overlay/scripts/runtime/vendor-pua.mjs 从上述
上游提交同步(仅 frontmatter 布尔裸值加引号这一类最小规范化)。本地修改一律会被
下次同步覆盖;如需裁剪,改 vendor 脚本并同步更新守门测试,不要直接改技能文件。
