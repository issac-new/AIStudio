#!/usr/bin/env bash
# 运行时造一个最小 git 仓库：基线提交后，在项目目录 proj 之外（兄弟目录 other）删一条断言。
# 项目目录＝proj，这处删除不在判定范围内 → 期望 pass。
# 与 violating-in-subproject 对照：同一布局下，范围内的断言删除仍被拦——限定范围不是放行。
set -u
rm -rf .git proj other
git init -q
git symbolic-ref HEAD refs/heads/main
mkdir -p proj other
printf 'test("a", () => { expect(1).toBe(1) })\n' > proj/a.test.js
printf 'test("b", () => { expect(2).toBe(2) })\ntest("c", () => { expect(3).toBe(3) })\n' > other/b.test.js
git add proj/a.test.js other/b.test.js
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
# 范围之外的断言删除（未提交）
printf 'test("b", () => { expect(2).toBe(2) })\n' > other/b.test.js
