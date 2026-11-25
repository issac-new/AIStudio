#!/usr/bin/env bash
# 运行时造一个最小 git 仓库：基线提交后在测试文件里新增一行 test.skip(（未提交）→ 期望 fail。
set -u
rm -rf .git a.test.js src
git init -q
git symbolic-ref HEAD refs/heads/main
printf 'test("a", () => { expect(1).toBe(1) })\n' > a.test.js
git add a.test.js
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
printf 'test("a", () => { expect(1).toBe(1) })\ntest.skip("b", () => { expect(2).toBe(2) })\n' > a.test.js
