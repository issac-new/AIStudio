# 合规样本（误报回归锁，七轮复盘）：含动态求值关键字但实际安全的写法。
#
# 背景：七轮复盘对 3 个成熟开源项目实测误报率，flask 被误报 2 处——
#   src/flask/cli.py: args = [ast.literal_eval(arg) for arg in expr.args]
# ast.literal_eval() 是 Python 官方推荐的动态求值安全替代（只解析字面量、不执行代码），
# 恰恰是正确解法，却因 §3 规则裸匹配关键字被当成违规抓（同文件 §1/§2/§4 都有白名单，唯 §3 没有）。
# 误报会训练用户"改回不安全写法或加豁免"，属反向激励。
#
# 本 fixture 锁的是：这些安全写法**必须 pass**（退出 0）。
# 修复前会失败（被误报为违规 → 退出 1）。

import ast
import json


def parse_literal(text):
    """安全解析字面量——ast.literal_eval 不执行代码，是动态求值的推荐替代。"""
    return ast.literal_eval(text)


def parse_kwargs(node):
    """列表推导里的 literal_eval（flask cli.py 的真实写法）。"""
    return {kw.arg: ast.literal_eval(kw.value) for kw in node.keywords}


def parse_json(text):
    """json.loads 亦为安全反序列化，不应被规则命中。"""
    return json.loads(text)


def safe_eval_wrapper(expr):
    """库常见的 .safe_eval 命名约定（沙箱化求值），不应误报。"""
    return _engine.safe_eval(expr)


_engine = None

