#!/usr/bin/env bash
# 运行时造一个最小 git 仓库：基线提交后普通源码里新增一个 skip( 方法、测试文件里新增一条断言
# （均未提交）→ 期望 pass。skip( 不在测试文件里，不是测试动作。
set -u
rm -rf .git a.test.js src
git init -q
git symbolic-ref HEAD refs/heads/main
mkdir -p src
printf 'test("a", () => { expect(1).toBe(1) })\n' > a.test.js
printf 'exports.read = function () { return 1 }\n' > src/reader.js
git add a.test.js src
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
printf 'exports.read = function () { return 1 }\nexports.skip = function (n) { return n }\nthis.skip(n)\n' > src/reader.js
printf 'test("a", () => { expect(1).toBe(1) })\ntest("b", () => { expect(2).toBe(2) })\n' > a.test.js
