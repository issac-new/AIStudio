#!/usr/bin/env bash
# 运行时造一个最小 git 仓库：基线提交后，在项目目录 proj 之内删一条断言（未提交）→ 期望 fail。
# 与 compliant-out-of-scope 对照：同一布局，区别只在断言删除落在范围内还是范围外。
set -u
rm -rf .git proj other
git init -q
git symbolic-ref HEAD refs/heads/main
mkdir -p proj other
printf 'test("a", () => { expect(1).toBe(1) })\ntest("a2", () => { expect(2).toBe(2) })\n' > proj/a.test.js
printf 'test("b", () => { expect(2).toBe(2) })\n' > other/b.test.js
git add proj/a.test.js other/b.test.js
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
# 范围之内的断言删除（未提交）
printf 'test("a", () => { expect(1).toBe(1) })\n' > proj/a.test.js
