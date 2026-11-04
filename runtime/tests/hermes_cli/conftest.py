"""runtime/tests 侧拼合树兼容夹具。

批一（1ae2f7c4c）把 test_project_pause 镜像到本目录时，vendor 树
tests/hermes_cli/conftest.py 的共享夹具不随行——pytest 按目录收集
conftest，导致 all_assignees_spawnable 缺失、5 例 setup ERROR
（v0.22.6/v0.22.7 拼合树同型红，与本仓 vendor 基线无关）。此处再导出
该夹具：单一事实源=vendor conftest，import 复用不复制；其余 autouse
隔离夹具（网络/锁抑制等）不引入，避免作用面外溢到 runtime 测试。
"""
from tests.hermes_cli.conftest import all_assignees_spawnable  # noqa: F401
